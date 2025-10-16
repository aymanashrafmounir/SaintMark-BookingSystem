const connectDB = require('../lib/db');
const authMiddleware = require('../lib/auth');
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

  if (req.method !== 'GET') {
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
};
