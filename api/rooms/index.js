const connectDB = require('../lib/db');
const Room = require('../../server/models/Room');

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

  if (req.method === 'GET') {
    try {
      await connectDB();
      const rooms = await Room.find().sort({ name: 1 });
      res.json(rooms);
    } catch (error) {
      console.error('Get rooms error:', error);
      res.status(500).json({ error: 'Failed to fetch rooms' });
    }
  } else if (req.method === 'POST') {
    try {
      await connectDB();
      
      // Apply auth middleware
      const authMiddleware = require('../lib/auth');
      await new Promise((resolve, reject) => {
        authMiddleware(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const { name, isEnabled } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Room name is required' });
      }

      const room = new Room({
        name,
        isEnabled: isEnabled !== undefined ? isEnabled : true
      });

      await room.save();
      res.status(201).json(room);
    } catch (error) {
      console.error('Create room error:', error);
      res.status(500).json({ error: 'Failed to create room' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
