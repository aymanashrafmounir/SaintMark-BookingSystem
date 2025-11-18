import os
import sys
from datetime import datetime
import pandas as pd
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from reportlab.lib.pagesizes import A4
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
        if not hour_stripped:
            hour_stripped = '12'
            
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
    """
    if df.empty:
        return pd.Series(dtype=object)

    result = pd.Series([None] * len(df), index=df.index, dtype=object)
    
    # First, try direct column access
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
    
    # If we still have missing values, try nested paths
    missing_mask = result.isna()
    if missing_mask.any():
        for path in paths:
            if not path or len(path) == 1:
                continue
            column = path[0]
            if column not in df.columns:
                continue

            try:
                current_missing = result.isna()
                if not current_missing.any():
                    break
                
                series_subset = df.loc[current_missing, column]
                non_null_mask = series_subset.notna()
                
                if non_null_mask.any():
                    nested_dict = {}
                    for idx in series_subset[non_null_mask].index:
                        value = df.loc[idx, column]
                        nested_val = _get_nested_value(value, path[1:])
                        if nested_val is not None:
                            nested_dict[idx] = nested_val
                    
                    if nested_dict:
                        for idx, val in nested_dict.items():
                            result.loc[idx] = str(val)
                    
            except Exception:
                continue

    result = result.fillna('غير محدد')
    return result.astype(str)

def fetch_slots_from_mongo(uri, db_name, collection_name, start_date, end_date):
    """
    Fetches booking slots from MongoDB within the provided date range and returns a DataFrame.
    Filters for Music Room only and time between 18:00-22:00 (6 PM - 10 PM).
    """
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())
    client = None

    try:
        print("جارٍ الاتصال بقاعدة البيانات...")
        client = MongoClient(uri)
        collection = client[db_name][collection_name]

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
        df['date'] = pd.to_datetime(df['date'], errors='coerce', utc=True)
        df.dropna(subset=['date'], inplace=True)

        if df.empty:
            print("تحذير: لا توجد وثائق تحتوي على تاريخ صالح.")
            return pd.DataFrame()

        try:
            df['date'] = df['date'].dt.tz_convert(None)
        except TypeError:
            mask = df['date'].dt.tz.notna()
            df.loc[mask, 'date'] = df.loc[mask, 'date'].dt.tz_convert(None)

        start_dt_naive = start_dt.replace(tzinfo=None) if start_dt.tzinfo else start_dt
        end_dt_naive = end_dt.replace(tzinfo=None) if end_dt.tzinfo else end_dt
        
        initial_count = len(df)
        df = df[(df['date'] >= start_dt_naive) & (df['date'] <= end_dt_naive)]
        filtered_count = len(df)
        
        print(f"بعد التصفية حسب التاريخ ({start_date} إلى {end_date}): {filtered_count} وثيقة من أصل {initial_count}")

    df.reset_index(drop=True, inplace=True)
    return df

def process_bookings_for_music_room(bookings_source):
    """
    Function to process booking data for Music Room only, filtering for time 18:00-22:00.
    Returns only recurring bookings.
    """
    
    DAY_TRANSLATIONS = {
        'Saturday': 'السبت', 'Sunday': 'الأحد', 'Monday': 'الاثنين',
        'Tuesday': 'الثلاثاء', 'Wednesday': 'الأربعاء', 'Thursday': 'الخميس',
        'Friday': 'الجمعة'
    }
    
    if isinstance(bookings_source, pd.DataFrame):
        df = bookings_source.copy()
    else:
        df = pd.read_json(bookings_source)

    if df.empty:
        return []

    print(f"جارٍ معالجة {len(df)} سجل...")

    # Normalize columns
    print("جارٍ تطبيع أسماء الأعمدة...")
    
    # roomName
    if 'roomName' in df.columns:
        df['roomName'] = df['roomName'].astype(str).str.strip().replace('nan', 'غير محدد')
    elif 'room' in df.columns:
        df['roomName'] = _coalesce_series_from_paths(df, [['room', 'name'], ['room', 'roomName'], ['room', 'title']])
    else:
        df['roomName'] = 'غير محدد'
    
    # Filter for Music Room only
    music_room_keywords = ['غرفة الموسيقي', 'غرفة الموسيقى', 'Music Room', 'music room', 'الموسيقي', 'الموسيقى']
    df = df[df['roomName'].str.contains('|'.join(music_room_keywords), case=False, na=False)]
    
    if df.empty:
        print("لا توجد حجوزات لغرفة الموسيقي.")
        return []
    
    print(f"بعد التصفية حسب الغرفة: {len(df)} سجل.")
    
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
        return []

    missing_required = [col for col in ['date', 'startTime', 'endTime'] if col not in booked_df.columns]
    if missing_required:
        print(f"البيانات المسترجعة تفتقد الأعمدة الضرورية: {', '.join(missing_required)}")
        return []

    booked_df['date'] = pd.to_datetime(booked_df['date'], errors='coerce')
    booked_df.dropna(subset=['date', 'startTime', 'endTime'], inplace=True)

    if booked_df.empty:
        return []

    booked_df['date'] = booked_df['date'].dt.date
    booked_df['startTime'] = booked_df['startTime'].astype(str).str.strip()
    booked_df['endTime'] = booked_df['endTime'].astype(str).str.strip()
    
    # Filter for time between 18:00-22:00 (6 PM - 10 PM)
    def is_time_in_range(time_str):
        try:
            t = datetime.strptime(time_str, '%H:%M').time()
            hour = t.hour
            return 18 <= hour < 22  # 6 PM to 10 PM
        except:
            return False
    
    booked_df = booked_df[booked_df['startTime'].apply(is_time_in_range)]
    
    if booked_df.empty:
        print("لا توجد حجوزات في الفترة من 6 مساءً إلى 10 مساءً.")
        return []
    
    print(f"بعد التصفية حسب الوقت (6 مساءً - 10 مساءً): {len(booked_df)} سجل.")

    print(f"جارٍ تجميع {len(booked_df)} حجز...")
    booked_df['group_key'] = booked_df['roomName'] + ' | ' + booked_df['serviceName'] + ' | ' + booked_df['providerName']
    booked_df.sort_values(by=['group_key', 'date', 'startTime'], inplace=True)
    booked_df.reset_index(drop=True, inplace=True)

    # Merge contiguous slots
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
        return []
    print(f"تم دمج الحجوزات إلى {len(merged_df)} فترات.")
    
    merged_df['day_of_week'] = pd.to_datetime(merged_df['date']).dt.day_name()
    merged_df['recurring_key'] = merged_df['group_key'] + ' | ' + merged_df['day_of_week'] + ' | ' + merged_df['startTime'] + ' - ' + merged_df['endTime']
    
    print("جارٍ تحليل الحجوزات المتكررة...")

    recurring_bookings = []
    
    grouped = merged_df.groupby('recurring_key', sort=False)
    unique_keys = merged_df['recurring_key'].nunique()
    processed_groups = 0
    
    for recurring_key, group in grouped:
        processed_groups += 1
        if processed_groups % 50 == 0:
            print(f"  - معالجة المجموعة {processed_groups} من {unique_keys}...")
        
        group_sorted = group.sort_values(by='date')
        group_list = group_sorted.to_dict('records')
        
        # Check if it's weekly recurring
        is_weekly_recurring = False
        if len(group_list) >= 2:
            intervals = []
            for i in range(len(group_list) - 1):
                date_diff = (group_list[i+1]['date'] - group_list[i]['date']).days
                intervals.append(date_diff)
            
            weekly_intervals = [d for d in intervals if d % 7 == 0 and d > 0]
            
            if len(intervals) > 0:
                weekly_ratio = len(weekly_intervals) / len(intervals)
                if (weekly_ratio >= 0.5 or 
                    (len(group_list) >= 3 and len(weekly_intervals) >= 1) or
                    (len(group_list) == 2 and len(weekly_intervals) == 1)):
                    is_weekly_recurring = True
        
        if is_weekly_recurring:
            first_row = group_list[0]
            start_date = group_list[0]['date']
            end_date = group_list[-1]['date']
            arabic_day = DAY_TRANSLATIONS.get(first_row['day_of_week'], first_row['day_of_week'])
            start_time_12 = format_to_ampm(first_row['startTime'])
            end_time_12 = format_to_ampm(first_row['endTime'])
            booking_count = len(group_list)
            
            # Format date range
            if start_date == end_date:
                date_range = start_date.strftime('%Y/%m/%d')
            else:
                date_range = f"{start_date.strftime('%Y/%m/%d')} إلى {end_date.strftime('%Y/%m/%d')}"
            
            recurring_bookings.append({
                'Room': first_row['roomName'],
                'Service': first_row['serviceName'],
                'Provider': first_row['providerName'],
                'Day': arabic_day,
                'Time': f"{start_time_12} إلى {end_time_12}",
                'Date': date_range,
                'Booking Count': booking_count
            })

    print(f"اكتمل التحليل: {len(recurring_bookings)} حجز متكرر.")
    return recurring_bookings

def create_pdf(recurring_data, output_filename="Music_Room_Report_A4.pdf"):
    """
    Generates an A4 PDF report with recurring bookings table for Music Room.
    """
    print(f"  - جارٍ تحميل الخطوط...")
    try:
        pdfmetrics.registerFont(TTFont('Arabic', 'DejaVuSans.ttf'))
        print(f"  - تم تحميل الخط بنجاح.")
    except Exception as e:
        print(f"  - تحذير: Font 'DejaVuSans.ttf' not found. Arabic text might not render correctly.")
        print(f"  - الخطأ: {e}")
        print("  - المتابعة بدون خط عربي مخصص...")

    print(f"  - جارٍ إعداد مستند PDF...")
    doc = SimpleDocTemplate(
        output_filename, 
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    try:
        styles.add(ParagraphStyle(name='Arabic', fontName='Arabic', fontSize=9, alignment=1))
        styles.add(ParagraphStyle(name='ArabicTitle', parent=styles['Heading2'], fontName='Arabic', fontSize=14, alignment=1, spaceAfter=10))
    except:
        styles.add(ParagraphStyle(name='Arabic', fontName='Helvetica', fontSize=9, alignment=1))
        styles.add(ParagraphStyle(name='ArabicTitle', parent=styles['Heading2'], fontName='Helvetica', fontSize=14, alignment=1, spaceAfter=10))
    
    def format_arabic(text, style='Arabic'):
        """Helper to format text for PDF."""
        try:
            reshaped_text = arabic_reshaper.reshape(str(text))
            bidi_text = get_display(reshaped_text)
        except Exception:
            bidi_text = str(text)
        return Paragraph(bidi_text, styles[style])
        
    def format_cell_text(text):
        """Helper to convert numerals AND format bidi text for a table cell."""
        try:
            arabic_text = to_eastern_arabic_numerals(str(text))
            reshaped_text = arabic_reshaper.reshape(arabic_text)
            bidi_text = get_display(reshaped_text)
        except Exception:
            bidi_text = str(text)
        return Paragraph(bidi_text, styles['Arabic'])

    print(f"  - جارٍ إعداد محتوى PDF...")
    elements = []
    
    # Add logo in top right corner
    try:
        logo_path = 'Logo.jpg'
        if os.path.exists(logo_path):
            logo_img = Image(logo_path, width=100, height=100, kind='proportional')
            title_text = format_arabic("مواعيد غرفة الموسيقي (6 مساءً - 10 مساءً)", style='ArabicTitle')
            
            header_table = Table([
                [title_text, logo_img]
            ], colWidths=[A4[0] - 140, 100])
            header_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (0, 0), 'LEFT'),
                ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                ('LINEBELOW', (0, 0), (-1, -1), 0, colors.white),
                ('LINEABOVE', (0, 0), (-1, -1), 0, colors.white),
                ('LINEBEFORE', (0, 0), (-1, -1), 0, colors.white),
                ('LINEAFTER', (0, 0), (-1, -1), 0, colors.white),
            ]))
            elements.append(header_table)
            print(f"  - تم إضافة اللوجو بنجاح.")
        else:
            title_text = format_arabic("مواعيد غرفة الموسيقي (6 مساءً - 10 مساءً)", style='ArabicTitle')
            elements.append(title_text)
            print(f"  - تحذير: لم يتم العثور على ملف اللوجو '{logo_path}'")
    except Exception as e:
        title_text = format_arabic("مواعيد غرفة الموسيقي (6 مساءً - 10 مساءً)", style='ArabicTitle')
        elements.append(title_text)
        print(f"  - تحذير: خطأ في تحميل اللوجو: {e}")
    
    elements.append(Spacer(1, 12))

    # --- Recurring Bookings Table ---
    if recurring_data:
        print(f"  - جارٍ إنشاء جدول المواعيد الثابتة ({len(recurring_data)} حجز)...")
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
                row = [
                    format_cell_text(item.get('Provider', '')),
                    format_cell_text(item.get('Service', '')),
                    format_cell_text(item.get('Room', '')),
                    format_cell_text(item.get('Day', '')),
                    format_cell_text(item.get('Booking Count', '')),
                    format_cell_text(item.get('Time', '')),
                    format_cell_text(item.get('Date', ''))
                ]
                recurring_table_data.append(row)
            except Exception as e:
                if len(recurring_data) <= 100:
                    print(f"    - تحذير: خطأ في معالجة الحجز المتكرر {i + 1}: {e}")
                continue
        
        print(f"  - جارٍ إنشاء الجدول ({len(recurring_table_data)} صف)...")
        try:
            t1 = Table(recurring_table_data, repeatRows=1)
            t1.setStyle(TableStyle([
                # Header row - blue background
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4A90E2')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#2C3E50')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#E8F4F8')]),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('LEADING', (0, 0), (-1, -1), 11),
            ]))
            elements.append(t1)
            print(f"  - تم إنشاء جدول المواعيد الثابتة.")
        except Exception as e:
            print(f"  - خطأ في إنشاء جدول المواعيد الثابتة: {e}")
            raise
    else:
        print("  - لا توجد بيانات لعرضها.")

    print(f"  - جارٍ بناء ملف PDF...")
    try:
        import time
        start_time = time.time()
        doc.build(elements)
        elapsed_time = time.time() - start_time
        print(f"  - ✓ تم إنشاء ملف PDF بنجاح: '{output_filename}'")
        print(f"  - الوقت المستغرق: {elapsed_time:.2f} ثانية")
    except Exception as e:
        print(f"  - ✗ خطأ في بناء ملف PDF: {type(e).__name__}: {e}")
        import traceback
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
    recurring = process_bookings_for_music_room(bookings_df)
    
    if not recurring:
        print("لا توجد مواعيد ثابتة لغرفة الموسيقي في الفترة من 6 مساءً إلى 10 مساءً.")
        sys.exit(0)
    
    print("\nجارٍ ترتيب البيانات...")
    recurring_sorted = sorted(recurring, key=lambda x: (x['Day'], x['Time'], x['Date']))
    
    print("\nجارٍ إنشاء ملف PDF...")
    create_pdf(recurring_sorted)
    print("\nاكتمل التنفيذ بنجاح!")

