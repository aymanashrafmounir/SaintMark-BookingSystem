const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Slot = require('../models/Slot');
const authMiddleware = require('../middleware/auth');
const { logAdminAction } = require('../utils/adminActionLogger');

// Get all rooms (public - for users)
router.get('/', async (req, res) => {
  try {
    const rooms = await Room.find().sort({ name: 1 });
    res.json(rooms);
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Get single room
router.get('/:id', async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json(room);
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

// Create room (admin only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, isEnabled } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Room name is required' });
    }

    const room = new Room({
      name,
      isEnabled: isEnabled !== undefined ? isEnabled : true
    });

    await room.save();

    if (req.adminId) {
      const roomData = room.toObject();
      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Added Room',
        actionType: 'create',
        targetCollection: 'Room',
        targetIds: [room._id],
        details: `تمت إضافة المكان "${room.name}"`,
        metadata: { room: roomData },
        undoPayload: {
          steps: [
            {
              operation: 'delete',
              collection: 'Room',
              ids: [room._id.toString()]
            }
          ]
        }
      });
    }

    res.status(201).json(room);
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Update room (admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, isEnabled } = req.body;
    
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const previousState = room.toObject();

    if (name) room.name = name;
    if (isEnabled !== undefined) room.isEnabled = isEnabled;
    room.updatedAt = Date.now();

    await room.save();

    if (req.adminId) {
      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Updated Room',
        actionType: 'update',
        targetCollection: 'Room',
        targetIds: [room._id],
        details: `تم تحديث المكان "${room.name}"`,
        metadata: {
          before: {
            name: previousState.name,
            isEnabled: previousState.isEnabled
          },
          after: {
            name: room.name,
            isEnabled: room.isEnabled
          }
        },
        undoPayload: {
          steps: [
            {
              operation: 'update',
              collection: 'Room',
              id: room._id.toString(),
              set: {
                name: previousState.name,
                isEnabled: previousState.isEnabled,
                updatedAt: previousState.updatedAt
              }
            }
          ]
        }
      });
    }

    res.json(room);
  } catch (error) {
    console.error('Update room error:', error);
    res.status(500).json({ error: 'Failed to update room' });
  }
});

// Delete room (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id).lean();
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const relatedSlots = await Slot.find({ roomId: req.params.id }).lean();

    // Also delete all slots for this room
    await Slot.deleteMany({ roomId: req.params.id });
    
    await Room.findByIdAndDelete(req.params.id);

    if (req.adminId) {
      const undoSteps = [
        {
          operation: 'restore',
          collection: 'Room',
          documents: [room]
        }
      ];

      if (relatedSlots.length) {
        undoSteps.push({
          operation: 'restore',
          collection: 'Slot',
          documents: relatedSlots
        });
      }

      await logAdminAction({
        adminId: req.adminId,
        actionName: 'Removed Room',
        actionType: 'delete',
        targetCollection: 'Room',
        targetIds: [room._id],
        details: `تم حذف المكان "${room.name}"`,
        metadata: {
          room,
          slotsRemoved: relatedSlots.length
        },
        undoPayload: {
          steps: undoSteps
        }
      });
    }

    res.json({ success: true, message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

module.exports = router;

