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
      const groups = await RoomGroup.find()
        .populate('rooms', 'name isEnabled')
        .sort({ name: 1 });
      res.json(groups);
    } else if (req.method === 'POST') {
      // Apply auth middleware
      await new Promise((resolve, reject) => {
        authMiddleware(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const { name, rooms, isEnabled } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Group name is required' });
      }

      const group = new RoomGroup({
        name,
        rooms: rooms || [],
        isEnabled: isEnabled !== undefined ? isEnabled : true
      });

      await group.save();
      const populatedGroup = await RoomGroup.findById(group._id).populate('rooms', 'name isEnabled');
      res.status(201).json(populatedGroup);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Room groups operation error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Group name already exists' });
    }
    res.status(500).json({ error: 'Failed to perform room groups operation' });
  }
};
