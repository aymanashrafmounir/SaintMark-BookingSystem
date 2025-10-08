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

module.exports = mongoose.model('Slot', slotSchema);

