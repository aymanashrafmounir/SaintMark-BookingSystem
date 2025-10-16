const connectDB = require('../lib/db');
const authMiddleware = require('../lib/auth');
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
      // Apply auth middleware for admin access
      await new Promise((resolve, reject) => {
        authMiddleware(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const { 
        page = 1, 
        limit = 50, 
        roomId, 
        roomIds,
        serviceName, 
        providerName, 
        type, 
        date,
        dateRangeStart,
        dateRangeEnd,
        startTime, 
        endTime 
      } = req.query;

      // Build filter query
      const filter = {};
      
      if (roomIds) {
        const roomIdArray = roomIds.split(',').map(id => id.trim());
        filter.roomId = { $in: roomIdArray };
      } else if (roomId) {
        filter.roomId = roomId;
      }
      if (type) filter.type = type;
      if (startTime) filter.startTime = startTime;
      if (endTime) filter.endTime = endTime;
      
      if (serviceName) {
        filter.serviceName = { $regex: serviceName, $options: 'i' };
      }
      if (providerName) {
        filter.providerName = { $regex: providerName, $options: 'i' };
      }
      
      // Date filtering
      if (dateRangeStart && dateRangeEnd) {
        const startDate = new Date(dateRangeStart);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(dateRangeEnd);
        endDate.setHours(23, 59, 59, 999);
        filter.date = { $gte: startDate, $lte: endDate };
      } else if (date) {
        const searchDate = new Date(date);
        const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));
        filter.date = { $gte: startOfDay, $lte: endOfDay };
      }

      // Calculate pagination
      const pageNumber = parseInt(page);
      const limitNumber = parseInt(limit);
      const skip = (pageNumber - 1) * limitNumber;

      // Execute query with pagination
      const slots = await Slot.find(filter)
        .populate('roomId', 'name isEnabled')
        .sort({ date: -1, startTime: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean();

      // Get total count for pagination
      const totalCount = await Slot.countDocuments(filter);
      
      res.json({
        slots,
        pagination: {
          total: totalCount,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(totalCount / limitNumber)
        }
      });
    } else if (req.method === 'POST') {
      // Apply auth middleware
      await new Promise((resolve, reject) => {
        authMiddleware(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const { roomId, startTime, endTime, serviceName, providerName, date, type } = req.body;

      if (!roomId || !startTime || !endTime || !date) {
        return res.status(400).json({ error: 'Room, time, and date are required' });
      }

      const hasServiceProvider = serviceName && providerName;
      
      const slot = new Slot({
        roomId,
        startTime,
        endTime,
        serviceName: serviceName || '',
        providerName: providerName || '',
        date: new Date(date),
        type: type || 'single',
        status: hasServiceProvider ? 'booked' : 'available',
        bookedBy: hasServiceProvider ? providerName : null
      });

      await slot.save();
      const populatedSlot = await Slot.findById(slot._id).populate('roomId', 'name isEnabled');
      res.status(201).json(populatedSlot);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Slots operation error:', error);
    res.status(500).json({ error: 'Failed to perform slots operation' });
  }
};
