import pandas as pd
from datetime import timedelta, datetime 
from reportlab.lib.pagesizes import A3
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from bidi.algorithm import get_display
import arabic_reshaper

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

def process_bookings(file_path):
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
    df = pd.read_json(file_path)
    booked_df = df[df['status'] == 'booked'].copy()
    booked_df['date'] = pd.to_datetime(booked_df['date']).dt.date
    booked_df['group_key'] = booked_df['roomName'] + ' | ' + booked_df['serviceName'] + ' | ' + booked_df['providerName']
    booked_df.sort_values(by=['group_key', 'date', 'startTime'], inplace=True)
    booked_df.reset_index(drop=True, inplace=True)

    # ... (الدمج زي ما هو) ...
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
    merged_df['day_of_week'] = pd.to_datetime(merged_df['date']).dt.day_name()
    merged_df['recurring_key'] = merged_df['group_key'] + ' | ' + merged_df['day_of_week'] + ' | ' + merged_df['startTime'] + ' - ' + merged_df['endTime']

    # ... (تحديد التكرار) ...
    recurring_bookings = []
    one_time_bookings = []
    processed_indices = set()

    for index, row in merged_df.iterrows():
        if index in processed_indices:
            continue
        potential_recurring = merged_df[merged_df['recurring_key'] == row['recurring_key']]
        potential_recurring = potential_recurring.sort_values(by='date')
        is_weekly_recurring = True
        if len(potential_recurring) > 1:
            for i in range(len(potential_recurring) - 1):
                date_diff = (potential_recurring.iloc[i+1]['date'] - potential_recurring.iloc[i]['date']).days
                if date_diff != 7:
                    is_weekly_recurring = False
                    break
        else:
            is_weekly_recurring = False

        if is_weekly_recurring:
            start_date = potential_recurring.iloc[0]['date']
            end_date = potential_recurring.iloc[-1]['date']
            arabic_day = DAY_TRANSLATIONS.get(row['day_of_week'], row['day_of_week'])
            start_time_12 = format_to_ampm(row['startTime'])
            end_time_12 = format_to_ampm(row['endTime'])
            booking_count = len(potential_recurring)
            
            recurring_bookings.append({
                'Room': row['roomName'], 'Service': row['serviceName'], 'Provider': row['providerName'],
                'Day': arabic_day,
                'Time': f"{start_time_12} إلى {end_time_12}",
                'Start Date': start_date.strftime('%Y/%m/%d'),
                'End Date': end_date.strftime('%Y/%m/%d'),
                'Booking Count': booking_count
            })
            processed_indices.update(potential_recurring.index)
        else:
            for _, one_off_row in potential_recurring.iterrows():
                 if one_off_row.name not in processed_indices:
                    start_time_12_one_off = format_to_ampm(one_off_row['startTime'])
                    end_time_12_one_off = format_to_ampm(one_off_row['endTime'])
                    
                    one_time_bookings.append({
                        'Room': one_off_row['roomName'], 'Service': one_off_row['serviceName'], 'Provider': one_off_row['providerName'],
                        'Date': one_off_row['date'].strftime('%Y/%m/%d'),
                        'Time': f"{start_time_12_one_off} إلى {end_time_12_one_off}"
                    })
                    processed_indices.add(one_off_row.name)

    return recurring_bookings, one_time_bookings


def create_pdf(recurring_data, one_time_data, output_filename="Booking_Report.pdf"):
    """
    Generates an A3 PDF report with two tables for recurring and one-time bookings.
    Handles Arabic text rendering.
    """
    try:
        pdfmetrics.registerFont(TTFont('Arabic', 'DejaVuSans.ttf'))
    except:
        print("Font 'DejaVuSans.ttf' not found. Arabic text might not render correctly.")
        print("Please download it and place it in the script's directory.")
        return

    doc = SimpleDocTemplate(output_filename, pagesize=A3)
    styles = getSampleStyleSheet()
    
    styles.add(ParagraphStyle(name='Arabic', fontName='Arabic', fontSize=10, alignment=1)) 
    styles.add(ParagraphStyle(name='ArabicTitle', parent=styles['h2'], fontName='Arabic', fontSize=16, alignment=1, spaceAfter=12))
    
    def format_arabic(text, style='Arabic'):
        """Helper to format text for PDF (no numerals conversion)."""
        reshaped_text = arabic_reshaper.reshape(str(text))
        bidi_text = get_display(reshaped_text)
        return Paragraph(bidi_text, styles[style])
        
    def format_cell_text(text):
        """
        Helper to convert numerals AND format bidi text for a table cell.
        """
        arabic_text = to_eastern_arabic_numerals(str(text))
        reshaped_text = arabic_reshaper.reshape(arabic_text)
        bidi_text = get_display(reshaped_text)
        return bidi_text

    elements = []
    
    title_text = format_arabic("تنظيم الخدمه بمبني الخدمات", style='ArabicTitle')
    elements.append(title_text)
    elements.append(Spacer(1, 24))

    # --- Recurring Bookings Table ---
    if recurring_data:
        elements.append(format_arabic("المواعيد الثابتة (الأسبوعية)", style='ArabicTitle'))
        elements.append(Spacer(1, 12))
        
        recurring_headers = [format_cell_text(h) for h in 
                             ['مقدم الخدمة', 'الخدمة', 'الغرفة', 'اليوم', 'عدد الحجوزات', 'الوقت', 'تاريخ النهاية', 'تاريخ البداية']]
        recurring_table_data = [recurring_headers]
        
        for item in recurring_data:
            row = [
                format_cell_text(item['Provider']), 
                format_cell_text(item['Service']), 
                format_cell_text(item['Room']),
                format_cell_text(item['Day']),
                format_cell_text(item['Booking Count']),
                format_cell_text(item['Time']), 
                format_cell_text(item['End Date']), 
                format_cell_text(item['Start Date']) 
            ]
            recurring_table_data.append(row)
        
        t1 = Table(recurring_table_data)
        t1.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), '#CCCCCC'), ('GRID', (0, 0), (-1, -1), 1, '#000000'),
            ('FONTNAME', (0, 0), (-1, -1), 'Arabic'), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(t1)

    elements.append(Spacer(1, 48))

    # --- One-Time Bookings Table ---
    if one_time_data:
        elements.append(format_arabic("المواعيد لمرة واحدة", style='ArabicTitle'))
        elements.append(Spacer(1, 12))
        
        onetime_headers = [format_cell_text(h) for h in 
                           ['مقدم الخدمة', 'الخدمة', 'الغرفة', 'الوقت', 'التاريخ']]
        onetime_table_data = [onetime_headers]

        for item in one_time_data:
            row = [
                format_cell_text(item['Provider']), 
                format_cell_text(item['Service']), 
                format_cell_text(item['Room']),
                format_cell_text(item['Time']), 
                format_cell_text(item['Date'])
            ]
            onetime_table_data.append(row)
            
        t2 = Table(onetime_table_data)
        t2.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), '#CCCCCC'), ('GRID', (0, 0), (-1, -1), 1, '#000000'),
            ('FONTNAME', (0, 0), (-1, -1), 'Arabic'), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(t2)

    doc.build(elements)
    print(f"PDF report '{output_filename}' has been created successfully.")

# --- Main Execution ---
if __name__ == "__main__":
    json_file = r"C:\Users\sigma\Downloads\Backup Data\10.11.2025\\roombooking.slots.json"
    recurring, onetime = process_bookings(json_file)
    
    recurring_sorted = sorted(recurring, key=lambda x: (x['Room'], x['Day'], x['Start Date']))
    
    # <-- (التصليح) هنا كان الخطأ، تم تصليح 'onEtime' إلى 'onetime'
    onetime_sorted = sorted(onetime, key=lambda x: (x['Room'], x['Date']))
    
    create_pdf(recurring_sorted, onetime_sorted)