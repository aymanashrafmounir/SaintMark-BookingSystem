const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Slot = require('../models/Slot');
const authMiddleware = require('../middleware/auth');
const { logAdminAction } = require('../utils/adminActionLogger');

// Get all bookings (admin only) with pagination
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    
    // Build filter
    const filter = {};
    if (status) {
      filter.status = status;
    }
    
    // Calculate pagination
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;
    
    // Execute query with pagination
    const [bookings, totalCount] = await Promise.all([
      Booking.find(filter)
        .populate('roomId', 'name')
        .populate('slotId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      Booking.countDocuments(filter)
    ]);
    
    res.json({
      bookings,
      pagination: {
        total: totalCount,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalCount / limitNumber)
      }
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Get pending bookings (admin only)
router.get('/pending', authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find({ status: 'pending' })
      .populate('roomId', 'name')
      .populate('slotId')
      .sort({ createdAt: 1 });
    
    res.json(bookings);
  } catch (error) {
    console.error('Get pending bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch pending bookings' });
  }
});

// Helper function to generate all dates with the same weekday between start and end date
const generateWeeklyDates = (startDate, endDate, dayOfWeek = null) => {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Get the day of week (0 = Sunday, 1 = Monday, etc.)
  const targetDayOfWeek = dayOfWeek !== null ? dayOfWeek : start.getDay();
  
  // Find the first occurrence of the target day of week
  let currentDate = new Date(start);
  const daysUntilTarget = (targetDayOfWeek - currentDate.getDay() + 7) % 7;
  
  if (daysUntilTarget > 0) {
    currentDate.setDate(currentDate.getDate() + daysUntilTarget);
  }
  
  // Generate all dates with the same day of week
  while (currentDate <= end) {
    dates.push(new Date(currentDate));
    // Add 7 days to get the same day next week
    currentDate.setDate(currentDate.getDate() + 7);
  }
  
  return dates;
};

// Helper function to get start of day in UTC
const getStartOfDayUTC = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

// Helper function to get start of next day in UTC (exclusive boundary)
const getStartOfNextDayUTC = (date) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

// Create booking request (public - users)
router.post('/', async (req, res) => {
  try {
    const { userName, slotId, roomId, startTime, endTime, serviceName, providerName, phoneNumber, date, isRecurring, endDate } = req.body;

    if (!userName || !slotId || !roomId || !startTime || !endTime || !serviceName || !providerName) {
      return res.status(400).json({ error: 'الحقول المطلوبة: اسم الخادم، المكان، الوقت، اسم الخدمة' });
    }

    // Validate phone number format if provided
    if (phoneNumber && phoneNumber.trim() !== '' && !/^(010|011|012|015)\d{8}$/.test(phoneNumber.trim())) {
      return res.status(400).json({ error: 'رقم الهاتف غير صحيح! يجب أن يبدأ بـ 010, 011, 012, أو 015 ويكون 11 رقم' });
    }

    // Check if slot exists
    const originalSlot = await Slot.findById(slotId);
    if (!originalSlot) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    if (originalSlot.status === 'booked') {
      return res.status(400).json({ error: 'This slot is already booked' });
    }

    // Handle recurring bookings - create ONE unified booking request
    // But first, make sure that ALL corresponding slots in the selected period exist and are not booked
    if (isRecurring && endDate) {
      const startDateObj = new Date(date);
      const endDateObj = new Date(endDate);
      
      if (endDateObj <= startDateObj) {
        return res.status(400).json({ error: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية' });
      }

      const dayOfWeek = startDateObj.getDay();

      // Generate all weekly dates between start and end on the same weekday
      const recurringDates = generateWeeklyDates(startDateObj, endDateObj, dayOfWeek);

      if (!recurringDates.length) {
        return res.status(400).json({ error: 'لا توجد تواريخ متاحة في الفترة المحددة' });
      }

      // Before creating the recurring booking request, verify that there is an available slot for EVERY generated date
      for (const recurringDate of recurringDates) {
        const dateString = recurringDate.toISOString().split('T')[0];
        const startOfDay = getStartOfDayUTC(dateString);
        const startOfNextDay = getStartOfNextDayUTC(dateString);

        if (!startOfDay || !startOfNextDay) {
          return res.status(400).json({ error: 'تاريخ غير صالح ضمن فترة التكرار' });
        }

        let slotForDay = null;

        // If this recurring date is the same calendar day as the originally selected slot,
        // use the originalSlot directly to avoid any timezone/date parsing issues
        const originalSlotDate = originalSlot.date instanceof Date
          ? originalSlot.date
          : new Date(originalSlot.date);
        const originalSlotDateStr = originalSlotDate.toISOString().split('T')[0];

        if (originalSlotDateStr === dateString) {
          slotForDay = originalSlot;
        } else {
          slotForDay = await Slot.findOne({
            roomId,
            startTime,
            endTime,
            date: { $gte: startOfDay, $lt: startOfNextDay }
          });
        }

        if (!slotForDay) {
          return res.status(400).json({
            error: `كان ده معاد محدد ليكن لا يوجد موعد متاح لهذا التاريخ (${dateString})`
          });
        }

        if (slotForDay.status === 'booked') {
          return res.status(400).json({
            error: `لا يمكن تحديد الموعد لان احدها محجوز في التاريخ (${dateString})`
          });
        }
      }

      // All slots are available across the requested recurring range, now create a single recurring booking request
      const booking = new Booking({
        userName,
        slotId, // Keep original slot ID for reference
        roomId,
        startTime,
        endTime,
        serviceName,
        providerName,
        phoneNumber: phoneNumber?.trim() || '',
        isRecurring: true,
        startDate: getStartOfDayUTC(date),
        endDate: getStartOfDayUTC(endDate),
        recurringDayOfWeek: dayOfWeek,
        status: 'pending'
        // date is not required for recurring bookings
      });

      await booking.save();
      const populatedBooking = await Booking.findById(booking._id)
        .populate('roomId', 'name')
        .populate('slotId');

      // Emit real-time event to admin (single unified request)
      const io = req.app.get('io');
      io.to('admin-room').emit('new-booking-request', populatedBooking);

      return res.status(201).json(populatedBooking);
    }

    // Single booking (non-recurring) - date is required
    if (!date) {
      return res.status(400).json({ error: 'التاريخ مطلوب للحجز العادي' });
    }

    const booking = new Booking({
      userName,
      slotId,
      roomId,
      startTime,
      endTime,
      serviceName,
      providerName,
      phoneNumber: phoneNumber?.trim() || '',
      date: new Date(date),
      status: 'pending',
      isRecurring: false
    });

    await booking.save();
    const populatedBooking = await Booking.findById(booking._id)
      .populate('roomId', 'name')
      .populate('slotId');

    // Emit real-time event to admin
    const io = req.app.get('io');
    io.to('admin-room').emit('new-booking-request', populatedBooking);

    res.status(201).json(populatedBooking);
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Failed to create booking request' });
  }
});

// Approve booking (admin only)
router.put('/:id/approve', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const bookingBefore = booking.toObject();

    // Handle recurring bookings - create all individual bookings
    if (booking.isRecurring) {
      const recurringDates = generateWeeklyDates(
        booking.startDate, 
        booking.endDate, 
        booking.recurringDayOfWeek
      );

      if (recurringDates.length === 0) {
        return res.status(400).json({ error: 'لا توجد تواريخ متاحة في الفترة المحددة' });
      }

      const createdBookings = [];
      const updatedSlots = [];

      // Update existing slots for each date (DO NOT CREATE NEW SLOTS)
      for (const recurringDate of recurringDates) {
        const dateString = recurringDate.toISOString().split('T')[0];
        const startOfDay = getStartOfDayUTC(dateString);
        const startOfNextDay = getStartOfNextDayUTC(dateString);

        // Find existing slot only (DO NOT CREATE)
        const slot = await Slot.findOne({
          roomId: booking.roomId,
          startTime: booking.startTime,
          endTime: booking.endTime,
          date: { $gte: startOfDay, $lt: startOfNextDay }
        });

        // Skip if slot doesn't exist - we only update existing slots
        if (!slot) {
          console.log(`Slot not found for date ${dateString} (room: ${booking.roomId}, time: ${booking.startTime}-${booking.endTime}), skipping...`);
          continue;
        }

        const slotBefore = slot.toObject();
        console.log(`Found slot ${slot._id} for date ${dateString}, current status: ${slot.status}`);

        // Skip if slot is already booked
        if (slot.status === 'booked') {
          console.log(`Slot already booked for date ${dateString}, skipping...`);
          continue;
        }

        // Update existing slot status and details only
        slot.status = 'booked';
        slot.bookedBy = booking.userName;
        slot.serviceName = booking.serviceName;
        slot.providerName = booking.providerName;
        
        try {
          await slot.save();
          console.log(`Updated slot ${slot._id} for date ${dateString} - Status: ${slot.status}, Service: ${slot.serviceName}, Provider: ${slot.providerName}`);
        } catch (error) {
          console.error(`Error saving slot ${slot._id}:`, error);
          continue;
        }
        
        // Verify the slot was saved correctly by reloading from database
        const savedSlot = await Slot.findById(slot._id);
        if (savedSlot && savedSlot.status === 'booked') {
          console.log(`Verified slot ${savedSlot._id} is booked - Service: ${savedSlot.serviceName}, Provider: ${savedSlot.providerName}`);
          updatedSlots.push({ slot: savedSlot, slotBefore });
        } else {
          console.error(`Failed to verify slot ${slot._id} update! Expected booked, got: ${savedSlot?.status || 'null'}`);
        }

        // Create individual booking for this date
        const individualBooking = new Booking({
          userName: booking.userName,
          slotId: slot._id,
          roomId: booking.roomId,
          startTime: booking.startTime,
          endTime: booking.endTime,
          serviceName: booking.serviceName,
          providerName: booking.providerName,
          phoneNumber: booking.phoneNumber || '',
          date: startOfDay,
          status: 'approved',
          isRecurring: false
        });
        await individualBooking.save();
        createdBookings.push(individualBooking);
      }

      // Update the recurring booking status to approved
      booking.status = 'approved';
      booking.updatedAt = Date.now();
      await booking.save();

      const populatedBooking = await Booking.findById(booking._id)
        .populate('roomId', 'name')
        .populate('slotId');

      // Emit real-time events
      const io = req.app.get('io');
      io.emit('booking-approved', populatedBooking);
      
      // Emit slot-updated events for all updated slots to refresh user views
      // Populate and emit all slots in parallel
      const slotPromises = updatedSlots.map(({ slot }) => {
        if (!slot || !slot._id) {
          console.error('Invalid slot in updatedSlots:', slot);
          return Promise.resolve(null);
        }
        
        return Slot.findById(slot._id)
          .populate('roomId', 'name')
          .then(populatedSlot => {
            if (populatedSlot) {
              // Verify slot is actually booked before emitting
              if (populatedSlot.status === 'booked') {
                io.emit('slot-updated', populatedSlot);
                console.log(`Emitted slot-updated for slot ${populatedSlot._id} on ${populatedSlot.date}`);
              } else {
                console.error(`Slot ${populatedSlot._id} is not booked after update! Status: ${populatedSlot.status}`);
              }
            } else {
              console.error(`Slot ${slot._id} not found after update`);
            }
            return populatedSlot;
          })
          .catch(err => {
            console.error('Error populating slot for emit:', err);
            return null;
          });
      });
      
      // Wait for all slot emits to complete (non-blocking)
      Promise.all(slotPromises).catch(err => 
        console.error('Error emitting slot-updated events:', err)
      );

      if (req.adminId) {
        const undoSteps = [
          {
            operation: 'restore',
            collection: 'Booking',
            documents: [bookingBefore]
          },
          {
            operation: 'delete',
            collection: 'Booking',
            documents: createdBookings.map(b => ({ _id: b._id }))
          }
        ];

        updatedSlots.forEach(({ slotBefore }) => {
          if (slotBefore) {
            undoSteps.push({
              operation: 'restore',
              collection: 'Slot',
              documents: [slotBefore]
            });
          }
        });

        await logAdminAction({
          adminId: req.adminId,
          actionName: 'Approved Recurring Booking',
          actionType: 'status-change',
          targetCollection: 'Booking',
          targetIds: [booking._id, ...createdBookings.map(b => b._id)],
          details: `تمت الموافقة على تثبيت معاد ${booking.userName} من ${booking.startDate.toISOString().split('T')[0]} إلى ${booking.endDate.toISOString().split('T')[0]} (${createdBookings.length} موعد)`,
          metadata: {
            before: bookingBefore,
            after: populatedBooking.toObject ? populatedBooking.toObject() : populatedBooking,
            createdBookings: createdBookings.map(b => b.toObject()),
            updatedSlots: updatedSlots.map(({ slot }) => slot.toObject())
          },
          undoPayload: {
            steps: undoSteps
          }
        });
      }

      return res.json({
        ...populatedBooking.toObject(),
        createdBookings: createdBookings.length,
        message: `تمت الموافقة على تثبيت المعاد وإنشاء ${createdBookings.length} حجز`
      });
    }

    // Handle single booking (non-recurring)
    // Update booking status
    booking.status = 'approved';
    booking.updatedAt = Date.now();
    await booking.save();

    // Update slot status and details
    const slot = await Slot.findById(booking.slotId);
    const slotBefore = slot ? slot.toObject() : null;
    if (slot) {
      slot.status = 'booked';
      slot.bookedBy = booking.userName;
      slot.serviceName = booking.serviceName;
      slot.providerName = booking.providerName;
      await slot.save();
      
      // Emit slot-updated event to refresh user views
      const populatedSlot = await Slot.findById(slot._id).populate('roomId', 'name');
      if (populatedSlot) {
        const io = req.app.get('io');
        io.emit('slot-updated', populatedSlot);
      }
    }

    const populatedBooking = await Booking.findById(booking._id)
      .populate('roomId', 'name')
      .populate('slotId');

    // Emit real-time event
    const io = req.app.get('io');
    io.emit('booking-approved', populatedBooking);

    if (req.adminId) {
      const undoSteps = [
        {
          operation: 'restore',
          collection: 'Booking',
          documents: [bookingBefore]
        }
      ];

      if (slotBefore) {
        undoSteps.push({
          operation: 'restore',
          collection: 'Slot',
          documents: [slotBefore]
        });
      }

      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Approved Booking',
        actionType: 'status-change',
        targetCollection: 'Booking',
        targetIds: [booking._id],
        details: `تمت الموافقة على حجز ${booking.userName} بتاريخ ${booking.date.toISOString().split('T')[0]}`,
        metadata: {
          before: bookingBefore,
          after: populatedBooking.toObject ? populatedBooking.toObject() : populatedBooking,
          slotBefore,
          slotAfter: slot ? slot.toObject() : null
        },
        undoPayload: {
          steps: undoSteps
        }
      });
    }

    res.json(populatedBooking);
  } catch (error) {
    console.error('Approve booking error:', error);
    res.status(500).json({ error: 'Failed to approve booking' });
  }
});

// Reject booking (admin only)
router.put('/:id/reject', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const bookingBefore = booking.toObject();

    booking.status = 'rejected';
    booking.updatedAt = Date.now();
    await booking.save();

    const populatedBooking = await Booking.findById(booking._id)
      .populate('roomId', 'name')
      .populate('slotId');

    // Emit real-time event
    const io = req.app.get('io');
    io.emit('booking-rejected', populatedBooking);

    if (req.adminId) {
      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Rejected Booking',
        actionType: 'status-change',
        targetCollection: 'Booking',
        targetIds: [booking._id],
        details: `تم رفض حجز ${booking.userName} بتاريخ ${booking.date.toISOString().split('T')[0]}`,
        metadata: {
          before: bookingBefore,
          after: populatedBooking.toObject ? populatedBooking.toObject() : populatedBooking
        },
        undoPayload: {
          steps: [
            {
              operation: 'restore',
              collection: 'Booking',
              documents: [bookingBefore]
            }
          ]
        }
      });
    }

    res.json(populatedBooking);
  } catch (error) {
    console.error('Reject booking error:', error);
    res.status(500).json({ error: 'Failed to reject booking' });
  }
});

// Delete booking (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const bookingDoc = await Booking.findById(req.params.id);
    if (!bookingDoc) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const bookingPlain = bookingDoc.toObject();

    await Booking.findByIdAndDelete(req.params.id);

    if (req.adminId) {
      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Removed Booking',
        actionType: 'delete',
        targetCollection: 'Booking',
        targetIds: [bookingPlain._id],
        details: `تم حذف حجز ${bookingPlain.userName} بتاريخ ${bookingPlain.date.toISOString().split('T')[0]}`,
        metadata: { booking: bookingPlain },
        undoPayload: {
          steps: [
            {
              operation: 'restore',
              collection: 'Booking',
              documents: [bookingPlain]
            }
          ]
        }
      });
    }

    res.json({ success: true, message: 'Booking deleted successfully' });
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

module.exports = router;

