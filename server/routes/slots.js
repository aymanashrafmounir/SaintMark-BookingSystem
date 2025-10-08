const express = require('express');
const router = express.Router();
const Slot = require('../models/Slot');
const authMiddleware = require('../middleware/auth');

// Get slots by room and date (public - for users)
router.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { date } = req.query;

    let query = { roomId };
    
    if (date) {
      const searchDate = new Date(date);
      const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));
      
      query.date = { $gte: startOfDay, $lte: endOfDay };
    }

    const slots = await Slot.find(query)
      .populate('roomId', 'name isEnabled')
      .sort({ date: 1, startTime: 1 });
    
    res.json(slots);
  } catch (error) {
    console.error('Get slots error:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
});

// Get all slots (admin)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const slots = await Slot.find()
      .populate('roomId', 'name isEnabled')
      .sort({ date: -1, startTime: 1 });
    
    res.json(slots);
  } catch (error) {
    console.error('Get all slots error:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
});

// Create slot (admin only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { roomId, startTime, endTime, serviceName, providerName, date, type } = req.body;

    if (!roomId || !startTime || !endTime || !date) {
      return res.status(400).json({ error: 'Room, time, and date are required' });
    }

    // If serviceName and providerName are empty/null, slot is available for booking
    // If they have values, slot is unavailable (already has service/provider assigned)
    const hasServiceProvider = serviceName && providerName;
    
    const slot = new Slot({
      roomId,
      startTime,
      endTime,
      serviceName: serviceName || '',
      providerName: providerName || '',
      date: new Date(date),
      type: type || 'single',
      status: hasServiceProvider ? 'booked' : 'available',
      bookedBy: hasServiceProvider ? providerName : null
    });

    await slot.save();
    const populatedSlot = await Slot.findById(slot._id).populate('roomId', 'name isEnabled');
    res.status(201).json(populatedSlot);
  } catch (error) {
    console.error('Create slot error:', error);
    res.status(500).json({ error: 'Failed to create slot' });
  }
});

// Bulk create slots (admin only) - Add multiple slots to multiple rooms at once
router.post('/bulk', authMiddleware, async (req, res) => {
  try {
    const { roomIds, slots } = req.body;

    // Validate input
    if (!roomIds || !Array.isArray(roomIds) || roomIds.length === 0) {
      return res.status(400).json({ error: 'At least one room must be selected' });
    }

    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: 'At least one slot must be provided' });
    }

    // Validate each slot has required fields
    for (const slot of slots) {
      if (!slot.startTime || !slot.endTime || !slot.date) {
        return res.status(400).json({ error: 'Each slot must have startTime, endTime, and date' });
      }
    }

    // Create all combinations of rooms and slots
    const slotsToCreate = [];
    
    for (const roomId of roomIds) {
      for (const slotData of slots) {
        const hasServiceProvider = slotData.serviceName && slotData.providerName;
        
        slotsToCreate.push({
          roomId,
          startTime: slotData.startTime,
          endTime: slotData.endTime,
          serviceName: slotData.serviceName || '',
          providerName: slotData.providerName || '',
          date: new Date(slotData.date),
          type: slotData.type || 'single',
          status: hasServiceProvider ? 'booked' : 'available',
          bookedBy: hasServiceProvider ? slotData.providerName : null
        });
      }
    }

    // Insert all slots at once
    const createdSlots = await Slot.insertMany(slotsToCreate);
    
    // Populate room details
    const populatedSlots = await Slot.find({ 
      _id: { $in: createdSlots.map(s => s._id) } 
    }).populate('roomId', 'name isEnabled');

    res.status(201).json({
      success: true,
      count: populatedSlots.length,
      slots: populatedSlots
    });
  } catch (error) {
    console.error('Bulk create slots error:', error);
    res.status(500).json({ error: 'Failed to create slots' });
  }
});

// Update slot (admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { startTime, endTime, serviceName, providerName, date, type } = req.body;
    
    const slot = await Slot.findById(req.params.id);
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    if (startTime) slot.startTime = startTime;
    if (endTime) slot.endTime = endTime;
    
    // Update serviceName and providerName (can be empty)
    if (serviceName !== undefined) slot.serviceName = serviceName || '';
    if (providerName !== undefined) slot.providerName = providerName || '';
    
    if (date) slot.date = new Date(date);
    if (type) slot.type = type;
    
    // Update status based on whether service/provider are filled
    const hasServiceProvider = slot.serviceName && slot.providerName;
    slot.status = hasServiceProvider ? 'booked' : 'available';
    slot.bookedBy = hasServiceProvider ? slot.providerName : null;

    await slot.save();
    const updatedSlot = await Slot.findById(slot._id).populate('roomId', 'name isEnabled');
    res.json(updatedSlot);
  } catch (error) {
    console.error('Update slot error:', error);
    res.status(500).json({ error: 'Failed to update slot' });
  }
});

// Delete slot (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const slot = await Slot.findById(req.params.id);
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    await Slot.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Slot deleted successfully' });
  } catch (error) {
    console.error('Delete slot error:', error);
    res.status(500).json({ error: 'Failed to delete slot' });
  }
});

module.exports = router;

