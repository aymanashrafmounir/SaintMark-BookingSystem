const connectDB = require('../lib/db');
const jwt = require('jsonwebtoken');
const Admin = require('../../server/models/Admin');

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

    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      const admin = await Admin.findById(decoded.id);
      
      if (!admin) {
        return res.status(401).json({ error: 'Admin not found' });
      }

      res.json({
        success: true,
        valid: true,
        admin: {
          id: admin._id,
          username: admin.username
        }
      });
    } catch (verifyError) {
      if (verifyError.name === 'TokenExpiredError') {
        res.json({
          success: true,
          valid: false,
          expired: true,
          expiredAt: verifyError.expiredAt
        });
      } else {
        res.status(401).json({ error: 'Invalid token' });
      }
    }
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({ error: 'Server error during token validation' });
  }
};
