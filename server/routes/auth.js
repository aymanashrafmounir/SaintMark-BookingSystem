const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// Admin Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find admin by username
    let admin = await Admin.findOne({ username });

    // If no admin exists, create default admin (for first-time setup)
    if (!admin) {
      const hashedPassword = await bcrypt.hash(
        process.env.ADMIN_PASSWORD || 'admin123',
        10
      );
      admin = new Admin({
        username: process.env.ADMIN_USERNAME || 'admin',
        passwordHash: hashedPassword
      });
      await admin.save();
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: admin._id, username: admin.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' } // Extended to 7 days for better user experience
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        username: admin.username
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Refresh Token
router.post('/refresh', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
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
});

// Validate Token
router.get('/validate', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
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
});

// Change Admin Password
router.post('/change-password', async (req, res) => {
  try {
    const { username, oldPassword, newPassword } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const isMatch = await bcrypt.compare(oldPassword, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Old password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.passwordHash = hashedPassword;
    await admin.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

