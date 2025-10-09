const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  serviceName: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  providerName: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  date: {
    type: Date,
    required: true
  },
  type: {
    type: String,
    enum: ['single', 'weekly'],
    default: 'single'
  },
  status: {
    type: String,
    enum: ['available', 'booked'],
    default: 'available'
  },
  bookedBy: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for better query performance
slotSchema.index({ roomId: 1, date: -1 }); // Most common query pattern
slotSchema.index({ date: -1, startTime: 1 }); // Date-based sorting
slotSchema.index({ serviceName: 1 }); // Text search
slotSchema.index({ providerName: 1 }); // Text search
slotSchema.index({ type: 1 }); // Filter by type
slotSchema.index({ status: 1 }); // Filter by status
slotSchema.index({ roomId: 1, date: -1, startTime: 1 }); // Compound index for common queries

module.exports = mongoose.model('Slot', slotSchema);

