import io from 'socket.io-client';

// For production, update REACT_APP_SOCKET_URL environment variable with your deployed backend URL
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

class SocketService {
  constructor() {
    this.socket = null;
  }

  connect() {
    if (!this.socket) {
      this.socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
      });

      this.socket.on('connect', () => {
        console.log('✅ Socket connected');
      });

      this.socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
      });

      this.socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
      });
    }
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinAdmin() {
    if (this.socket) {
      this.socket.emit('join-admin');
    }
  }

  onNewBookingRequest(callback) {
    if (this.socket) {
      this.socket.on('new-booking-request', callback);
    }
  }

  onBookingApproved(callback) {
    if (this.socket) {
      this.socket.on('booking-approved', callback);
    }
  }

  onBookingRejected(callback) {
    if (this.socket) {
      this.socket.on('booking-rejected', callback);
    }
  }

  removeListener(event) {
    if (this.socket) {
      this.socket.off(event);
    }
  }
}

const socketService = new SocketService();
export default socketService;

