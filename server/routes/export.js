const express = require('express');
const router = express.Router();
const Slot = require('../models/Slot');
const authMiddleware = require('../middleware/auth');
const { processBookings, createPDF } = require('../utils/pdfGenerator');


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

// Export bookings to PDF report (admin only)
router.get('/bookings/pdf', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required (format: YYYY-MM-DD)' });
    }

    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    if (start > end) {
      return res.status(400).json({ error: 'startDate must be before or equal to endDate' });
    }

    // Fetch booked slots in date range
    const slots = await Slot.find({
      status: 'booked',
      date: { $gte: start, $lte: end }
    })
      .populate('roomId', 'name isEnabled')
      .sort({ date: 1, startTime: 1 })
      .lean();

    if (slots.length === 0) {
      return res.status(404).json({ error: 'No booked slots found in the specified date range' });
    }

    // Process bookings
    const { recurring, oneTime } = processBookings(slots);

    // Create PDF
    const pdfDoc = createPDF(recurring, oneTime);

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Booking_Report_${startDate}_${endDate}.pdf`);

    // Stream PDF to response
    pdfDoc.pipe(res);
    pdfDoc.end();

  } catch (error) {
    console.error('Export bookings PDF error:', error);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

module.exports = router;

