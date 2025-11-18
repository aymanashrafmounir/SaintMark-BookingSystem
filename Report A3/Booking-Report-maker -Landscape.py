import os
import sys
from datetime import datetime
import pandas as pd
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from reportlab.lib.pagesizes import A3, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer, Paragraph, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import arabic_reshaper
from bidi.algorithm import get_display

# --- دالة تحويل الأرقام ---
def to_eastern_arabic_numerals(text):
    """Converts Western Arabic numerals (0-9) to Eastern Arabic numerals (٠-٩) in a string."""
    text = str(text) 
    mapping = {
        "0": "٠", "1": "١", "2": "٢", "3": "٣", "4": "٤",
        "5": "٥", "6": "٦", "7": "٧", "8": "٨", "9": "٩"
    }
    for k, v in mapping.items():
        text = text.replace(k, v)
    return text

# --- دالة تحويل الوقت ---
def format_to_ampm(time_str_24):
    """
    Converts 'HH:MM' string to 'H:MM ص/م' string (no leading zero).
    """
    if not time_str_24:
        return ""
    try:
        t = datetime.strptime(time_str_24, '%H:%M').time()
        
        hour_12 = t.strftime('%I')
        minutes = t.strftime('%M')
        
        hour_stripped = hour_12.lstrip('0') 
        if not hour_stripped: # لو كانت الساعة 12 منتصف الليل، lstrip('00') هتخليها فاضية
            hour_stripped = '12' # (دي حالة خاصة لو الساعة 00:00)
            
        # (تعديل بسيط لضمان إن 00:xx تبقى 12:xx ص)
        if t.strftime('%H') == '00':
             hour_stripped = '12'

        am_pm = t.strftime('%p').replace('AM', 'ص').replace('PM', 'م')
        
        return f"{hour_stripped}:{minutes} {am_pm}"
    
    except ValueError:
        return time_str_24

def _get_nested_value(data, keys):
    """
    Safely traverse dictionaries/lists using a sequence of keys.
    Returns None if the path does not exist.
    """
    current = data
    for key in keys:
        if current is None:
            return None
        if isinstance(current, dict):
            current = current.get(key)
        elif isinstance(current, list):
            if not current:
                return None
            candidate = current[0]
            if isinstance(candidate, dict):
                current = candidate.get(key)
            else:
                return None
        else:
            return None
    return current

def _coalesce_series_from_paths(df, paths):
    """
    Returns a Series combining the first non-null values found in the provided paths.
    Optimized version that checks direct columns first before nested paths.
    """
    if df.empty:
        return pd.Series(dtype=object)

    result = pd.Series([None] * len(df), index=df.index, dtype=object)
    
    # First, try direct column access (fast path - no nested access needed)
    for path in paths:
        if not path or len(path) != 1:
            continue
        column = path[0]
        if column in df.columns:
            fill_mask = result.isna() & df[column].notna()
            if fill_mask.any():
                result[fill_mask] = df[column][fill_mask].astype(str)
            if result.notna().all():
                return result
    
    # If we still have missing values, try nested paths (slower - only for missing rows)
    missing_mask = result.isna()
    if missing_mask.any():
        for path in paths:
            if not path or len(path) == 1:
                continue
            column = path[0]
            if column not in df.columns:
                continue

            try:
                # Only process rows where result is still None
                current_missing = result.isna()
                if not current_missing.any():
                    break
                
                # Get only the rows that need processing
                series_subset = df.loc[current_missing, column]
                non_null_mask = series_subset.notna()
                
                if non_null_mask.any():
                    # Extract nested values only for non-null entries
                    nested_dict = {}
                    for idx in series_subset[non_null_mask].index:
                        value = df.loc[idx, column]
                        nested_val = _get_nested_value(value, path[1:])
                        if nested_val is not None:
                            nested_dict[idx] = nested_val
                    
                    # Update result with nested values
                    if nested_dict:
                        for idx, val in nested_dict.items():
                            result.loc[idx] = str(val)
                    
            except Exception:
                continue

    # Fill remaining None values with default
    result = result.fillna('غير محدد')
    return result.astype(str)

def fetch_slots_from_mongo(uri, db_name, collection_name, start_date, end_date):
    """
    Fetches booking slots from MongoDB within the provided date range and returns a DataFrame.
    """
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())
    client = None

    try:
        print("جارٍ الاتصال بقاعدة البيانات...")
        client = MongoClient(uri)
        collection = client[db_name][collection_name]

        # Always fetch all booked documents and filter client-side
        # This ensures we get all documents regardless of date format in MongoDB
        print("جارٍ جلب جميع الحجوزات المؤكدة من قاعدة البيانات...")
        documents = list(collection.find({"status": "booked"}))
        print(f"تم جلب {len(documents)} وثيقة من قاعدة البيانات.")

    except PyMongoError as exc:
        print(f"خطأ في الاتصال بقاعدة البيانات: {exc}")
        return pd.DataFrame()
    finally:
        if client is not None:
            client.close()

    if not documents:
        return pd.DataFrame()

    df = pd.DataFrame(documents)
    if '_id' in df.columns:
        df['_id'] = df['_id'].astype(str)

    if 'date' in df.columns:
        # Convert date to datetime, handling various formats
        # Use utc=True to normalize all dates to UTC (timezone-aware)
        df['date'] = pd.to_datetime(df['date'], errors='coerce', utc=True)
        df.dropna(subset=['date'], inplace=True)

        if df.empty:
            print("تحذير: لا توجد وثائق تحتوي على تاريخ صالح.")
            return pd.DataFrame()

        # Remove timezone from all dates (convert to naive datetime)
        # Since we used utc=True, all dates are now timezone-aware (UTC)
        # Use vectorized operation for better performance
        try:
            df['date'] = df['date'].dt.tz_convert(None)
        except TypeError:
            # If some dates are already naive, handle them separately
            mask = df['date'].dt.tz.notna()
            df.loc[mask, 'date'] = df.loc[mask, 'date'].dt.tz_convert(None)

        # Filter by date range client-side
        start_dt_naive = start_dt.replace(tzinfo=None) if start_dt.tzinfo else start_dt
        end_dt_naive = end_dt.replace(tzinfo=None) if end_dt.tzinfo else end_dt
        
        initial_count = len(df)
        df = df[(df['date'] >= start_dt_naive) & (df['date'] <= end_dt_naive)]
        filtered_count = len(df)
        
        print(f"بعد التصفية حسب التاريخ ({start_date} إلى {end_date}): {filtered_count} وثيقة من أصل {initial_count}")

    df.reset_index(drop=True, inplace=True)
    return df

def process_bookings(bookings_source):
    """
    Function to process booking data: filter, merge contiguous slots, 
    and identify recurring vs. one-time bookings.
    """
    
    DAY_TRANSLATIONS = {
        'Saturday': 'السبت', 'Sunday': 'الأحد', 'Monday': 'الاثنين',
        'Tuesday': 'الثلاثاء', 'Wednesday': 'الأربعاء', 'Thursday': 'الخميس',
        'Friday': 'الجمعة'
    }
    
    # ... (التحميل والفلترة زي ما هو) ...
    if isinstance(bookings_source, pd.DataFrame):
        df = bookings_source.copy()
    else:
        df = pd.read_json(bookings_source)

    if df.empty:
        return [], []

    print(f"جارٍ معالجة {len(df)} سجل...")

    # Fast path: Check if columns exist directly first
    print("جارٍ تطبيع أسماء الأعمدة...")
    
    # roomName
    if 'roomName' in df.columns:
        df['roomName'] = df['roomName'].astype(str).str.strip().replace('nan', 'غير محدد')
    elif 'room' in df.columns:
        # Try nested access only if direct column doesn't exist
        df['roomName'] = _coalesce_series_from_paths(df, [['room', 'name'], ['room', 'roomName'], ['room', 'title']])
    else:
        df['roomName'] = 'غير محدد'
    
    # serviceName
    if 'serviceName' in df.columns:
        df['serviceName'] = df['serviceName'].astype(str).str.strip().replace('nan', 'غير محدد')
    elif 'service' in df.columns:
        df['serviceName'] = _coalesce_series_from_paths(df, [['service', 'name'], ['service', 'serviceName']])
    else:
        df['serviceName'] = 'غير محدد'
    
    # providerName
    if 'providerName' in df.columns:
        df['providerName'] = df['providerName'].astype(str).str.strip().replace('nan', 'غير محدد')
    elif 'provider' in df.columns or 'staff' in df.columns:
        df['providerName'] = _coalesce_series_from_paths(df, [['provider', 'name'], ['provider', 'fullName'], ['staff', 'name'], ['staff', 'fullName']])
    else:
        df['providerName'] = 'غير محدد'
    
    print("اكتمل تطبيع الأعمدة.")

    if 'status' in df.columns:
        booked_df = df[df['status'] == 'booked'].copy()
    else:
        booked_df = df.copy()

    if booked_df.empty:
        return [], []

    missing_required = [col for col in ['date', 'startTime', 'endTime'] if col not in booked_df.columns]
    if missing_required:
        print(f"البيانات المسترجعة تفتقد الأعمدة الضرورية: {', '.join(missing_required)}")
        return [], []

    booked_df['date'] = pd.to_datetime(booked_df['date'], errors='coerce')
    booked_df.dropna(subset=['date', 'startTime', 'endTime'], inplace=True)

    if booked_df.empty:
        return [], []

    booked_df['date'] = booked_df['date'].dt.date
    booked_df['startTime'] = booked_df['startTime'].astype(str).str.strip()
    booked_df['endTime'] = booked_df['endTime'].astype(str).str.strip()

    print(f"جارٍ تجميع {len(booked_df)} حجز...")
    booked_df['group_key'] = booked_df['roomName'] + ' | ' + booked_df['serviceName'] + ' | ' + booked_df['providerName']
    booked_df.sort_values(by=['group_key', 'date', 'startTime'], inplace=True)
    booked_df.reset_index(drop=True, inplace=True)

    # ... (الدمج زي ما هو) ...
    print("جارٍ دمج الفترات المتتالية...")
    merged_slots = []
    if not booked_df.empty:
        current_slot = booked_df.iloc[0].to_dict()
        for i in range(1, len(booked_df)):
            next_slot = booked_df.iloc[i]
            if (current_slot['group_key'] == next_slot['group_key'] and
                current_slot['date'] == next_slot['date'] and
                current_slot['endTime'] == next_slot['startTime']):
                current_slot['endTime'] = next_slot['endTime']
            else:
                merged_slots.append(current_slot)
                current_slot = next_slot.to_dict()
        merged_slots.append(current_slot)
    merged_df = pd.DataFrame(merged_slots)
    if merged_df.empty:
        return [], []
    print(f"تم دمج الحجوزات إلى {len(merged_df)} فترات.")
    
    merged_df['day_of_week'] = pd.to_datetime(merged_df['date']).dt.day_name()
    merged_df['recurring_key'] = merged_df['group_key'] + ' | ' + merged_df['day_of_week'] + ' | ' + merged_df['startTime'] + ' - ' + merged_df['endTime']
    
    print("جارٍ تحليل الحجوزات المتكررة...")

    # Use groupby for better performance instead of iterrows
    recurring_bookings = []
    one_time_bookings = []
    
    # Group by recurring_key for efficient processing
    grouped = merged_df.groupby('recurring_key', sort=False)
    # Get unique recurring keys count for progress tracking
    unique_keys = merged_df['recurring_key'].nunique()
    processed_groups = 0
    
    for recurring_key, group in grouped:
        processed_groups += 1
        if processed_groups % 50 == 0:
            print(f"  - معالجة المجموعة {processed_groups} من {unique_keys}...")
        
        # Sort by date for checking weekly recurrence
        group_sorted = group.sort_values(by='date')
        group_list = group_sorted.to_dict('records')
        
        # Check if it's weekly recurring
        # Since recurring_key includes day_of_week, all bookings in this group are on the same day
        # A booking is recurring if there are at least 2 occurrences on the same day of week
        is_weekly_recurring = False
        if len(group_list) >= 2:
            # Since all bookings share the same day_of_week (in recurring_key),
            # we check if intervals are multiples of 7 days (weekly pattern)
            intervals = []
            for i in range(len(group_list) - 1):
                date_diff = (group_list[i+1]['date'] - group_list[i]['date']).days
                intervals.append(date_diff)
            
            # Check if intervals are multiples of 7 (7, 14, 21, etc.)
            weekly_intervals = [d for d in intervals if d % 7 == 0 and d > 0]
            
            if len(intervals) > 0:
                weekly_ratio = len(weekly_intervals) / len(intervals)
                # Consider it recurring if:
                # 1. At least 50% of intervals are weekly (multiples of 7)
                # 2. OR if there are 3+ occurrences and at least one weekly interval
                # 3. OR if there are 2 occurrences with exactly 7 days between them
                if (weekly_ratio >= 0.5 or 
                    (len(group_list) >= 3 and len(weekly_intervals) >= 1) or
                    (len(group_list) == 2 and len(weekly_intervals) == 1)):
                    is_weekly_recurring = True
        
        # Get first row for common data
        first_row = group_list[0]
        
        if is_weekly_recurring:
            # It's a recurring booking
            start_date = group_list[0]['date']
            end_date = group_list[-1]['date']
            arabic_day = DAY_TRANSLATIONS.get(first_row['day_of_week'], first_row['day_of_week'])
            start_time_12 = format_to_ampm(first_row['startTime'])
            end_time_12 = format_to_ampm(first_row['endTime'])
            booking_count = len(group_list)
            
            recurring_bookings.append({
                'Room': first_row['roomName'],
                'Service': first_row['serviceName'],
                'Provider': first_row['providerName'],
                'Day': arabic_day,
                'Time': f"{start_time_12} إلى {end_time_12}",
                'Start Date': start_date.strftime('%Y/%m/%d'),
                'End Date': end_date.strftime('%Y/%m/%d'),
                'Booking Count': booking_count
            })
        else:
            # One-time bookings
            for row in group_list:
                start_time_12_one_off = format_to_ampm(row['startTime'])
                end_time_12_one_off = format_to_ampm(row['endTime'])
                
                one_time_bookings.append({
                    'Room': row['roomName'],
                    'Service': row['serviceName'],
                    'Provider': row['providerName'],
                    'Date': row['date'].strftime('%Y/%m/%d'),
                    'Time': f"{start_time_12_one_off} إلى {end_time_12_one_off}"
                })

    print(f"اكتمل التحليل: {len(recurring_bookings)} حجز متكرر، {len(one_time_bookings)} حجز لمرة واحدة.")
    
    # Group bookings that are identical except for room/location
    # Group by: service, provider, day of week, time (without date and room)
    print("جارٍ تجميع الحجوزات المتطابقة (عدا المكان)...")
    grouped_by_location = []
    
    # Create a key without room name and date for grouping (to group across dates)
    merged_df['location_group_key'] = (
        merged_df['serviceName'] + ' | ' + 
        merged_df['providerName'] + ' | ' + 
        merged_df['day_of_week'] + ' | ' + 
        merged_df['startTime'] + ' | ' + 
        merged_df['endTime']
    )
    
    location_grouped = merged_df.groupby('location_group_key', sort=False)
    for location_key, location_group in location_grouped:
        if len(location_group) > 1:  # Only group if there are multiple entries
            # Get unique rooms, clean and filter
            rooms_raw = location_group['roomName'].unique().tolist()
            # Clean rooms: remove empty, strip whitespace, filter out invalid
            rooms = []
            for r in rooms_raw:
                if r:
                    r_clean = str(r).strip()
                    if r_clean and r_clean != 'nan' and r_clean != 'غير محدد' and r_clean not in rooms:
                        rooms.append(r_clean)
            
            # Only proceed if we have at least 2 different valid rooms
            if len(rooms) > 1:
                first_row = location_group.iloc[0]
                start_time_12 = format_to_ampm(first_row['startTime'])
                end_time_12 = format_to_ampm(first_row['endTime'])
                arabic_day = DAY_TRANSLATIONS.get(first_row['day_of_week'], first_row['day_of_week'])
                
                # Get date range (min and max dates)
                dates = location_group['date'].unique()
                dates_sorted = sorted(dates)
                start_date = dates_sorted[0]
                end_date = dates_sorted[-1]
                
                # Format date range
                if start_date == end_date:
                    date_range = start_date.strftime('%Y/%m/%d')
                else:
                    date_range = f"{start_date.strftime('%Y/%m/%d')} إلى {end_date.strftime('%Y/%m/%d')}"
                
                # Sort rooms for consistent display
                rooms_sorted = sorted(rooms)
                
                grouped_by_location.append({
                    'Rooms': ' | '.join(rooms_sorted),  # Join rooms with pipe separator
                    'Service': first_row['serviceName'],
                    'Provider': first_row['providerName'],
                    'Day': arabic_day,
                    'Date': date_range,
                    'Time': f"{start_time_12} إلى {end_time_12}",
                    'Count': len(location_group)
                })
    
    print(f"تم تجميع {len(grouped_by_location)} مجموعة من الحجوزات المتطابقة.")
    
    # Remove recurring bookings that are in the grouped_by_location table
    # Create a set of keys for grouped bookings (service + provider + day + time)
    grouped_keys = set()
    for item in grouped_by_location:
        # Create key: service + provider + day + time
        key = f"{item['Service']} | {item['Provider']} | {item['Day']} | {item['Time']}"
        grouped_keys.add(key)
    
    # Filter out recurring bookings that match grouped keys
    filtered_recurring = []
    removed_count = 0
    for booking in recurring_bookings:
        booking_key = f"{booking['Service']} | {booking['Provider']} | {booking['Day']} | {booking['Time']}"
        if booking_key not in grouped_keys:
            filtered_recurring.append(booking)
        else:
            removed_count += 1
    
    if removed_count > 0:
        print(f"تم إزالة {removed_count} حجز متكرر من جدول المواعيد الثابتة (لأنها موجودة في جدول الحجوزات المتطابقة).")
    
    return filtered_recurring, one_time_bookings, grouped_by_location



def create_pdf(recurring_data, one_time_data, grouped_by_location_data=None, output_filename="Booking_Report.pdf"):
    """
    Generates an A3 PDF report with tables for recurring, one-time, and grouped-by-location bookings.
    Handles Arabic text rendering.
    """
    print(f"  - جارٍ تحميل الخطوط...")
    try:
        pdfmetrics.registerFont(TTFont('Arabic', 'DejaVuSans.ttf'))
        print(f"  - تم تحميل الخط بنجاح.")
    except Exception as e:
        print(f"  - تحذير: Font 'DejaVuSans.ttf' not found. Arabic text might not render correctly.")
        print(f"  - الخطأ: {e}")
        print("  - المتابعة بدون خط عربي مخصص...")
        # Continue without custom font - ReportLab will use default

    print(f"  - جارٍ إعداد مستند PDF...")
    # --- التعديلات الرئيسية هنا ---
    doc = SimpleDocTemplate(
        output_filename, 
        pagesize=landscape(A3), # <--- 1. استخدام الصفحة بالعرض
        leftMargin=36,          # <--- 2. تصغير الهوامش (الافتراضي 72)
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    # ------------------------------
    
    styles = getSampleStyleSheet()
    
    # <--- 3. تصغير حجم الخطوط ---
    try:
        styles.add(ParagraphStyle(name='Arabic', fontName='Arabic', fontSize=9, alignment=1))
        # Use Arabic font (DejaVuSans.ttf) for titles as well
        styles.add(ParagraphStyle(name='ArabicTitle', parent=styles['Heading2'], fontName='Arabic', fontSize=14, alignment=1, spaceAfter=10))
    except:
        # If Arabic font is not available, use Helvetica
        styles.add(ParagraphStyle(name='Arabic', fontName='Helvetica', fontSize=9, alignment=1))
        styles.add(ParagraphStyle(name='ArabicTitle', parent=styles['Heading2'], fontName='Helvetica', fontSize=14, alignment=1, spaceAfter=10))
    
    def format_arabic(text, style='Arabic'):
        """Helper to format text for PDF (no numerals conversion)."""
        try:
            reshaped_text = arabic_reshaper.reshape(str(text))
            bidi_text = get_display(reshaped_text)
        except Exception:
            # If Arabic reshaping fails, use text as-is
            bidi_text = str(text)
        return Paragraph(bidi_text, styles[style])
        
    def format_cell_text(text):
        """
        Helper to convert numerals AND format bidi text for a table cell.
        """
        try:
            arabic_text = to_eastern_arabic_numerals(str(text))
            reshaped_text = arabic_reshaper.reshape(arabic_text)
            bidi_text = get_display(reshaped_text)
        except Exception:
            # If Arabic processing fails, use text as-is
            bidi_text = str(text)
        return Paragraph(bidi_text, styles['Arabic'])

    print(f"  - جارٍ إعداد محتوى PDF...")
    elements = []
    
    # Add logo in top right corner
    try:
        logo_path = 'Logo.jpg'
        if os.path.exists(logo_path):
            # Create a table with title on left and logo on right
            logo_img = Image(logo_path, width=120, height=120, kind='proportional')
            title_text = format_arabic("تنظيم الخدمه بمبني الخدمات", style='ArabicTitle')
            
            # Create a table with 2 columns: title (left) and logo (right)
            header_table = Table([
                [title_text, logo_img]
            ], colWidths=[landscape(A3)[0] - 160, 100])
            header_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (0, 0), 'LEFT'),  # Title left aligned
                ('ALIGN', (1, 0), (1, 0), 'RIGHT'),  # Logo right aligned
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                # No borders for header table
                ('LINEBELOW', (0, 0), (-1, -1), 0, colors.white),
                ('LINEABOVE', (0, 0), (-1, -1), 0, colors.white),
                ('LINEBEFORE', (0, 0), (-1, -1), 0, colors.white),
                ('LINEAFTER', (0, 0), (-1, -1), 0, colors.white),
            ]))
            elements.append(header_table)
            print(f"  - تم إضافة اللوجو بنجاح.")
        else:
            # If logo not found, just add title
            title_text = format_arabic("تنظيم الخدمه بمبني الخدمات", style='ArabicTitle')
            elements.append(title_text)
            print(f"  - تحذير: لم يتم العثور على ملف اللوجو '{logo_path}'")
    except Exception as e:
        # If logo loading fails, just add title
        title_text = format_arabic("تنظيم الخدمه بمبني الخدمات", style='ArabicTitle')
        elements.append(title_text)
        print(f"  - تحذير: خطأ في تحميل اللوجو: {e}")
    
    elements.append(Spacer(1, 12))

    # Initialize table data variables
    recurring_table_data = None
    onetime_table_data = None

    # --- Recurring Bookings Table ---
    if recurring_data:
        print(f"  - جارٍ إنشاء جدول الحجوزات المتكررة ({len(recurring_data)} حجز)...")
        elements.append(format_arabic("المواعيد الثابتة (الأسبوعية)", style='ArabicTitle'))
        elements.append(Spacer(1, 6))
        
        recurring_headers = [
            format_arabic(h, style='Arabic') for h in 
            ['الخادم المسؤول', 'الخدمة', 'الغرفة', 'اليوم', 'عدد الحجوزات', 'الوقت', 'التاريخ']
        ]
        recurring_table_data = [recurring_headers]
        
        for i, item in enumerate(recurring_data):
            if len(recurring_data) > 100 and (i + 1) % 100 == 0:
                print(f"    - معالجة الحجز المتكرر {i + 1} من {len(recurring_data)}...")
            try:
                # Format date range like in grouped_by_location table
                start_date = item.get('Start Date', '')
                end_date = item.get('End Date', '')
                if start_date == end_date:
                    date_range = start_date
                else:
                    date_range = f"{start_date} إلى {end_date}"
                
                row = [
                    format_cell_text(item.get('Provider', '')),
                    format_cell_text(item.get('Service', '')),
                    format_cell_text(item.get('Room', '')),
                    format_cell_text(item.get('Day', '')),
                    format_cell_text(item.get('Booking Count', '')),
                    format_cell_text(item.get('Time', '')),
                    format_cell_text(date_range)
                ]
                recurring_table_data.append(row)
            except Exception as e:
                if len(recurring_data) <= 100:  # Only print errors for small datasets
                    print(f"    - تحذير: خطأ في معالجة الحجز المتكرر {i + 1}: {e}")
                continue
        
        print(f"  - جارٍ إنشاء الجدول ({len(recurring_table_data)} صف)...")
        try:
            t1 = Table(recurring_table_data, repeatRows=1)
            t1.setStyle(TableStyle([
                # Header row - blue background
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4A90E2')),  # Blue header
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),  # White text in header
                # Grid and borders
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#2C3E50')),  # Dark blue-gray grid
                # Alternating row colors
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#E8F4F8')]),  # White and light blue
                # Alignment
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('LEADING', (0, 0), (-1, -1), 11),
            ]))
            elements.append(t1)
            print(f"  - تم إنشاء جدول الحجوزات المتكررة.")
        except Exception as e:
            print(f"  - خطأ في إنشاء جدول الحجوزات المتكررة: {e}")
            raise

    elements.append(Spacer(1, 24))

    # --- One-Time Bookings Table ---
    if one_time_data:
        print(f"  - جارٍ إنشاء جدول الحجوزات لمرة واحدة ({len(one_time_data)} حجز)...")
        elements.append(format_arabic("المواعيد لمرة واحدة", style='ArabicTitle'))
        elements.append(Spacer(1, 6))
        
        onetime_headers = [
            format_arabic(h, style='Arabic') for h in 
            ['الخادم المسؤول', 'الخدمة', 'الغرفة', 'الوقت', 'التاريخ']
        ]
        onetime_table_data = [onetime_headers]

        for i, item in enumerate(one_time_data):
            if len(one_time_data) > 200 and (i + 1) % 200 == 0:
                print(f"    - معالجة الحجز لمرة واحدة {i + 1} من {len(one_time_data)}...")
            try:
                row = [
                    format_cell_text(item.get('Provider', '')),
                    format_cell_text(item.get('Service', '')),
                    format_cell_text(item.get('Room', '')),
                    format_cell_text(item.get('Time', '')),
                    format_cell_text(item.get('Date', ''))
                ]
                onetime_table_data.append(row)
            except Exception as e:
                if len(one_time_data) <= 200:  # Only print errors for small datasets
                    print(f"    - تحذير: خطأ في معالجة الحجز لمرة واحدة {i + 1}: {e}")
                continue
            
        print(f"  - جارٍ إنشاء الجدول ({len(onetime_table_data)} صف)...")
        try:
            t2 = Table(onetime_table_data, repeatRows=1)
            t2.setStyle(TableStyle([
                # Header row - green background
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#27AE60')),  # Green header
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),  # White text in header
                # Grid and borders
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#1E8449')),  # Dark green grid
                # Alternating row colors
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#E8F8F5')]),  # White and light green
                # Alignment
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('LEADING', (0, 0), (-1, -1), 11),
            ]))
            elements.append(t2)
            print(f"  - تم إنشاء جدول الحجوزات لمرة واحدة.")
        except Exception as e:
            print(f"  - خطأ في إنشاء جدول الحجوزات لمرة واحدة: {e}")
            raise

    elements.append(Spacer(1, 24))

    # --- Grouped by Location Table ---
    grouped_table_data = None
    if grouped_by_location_data:
        print(f"  - جارٍ إنشاء جدول الحجوزات المجمعة حسب المكان ({len(grouped_by_location_data)} مجموعة)...")
        elements.append(format_arabic("الحجوزات المتطابقة (متعددة الأماكن)", style='ArabicTitle'))
        elements.append(Spacer(1, 6))
        
        grouped_headers = [
            format_arabic(h, style='Arabic') for h in 
            ['الأماكن', 'مقدم الخدمة', 'الخدمة', 'اليوم', 'التاريخ', 'الوقت', 'عدد الحجوزات']
        ]
        grouped_table_data = [grouped_headers]

        for i, item in enumerate(grouped_by_location_data):
            if len(grouped_by_location_data) > 200 and (i + 1) % 200 == 0:
                print(f"    - معالجة المجموعة {i + 1} من {len(grouped_by_location_data)}...")
            try:
                row = [
                    format_cell_text(item.get('Rooms', '')),
                    format_cell_text(item.get('Provider', '')),
                    format_cell_text(item.get('Service', '')),
                    format_cell_text(item.get('Day', '')),
                    format_cell_text(item.get('Date', '')),
                    format_cell_text(item.get('Time', '')),
                    format_cell_text(item.get('Count', ''))
                ]
                grouped_table_data.append(row)
            except Exception as e:
                if len(grouped_by_location_data) <= 200:
                    print(f"    - تحذير: خطأ في معالجة المجموعة {i + 1}: {e}")
                continue
            
        print(f"  - جارٍ إنشاء الجدول ({len(grouped_table_data)} صف)...")
        try:
            # Calculate column widths - give more space to Rooms column (first column)
            # A3 landscape: ~1120 points width, minus margins (72 total) = ~1048 points
            # 7 columns: give Rooms column 30% of width, others share the rest
            total_width = landscape(A3)[0] - 72  # Total width minus margins
            rooms_col_width = total_width * 0.30  # 30% for rooms
            other_col_width = (total_width - rooms_col_width) / 6  # Rest divided by 6 columns
            
            t3 = Table(grouped_table_data, repeatRows=1, colWidths=[
                rooms_col_width,  # Rooms column - wider
                other_col_width,  # Provider
                other_col_width,  # Service
                other_col_width,  # Day
                other_col_width,  # Date
                other_col_width,  # Time
                other_col_width   # Count
            ])
            t3.setStyle(TableStyle([
                # Header row - orange/amber background
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F39C12')),  # Orange header
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),  # White text in header
                # Grid and borders
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#D68910')),  # Dark orange grid
                # Alternating row colors
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#FEF5E7')]),  # White and light orange
                # Alignment
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('LEADING', (0, 0), (-1, -1), 12),  # Increase line spacing for better text wrapping
            ]))
            elements.append(t3)
            print(f"  - تم إنشاء جدول الحجوزات المجمعة حسب المكان.")
        except Exception as e:
            print(f"  - خطأ في إنشاء جدول الحجوزات المجمعة: {e}")
            raise

    total_rows = 0
    if recurring_table_data is not None:
        total_rows += len(recurring_table_data)
    if onetime_table_data is not None:
        total_rows += len(onetime_table_data)
    if grouped_table_data is not None:
        total_rows += len(grouped_table_data)
    
    # Check if we have any data to write
    if total_rows == 0 or len(elements) == 0:
        print(f"  - تحذير: لا توجد بيانات لكتابتها في PDF.")
        return
    
    print(f"  - جارٍ بناء ملف PDF...")
    if total_rows > 0:
        print(f"  - إجمالي الصفوف في الجداول: {total_rows}")
    print(f"  - عدد العناصر: {len(elements)}")
    if total_rows > 1000:
        print(f"  - تحذير: الجدول كبير جدًا ({total_rows} صف).")
        print(f"  - قد يستغرق هذا وقتًا طويلاً جدًا (عدة دقائق أو أكثر)...")
        print(f"  - يرجى الانتظار...")
    elif total_rows > 500:
        print(f"  - الجدول كبير ({total_rows} صف). قد يستغرق هذا دقيقة أو أكثر...")
    else:
        print(f"  - قد يستغرق هذا بضع ثوانٍ...")
    
    try:
        import time
        start_time = time.time()
        print(f"  - بدء عملية البناء...")
        sys.stdout.flush()  # Force output to be printed immediately
        
        doc.build(elements)
        
        elapsed_time = time.time() - start_time
        print(f"  - ✓ تم إنشاء ملف PDF بنجاح: '{output_filename}'")
        print(f"  - الوقت المستغرق: {elapsed_time:.2f} ثانية ({elapsed_time/60:.2f} دقيقة)")
    except MemoryError as e:
        print(f"  - ✗ خطأ في الذاكرة: الجداول كبيرة جدًا.")
        print(f"  - الحل: حاول تقليل فترة التاريخ أو تقسيم البيانات إلى ملفات أصغر.")
        raise
    except KeyboardInterrupt:
        print(f"  - ✗ تم إلغاء العملية من قبل المستخدم.")
        raise
    except Exception as e:
        print(f"  - ✗ خطأ في بناء ملف PDF: {type(e).__name__}: {e}")
        import traceback
        print("  - تفاصيل الخطأ:")
        traceback.print_exc()
        raise

# --- Main Execution ---
if __name__ == "__main__":
    start_input = input("ادخل تاريخ البداية (DD.MM.YYYY): ").strip()
    end_input = input("ادخل تاريخ النهاية (DD.MM.YYYY): ").strip()

    try:
        start_date = datetime.strptime(start_input, "%d.%m.%Y").date()
        end_date = datetime.strptime(end_input, "%d.%m.%Y").date()
    except ValueError:
        print("تنسيق التاريخ غير صحيح. برجاء إدخال التاريخ بصيغة DD.MM.YYYY")
        sys.exit(1)

    if start_date > end_date:
        print("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية.")
        sys.exit(1)

    mongo_uri = os.getenv(
        "MONGO_URI",
        "mongodb+srv://bookingadmin:lUiBEeVo9LzGEdhY@bookingcluster.2y1krrh.mongodb.net/?retryWrites=true&w=majority&appName=BookingCluster"
    )

    if "<username>" in mongo_uri or "<password>" in mongo_uri:
        print("من فضلك حدّث قيمة MONGO_URI ببيانات الدخول الصحيحة قبل التشغيل.")
        sys.exit(1)

    db_name = os.getenv("MONGO_DB_NAME", "roombooking")
    collection_name = os.getenv("MONGO_COLLECTION_NAME", "slots")

    bookings_df = fetch_slots_from_mongo(mongo_uri, db_name, collection_name, start_date, end_date)

    if bookings_df.empty:
        print("لا توجد حجوزات مؤكدة في الفترة المحددة.")
        sys.exit(0)

    print("\nبدء معالجة الحجوزات...")
    recurring, onetime, grouped_by_location = process_bookings(bookings_df)
    
    print("\nجارٍ ترتيب البيانات...")
    recurring_sorted = sorted(recurring, key=lambda x: (x['Room'], x['Day'], x['Start Date']))
    onetime_sorted = sorted(onetime, key=lambda x: (x['Room'], x['Date']))
    grouped_sorted = sorted(grouped_by_location, key=lambda x: (x['Service'], x['Date'], x['Time']))
    
    print("\nجارٍ إنشاء ملف PDF...")
    create_pdf(recurring_sorted, onetime_sorted, grouped_sorted)
    print("\nاكتمل التنفيذ بنجاح!")