const connectDB = require('../lib/db');
const authMiddleware = require('../lib/auth');
const RoomGroup = require('../../server/models/RoomGroup');

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
      const group = await RoomGroup.findById(req.query.id).populate('rooms', 'name isEnabled');
      if (!group) {
        return res.status(404).json({ error: 'Room group not found' });
      }
      res.json(group);
    } else if (req.method === 'PUT') {
      // Apply auth middleware
      await new Promise((resolve, reject) => {
        authMiddleware(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const { name, rooms, isEnabled } = req.body;
      
      const group = await RoomGroup.findById(req.query.id);
      if (!group) {
        return res.status(404).json({ error: 'Room group not found' });
      }

      if (name) group.name = name;
      if (rooms !== undefined) group.rooms = rooms;
      if (isEnabled !== undefined) group.isEnabled = isEnabled;
      group.updatedAt = Date.now();

      await group.save();
      const updatedGroup = await RoomGroup.findById(group._id).populate('rooms', 'name isEnabled');
      res.json(updatedGroup);
    } else if (req.method === 'DELETE') {
      // Apply auth middleware
      await new Promise((resolve, reject) => {
        authMiddleware(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const group = await RoomGroup.findById(req.query.id);
      if (!group) {
        return res.status(404).json({ error: 'Room group not found' });
      }

      await RoomGroup.findByIdAndDelete(req.query.id);
      res.json({ success: true, message: 'Room group deleted successfully' });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Room group operation error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Group name already exists' });
    }
    res.status(500).json({ error: 'Failed to perform room group operation' });
  }
};
