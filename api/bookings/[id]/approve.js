const connectDB = require('../../lib/db');
const authMiddleware = require('../../lib/auth');
const Booking = require('../../../server/models/Booking');
const Slot = require('../../../server/models/Slot');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();
    
    // Apply auth middleware
    await new Promise((resolve, reject) => {
      authMiddleware(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const booking = await Booking.findById(req.query.id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Update booking status
    booking.status = 'approved';
    booking.updatedAt = Date.now();
    await booking.save();

    // Update slot status and details
    const slot = await Slot.findById(booking.slotId);
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

    res.json(populatedBooking);
  } catch (error) {
    console.error('Approve booking error:', error);
    res.status(500).json({ error: 'Failed to approve booking' });
  }
};
