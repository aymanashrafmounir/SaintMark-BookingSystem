const connectDB = require('../lib/db');
const authMiddleware = require('../lib/auth');
const Room = require('../../server/models/Room');
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

  try {
    await connectDB();

    if (req.method === 'GET') {
      const room = await Room.findById(req.query.id);
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }
      res.json(room);
    } else if (req.method === 'PUT') {
      // Apply auth middleware
      await new Promise((resolve, reject) => {
        authMiddleware(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const { name, isEnabled } = req.body;
      
      const room = await Room.findById(req.query.id);
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      if (name) room.name = name;
      if (isEnabled !== undefined) room.isEnabled = isEnabled;
      room.updatedAt = Date.now();

      await room.save();
      res.json(room);
    } else if (req.method === 'DELETE') {
      // Apply auth middleware
      await new Promise((resolve, reject) => {
        authMiddleware(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const room = await Room.findById(req.query.id);
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      // Also delete all slots for this room
      await Slot.deleteMany({ roomId: req.query.id });
      
      await Room.findByIdAndDelete(req.query.id);
      res.json({ success: true, message: 'Room deleted successfully' });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Room operation error:', error);
    res.status(500).json({ error: 'Failed to perform room operation' });
  }
};
