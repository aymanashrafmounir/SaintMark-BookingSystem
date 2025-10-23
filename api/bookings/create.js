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

    const { slotId, roomId, date, startTime, endTime, userInfo } = req.body;

    if (!slotId || !roomId || !date || !startTime || !endTime || !userInfo) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!userInfo.name || !userInfo.email || !userInfo.phone) {
      return res.status(400).json({ error: 'User information is required' });
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
      slotId,
      roomId,
      date: new Date(date),
      startTime,
      endTime,
      userInfo,
      status: 'pending'
    });

    await booking.save();
    const populatedBooking = await Booking.findById(booking._id)
      .populate('roomId', 'name')
      .populate('slotId');

    // Send notification to admin
    try {
      const fetch = require('node-fetch');
      const webhookUrl = process.env.NETLIFY_ADMIN_WEBHOOK_URL;
      
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NETLIFY_WEBHOOK_SECRET || 'default-secret'}`
          },
          body: JSON.stringify({
            bookingId: booking._id,
            action: 'new_booking',
            timestamp: new Date().toISOString(),
            booking: {
              id: booking._id,
              userInfo: booking.userInfo,
              room: populatedBooking.roomId?.name || 'Unknown Room',
              date: booking.date,
              startTime: booking.startTime,
              endTime: booking.endTime,
              status: booking.status,
              createdAt: booking.createdAt
            }
          })
        });
        console.log('Notification sent to admin for booking:', booking._id);
      }
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
      // Don't fail the booking if notification fails
    }

    res.status(201).json(populatedBooking);
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Failed to create booking request' });
  }
};
