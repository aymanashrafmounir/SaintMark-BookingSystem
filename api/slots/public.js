const connectDB = require('../lib/db');
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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();

    const { 
      page = 1, 
      limit = 10, 
      roomId, 
      roomIds,
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
    
    // Date range filtering
    if (dateRangeStart && dateRangeEnd) {
      const startDate = new Date(dateRangeStart);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateRangeEnd);
      endDate.setHours(23, 59, 59, 999);
      filter.date = { $gte: startDate, $lte: endDate };
    }
    
    // Time filtering
    if (startTime) filter.startTime = startTime;
    if (endTime) filter.endTime = endTime;

    // Calculate pagination
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Execute query with pagination
    const slots = await Slot.find(filter)
      .populate('roomId', 'name isEnabled')
      .sort({ date: 1, startTime: 1 })
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
  } catch (error) {
    console.error('Get public slots error:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
};
