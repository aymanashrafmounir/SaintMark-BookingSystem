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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();

    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }

    let decoded;
    let isExpired = false;

    try {
      // First try to verify the token normally
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (verifyError) {
      if (verifyError.name === 'TokenExpiredError') {
        // Token is expired, but we can still decode it to get the payload
        isExpired = true;
        decoded = jwt.decode(token);
        
        if (!decoded || !decoded.id) {
          return res.status(401).json({ error: 'Invalid token format' });
        }
      } else {
        // Other verification errors (invalid signature, malformed, etc.)
        console.error('Token verification error:', verifyError);
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    // Find the admin by ID from the token payload
    const admin = await Admin.findById(decoded.id);
    
    if (!admin) {
      return res.status(401).json({ error: 'Admin not found' });
    }

    // Generate new token
    const newToken = jwt.sign(
      { id: admin._id, username: admin.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token: newToken,
      admin: {
        id: admin._id,
        username: admin.username
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Server error during token refresh' });
  }
};
