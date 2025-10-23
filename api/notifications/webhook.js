const connectDB = require('../lib/db');
const Booking = require('../../server/models/Booking');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
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

    const { bookingId, action } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID is required' });
    }

    // Get booking details
    const booking = await Booking.findById(bookingId)
      .populate('slot')
      .populate('room', 'name');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Prepare notification data
    const notificationData = {
      bookingId: booking._id,
      action: action || 'new_booking',
      timestamp: new Date().toISOString(),
      booking: {
        id: booking._id,
        userInfo: booking.userInfo,
        room: booking.room?.name || 'Unknown Room',
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        status: booking.status,
        createdAt: booking.createdAt
      }
    };

    // Send webhook to Netlify admin (if configured)
    const netlifyWebhookUrl = process.env.NETLIFY_ADMIN_WEBHOOK_URL;
    
    if (netlifyWebhookUrl) {
      try {
        const fetch = require('node-fetch');
        await fetch(netlifyWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NETLIFY_WEBHOOK_SECRET || 'default-secret'}`
          },
          body: JSON.stringify(notificationData)
        });
        
        console.log('Notification sent to Netlify admin:', notificationData);
      } catch (webhookError) {
        console.error('Failed to send webhook notification:', webhookError);
        // Don't fail the request if webhook fails
      }
    }

    // Also send email notification if configured
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      // Here you would integrate with an email service like SendGrid, Nodemailer, etc.
      console.log('Email notification would be sent to:', adminEmail);
      console.log('Booking details:', notificationData);
    }

    res.json({ 
      success: true, 
      message: 'Notification sent successfully',
      notificationId: Date.now()
    });

  } catch (error) {
    console.error('Notification webhook error:', error);
    res.status(500).json({ 
      error: 'Failed to send notification',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
