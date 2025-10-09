const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userName: {
    type: String,
    required: true,
    trim: true
  },
  slotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Slot',
    required: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
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
    required: true,
    trim: true
  },
  providerName: {
    type: String,
    required: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        // Must be 11 digits and start with 010, 011, 012, or 015
        return /^(010|011|012|015)\d{8}$/.test(v);
      },
      message: props => `${props.value} ليس رقم هاتف صحيح! يجب أن يبدأ بـ 010, 011, 012, أو 015 ويكون 11 رقم`
    }
  },
  date: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

bookingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Add indexes for better query performance
bookingSchema.index({ status: 1, createdAt: -1 }); // Most common query (filter by status, sort by date)
bookingSchema.index({ roomId: 1, date: -1 }); // Filter by room and date
bookingSchema.index({ createdAt: -1 }); // Sort by creation date
bookingSchema.index({ userName: 1 }); // Search by user name

module.exports = mongoose.model('Booking', bookingSchema);

