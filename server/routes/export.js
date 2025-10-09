const express = require('express');
const router = express.Router();
const Slot = require('../models/Slot');
const authMiddleware = require('../middleware/auth');


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

