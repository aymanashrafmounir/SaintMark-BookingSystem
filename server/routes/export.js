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

// Export all slots to JSON (admin only)
router.get('/slots/json', authMiddleware, async (req, res) => {
  try {
    const slots = await Slot.find()
      .populate('roomId', 'name isEnabled')
      .sort({ date: -1, startTime: 1 })
      .lean();

    // Format the data for JSON export
    const formattedSlots = slots.map(slot => ({
      id: slot._id.toString(),
      roomId: slot.roomId._id.toString(),
      roomName: slot.roomId.name,
      roomEnabled: slot.roomId.isEnabled,
      startTime: slot.startTime,
      endTime: slot.endTime,
      serviceName: slot.serviceName,
      providerName: slot.providerName,
      date: slot.date,
      type: slot.type,
      status: slot.status,
      bookedBy: slot.bookedBy,
      createdAt: slot.createdAt
    }));

    // Set response headers for JSON download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=slots-export-${Date.now()}.json`);
    
    res.json({
      exportDate: new Date().toISOString(),
      totalSlots: formattedSlots.length,
      slots: formattedSlots
    });
  } catch (error) {
    console.error('Export slots JSON error:', error);
    res.status(500).json({ error: 'Failed to export slots' });
  }
});

module.exports = router;

