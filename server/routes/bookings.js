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

// Create booking request (public - users)
router.post('/', async (req, res) => {
  try {
    const { userName, slotId, roomId, startTime, endTime, serviceName, providerName, phoneNumber, date } = req.body;

    if (!userName || !slotId || !roomId || !startTime || !endTime || !serviceName || !providerName || !phoneNumber || !date) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate phone number format
    if (!/^(010|011|012|015)\d{8}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'رقم الهاتف غير صحيح! يجب أن يبدأ بـ 010, 011, 012, أو 015 ويكون 11 رقم' });
    }

    // Check if slot exists and is available
    const slot = await Slot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    if (slot.status === 'booked') {
      return res.status(400).json({ error: 'This slot is already booked' });
    }

    const booking = new Booking({
      userName,
      slotId,
      roomId,
      startTime,
      endTime,
      serviceName,
      providerName,
      phoneNumber,
      date: new Date(date),
      status: 'pending'
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

