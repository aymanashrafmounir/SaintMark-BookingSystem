const express = require('express');
const router = express.Router();
const Slot = require('../models/Slot');
const authMiddleware = require('../middleware/auth');
const { logAdminAction } = require('../utils/adminActionLogger');

const statusLabels = {
  available: 'متاح',
  booked: 'محجوز'
};

const typeLabels = {
  single: 'مرة واحدة',
  weekly: 'أسبوعي'
};

const toArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const formatServiceProviderText = (serviceName, providerName) => {
  if (serviceName || providerName) {
    return `الخدمة: ${serviceName || 'غير محددة'}، الخادم: ${providerName || 'غير محدد'}`;
  }
  return 'متاح للحجز (بدون خدمة أو خادم)';
};

const serviceProviderDetailSuffix = (serviceName, providerName) => {
  const summary = formatServiceProviderText(serviceName, providerName);
  return summary ? ` | ${summary}` : '';
};

const isValidDateString = (dateStr) => {
  return typeof dateStr === 'string' && dateStr.trim().length > 0;
};

const formatSlotAssignmentsSummary = (slots = []) => {
  const serviceNames = new Set();
  const providerNames = new Set();
  let availableCount = 0;

  slots.forEach((slot) => {
    if (slot.serviceName) {
      serviceNames.add(slot.serviceName);
    }
    if (slot.providerName) {
      providerNames.add(slot.providerName);
    }
    if (!slot.serviceName && !slot.providerName) {
      availableCount += 1;
    }
  });

  const parts = [];
  if (serviceNames.size) {
    parts.push(`الخدمات: ${Array.from(serviceNames).join('، ')}`);
  }
  if (providerNames.size) {
    parts.push(`الخدام: ${Array.from(providerNames).join('، ')}`);
  }
  if (availableCount) {
    parts.push(`مواعيد متاحة للحجز: ${availableCount}`);
  }

  return parts.length ? ` | ${parts.join(' | ')}` : '';
};

const formatFilterSummary = (filters = {}) => {
  if (!filters || typeof filters !== 'object') return '';

  const parts = [];

  const roomIds = toArray(filters.roomIds);
  if (roomIds.length) {
    parts.push(`الأماكن: ${roomIds.join('، ')}`);
  }
  if (filters.roomId) {
    parts.push(`المكان: ${filters.roomId}`);
  }

  if (filters.dateRangeStart && filters.dateRangeEnd) {
    parts.push(`التاريخ من ${filters.dateRangeStart} إلى ${filters.dateRangeEnd}`);
  } else if (filters.dateRangeStart) {
    parts.push(`التاريخ من ${filters.dateRangeStart}`);
  } else if (filters.dateRangeEnd) {
    parts.push(`التاريخ حتى ${filters.dateRangeEnd}`);
  } else if (filters.date) {
    parts.push(`التاريخ: ${filters.date}`);
  }

  if (filters.startTime) {
    parts.push(`وقت البداية: ${filters.startTime}`);
  }
  if (filters.endTime) {
    parts.push(`وقت النهاية: ${filters.endTime}`);
  }

  const timeRanges = toArray(filters.timeRanges);
  if (timeRanges.length) {
    parts.push(`نطاقات الوقت: ${timeRanges.join('، ')}`);
  }

  const daysOfWeek = toArray(filters.daysOfWeek);
  if (daysOfWeek.length) {
    parts.push(`أيام الأسبوع: ${daysOfWeek.join('، ')}`);
  }

  if (filters.serviceName) {
    parts.push(`الخدمة تحتوي على: ${filters.serviceName}`);
  }
  if (filters.providerName) {
    parts.push(`الخادم يحتوي على: ${filters.providerName}`);
  }

  if (filters.type) {
    parts.push(`النوع: ${typeLabels[filters.type] || filters.type}`);
  }

  return parts.length ? ` | معايير التصفية: ${parts.join('، ')}` : '';
};

const formatUpdateSummary = (updates = {}) => {
  if (!updates || typeof updates !== 'object') return '';

  const parts = [];

  if (Object.prototype.hasOwnProperty.call(updates, 'serviceName')) {
    parts.push(`الخدمة ← ${updates.serviceName || 'فارغة'}`);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'providerName')) {
    parts.push(`الخادم ← ${updates.providerName || 'فارغ'}`);
  }
  if (updates.status) {
    parts.push(`الحالة ← ${statusLabels[updates.status] || updates.status}`);
  }
  if (updates.type) {
    parts.push(`النوع ← ${typeLabels[updates.type] || updates.type}`);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'bookedBy')) {
    parts.push(`تم الحجز بواسطة ← ${updates.bookedBy || 'غير محدد'}`);
  }

  return parts.length ? ` | التعديلات: ${parts.join('، ')}` : '';
};

// Helper function to parse date string to UTC Date (handles YYYY-MM-DD format)
const parseDateToUTC = (dateString) => {
  // Return null if dateString is falsy or empty string
  if (!dateString || (typeof dateString === 'string' && dateString.trim().length === 0)) {
    return null;
  }
  
  // If it's already a Date object, return it
  if (dateString instanceof Date) {
    return dateString;
  }
  
  // Ensure dateString is a string
  if (typeof dateString !== 'string') {
    return null;
  }
  
  // Parse YYYY-MM-DD format as UTC date
  // Split the date string to avoid timezone interpretation issues
  const dateOnly = dateString.split('T')[0].trim();
  const parts = dateOnly.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    const day = parseInt(parts[2], 10);
    
    // Validate that we got valid numbers
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return null;
    }
    
    // Validate reasonable date ranges
    if (year < 1900 || year > 2100 || month < 0 || month > 11 || day < 1 || day > 31) {
      return null;
    }
    
    return new Date(Date.UTC(year, month, day));
  }
  
  // Fallback to standard date parsing
  const parsedDate = new Date(dateString);
  // Check if the parsed date is valid
  if (isNaN(parsedDate.getTime())) {
    return null;
  }
  return parsedDate;
};

// Helper function to get start of day in UTC
const getStartOfDayUTC = (dateString) => {
  const date = parseDateToUTC(dateString);
  if (!date) return null;
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

// Helper function to get end of day in UTC
// Returns the start of the next day (exclusive) for better date range queries
const getEndOfDayUTC = (dateString) => {
  const date = parseDateToUTC(dateString);
  if (!date) return null;
  // Instead of 23:59:59.999, use the start of the next day (exclusive)
  // This is more reliable for date comparisons
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

// Helper function to get start of next day in UTC (exclusive boundary)
const getStartOfNextDayUTC = (dateString) => {
  const date = parseDateToUTC(dateString);
  if (!date) return null;
  // Add one day and set to midnight UTC
  date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

// Get slots by room and date (public - for users)
router.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { date } = req.query;

    let query = { roomId };
    
    if (date) {
      const startOfDay = getStartOfDayUTC(date);
      const startOfNextDay = getStartOfNextDayUTC(date);
      if (startOfDay && startOfNextDay) {
        query.date = { $gte: startOfDay, $lt: startOfNextDay };
      }
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
      date,
      startTime,
      endTime
    } = req.query;

    // Build filter query
    const filter = {};
    
    const sanitizeString = (value) => {
      if (typeof value === 'string') {
        return value.trim();
      }
      return value;
    };

    const sanitizedRoomIds = sanitizeString(roomIds);
    const sanitizedRoomId = sanitizeString(roomId);

    if (sanitizedRoomIds) {
      // Handle multiple room IDs (for group filtering)
      const roomIdArray = sanitizedRoomIds.split(',').map(id => id.trim());
      filter.roomId = { $in: roomIdArray };
    } else if (sanitizedRoomId) {
      filter.roomId = sanitizedRoomId;
    }
    
    // Date range filtering
    const sanitizedDateRangeStart = sanitizeString(dateRangeStart);
    const sanitizedDateRangeEnd = sanitizeString(dateRangeEnd);
    const sanitizedDate = sanitizeString(date);

    if (isValidDateString(sanitizedDateRangeStart) && isValidDateString(sanitizedDateRangeEnd)) {
      const startDate = getStartOfDayUTC(sanitizedDateRangeStart);
      const endDateNextDay = getStartOfNextDayUTC(sanitizedDateRangeEnd);
      if (startDate && endDateNextDay) {
        filter.date = { $gte: startDate, $lt: endDateNextDay };
      }
    } else if (isValidDateString(sanitizedDateRangeStart)) {
      const startDate = getStartOfDayUTC(sanitizedDateRangeStart);
      if (startDate) {
        filter.date = { $gte: startDate };
      }
    } else if (isValidDateString(sanitizedDateRangeEnd)) {
      const endDateNextDay = getStartOfNextDayUTC(sanitizedDateRangeEnd);
      if (endDateNextDay) {
        filter.date = { $lt: endDateNextDay };
      }
    } else if (isValidDateString(sanitizedDate)) {
      const startOfDay = getStartOfDayUTC(sanitizedDate);
      const startOfNextDay = getStartOfNextDayUTC(sanitizedDate);
      if (startOfDay && startOfNextDay) {
        filter.date = { $gte: startOfDay, $lt: startOfNextDay };
      }
    }
    
    // Time filtering
    const sanitizedStartTime = sanitizeString(startTime);
    const sanitizedEndTime = sanitizeString(endTime);
    if (sanitizedStartTime) filter.startTime = sanitizedStartTime;
    if (sanitizedEndTime) filter.endTime = sanitizedEndTime;

    // Build date filter but delay applying it until after querying (to match admin logic)
    let dateFilter = null;
    if (isValidDateString(sanitizedDateRangeStart) && isValidDateString(sanitizedDateRangeEnd)) {
      const startDate = getStartOfDayUTC(sanitizedDateRangeStart);
      const endDateNextDay = getStartOfNextDayUTC(sanitizedDateRangeEnd);
      if (startDate && endDateNextDay) {
        dateFilter = { $gte: startDate, $lt: endDateNextDay };
      }
    } else if (isValidDateString(sanitizedDateRangeStart)) {
      const startDate = getStartOfDayUTC(sanitizedDateRangeStart);
      if (startDate) {
        dateFilter = { $gte: startDate };
      }
    } else if (isValidDateString(sanitizedDateRangeEnd)) {
      const endDateNextDay = getStartOfNextDayUTC(sanitizedDateRangeEnd);
      if (endDateNextDay) {
        dateFilter = { $lt: endDateNextDay };
      }
    } else if (isValidDateString(sanitizedDate)) {
      const startOfDay = getStartOfDayUTC(sanitizedDate);
      const startOfNextDay = getStartOfNextDayUTC(sanitizedDate);
      if (startOfDay && startOfNextDay) {
        dateFilter = { $gte: startOfDay, $lt: startOfNextDay };
      }
    }

    // Calculate pagination (will apply after in-memory filtering)
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const queryWithoutDate = { ...filter };
    delete queryWithoutDate.date;

    let slots = await Slot.find(queryWithoutDate)
      .populate('roomId', 'name isEnabled')
      .sort({ date: 1, startTime: 1 })
      .lean();

    if (dateFilter) {
      slots = slots.filter(slot => {
        if (!slot.date) return false;
        const slotDate = slot.date instanceof Date ? slot.date : new Date(slot.date);
        if (Number.isNaN(slotDate.getTime())) {
          return false;
        }

        if (dateFilter.$gte && dateFilter.$lt) {
          return slotDate >= dateFilter.$gte && slotDate < dateFilter.$lt;
        } else if (dateFilter.$gte) {
          return slotDate >= dateFilter.$gte;
        } else if (dateFilter.$lt) {
          return slotDate < dateFilter.$lt;
        }
        return true;
      });
    }

    const totalCount = slots.length;
    const paginatedSlots = slots.slice(skip, skip + limitNumber);
    
    res.json({
      slots: paginatedSlots,
      pagination: {
        total: totalCount,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalCount / limitNumber) || 0
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
    // Helper to check if a date string is valid (not empty after trimming)
    const isValidDateString = (dateStr) => {
      return dateStr && typeof dateStr === 'string' && dateStr.trim().length > 0;
    };
    
    // Check for date range first (both start and end must be present)
    if (isValidDateString(dateRangeStart) && isValidDateString(dateRangeEnd)) {
      const startDate = getStartOfDayUTC(dateRangeStart);
      const endDateNextDay = getStartOfNextDayUTC(dateRangeEnd);
      if (startDate && endDateNextDay) {
        // Use exclusive upper bound (less than next day) for better date matching
        filter.date = { $gte: startDate, $lt: endDateNextDay };
      }
    } else if (isValidDateString(dateRangeStart)) {
      // Only start date
      const startDate = getStartOfDayUTC(dateRangeStart);
      if (startDate) {
        filter.date = { $gte: startDate };
      }
    } else if (isValidDateString(dateRangeEnd)) {
      // Only end date - use start of next day as exclusive boundary
      const endDateNextDay = getStartOfNextDayUTC(dateRangeEnd);
      if (endDateNextDay) {
        filter.date = { $lt: endDateNextDay };
      }
    } else if (isValidDateString(date)) {
      // Single date filter - search for the entire day
      // Use start of day and start of next day (exclusive) for better matching
      const startOfDay = getStartOfDayUTC(date);
      const startOfNextDay = getStartOfNextDayUTC(date);
      if (startOfDay && startOfNextDay) {
        filter.date = { $gte: startOfDay, $lt: startOfNextDay };
      }
    }

    // Calculate pagination
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Execute query with pagination
    // Build query without date filter first, then apply date filter more flexibly
    const queryWithoutDate = { ...filter };
    delete queryWithoutDate.date;
    
    // Execute query - get all slots matching non-date filters first
    let slots = await Slot.find(queryWithoutDate)
      .populate('roomId', 'name isEnabled')
      .sort({ date: -1, startTime: 1 })
      .lean(); // Use lean() for better performance
    
    // Apply date filter on the results (more flexible than MongoDB query)
    if (filter.date) {
      const dateFilter = filter.date;
      
      slots = slots.filter(slot => {
        if (!slot.date) return false;
        
        const slotDate = slot.date instanceof Date ? slot.date : new Date(slot.date);
        const slotDateStr = slotDate.toISOString().split('T')[0];
        
        // Handle different date filter types
        if (dateFilter.$gte && dateFilter.$lt) {
          // Date range: start <= date < end
          const startDateStr = dateFilter.$gte.toISOString().split('T')[0];
          const endDateStr = dateFilter.$lt.toISOString().split('T')[0];
          return slotDateStr >= startDateStr && slotDateStr < endDateStr;
        } else if (dateFilter.$gte) {
          // Only start date: date >= start
          const startDateStr = dateFilter.$gte.toISOString().split('T')[0];
          return slotDateStr >= startDateStr;
        } else if (dateFilter.$lt) {
          // Only end date: date < end
          const endDateStr = dateFilter.$lt.toISOString().split('T')[0];
          return slotDateStr < endDateStr;
        } else if (dateFilter.$lte) {
          // Less than or equal
          const endDateStr = dateFilter.$lte.toISOString().split('T')[0];
          return slotDateStr <= endDateStr;
        }
        
        return true;
      });
    }
    
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
    
    // Compute status counts before pagination
    const statusCounts = slots.reduce((acc, slot) => {
      const statusKey = slot.status || 'unknown';
      acc[statusKey] = (acc[statusKey] || 0) + 1;
      return acc;
    }, {});

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
      },
      statusCounts
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
    
    // Normalize date to UTC to ensure consistency with queries
    const normalizedDate = parseDateToUTC(date);
    if (!normalizedDate) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    normalizedDate.setUTCHours(0, 0, 0, 0);
    
    const slot = new Slot({
      roomId,
      startTime,
      endTime,
      serviceName: serviceName || '',
      providerName: providerName || '',
      date: normalizedDate,
      type: type || 'single',
      status: hasServiceProvider ? 'booked' : 'available',
      bookedBy: hasServiceProvider ? providerName : null
    });

    await slot.save();
    const populatedSlot = await Slot.findById(slot._id).populate('roomId', 'name isEnabled');

    if (req.adminId) {
      const slotData = populatedSlot.toObject();
      const slotDate = slotData.date instanceof Date
        ? slotData.date.toISOString().split('T')[0]
        : new Date(slotData.date).toISOString().split('T')[0];
      const assignmentDetail = serviceProviderDetailSuffix(slotData.serviceName, slotData.providerName);

      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Added Slot',
        actionType: 'create',
        targetCollection: 'Slot',
        targetIds: [slot._id],
        details: `تمت إضافة موعد ${slotData.startTime}-${slotData.endTime} بتاريخ ${slotDate} للغرفة ${slotData.roomId?.name || 'بدون اسم'}${assignmentDetail}`,
        metadata: { slot: slotData },
        undoPayload: {
          steps: [
            {
              operation: 'delete',
              collection: 'Slot',
              ids: [slot._id.toString()]
            }
          ]
        }
      });
    }

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
        
        // Normalize date to UTC to ensure consistency with queries
        const normalizedDate = parseDateToUTC(slotData.date);
        if (!normalizedDate) {
          return res.status(400).json({ error: `Invalid date format for slot: ${slotData.date}` });
        }
        normalizedDate.setUTCHours(0, 0, 0, 0);
        
        slotsToCreate.push({
          roomId,
          startTime: slotData.startTime,
          endTime: slotData.endTime,
          serviceName: slotData.serviceName || '',
          providerName: slotData.providerName || '',
          date: normalizedDate,
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

    if (req.adminId) {
      const slotDocs = populatedSlots.map((slot) => slot.toObject());
      const assignmentsSummary = formatSlotAssignmentsSummary(slotDocs);
      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Bulk Added Slots',
        actionType: 'bulk-create',
        targetCollection: 'Slot',
        targetIds: slotDocs.map((slot) => slot._id),
        details: `تم إنشاء ${slotDocs.length} موعد/مواعيد جديدة${assignmentsSummary}`,
        metadata: {
          roomIds,
          requestSlots: slots,
          createdSlots: slotDocs
        },
        undoPayload: {
          steps: [
            {
              operation: 'delete',
              collection: 'Slot',
              ids: slotDocs.map((slot) => slot._id.toString())
            }
          ]
        }
      });
    }

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

      const slotsBefore = await Slot.find({ _id: { $in: requestedSlotIds } }).lean();

      const result = await Slot.updateMany(
        { _id: { $in: requestedSlotIds } },
        { $set: updateData }
      );

      if (req.adminId && result.modifiedCount > 0 && slotsBefore.length) {
        const updateSummaryText = formatUpdateSummary(updates);
        await logAdminAction({
          adminId: req.adminId,
          actionName: 'Bulk Updated Slots',
          actionType: 'bulk-update',
          targetCollection: 'Slot',
          targetIds: slotsBefore.map((slot) => slot._id),
          details: `تم تحديث ${result.modifiedCount} موعد (تحديد يدوي)${updateSummaryText}`,
          metadata: {
            updates: updateData,
            slotIds: requestedSlotIds,
            before: slotsBefore
          },
          undoPayload: {
            steps: [
              {
                operation: 'restore',
                collection: 'Slot',
                documents: slotsBefore
              }
            ]
          }
        });
      }

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
    
    console.log('Bulk update: Received filters:', JSON.stringify(filters, null, 2));
    console.log('Bulk update: Received updates:', JSON.stringify(updates, null, 2));
    
    // If making slots available, serviceName and providerName can be empty
    const isMakingAvailable = updates.status === 'available' && 
                             (updates.serviceName === '' || updates.serviceName === null || updates.serviceName === undefined) &&
                             (updates.providerName === '' || updates.providerName === null || updates.providerName === undefined);
    
    console.log('Bulk update: isMakingAvailable:', isMakingAvailable);
    console.log('Bulk update: serviceName:', updates.serviceName, 'providerName:', updates.providerName);
    
    // Only require serviceName and providerName if we're assigning (not making available)
    if (!isMakingAvailable && updates.status !== 'available') {
      if (updates.serviceName === undefined && updates.providerName === undefined) {
        // If neither is provided, it's an error
        return res.status(400).json({ error: 'Service name and provider name are required for filter-based updates' });
      }
      // If one is provided but not the other, it's also an error
      if ((updates.serviceName && !updates.providerName) || (!updates.serviceName && updates.providerName)) {
        return res.status(400).json({ error: 'Both service name and provider name are required when assigning' });
      }
    }

    // Build query from filters
    const query = {};
    
    // Helper to check if a filter value is valid
    const isValidFilter = (val) => {
      if (val === undefined || val === null || val === '') return false;
      if (Array.isArray(val) && val.length === 0) return false;
      if (typeof val === 'string' && val.trim().length === 0) return false;
      return true;
    };
    
    if (filters.roomIds) {
      // Handle multiple room IDs (for group filtering)
      let roomIdArray;
      if (Array.isArray(filters.roomIds)) {
        roomIdArray = filters.roomIds.filter(id => isValidFilter(id));
      } else if (typeof filters.roomIds === 'string' && filters.roomIds.trim()) {
        roomIdArray = filters.roomIds.split(',').map(id => id.trim()).filter(id => isValidFilter(id));
      }
      if (roomIdArray && roomIdArray.length > 0) {
        query.roomId = { $in: roomIdArray };
        console.log('Bulk update: Filtering by roomIds:', roomIdArray);
      }
    } else if (isValidFilter(filters.roomId)) {
      query.roomId = filters.roomId;
      console.log('Bulk update: Filtering by roomId:', filters.roomId);
    }
    
    if (isValidFilter(filters.type)) {
      query.type = filters.type;
    }
    if (isValidFilter(filters.startTime)) {
      query.startTime = filters.startTime;
    }
    if (isValidFilter(filters.endTime)) {
      query.endTime = filters.endTime;
    }
    
    if (isValidFilter(filters.serviceName)) {
      query.serviceName = { $regex: filters.serviceName, $options: 'i' };
    }
    if (isValidFilter(filters.providerName)) {
      query.providerName = { $regex: filters.providerName, $options: 'i' };
    }
    
    // Filter by status if provided
    if (isValidFilter(filters.status)) {
      query.status = filters.status;
      console.log('Bulk update: Filtering by status:', filters.status);
    }
    
    // Helper to check if a date string is valid
    const isValidDateString = (dateStr) => {
      return dateStr && typeof dateStr === 'string' && dateStr.trim().length > 0;
    };
    
    // Build date filter object (but don't add it to query yet - we'll apply it client-side like GET endpoint)
    let dateFilter = null;
    if (isValidDateString(filters.dateRangeStart) && isValidDateString(filters.dateRangeEnd)) {
      const startDate = getStartOfDayUTC(filters.dateRangeStart);
      const endDateNextDay = getStartOfNextDayUTC(filters.dateRangeEnd);
      if (startDate && endDateNextDay) {
        dateFilter = { $gte: startDate, $lt: endDateNextDay };
        console.log('Bulk update: Date range filter:', {
          start: startDate.toISOString(),
          end: endDateNextDay.toISOString()
        });
      }
    } else if (isValidDateString(filters.dateRangeStart)) {
      const startDate = getStartOfDayUTC(filters.dateRangeStart);
      if (startDate) {
        dateFilter = { $gte: startDate };
        console.log('Bulk update: Date range start filter:', startDate.toISOString());
      }
    } else if (isValidDateString(filters.dateRangeEnd)) {
      const endDateNextDay = getStartOfNextDayUTC(filters.dateRangeEnd);
      if (endDateNextDay) {
        dateFilter = { $lt: endDateNextDay };
        console.log('Bulk update: Date range end filter:', endDateNextDay.toISOString());
      }
    } else if (isValidDateString(filters.date)) {
      const startOfDay = getStartOfDayUTC(filters.date);
      const startOfNextDay = getStartOfNextDayUTC(filters.date);
      if (startOfDay && startOfNextDay) {
        dateFilter = { $gte: startOfDay, $lt: startOfNextDay };
        console.log('Bulk update: Single date filter:', {
          start: startOfDay.toISOString(),
          end: startOfNextDay.toISOString()
        });
      }
    }

    console.log('Bulk update: Query before MongoDB search (without date):', JSON.stringify(query, null, 2));
    console.log('Bulk update: Query keys:', Object.keys(query));
    console.log('Bulk update: Date filter (will be applied client-side):', dateFilter ? JSON.stringify(dateFilter, null, 2) : 'none');
    
    // Check if query is empty - if so, we need to find all slots (but this should not happen in practice)
    if (Object.keys(query).length === 0 && !dateFilter) {
      console.warn('Bulk update: WARNING - Query is empty! This means no filters were applied.');
      console.warn('Bulk update: Filters received:', JSON.stringify(filters, null, 2));
      // Return error if query is completely empty (this is likely a bug)
      return res.status(400).json({
        success: false,
        count: 0,
        error: 'No valid filters provided. Please apply at least one filter.',
        message: 'No valid filters provided'
      });
    }
    
    // Get slots matching non-date filters first (same as GET endpoint)
    // We'll apply date filter client-side for consistency and flexibility
    let slotsToUpdate = await Slot.find(query).lean();
    
    console.log(`Bulk update: Found ${slotsToUpdate.length} slots from MongoDB query (before date/days/time filtering)`);
    if (slotsToUpdate.length === 0) {
      console.log('Bulk update: No slots found from MongoDB! Query was:', JSON.stringify(query, null, 2));
      console.log('Bulk update: Filters received:', JSON.stringify(filters, null, 2));
      
      // Try to find what went wrong - check if filters are valid
      const filterKeys = Object.keys(filters || {});
      console.log('Bulk update: Filter keys received:', filterKeys);
      filterKeys.forEach(key => {
        console.log(`Bulk update: Filter ${key}:`, filters[key], 'Type:', typeof filters[key]);
      });
    }
    
    // Apply date filter client-side (same as GET endpoint) for consistency
    if (dateFilter) {
      const beforeDateFilter = slotsToUpdate.length;
      slotsToUpdate = slotsToUpdate.filter(slot => {
        if (!slot.date) return false;
        
        const slotDate = slot.date instanceof Date ? slot.date : new Date(slot.date);
        const slotDateStr = slotDate.toISOString().split('T')[0];
        
        // Handle different date filter types
        if (dateFilter.$gte && dateFilter.$lt) {
          // Date range: start <= date < end
          const startDateStr = dateFilter.$gte.toISOString().split('T')[0];
          const endDateStr = dateFilter.$lt.toISOString().split('T')[0];
          return slotDateStr >= startDateStr && slotDateStr < endDateStr;
        } else if (dateFilter.$gte) {
          // Only start date: date >= start
          const startDateStr = dateFilter.$gte.toISOString().split('T')[0];
          return slotDateStr >= startDateStr;
        } else if (dateFilter.$lt) {
          // Only end date: date < end
          const endDateStr = dateFilter.$lt.toISOString().split('T')[0];
          return slotDateStr < endDateStr;
        }
        
        return true;
      });
      console.log(`Bulk update: After date filtering: ${slotsToUpdate.length} slots (was ${beforeDateFilter})`);
    }
    
    // Filter by days of week if specified (same as GET endpoint)
    if (filters.daysOfWeek) {
      let selectedDays;
      if (Array.isArray(filters.daysOfWeek)) {
        selectedDays = filters.daysOfWeek.filter(d => d !== '' && d !== null && d !== undefined).map(d => parseInt(d));
      } else if (typeof filters.daysOfWeek === 'string' && filters.daysOfWeek.trim().length > 0) {
        selectedDays = filters.daysOfWeek.split(',').map(d => d.trim()).filter(d => d.length > 0).map(d => parseInt(d));
      }
      
      if (selectedDays && selectedDays.length > 0) {
        const beforeDayFilter = slotsToUpdate.length;
        slotsToUpdate = slotsToUpdate.filter(slot => {
          if (!slot.date) return false;
          const slotDay = new Date(slot.date).getDay(); // 0 = Sunday, 1 = Monday, etc.
          return selectedDays.includes(slotDay);
        });
        console.log(`Bulk update: After daysOfWeek filtering: ${slotsToUpdate.length} slots (was ${beforeDayFilter}), selectedDays: ${selectedDays}`);
      }
    }
    
    // Filter by time ranges if specified (same as GET endpoint)
    if (filters.timeRanges) {
      let selectedTimeRanges;
      if (Array.isArray(filters.timeRanges)) {
        selectedTimeRanges = filters.timeRanges.filter(tr => tr && tr.trim().length > 0);
      } else if (typeof filters.timeRanges === 'string' && filters.timeRanges.trim().length > 0) {
        selectedTimeRanges = filters.timeRanges.split(',').map(tr => tr.trim()).filter(tr => tr.length > 0);
      }
      
      if (selectedTimeRanges && selectedTimeRanges.length > 0) {
        const beforeTimeFilter = slotsToUpdate.length;
        slotsToUpdate = slotsToUpdate.filter(slot => {
          if (!slot.startTime) return false;
          // Check if slot's start time falls within any of the selected time ranges
          return selectedTimeRanges.some(timeRange => {
            const [rangeStart, rangeEnd] = timeRange.split('-');
            if (!rangeStart || !rangeEnd) return false;
            return slot.startTime >= rangeStart.trim() && slot.startTime < rangeEnd.trim();
          });
        });
        console.log(`Bulk update: After timeRanges filtering: ${slotsToUpdate.length} slots (was ${beforeTimeFilter}), timeRanges: ${selectedTimeRanges}`);
      }
    }
    
    console.log(`Bulk update: Final slots count after all filters: ${slotsToUpdate.length}`);

    // Check if we have slots to update
    if (slotsToUpdate.length === 0) {
      console.log('Bulk update: No slots found matching filters');
      return res.json({
        success: true,
        count: 0,
        message: 'No slots found matching the filters'
      });
    }

    console.log(`Bulk update: Updating ${slotsToUpdate.length} slots`);

    // Save previous state for undo BEFORE updating (deep copy)
    const previousSlots = slotsToUpdate.map(slot => ({
      ...slot,
      _id: slot._id.toString()
    }));

    // Update all matching slots
    const updateData = {};
    
    // Always update serviceName and providerName if provided
    if (updates.serviceName !== undefined) {
      updateData.serviceName = updates.serviceName || '';
    }
    if (updates.providerName !== undefined) {
      updateData.providerName = updates.providerName || '';
    }
    
    // Determine status based on updates
    if (updates.status !== undefined) {
      // Status explicitly provided
      updateData.status = updates.status;
    } else if (isMakingAvailable) {
      // Making available (empty service/provider)
      updateData.status = 'available';
    } else if (updates.serviceName && updates.providerName) {
      // Assigning service/provider - slot becomes booked
      updateData.status = 'booked';
    } else if (updates.serviceName === '' && updates.providerName === '') {
      // Clearing service/provider - slot becomes available
      updateData.status = 'available';
    }
    // If status is not set by now, we'll update it based on serviceName/providerName
    if (!updateData.status) {
      if (updateData.serviceName && updateData.providerName) {
        updateData.status = 'booked';
      } else {
        updateData.status = 'available';
      }
    }
    
    // Update bookedBy based on status
    if (updateData.status === 'available') {
      updateData.bookedBy = null;
    } else if (updateData.providerName) {
      updateData.bookedBy = updateData.providerName;
    } else {
      updateData.bookedBy = null;
    }
    
    console.log('Bulk update: Update data:', JSON.stringify(updateData, null, 2));
    console.log('Bulk update: Filters received:', JSON.stringify(filters, null, 2));

    // slotsToUpdate is already lean(), so we can use it directly
    const slotsToUpdateIds = slotsToUpdate.map(slot => slot._id);
    console.log(`Bulk update: Updating slots with IDs: ${slotsToUpdateIds.slice(0, 5).join(', ')}... (${slotsToUpdateIds.length} total)`);
    
    // Check if updateData is empty (shouldn't happen, but safety check)
    if (Object.keys(updateData).length === 0) {
      console.error('Bulk update: updateData is empty! Updates:', updates);
      return res.status(400).json({ 
        error: 'No update data provided',
        count: 0
      });
    }
    
    const result = await Slot.updateMany(
      { _id: { $in: slotsToUpdateIds } },
      { $set: updateData }
    );
    
    console.log(`Bulk update: Result - matched: ${result.matchedCount}, modified: ${result.modifiedCount}, updateData keys: ${Object.keys(updateData).join(', ')}`);
    console.log(`Bulk update: Total slots to update: ${slotsToUpdate.length}, IDs to update: ${slotsToUpdateIds.length}`);

    // Log admin action if slots were found and modified
    if (req.adminId && result.matchedCount > 0 && slotsToUpdate.length > 0) {
      const filterSummaryText = formatFilterSummary(filters);
      const updateSummaryText = formatUpdateSummary(updates);
      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Bulk Updated Slots',
        actionType: 'bulk-update',
        targetCollection: 'Slot',
        targetIds: slotsToUpdate.map(slot => slot._id.toString()),
        details: `تم تحديث ${result.modifiedCount} موعد من ${result.matchedCount} موعد مطابق باستخدام المرشحات${filterSummaryText}${updateSummaryText}`,
        metadata: {
          filters,
          updates: updateData,
          before: previousSlots,
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount
        },
        undoPayload: {
          steps: [
            {
              operation: 'restore',
              collection: 'Slot',
              documents: previousSlots
            }
          ]
        }
      });
    }

    // Return response with detailed information
    if (result.matchedCount === 0) {
      console.log('Bulk update: No slots matched the filters');
      return res.status(404).json({
        success: false,
        count: 0,
        matchedCount: 0,
        modifiedCount: 0,
        error: 'No slots found matching the filters',
        message: 'No slots found matching the filters'
      });
    }

    // Return success response - use modifiedCount as the main count
    // If modifiedCount is 0 but matchedCount > 0, it means slots already have those values
    const responseCount = result.modifiedCount > 0 ? result.modifiedCount : result.matchedCount;
    const message = result.modifiedCount > 0 
      ? `Updated ${result.modifiedCount} slots successfully` 
      : `Found ${result.matchedCount} slots but they already have the same values (no changes made)`;
    
    console.log(`Bulk update: Returning response - count: ${responseCount}, message: ${message}`);
    
    res.json({
      success: true,
      count: responseCount,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      message: message
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

    const previousState = slot.toObject();

    if (startTime) slot.startTime = startTime;
    if (endTime) slot.endTime = endTime;
    
    // Update serviceName and providerName (can be empty)
    if (serviceName !== undefined) slot.serviceName = serviceName || '';
    if (providerName !== undefined) slot.providerName = providerName || '';
    
    if (date) {
      const normalizedDate = parseDateToUTC(date);
      if (normalizedDate) {
        normalizedDate.setUTCHours(0, 0, 0, 0);
        slot.date = normalizedDate;
      }
    }
    if (type) slot.type = type;
    
    // Update status based on whether service/provider are filled
    const hasServiceProvider = slot.serviceName && slot.providerName;
    slot.status = hasServiceProvider ? 'booked' : 'available';
    slot.bookedBy = hasServiceProvider ? slot.providerName : null;

    await slot.save();
    const updatedSlot = await Slot.findById(slot._id).populate('roomId', 'name isEnabled');

    if (req.adminId) {
      const updatedSlotData = updatedSlot.toObject();
      const assignmentDetail = serviceProviderDetailSuffix(updatedSlotData.serviceName, updatedSlotData.providerName);
      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Updated Slot',
        actionType: 'update',
        targetCollection: 'Slot',
        targetIds: [slot._id],
        details: `تم تحديث موعد ${updatedSlotData.startTime}-${updatedSlotData.endTime} للغرفة ${updatedSlotData.roomId?.name || 'بدون اسم'}${assignmentDetail}`,
        metadata: {
          before: previousState,
          after: updatedSlotData
        },
        undoPayload: {
          steps: [
            {
              operation: 'restore',
              collection: 'Slot',
              documents: [previousState]
            }
          ]
        }
      });
    }

    res.json(updatedSlot);
  } catch (error) {
    console.error('Update slot error:', error);
    res.status(500).json({ error: 'Failed to update slot' });
  }
});

// Delete slot (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const slotDoc = await Slot.findById(req.params.id);
    if (!slotDoc) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    const slotPlain = slotDoc.toObject();
    await slotDoc.populate('roomId', 'name isEnabled');

    await Slot.findByIdAndDelete(req.params.id);

    if (req.adminId) {
      const slotDate = slotPlain.date instanceof Date
        ? slotPlain.date.toISOString().split('T')[0]
        : new Date(slotPlain.date).toISOString().split('T')[0];
      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Removed Slot',
        actionType: 'delete',
        targetCollection: 'Slot',
        targetIds: [slotPlain._id],
        details: `تم حذف موعد ${slotPlain.startTime}-${slotPlain.endTime} بتاريخ ${slotDate} للغرفة ${slotDoc.roomId?.name || ''}`,
        metadata: { slot: slotPlain },
        undoPayload: {
          steps: [
            {
              operation: 'restore',
              collection: 'Slot',
              documents: [slotPlain]
            }
          ]
        }
      });
    }

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
    
    // Helper to check if a date string is valid
    const isValidDateString = (dateStr) => {
      return dateStr && typeof dateStr === 'string' && dateStr.trim().length > 0;
    };
    
    // Date range filter - use same logic as GET and bulk-update endpoints
    if (isValidDateString(filters.dateRangeStart) && isValidDateString(filters.dateRangeEnd)) {
      const startDate = getStartOfDayUTC(filters.dateRangeStart);
      const endDateNextDay = getStartOfNextDayUTC(filters.dateRangeEnd);
      if (startDate && endDateNextDay) {
        query.date = { $gte: startDate, $lt: endDateNextDay };
      }
    } else if (isValidDateString(filters.dateRangeStart)) {
      const startDate = getStartOfDayUTC(filters.dateRangeStart);
      if (startDate) {
        query.date = { $gte: startDate };
      }
    } else if (isValidDateString(filters.dateRangeEnd)) {
      const endDateNextDay = getStartOfNextDayUTC(filters.dateRangeEnd);
      if (endDateNextDay) {
        query.date = { $lt: endDateNextDay };
      }
    } else if (isValidDateString(filters.date)) {
      const startOfDay = getStartOfDayUTC(filters.date);
      const startOfNextDay = getStartOfNextDayUTC(filters.date);
      if (startOfDay && startOfNextDay) {
        query.date = { $gte: startOfDay, $lt: startOfNextDay };
      }
    }

    // Get slots matching non-date filters first
    let slotsToDelete = await Slot.find(query).lean();
    
    // Apply date filter client-side (same as GET and bulk-update endpoints) for consistency
    if (query.date) {
      const dateFilter = query.date;
      slotsToDelete = slotsToDelete.filter(slot => {
        if (!slot.date) return false;
        
        const slotDate = slot.date instanceof Date ? slot.date : new Date(slot.date);
        const slotDateStr = slotDate.toISOString().split('T')[0];
        
        // Handle different date filter types
        if (dateFilter.$gte && dateFilter.$lt) {
          const startDateStr = dateFilter.$gte.toISOString().split('T')[0];
          const endDateStr = dateFilter.$lt.toISOString().split('T')[0];
          return slotDateStr >= startDateStr && slotDateStr < endDateStr;
        } else if (dateFilter.$gte) {
          const startDateStr = dateFilter.$gte.toISOString().split('T')[0];
          return slotDateStr >= startDateStr;
        } else if (dateFilter.$lt) {
          const endDateStr = dateFilter.$lt.toISOString().split('T')[0];
          return slotDateStr < endDateStr;
        }
        
        return true;
      });
    }
    
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
    // slotsToDelete is already lean(), so we can use it directly
    const slotsToDeleteIds = slotsToDelete.map(slot => slot._id);
    const result = await Slot.deleteMany({ _id: { $in: slotsToDeleteIds } });

    if (req.adminId && result.deletedCount > 0 && slotsToDelete.length > 0) {
      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Bulk Removed Slots',
        actionType: 'bulk-delete',
        targetCollection: 'Slot',
        targetIds: slotsToDelete.map(slot => slot._id),
        details: `تم حذف ${result.deletedCount} موعد باستخدام المرشحات`,
        metadata: {
          filters,
          removedSlots: slotsToDelete
        },
        undoPayload: {
          steps: [
            {
              operation: 'restore',
              collection: 'Slot',
              documents: slotsToDelete
            }
          ]
        }
      });
    }

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

