const mongoose = require('mongoose');
const AdminAction = require('../models/AdminAction');

const collectionResolvers = {
  Room: () => require('../models/Room'),
  RoomGroup: () => require('../models/RoomGroup'),
  Slot: () => require('../models/Slot'),
  Booking: () => require('../models/Booking')
};

const getModel = (collection) => {
  const resolver = collectionResolvers[collection];
  if (!resolver) {
    throw new Error(`Unsupported collection for admin action: ${collection}`);
  }
  return resolver();
};

const runUndoSteps = async (payload = {}) => {
  const { steps = [] } = payload;

  for (const step of steps) {
    const { operation, collection } = step;

    if (!operation || !collection) {
      throw new Error('Invalid undo step: operation and collection are required');
    }

    const Model = getModel(collection);

    switch (operation) {
      case 'delete': {
        const ids = (step.ids || []).map((id) => new mongoose.Types.ObjectId(id));
        if (!ids.length) {
          throw new Error('Delete operation requires ids array');
        }
        await Model.deleteMany({ _id: { $in: ids } });
        break;
      }
      case 'restore': {
        const documents = step.documents || [];
        if (!documents.length) {
          throw new Error('Restore operation requires documents array');
        }

        const bulkOps = documents.map((doc) => ({
          replaceOne: {
            filter: { _id: doc._id },
            replacement: doc,
            upsert: true
          }
        }));

        if (bulkOps.length) {
          await Model.bulkWrite(bulkOps, { ordered: false });
        }
        break;
      }
      case 'update': {
        const { id, set = {}, unset = [] } = step;
        if (!id) {
          throw new Error('Update operation requires id');
        }
        const updateQuery = {};
        if (Object.keys(set).length) {
          updateQuery.$set = set;
        }
        if (unset.length) {
          updateQuery.$unset = unset.reduce((acc, field) => {
            acc[field] = '';
            return acc;
          }, {});
        }
        if (!Object.keys(updateQuery).length) {
          break;
        }
        await Model.updateOne({ _id: id }, updateQuery);
        break;
      }
      default:
        throw new Error(`Unsupported undo operation: ${operation}`);
    }
  }
};

const logAdminAction = async ({
  adminId,
  actionName,
  actionType = 'custom',
  targetCollection,
  targetIds = [],
  details = '',
  metadata = {},
  undoPayload
}) => {
  if (!undoPayload) {
    throw new Error('undoPayload is required for admin action logging');
  }

  const action = new AdminAction({
    adminId,
    actionName,
    actionType,
    targetCollection,
    targetIds,
    details,
    metadata,
    undoPayload
  });

  await action.save();
  return action;
};

const undoAdminAction = async ({ actionId }) => {
  const action = await AdminAction.findById(actionId);
  if (!action) {
    throw new Error('Action not found');
  }
  if (action.status === 'undone') {
    throw new Error('Action already undone');
  }

  await runUndoSteps(action.undoPayload);

  action.status = 'undone';
  action.undoneAt = new Date();
  await action.save();

  return action;
};

module.exports = {
  logAdminAction,
  undoAdminAction
};

