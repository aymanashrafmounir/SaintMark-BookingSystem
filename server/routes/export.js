const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const puppeteer = require('puppeteer');
const Room = require('../models/Room');
const Slot = require('../models/Slot');
const Booking = require('../models/Booking');
const authMiddleware = require('../middleware/auth');

// Export all data to Excel (admin only)
router.get('/excel', authMiddleware, async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    
    // Sheet 1: Rooms
    const roomsSheet = workbook.addWorksheet('Rooms');
    roomsSheet.columns = [
      { header: 'ID', key: 'id', width: 30 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Enabled', key: 'isEnabled', width: 15 },
      { header: 'Created At', key: 'createdAt', width: 20 }
    ];

    const rooms = await Room.find().sort({ createdAt: -1 });
    rooms.forEach(room => {
      roomsSheet.addRow({
        id: room._id.toString(),
        name: room.name,
        isEnabled: room.isEnabled ? 'Yes' : 'No',
        createdAt: room.createdAt.toLocaleString()
      });
    });

    // Sheet 2: Slots
    const slotsSheet = workbook.addWorksheet('Slots');
    slotsSheet.columns = [
      { header: 'ID', key: 'id', width: 30 },
      { header: 'Room', key: 'room', width: 25 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Start Time', key: 'startTime', width: 15 },
      { header: 'End Time', key: 'endTime', width: 15 },
      { header: 'Service Name', key: 'serviceName', width: 25 },
      { header: 'Provider Name', key: 'providerName', width: 25 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Booked By', key: 'bookedBy', width: 25 }
    ];

    const slots = await Slot.find().populate('roomId', 'name').sort({ date: -1 });
    slots.forEach(slot => {
      slotsSheet.addRow({
        id: slot._id.toString(),
        room: slot.roomId?.name || 'N/A',
        date: new Date(slot.date).toLocaleDateString(),
        startTime: slot.startTime,
        endTime: slot.endTime,
        serviceName: slot.serviceName,
        providerName: slot.providerName,
        type: slot.type,
        status: slot.status,
        bookedBy: slot.bookedBy || 'N/A'
      });
    });

    // Sheet 3: Bookings
    const bookingsSheet = workbook.addWorksheet('Bookings');
    bookingsSheet.columns = [
      { header: 'ID', key: 'id', width: 30 },
      { header: 'User Name', key: 'userName', width: 25 },
      { header: 'Room', key: 'room', width: 25 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Start Time', key: 'startTime', width: 15 },
      { header: 'End Time', key: 'endTime', width: 15 },
      { header: 'Service Name', key: 'serviceName', width: 25 },
      { header: 'Provider Name', key: 'providerName', width: 25 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Created At', key: 'createdAt', width: 20 },
      { header: 'Updated At', key: 'updatedAt', width: 20 }
    ];

    const bookings = await Booking.find()
      .populate('roomId', 'name')
      .sort({ createdAt: -1 });
    
    bookings.forEach(booking => {
      bookingsSheet.addRow({
        id: booking._id.toString(),
        userName: booking.userName,
        room: booking.roomId?.name || 'N/A',
        date: new Date(booking.date).toLocaleDateString(),
        startTime: booking.startTime,
        endTime: booking.endTime,
        serviceName: booking.serviceName,
        providerName: booking.providerName,
        status: booking.status,
        createdAt: booking.createdAt.toLocaleString(),
        updatedAt: booking.updatedAt.toLocaleString()
      });
    });

    // Style headers
    [roomsSheet, slotsSheet, bookingsSheet].forEach(sheet => {
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      sheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
    });

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=booking-system-export-${Date.now()}.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Export slots data to Excel with month interval (admin only)
router.get('/slots/excel', authMiddleware, async (req, res) => {
  try {
    const { startMonth, endMonth } = req.query;
    
    if (!startMonth || !endMonth) {
      return res.status(400).json({ error: 'يجب تحديد شهر البداية وشهر النهاية' });
    }

    // Parse month strings (format: YYYY-MM)
    const startDate = new Date(startMonth + '-01');
    const endDate = new Date(endMonth + '-01');
    
    // Set end date to last day of the month
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);

    // Query slots within the date range
    const slots = await Slot.find({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).populate('roomId', 'name').sort({ date: 1, startTime: 1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('المواعيد');

    // Set columns with Arabic headers
    worksheet.columns = [
      { header: 'الخدمة', key: 'serviceName', width: 25 },
      { header: 'اسم الخادم', key: 'providerName', width: 25 },
      { header: 'رقم الخادم', key: 'providerNumber', width: 20 },
      { header: 'التاريخ', key: 'date', width: 15 },
      { header: 'الوقت', key: 'time', width: 20 },
      { header: 'المكان', key: 'room', width: 20 },
      { header: 'النوع', key: 'type', width: 15 },
      { header: 'الحالة', key: 'status', width: 15 }
    ];

    // Add data rows
    slots.forEach(slot => {
      const startTime = slot.startTime;
      const endTime = slot.endTime;
      const timeRange = `${startTime} - ${endTime}`;
      
      worksheet.addRow({
        serviceName: slot.serviceName || '',
        providerName: slot.providerName || '',
        providerNumber: '', // This field doesn't exist in the model, leaving empty
        date: new Date(slot.date).toLocaleDateString('ar-EG'),
        time: timeRange,
        room: slot.roomId?.name || 'غير محدد',
        type: slot.type === 'weekly' ? 'أسبوعي' : 'مرة واحدة',
        status: slot.status === 'available' ? 'متاح' : 'محجوز'
      });
    });

    // Style headers
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=مواعيد-${startMonth}-إلى-${endMonth}-${Date.now()}.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export slots error:', error);
    res.status(500).json({ error: 'فشل تصدير المواعيد' });
  }
});

// Export slots data to PDF with month interval (admin only)
router.get('/slots/pdf', authMiddleware, async (req, res) => {
  try {
    const { startMonth, endMonth } = req.query;
    
    if (!startMonth || !endMonth) {
      return res.status(400).json({ error: 'يجب تحديد شهر البداية وشهر النهاية' });
    }

    // Parse month strings (format: YYYY-MM)
    const startDate = new Date(startMonth + '-01');
    const endDate = new Date(endMonth + '-01');
    
    // Set end date to last day of the month
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);

    // Query slots within the date range
    const slots = await Slot.find({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).populate('roomId', 'name').sort({ date: 1, startTime: 1 });

    // Generate HTML content for PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>تقرير المواعيد</title>
        <style>
          body {
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 20px;
            direction: rtl;
            text-align: right;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
          }
          .header h1 {
            color: #333;
            margin: 0;
            font-size: 24px;
          }
          .header p {
            color: #666;
            margin: 5px 0;
            font-size: 14px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            font-size: 12px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: right;
          }
          th {
            background-color: #4472C4;
            color: white;
            font-weight: bold;
          }
          tr:nth-child(even) {
            background-color: #f9f9f9;
          }
          .summary {
            margin-top: 30px;
            padding: 15px;
            background-color: #f0f0f0;
            border-radius: 5px;
          }
          .summary h3 {
            margin-top: 0;
            color: #333;
          }
          .no-data {
            text-align: center;
            padding: 40px;
            color: #666;
            font-size: 16px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>تقرير المواعيد</h1>
          <p>من ${startMonth} إلى ${endMonth}</p>
          <p>تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}</p>
        </div>
        
        ${slots.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th>الخدمة</th>
                <th>اسم الخادم</th>
                <th>رقم الخادم</th>
                <th>التاريخ</th>
                <th>الوقت</th>
                <th>المكان</th>
                <th>النوع</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              ${slots.map(slot => `
                <tr>
                  <td>${slot.serviceName || ''}</td>
                  <td>${slot.providerName || ''}</td>
                  <td></td>
                  <td>${new Date(slot.date).toLocaleDateString('ar-EG')}</td>
                  <td>${slot.startTime} - ${slot.endTime}</td>
                  <td>${slot.roomId?.name || 'غير محدد'}</td>
                  <td>${slot.type === 'weekly' ? 'أسبوعي' : 'مرة واحدة'}</td>
                  <td>${slot.status === 'available' ? 'متاح' : 'محجوز'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="summary">
            <h3>ملخص التقرير</h3>
            <p><strong>إجمالي المواعيد:</strong> ${slots.length}</p>
            <p><strong>المواعيد المتاحة:</strong> ${slots.filter(s => s.status === 'available').length}</p>
            <p><strong>المواعيد المحجوزة:</strong> ${slots.filter(s => s.status === 'booked').length}</p>
            <p><strong>المواعيد الأسبوعية:</strong> ${slots.filter(s => s.type === 'weekly').length}</p>
            <p><strong>المواعيد لمرة واحدة:</strong> ${slots.filter(s => s.type === 'single').length}</p>
          </div>
        ` : `
          <div class="no-data">
            <p>لا توجد مواعيد في الفترة المحددة</p>
          </div>
        `}
      </body>
      </html>
    `;

    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm'
      }
    });
    
    await browser.close();

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=مواعيد-${startMonth}-إلى-${endMonth}-${Date.now()}.pdf`
    );

    res.send(pdfBuffer);
  } catch (error) {
    console.error('Export slots PDF error:', error);
    res.status(500).json({ error: 'فشل تصدير المواعيد إلى PDF' });
  }
});

module.exports = router;

