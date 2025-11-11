const mongoose = require('mongoose');

const { Schema } = mongoose;

const adminActionSchema = new Schema({
  adminId: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  actionName: {
    type: String,
    required: true
  },
  actionType: {
    type: String,
    enum: ['create', 'update', 'delete', 'bulk-create', 'bulk-update', 'bulk-delete', 'status-change', 'custom'],
    default: 'custom'
  },
  targetCollection: {
    type: String,
    required: true
  },
  targetIds: [{
    type: Schema.Types.ObjectId
  }],
  details: {
    type: String,
    default: ''
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  undoPayload: {
    type: Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ['completed', 'undone'],
    default: 'completed'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  undoneAt: {
    type: Date
  }
});

module.exports = mongoose.model('AdminAction', adminActionSchema);

