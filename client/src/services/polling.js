// Simple polling service to replace Socket.IO for serverless environment
class PollingService {
  constructor() {
    this.intervals = new Map();
    this.listeners = new Map();
  }

  // Start polling for new bookings (admin only)
  startBookingPolling(callback, interval = 5000) {
    const intervalId = setInterval(async () => {
      try {
        const response = await fetch('/api/bookings/pending');
        if (response.ok) {
          const bookings = await response.json();
          callback(bookings);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, interval);

    this.intervals.set('bookings', intervalId);
    this.listeners.set('bookings', callback);
  }

  // Start polling for booking status updates (users)
  startBookingStatusPolling(callback, interval = 3000) {
    const intervalId = setInterval(async () => {
      try {
        // This would need to be implemented based on user's booking history
        // For now, we'll just call the callback to maintain compatibility
        callback();
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, interval);

    this.intervals.set('bookingStatus', intervalId);
    this.listeners.set('bookingStatus', callback);
  }

  // Stop polling
  stopPolling(type) {
    const intervalId = this.intervals.get(type);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(type);
      this.listeners.delete(type);
    }
  }

  // Stop all polling
  stopAllPolling() {
    this.intervals.forEach((intervalId) => {
      clearInterval(intervalId);
    });
    this.intervals.clear();
    this.listeners.clear();
  }

  // Simulate Socket.IO events for compatibility
  onNewBookingRequest(callback) {
    this.startBookingPolling(callback);
  }

  onBookingApproved(callback) {
    this.startBookingStatusPolling(callback);
  }

  onBookingRejected(callback) {
    this.startBookingStatusPolling(callback);
  }

  removeListener(event) {
    switch (event) {
      case 'new-booking-request':
        this.stopPolling('bookings');
        break;
      case 'booking-approved':
      case 'booking-rejected':
        this.stopPolling('bookingStatus');
        break;
      default:
        // No action needed for unknown events
        break;
    }
  }

  connect() {
    // No-op for compatibility
    console.log('✅ Polling service connected');
  }

  joinAdmin() {
    // No-op for compatibility
  }

  disconnect() {
    this.stopAllPolling();
    console.log('❌ Polling service disconnected');
  }
}

const pollingService = new PollingService();
export default pollingService;
