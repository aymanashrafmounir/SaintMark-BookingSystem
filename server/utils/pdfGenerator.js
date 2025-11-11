const PdfPrinter = require('pdfmake');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Try to load fonts from various locations
let fonts = {};
let fontsLoading = false;
const fontsDir = path.join(__dirname, 'fonts');

// Function to download font if not exists
function downloadFontIfNeeded() {
  return new Promise((resolve, reject) => {
    // Create fonts directory if it doesn't exist
    if (!fs.existsSync(fontsDir)) {
      fs.mkdirSync(fontsDir, { recursive: true });
    }

    const robotoNormal = path.join(fontsDir, 'Roboto-Regular.ttf');
    
    // If font already exists, resolve immediately
    if (fs.existsSync(robotoNormal)) {
      resolve();
      return;
    }

    // Download font from CDN
    console.log('📥 Downloading Roboto font...');
    const fontUrl = 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf';
    const file = fs.createWriteStream(robotoNormal);
    
    https.get(fontUrl, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('✓ Roboto font downloaded successfully');
          resolve();
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        file.close();
        fs.unlinkSync(robotoNormal);
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(fs.createWriteStream(robotoNormal));
          resolve();
        }).on('error', reject);
      } else {
        file.close();
        fs.unlinkSync(robotoNormal);
        reject(new Error(`Failed to download font: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(robotoNormal)) {
        fs.unlinkSync(robotoNormal);
      }
      reject(err);
    });
  });
}

// Load fonts
function loadFonts() {
  const robotoNormal = path.join(fontsDir, 'Roboto-Regular.ttf');

  if (fs.existsSync(robotoNormal)) {
    // Use the same font file for all styles (temporary solution)
    fonts = {
      Roboto: {
        normal: robotoNormal,
        bold: robotoNormal,      // Use same font for now
        italics: robotoNormal,   // Use same font for now
        bolditalics: robotoNormal // Use same font for now
      }
    };
    console.log('✓ Loaded Roboto font from local fonts directory');
    return true;
  }
  return false;
}

// Try to load fonts immediately
if (!loadFonts()) {
  console.warn('⚠ Roboto fonts not found. Will attempt to download on first use.');
}

// Helper function to convert Western to Eastern Arabic numerals
const toEasternArabicNumerals = (text) => {
  if (!text) return '';
  const mapping = {
    '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
    '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩'
  };
  return String(text).replace(/[0-9]/g, (digit) => mapping[digit] || digit);
};

// Helper function to format time from 24h to 12h with ص/م
const formatToAMPM = (timeStr24) => {
  if (!timeStr24) return '';
  try {
    const [hours, minutes] = timeStr24.split(':').map(Number);
    let hour12 = hours % 12;
    if (hour12 === 0) hour12 = 12;
    const ampm = hours >= 12 ? 'م' : 'ص';
    return `${hour12}:${String(minutes).padStart(2, '0')} ${ampm}`;
  } catch (error) {
    return timeStr24;
  }
};

// Helper to get day name in Arabic
const getArabicDayName = (date) => {
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return days[date.getDay()];
};

// Process bookings: merge contiguous slots and identify recurring vs one-time
const processBookings = (slots) => {
  if (!slots || slots.length === 0) {
    return { recurring: [], oneTime: [] };
  }

  // Normalize data
  const normalized = slots.map(slot => ({
    roomName: slot.roomId?.name || 'غير محدد',
    serviceName: slot.serviceName || 'غير محدد',
    providerName: slot.providerName || 'غير محدد',
    date: new Date(slot.date),
    startTime: slot.startTime,
    endTime: slot.endTime,
    status: slot.status
  })).filter(slot => slot.status === 'booked');

  if (normalized.length === 0) {
    return { recurring: [], oneTime: [] };
  }

  // Sort by room, service, provider, date, time
  normalized.sort((a, b) => {
    const keyA = `${a.roomName}|${a.serviceName}|${a.providerName}`;
    const keyB = `${b.roomName}|${b.serviceName}|${b.providerName}`;
    if (keyA !== keyB) return keyA.localeCompare(keyB);
    if (a.date.getTime() !== b.date.getTime()) return a.date.getTime() - b.date.getTime();
    return a.startTime.localeCompare(b.startTime);
  });

  // Merge contiguous slots
  const merged = [];
  let currentSlot = { ...normalized[0] };

  for (let i = 1; i < normalized.length; i++) {
    const nextSlot = normalized[i];
    const sameGroup = 
      currentSlot.roomName === nextSlot.roomName &&
      currentSlot.serviceName === nextSlot.serviceName &&
      currentSlot.providerName === nextSlot.providerName;
    
    const sameDate = currentSlot.date.getTime() === nextSlot.date.getTime();
    const contiguous = currentSlot.endTime === nextSlot.startTime;

    if (sameGroup && sameDate && contiguous) {
      currentSlot.endTime = nextSlot.endTime;
    } else {
      merged.push(currentSlot);
      currentSlot = { ...nextSlot };
    }
  }
  merged.push(currentSlot);

  // Identify recurring vs one-time bookings
  const recurring = [];
  const oneTime = [];

  // Group by recurring key (room|service|provider|day|time)
  const grouped = {};
  merged.forEach(slot => {
    const dayName = getArabicDayName(slot.date);
    const timeRange = `${slot.startTime}-${slot.endTime}`;
    const key = `${slot.roomName}|${slot.serviceName}|${slot.providerName}|${dayName}|${timeRange}`;
    
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(slot);
  });

  // Check each group for weekly recurrence
  Object.values(grouped).forEach(group => {
    if (group.length === 1) {
      // Single occurrence - one-time booking
      const slot = group[0];
      oneTime.push({
        Room: slot.roomName,
        Service: slot.serviceName,
        Provider: slot.providerName,
        Date: slot.date.toISOString().split('T')[0].replace(/-/g, '/'),
        Time: `${formatToAMPM(slot.startTime)} إلى ${formatToAMPM(slot.endTime)}`
      });
    } else {
      // Multiple occurrences - check if weekly recurring
      group.sort((a, b) => a.date.getTime() - b.date.getTime());
      
      let isWeeklyRecurring = true;
      for (let i = 1; i < group.length; i++) {
        const daysDiff = (group[i].date.getTime() - group[i-1].date.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff !== 7) {
          isWeeklyRecurring = false;
          break;
        }
      }

      if (isWeeklyRecurring) {
        // Recurring booking
        const firstSlot = group[0];
        const lastSlot = group[group.length - 1];
        recurring.push({
          Room: firstSlot.roomName,
          Service: firstSlot.serviceName,
          Provider: firstSlot.providerName,
          Day: getArabicDayName(firstSlot.date),
          Time: `${formatToAMPM(firstSlot.startTime)} إلى ${formatToAMPM(firstSlot.endTime)}`,
          'Start Date': firstSlot.date.toISOString().split('T')[0].replace(/-/g, '/'),
          'End Date': lastSlot.date.toISOString().split('T')[0].replace(/-/g, '/'),
          'Booking Count': group.length
        });
      } else {
        // Not weekly recurring - treat as one-time bookings
        group.forEach(slot => {
          oneTime.push({
            Room: slot.roomName,
            Service: slot.serviceName,
            Provider: slot.providerName,
            Date: slot.date.toISOString().split('T')[0].replace(/-/g, '/'),
            Time: `${formatToAMPM(slot.startTime)} إلى ${formatToAMPM(slot.endTime)}`
          });
        });
      }
    }
  });

  // Sort results
  recurring.sort((a, b) => {
    if (a.Room !== b.Room) return a.Room.localeCompare(b.Room);
    if (a.Day !== b.Day) return a.Day.localeCompare(b.Day);
    return a['Start Date'].localeCompare(b['Start Date']);
  });

  oneTime.sort((a, b) => {
    if (a.Room !== b.Room) return a.Room.localeCompare(b.Room);
    return a.Date.localeCompare(b.Date);
  });

  return { recurring, oneTime };
};

// Create PDF document
const createPDF = async (recurringData, oneTimeData) => {
  // Ensure fonts are loaded
  if (Object.keys(fonts).length === 0) {
    if (!fontsLoading) {
      fontsLoading = true;
      try {
        await downloadFontIfNeeded();
        loadFonts();
      } catch (error) {
        fontsLoading = false;
        console.error('Failed to download fonts:', error);
        throw new Error(
          'Fonts not found and could not be downloaded automatically. ' +
          'Please ensure server/utils/fonts/Roboto-Regular.ttf exists.'
        );
      }
      fontsLoading = false;
    } else {
      // Wait for fonts to load (simple polling)
      let attempts = 0;
      while (Object.keys(fonts).length === 0 && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      if (Object.keys(fonts).length === 0) {
        throw new Error('Fonts could not be loaded');
      }
    }
  }
  
  // Create printer with fonts
  const printer = new PdfPrinter(fonts);

  const docDefinition = {
    pageSize: 'A3',
    pageOrientation: 'landscape',
    pageMargins: [36, 36, 36, 36],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 9,
      alignment: 'center'
    },
    content: [
      {
        text: 'تنظيم الخدمه بمبني الخدمات',
        style: 'title',
        alignment: 'center',
        margin: [0, 0, 0, 12]
      },
      ...(recurringData.length > 0 ? [
        {
          text: 'المواعيد الثابتة (الأسبوعية)',
          style: 'subtitle',
          alignment: 'center',
          margin: [0, 0, 0, 6]
        },
        {
          table: {
            headerRows: 1,
            widths: ['*', '*', '*', '*', '*', '*', '*', '*'],
            body: [
              [
                { text: toEasternArabicNumerals('الخادم المسوؤل'), style: 'tableHeader' },
                { text: toEasternArabicNumerals('الخدمة'), style: 'tableHeader' },
                { text: toEasternArabicNumerals('الغرفة'), style: 'tableHeader' },
                { text: toEasternArabicNumerals('اليوم'), style: 'tableHeader' },
                { text: toEasternArabicNumerals('عدد الحجوزات'), style: 'tableHeader' },
                { text: toEasternArabicNumerals('الوقت'), style: 'tableHeader' },
                { text: toEasternArabicNumerals('تاريخ النهاية'), style: 'tableHeader' },
                { text: toEasternArabicNumerals('تاريخ البداية'), style: 'tableHeader' }
              ],
              ...recurringData.map(item => [
                toEasternArabicNumerals(item.Provider || ''),
                toEasternArabicNumerals(item.Service || ''),
                toEasternArabicNumerals(item.Room || ''),
                toEasternArabicNumerals(item.Day || ''),
                toEasternArabicNumerals(item['Booking Count'] || ''),
                toEasternArabicNumerals(item.Time || ''),
                toEasternArabicNumerals(item['End Date'] || ''),
                toEasternArabicNumerals(item['Start Date'] || '')
              ])
            ]
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 24]
        }
      ] : []),
      ...(oneTimeData.length > 0 ? [
        {
          text: 'المواعيد لمرة واحدة',
          style: 'subtitle',
          alignment: 'center',
          margin: [0, 0, 0, 6]
        },
        {
          table: {
            headerRows: 1,
            widths: ['*', '*', '*', '*', '*'],
            body: [
              [
                { text: toEasternArabicNumerals('مقدم الخدمة'), style: 'tableHeader' },
                { text: toEasternArabicNumerals('الخدمة'), style: 'tableHeader' },
                { text: toEasternArabicNumerals('الغرفة'), style: 'tableHeader' },
                { text: toEasternArabicNumerals('الوقت'), style: 'tableHeader' },
                { text: toEasternArabicNumerals('التاريخ'), style: 'tableHeader' }
              ],
              ...oneTimeData.map(item => [
                toEasternArabicNumerals(item.Provider || ''),
                toEasternArabicNumerals(item.Service || ''),
                toEasternArabicNumerals(item.Room || ''),
                toEasternArabicNumerals(item.Time || ''),
                toEasternArabicNumerals(item.Date || '')
              ])
            ]
          },
          layout: 'lightHorizontalLines'
        }
      ] : [])
    ],
    styles: {
      title: {
        fontSize: 14,
        bold: true,
        alignment: 'center'
      },
      subtitle: {
        fontSize: 12,
        bold: true,
        alignment: 'center'
      },
      tableHeader: {
        bold: true,
        fillColor: '#CCCCCC',
        alignment: 'center'
      }
    }
  };

  return printer.createPdfKitDocument(docDefinition);
};

module.exports = {
  processBookings,
  createPDF,
  toEasternArabicNumerals,
  formatToAMPM
};

