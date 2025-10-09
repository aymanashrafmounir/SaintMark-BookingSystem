const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
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

// Export monthly report (admin only)
router.get('/monthly-report', authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.query;
    
    // Validate year and month
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const workbook = new ExcelJS.Workbook();
    
    // Sheet 1: Monthly Summary
    const summarySheet = workbook.addWorksheet('Monthly Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 }
    ];

    // Get statistics
    const totalSlots = await Slot.countDocuments({
      date: { $gte: startDate, $lte: endDate }
    });

    const bookedSlots = await Slot.countDocuments({
      date: { $gte: startDate, $lte: endDate },
      status: 'booked'
    });

    const availableSlots = await Slot.countDocuments({
      date: { $gte: startDate, $lte: endDate },
      status: 'available'
    });

    const totalBookings = await Booking.countDocuments({
      date: { $gte: startDate, $lte: endDate }
    });

    const approvedBookings = await Booking.countDocuments({
      date: { $gte: startDate, $lte: endDate },
      status: 'approved'
    });

    const rejectedBookings = await Booking.countDocuments({
      date: { $gte: startDate, $lte: endDate },
      status: 'rejected'
    });

    const pendingBookings = await Booking.countDocuments({
      date: { $gte: startDate, $lte: endDate },
      status: 'pending'
    });

    // Add summary data
    summarySheet.addRows([
      { metric: 'Report Period', value: `${year}-${month.toString().padStart(2, '0')}` },
      { metric: 'Total Slots', value: totalSlots },
      { metric: 'Booked Slots', value: bookedSlots },
      { metric: 'Available Slots', value: availableSlots },
      { metric: 'Booking Rate', value: totalSlots > 0 ? `${((bookedSlots / totalSlots) * 100).toFixed(2)}%` : '0%' },
      { metric: 'Total Bookings', value: totalBookings },
      { metric: 'Approved Bookings', value: approvedBookings },
      { metric: 'Rejected Bookings', value: rejectedBookings },
      { metric: 'Pending Bookings', value: pendingBookings },
      { metric: 'Approval Rate', value: totalBookings > 0 ? `${((approvedBookings / totalBookings) * 100).toFixed(2)}%` : '0%' }
    ]);

    // Sheet 2: Daily Breakdown
    const dailySheet = workbook.addWorksheet('Daily Breakdown');
    dailySheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Total Slots', key: 'totalSlots', width: 15 },
      { header: 'Booked Slots', key: 'bookedSlots', width: 15 },
      { header: 'Available Slots', key: 'availableSlots', width: 15 },
      { header: 'Booking Rate', key: 'bookingRate', width: 15 },
      { header: 'Total Bookings', key: 'totalBookings', width: 15 },
      { header: 'Approved', key: 'approved', width: 15 },
      { header: 'Rejected', key: 'rejected', width: 15 },
      { header: 'Pending', key: 'pending', width: 15 }
    ];

    // Generate daily data
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayStart = new Date(currentDate);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59);

      const dayTotalSlots = await Slot.countDocuments({
        date: { $gte: dayStart, $lte: dayEnd }
      });

      const dayBookedSlots = await Slot.countDocuments({
        date: { $gte: dayStart, $lte: dayEnd },
        status: 'booked'
      });

      const dayAvailableSlots = await Slot.countDocuments({
        date: { $gte: dayStart, $lte: dayEnd },
        status: 'available'
      });

      const dayTotalBookings = await Booking.countDocuments({
        date: { $gte: dayStart, $lte: dayEnd }
      });

      const dayApprovedBookings = await Booking.countDocuments({
        date: { $gte: dayStart, $lte: dayEnd },
        status: 'approved'
      });

      const dayRejectedBookings = await Booking.countDocuments({
        date: { $gte: dayStart, $lte: dayEnd },
        status: 'rejected'
      });

      const dayPendingBookings = await Booking.countDocuments({
        date: { $gte: dayStart, $lte: dayEnd },
        status: 'pending'
      });

      const bookingRate = dayTotalSlots > 0 ? `${((dayBookedSlots / dayTotalSlots) * 100).toFixed(2)}%` : '0%';

      dailySheet.addRow({
        date: currentDate.toLocaleDateString(),
        totalSlots: dayTotalSlots,
        bookedSlots: dayBookedSlots,
        availableSlots: dayAvailableSlots,
        bookingRate: bookingRate,
        totalBookings: dayTotalBookings,
        approved: dayApprovedBookings,
        rejected: dayRejectedBookings,
        pending: dayPendingBookings
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sheet 3: Room Performance
    const roomSheet = workbook.addWorksheet('Room Performance');
    roomSheet.columns = [
      { header: 'Room Name', key: 'roomName', width: 25 },
      { header: 'Total Slots', key: 'totalSlots', width: 15 },
      { header: 'Booked Slots', key: 'bookedSlots', width: 15 },
      { header: 'Available Slots', key: 'availableSlots', width: 15 },
      { header: 'Booking Rate', key: 'bookingRate', width: 15 },
      { header: 'Total Bookings', key: 'totalBookings', width: 15 },
      { header: 'Approved', key: 'approved', width: 15 },
      { header: 'Rejected', key: 'rejected', width: 15 },
      { header: 'Pending', key: 'pending', width: 15 }
    ];

    // Get room performance data
    const rooms = await Room.find();
    for (const room of rooms) {
      const roomTotalSlots = await Slot.countDocuments({
        roomId: room._id,
        date: { $gte: startDate, $lte: endDate }
      });

      const roomBookedSlots = await Slot.countDocuments({
        roomId: room._id,
        date: { $gte: startDate, $lte: endDate },
        status: 'booked'
      });

      const roomAvailableSlots = await Slot.countDocuments({
        roomId: room._id,
        date: { $gte: startDate, $lte: endDate },
        status: 'available'
      });

      const roomTotalBookings = await Booking.countDocuments({
        roomId: room._id,
        date: { $gte: startDate, $lte: endDate }
      });

      const roomApprovedBookings = await Booking.countDocuments({
        roomId: room._id,
        date: { $gte: startDate, $lte: endDate },
        status: 'approved'
      });

      const roomRejectedBookings = await Booking.countDocuments({
        roomId: room._id,
        date: { $gte: startDate, $lte: endDate },
        status: 'rejected'
      });

      const roomPendingBookings = await Booking.countDocuments({
        roomId: room._id,
        date: { $gte: startDate, $lte: endDate },
        status: 'pending'
      });

      const roomBookingRate = roomTotalSlots > 0 ? `${((roomBookedSlots / roomTotalSlots) * 100).toFixed(2)}%` : '0%';

      roomSheet.addRow({
        roomName: room.name,
        totalSlots: roomTotalSlots,
        bookedSlots: roomBookedSlots,
        availableSlots: roomAvailableSlots,
        bookingRate: roomBookingRate,
        totalBookings: roomTotalBookings,
        approved: roomApprovedBookings,
        rejected: roomRejectedBookings,
        pending: roomPendingBookings
      });
    }

    // Sheet 4: Detailed Bookings
    const bookingsSheet = workbook.addWorksheet('Detailed Bookings');
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

    const monthlyBookings = await Booking.find({
      date: { $gte: startDate, $lte: endDate }
    })
      .populate('roomId', 'name')
      .sort({ date: -1 });
    
    monthlyBookings.forEach(booking => {
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
    [summarySheet, dailySheet, roomSheet, bookingsSheet].forEach(sheet => {
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
      `attachment; filename=monthly-report-${year}-${month.toString().padStart(2, '0')}.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Monthly report export error:', error);
    res.status(500).json({ error: 'Failed to export monthly report' });
  }
});

// Export all months report (admin only)
router.get('/all-months-report', authMiddleware, async (req, res) => {
  try {
    const { year } = req.query;
    
    if (!year) {
      return res.status(400).json({ error: 'Year is required' });
    }

    const workbook = new ExcelJS.Workbook();
    
    // Create a sheet for each month
    for (let month = 1; month <= 12; month++) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      
      const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
      const sheet = workbook.addWorksheet(`${monthName} ${year}`);
      
      sheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Total Slots', key: 'totalSlots', width: 15 },
        { header: 'Booked Slots', key: 'bookedSlots', width: 15 },
        { header: 'Available Slots', key: 'availableSlots', width: 15 },
        { header: 'Booking Rate', key: 'bookingRate', width: 15 },
        { header: 'Total Bookings', key: 'totalBookings', width: 15 },
        { header: 'Approved', key: 'approved', width: 15 },
        { header: 'Rejected', key: 'rejected', width: 15 },
        { header: 'Pending', key: 'pending', width: 15 }
      ];

      // Generate daily data for the month
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dayStart = new Date(currentDate);
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59);

        const dayTotalSlots = await Slot.countDocuments({
          date: { $gte: dayStart, $lte: dayEnd }
        });

        const dayBookedSlots = await Slot.countDocuments({
          date: { $gte: dayStart, $lte: dayEnd },
          status: 'booked'
        });

        const dayAvailableSlots = await Slot.countDocuments({
          date: { $gte: dayStart, $lte: dayEnd },
          status: 'available'
        });

        const dayTotalBookings = await Booking.countDocuments({
          date: { $gte: dayStart, $lte: dayEnd }
        });

        const dayApprovedBookings = await Booking.countDocuments({
          date: { $gte: dayStart, $lte: dayEnd },
          status: 'approved'
        });

        const dayRejectedBookings = await Booking.countDocuments({
          date: { $gte: dayStart, $lte: dayEnd },
          status: 'rejected'
        });

        const dayPendingBookings = await Booking.countDocuments({
          date: { $gte: dayStart, $lte: dayEnd },
          status: 'pending'
        });

        const bookingRate = dayTotalSlots > 0 ? `${((dayBookedSlots / dayTotalSlots) * 100).toFixed(2)}%` : '0%';

        sheet.addRow({
          date: currentDate.toLocaleDateString(),
          totalSlots: dayTotalSlots,
          bookedSlots: dayBookedSlots,
          availableSlots: dayAvailableSlots,
          bookingRate: bookingRate,
          totalBookings: dayTotalBookings,
          approved: dayApprovedBookings,
          rejected: dayRejectedBookings,
          pending: dayPendingBookings
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Style headers
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      sheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
    }

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=yearly-report-${year}.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('All months report export error:', error);
    res.status(500).json({ error: 'Failed to export all months report' });
  }
});

module.exports = router;

