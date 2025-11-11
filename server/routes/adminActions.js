const express = require('express');
const router = express.Router();
const AdminAction = require('../models/AdminAction');
const authMiddleware = require('../middleware/auth');
const { undoAdminAction } = require('../utils/adminActionLogger');

router.use(authMiddleware);

// Get admin actions history
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const filter = {};
    if (status) {
      filter.status = status;
    }

    const [actions, totalCount] = await Promise.all([
      AdminAction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      AdminAction.countDocuments(filter)
    ]);

    res.json({
      actions,
      pagination: {
        total: totalCount,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalCount / limitNumber)
      }
    });
  } catch (error) {
    console.error('Get admin actions error:', error);
    res.status(500).json({ error: 'Failed to fetch admin actions history' });
  }
});

// Undo specific admin action
router.post('/:id/undo', async (req, res) => {
  try {
    const action = await undoAdminAction({ actionId: req.params.id });
    res.json({
      success: true,
      action
    });
  } catch (error) {
    console.error('Undo admin action error:', error);
    res.status(400).json({ error: error.message || 'Failed to undo action' });
  }
});

module.exports = router;

