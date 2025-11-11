const express = require('express');
const router = express.Router();
const RoomGroup = require('../models/RoomGroup');
const authMiddleware = require('../middleware/auth');
const { logAdminAction } = require('../utils/adminActionLogger');

// Get all room groups (public - for users)
router.get('/', async (req, res) => {
  try {
    const groups = await RoomGroup.find()
      .populate('rooms', 'name isEnabled')
      .sort({ name: 1 });
    res.json(groups);
  } catch (error) {
    console.error('Get room groups error:', error);
    res.status(500).json({ error: 'Failed to fetch room groups' });
  }
});

// Get single room group
router.get('/:id', async (req, res) => {
  try {
    const group = await RoomGroup.findById(req.params.id).populate('rooms', 'name isEnabled');
    if (!group) {
      return res.status(404).json({ error: 'Room group not found' });
    }
    res.json(group);
  } catch (error) {
    console.error('Get room group error:', error);
    res.status(500).json({ error: 'Failed to fetch room group' });
  }
});

// Create room group (admin only)
router.post('/', authMiddleware, async (req, res) => {
  try {
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

    if (req.adminId) {
      const groupData = group.toObject();
      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Added Room Group',
        actionType: 'create',
        targetCollection: 'RoomGroup',
        targetIds: [group._id],
        details: `تمت إضافة المجموعة "${group.name}"`,
        metadata: { group: groupData },
        undoPayload: {
          steps: [
            {
              operation: 'delete',
              collection: 'RoomGroup',
              ids: [group._id.toString()]
            }
          ]
        }
      });
    }

    const populatedGroup = await RoomGroup.findById(group._id).populate('rooms', 'name isEnabled');
    res.status(201).json(populatedGroup);
  } catch (error) {
    console.error('Create room group error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Group name already exists' });
    }
    res.status(500).json({ error: 'Failed to create room group' });
  }
});

// Update room group (admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, rooms, isEnabled } = req.body;
    
    const group = await RoomGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'Room group not found' });
    }

    const previousState = group.toObject();

    if (name) group.name = name;
    if (rooms !== undefined) group.rooms = rooms;
    if (isEnabled !== undefined) group.isEnabled = isEnabled;
    group.updatedAt = Date.now();

    await group.save();
    const updatedGroup = await RoomGroup.findById(group._id).populate('rooms', 'name isEnabled');

    if (req.adminId) {
      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Updated Room Group',
        actionType: 'update',
        targetCollection: 'RoomGroup',
        targetIds: [group._id],
        details: `تم تحديث المجموعة "${group.name}"`,
        metadata: {
          before: {
            name: previousState.name,
            rooms: previousState.rooms,
            isEnabled: previousState.isEnabled
          },
          after: {
            name: group.name,
            rooms: group.rooms,
            isEnabled: group.isEnabled
          }
        },
        undoPayload: {
          steps: [
            {
              operation: 'update',
              collection: 'RoomGroup',
              id: group._id.toString(),
              set: {
                name: previousState.name,
                rooms: previousState.rooms,
                isEnabled: previousState.isEnabled,
                updatedAt: previousState.updatedAt
              }
            }
          ]
        }
      });
    }

    res.json(updatedGroup);
  } catch (error) {
    console.error('Update room group error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Group name already exists' });
    }
    res.status(500).json({ error: 'Failed to update room group' });
  }
});

// Delete room group (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const group = await RoomGroup.findById(req.params.id).lean();
    if (!group) {
      return res.status(404).json({ error: 'Room group not found' });
    }

    await RoomGroup.findByIdAndDelete(req.params.id);

    if (req.adminId) {
      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Removed Room Group',
        actionType: 'delete',
        targetCollection: 'RoomGroup',
        targetIds: [group._id],
        details: `تم حذف المجموعة "${group.name}"`,
        metadata: { group },
        undoPayload: {
          steps: [
            {
              operation: 'restore',
              collection: 'RoomGroup',
              documents: [group]
            }
          ]
        }
      });
    }

    res.json({ success: true, message: 'Room group deleted successfully' });
  } catch (error) {
    console.error('Delete room group error:', error);
    res.status(500).json({ error: 'Failed to delete room group' });
  }
});

module.exports = router;

