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

// Get slots with pagination and filtering (public - for users)
router.get('/public', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      roomId, 
      roomIds, // comma-separated room IDs for group filtering
      dateRangeStart,
      dateRangeEnd,
      startTime,
      endTime
    } = req.query;

    // Build filter query
    const filter = {};
    
    if (roomIds) {
      // Handle multiple room IDs (for group filtering)
      const roomIdArray = roomIds.split(',').map(id => id.trim());
      filter.roomId = { $in: roomIdArray };
    } else if (roomId) {
      filter.roomId = roomId;
    }
    
    // Date range filtering
    if (dateRangeStart && dateRangeEnd) {
      const startDate = new Date(dateRangeStart);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateRangeEnd);
      endDate.setHours(23, 59, 59, 999);
      filter.date = { $gte: startDate, $lte: endDate };
    }
    
    // Time filtering
    if (startTime) filter.startTime = startTime;
    if (endTime) filter.endTime = endTime;

    // Calculate pagination
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Execute query with pagination
    const slots = await Slot.find(filter)
      .populate('roomId', 'name isEnabled')
      .sort({ date: 1, startTime: 1 })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    // Get total count for pagination
    const totalCount = await Slot.countDocuments(filter);
    
    res.json({
      slots,
      pagination: {
        total: totalCount,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalCount / limitNumber)
      }
    });
  } catch (error) {
    console.error('Get public slots error:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
});

// Get all slots (admin) with pagination and filtering
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      roomId, 
      roomIds, // comma-separated room IDs for group filtering
      serviceName, 
      providerName, 
      type, 
      date,
      dateRangeStart,
      dateRangeEnd,
      daysOfWeek, // comma-separated: "0,1,6" for Sunday, Monday, Saturday
      timeRanges, // comma-separated time ranges: "10:00-12:00,14:00-16:00"
      startTime, 
      endTime 
    } = req.query;

    // Build filter query
    const filter = {};
    
    if (roomIds) {
      // Handle multiple room IDs (for group filtering)
      const roomIdArray = roomIds.split(',').map(id => id.trim());
      filter.roomId = { $in: roomIdArray };
    } else if (roomId) {
      filter.roomId = roomId;
    }
    if (type) filter.type = type;
    if (startTime) filter.startTime = startTime;
    if (endTime) filter.endTime = endTime;
    
    // Case-insensitive search for text fields
    if (serviceName) {
      filter.serviceName = { $regex: serviceName, $options: 'i' };
    }
    if (providerName) {
      filter.providerName = { $regex: providerName, $options: 'i' };
    }
    
    // Date filtering - prioritize range over single date
    if (dateRangeStart && dateRangeEnd) {
      const startDate = new Date(dateRangeStart);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateRangeEnd);
      endDate.setHours(23, 59, 59, 999);
      filter.date = { $gte: startDate, $lte: endDate };
    } else if (date) {
      const searchDate = new Date(date);
      const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));
      filter.date = { $gte: startOfDay, $lte: endOfDay };
    }

    // Calculate pagination
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Execute query with pagination
    let slots = await Slot.find(filter)
      .populate('roomId', 'name isEnabled')
      .sort({ date: -1, startTime: 1 })
      .lean(); // Use lean() for better performance
    
    // Filter by days of week if specified (client-side filtering for flexibility)
    if (daysOfWeek) {
      const selectedDays = daysOfWeek.split(',').map(d => parseInt(d));
      slots = slots.filter(slot => {
        const slotDay = new Date(slot.date).getDay(); // 0 = Sunday, 1 = Monday, etc.
        return selectedDays.includes(slotDay);
      });
    }
    
    // Filter by time ranges if specified (client-side filtering for flexibility)
    if (timeRanges) {
      const selectedTimeRanges = timeRanges.split(',').map(tr => tr.trim());
      slots = slots.filter(slot => {
        // Check if slot's start time falls within any of the selected time ranges
        return selectedTimeRanges.some(timeRange => {
          const [rangeStart, rangeEnd] = timeRange.split('-');
          return slot.startTime >= rangeStart && slot.startTime < rangeEnd;
        });
      });
    }
    
    // Apply pagination after day filtering
    const totalCount = slots.length;
    const paginatedSlots = slots.slice(skip, skip + limitNumber);
    
    res.json({
      slots: paginatedSlots,
      pagination: {
        total: totalCount,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalCount / limitNumber)
      }
    });
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

// Bulk update slots (admin only) - Update multiple slots with filters or slot IDs
router.put('/bulk-update', authMiddleware, async (req, res) => {
  try {
    const { filters, updates, slotIds: requestedSlotIds } = req.body;

    // If slotIds are provided, update specific slots
    if (requestedSlotIds && Array.isArray(requestedSlotIds) && requestedSlotIds.length > 0) {
      const updateData = {};
      
      // Handle different types of updates
      if (updates.type) {
        updateData.type = updates.type;
      }
      
      if (updates.serviceName !== undefined) {
        updateData.serviceName = updates.serviceName;
      }
      
      if (updates.providerName !== undefined) {
        updateData.providerName = updates.providerName;
      }
      
      if (updates.status) {
        updateData.status = updates.status;
      }
      
      if (updates.bookedBy !== undefined) {
        updateData.bookedBy = updates.bookedBy;
      }

      const result = await Slot.updateMany(
        { _id: { $in: requestedSlotIds } },
        { $set: updateData }
      );

      return res.json({
        success: true,
        count: result.modifiedCount,
        message: `Updated ${result.modifiedCount} slots`
      });
    }

    // Original filter-based bulk update logic
    // Allow empty serviceName and providerName for "make available" operations
    if (!updates) {
      return res.status(400).json({ error: 'Updates object is required' });
    }
    
    // If making slots available, serviceName and providerName can be empty
    const isMakingAvailable = updates.status === 'available' && 
                             (updates.serviceName === '' || updates.serviceName === null) &&
                             (updates.providerName === '' || updates.providerName === null);
    
    if (!isMakingAvailable && (!updates.serviceName || !updates.providerName)) {
      return res.status(400).json({ error: 'Service name and provider name are required for filter-based updates' });
    }

    // Build query from filters
    const query = {};
    
    if (filters.roomIds && filters.roomIds.length > 0) {
      // Handle multiple room IDs (for group filtering)
      let roomIdArray;
      if (Array.isArray(filters.roomIds)) {
        roomIdArray = filters.roomIds;
      } else {
        roomIdArray = filters.roomIds.split(',').map(id => id.trim());
      }
      query.roomId = { $in: roomIdArray };
    } else if (filters.roomId) {
      query.roomId = filters.roomId;
    }
    if (filters.type) query.type = filters.type;
    if (filters.startTime) query.startTime = filters.startTime;
    if (filters.endTime) query.endTime = filters.endTime;
    
    if (filters.serviceName) {
      query.serviceName = { $regex: filters.serviceName, $options: 'i' };
    }
    if (filters.providerName) {
      query.providerName = { $regex: filters.providerName, $options: 'i' };
    }
    
    // Date range filter
    if (filters.dateRangeStart && filters.dateRangeEnd) {
      const startDate = new Date(filters.dateRangeStart);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(filters.dateRangeEnd);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    } else if (filters.date) {
      const searchDate = new Date(filters.date);
      const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));
      query.date = { $gte: startOfDay, $lte: endOfDay };
    }

    // Get slots to filter by day of week if needed
    let slotsToUpdate = await Slot.find(query);
    
    // Filter by days of week if specified
    if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
      let selectedDays;
      if (Array.isArray(filters.daysOfWeek)) {
        selectedDays = filters.daysOfWeek.map(d => parseInt(d));
      } else {
        selectedDays = filters.daysOfWeek.split(',').map(d => parseInt(d));
      }
      slotsToUpdate = slotsToUpdate.filter(slot => {
        const slotDay = new Date(slot.date).getDay();
        return selectedDays.includes(slotDay);
      });
    }
    
    // Filter by time ranges if specified
    if (filters.timeRanges && filters.timeRanges.length > 0) {
      let selectedTimeRanges;
      if (Array.isArray(filters.timeRanges)) {
        selectedTimeRanges = filters.timeRanges;
      } else {
        selectedTimeRanges = filters.timeRanges.split(',').map(tr => tr.trim());
      }
      slotsToUpdate = slotsToUpdate.filter(slot => {
        // Check if slot's start time falls within any of the selected time ranges
        return selectedTimeRanges.some(timeRange => {
          const [rangeStart, rangeEnd] = timeRange.split('-');
          return slot.startTime >= rangeStart && slot.startTime < rangeEnd;
        });
      });
    }

    // Update all matching slots
    const updateData = {
      serviceName: updates.serviceName || '',
      providerName: updates.providerName || '',
      status: updates.status || (isMakingAvailable ? 'available' : 'booked'),
      bookedBy: isMakingAvailable ? null : (updates.providerName || null)
    };

    const slotsToUpdateIds = slotsToUpdate.map(slot => slot._id);
    
    const result = await Slot.updateMany(
      { _id: { $in: slotsToUpdateIds } },
      { $set: updateData }
    );

    res.json({
      success: true,
      count: result.modifiedCount,
      message: `Updated ${result.modifiedCount} slots`
    });
  } catch (error) {
    console.error('Bulk update slots error:', error);
    res.status(500).json({ error: 'Failed to update slots' });
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

// Bulk delete slots (admin only) - Delete multiple slots with filters
router.post('/bulk-delete', authMiddleware, async (req, res) => {
  try {
    const { filters } = req.body;

    // Build query from filters
    const query = {};
    
    if (filters.roomIds && filters.roomIds.length > 0) {
      // Handle multiple room IDs (for group filtering)
      let roomIdArray;
      if (Array.isArray(filters.roomIds)) {
        roomIdArray = filters.roomIds;
      } else {
        roomIdArray = filters.roomIds.split(',').map(id => id.trim());
      }
      query.roomId = { $in: roomIdArray };
    } else if (filters.roomId) {
      query.roomId = filters.roomId;
    }
    if (filters.type) query.type = filters.type;
    if (filters.startTime) query.startTime = filters.startTime;
    if (filters.endTime) query.endTime = filters.endTime;
    
    if (filters.serviceName) {
      query.serviceName = { $regex: filters.serviceName, $options: 'i' };
    }
    if (filters.providerName) {
      query.providerName = { $regex: filters.providerName, $options: 'i' };
    }
    
    // Date range filter
    if (filters.dateRangeStart && filters.dateRangeEnd) {
      const startDate = new Date(filters.dateRangeStart);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(filters.dateRangeEnd);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    } else if (filters.date) {
      const searchDate = new Date(filters.date);
      const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));
      query.date = { $gte: startOfDay, $lte: endOfDay };
    }

    // Get slots to filter by day of week if needed
    let slotsToDelete = await Slot.find(query);
    
    // Filter by days of week if specified
    if (filters.daysOfWeek) {
      let selectedDays;
      if (Array.isArray(filters.daysOfWeek)) {
        selectedDays = filters.daysOfWeek.map(d => parseInt(d));
      } else {
        selectedDays = filters.daysOfWeek.split(',').map(d => parseInt(d));
      }
      slotsToDelete = slotsToDelete.filter(slot => {
        const slotDay = new Date(slot.date).getDay();
        return selectedDays.includes(slotDay);
      });
    }
    
    // Filter by time ranges if specified
    if (filters.timeRanges) {
      let selectedTimeRanges;
      if (Array.isArray(filters.timeRanges)) {
        selectedTimeRanges = filters.timeRanges;
      } else {
        selectedTimeRanges = filters.timeRanges.split(',').map(tr => tr.trim());
      }
      slotsToDelete = slotsToDelete.filter(slot => {
        // Check if slot's start time falls within any of the selected time ranges
        return selectedTimeRanges.some(timeRange => {
          const [rangeStart, rangeEnd] = timeRange.split('-');
          return slot.startTime >= rangeStart && slot.startTime < rangeEnd;
        });
      });
    }

    // Delete all matching slots
    const slotsToDeleteIds = slotsToDelete.map(slot => slot._id);
    const result = await Slot.deleteMany({ _id: { $in: slotsToDeleteIds } });

    res.json({
      success: true,
      count: result.deletedCount,
      message: `Deleted ${result.deletedCount} slots`
    });
  } catch (error) {
    console.error('Bulk delete slots error:', error);
    res.status(500).json({ error: 'Failed to delete slots' });
  }
});

module.exports = router;

