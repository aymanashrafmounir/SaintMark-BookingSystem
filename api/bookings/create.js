const connectDB = require('../lib/db');
const Booking = require('../../server/models/Booking');
const Slot = require('../../server/models/Slot');

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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();

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

    res.status(201).json(populatedBooking);
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Failed to create booking request' });
  }
};
