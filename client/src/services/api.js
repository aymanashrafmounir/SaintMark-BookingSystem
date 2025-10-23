import axios from 'axios';

// For production, this will use the same domain as the frontend (Vercel)
// For development, use localhost for Vercel dev server
const API_URL = process.env.REACT_APP_API_URL || '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Simple response interceptor for user-only version
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Auth APIs - Removed for user-only version

// Room APIs
export const roomAPI = {
  getAll: () => api.get('/rooms'),
  getById: (id) => api.get(`/rooms/${id}`),
  create: (data) => api.post('/rooms', data),
  update: (id, data) => api.put(`/rooms/${id}`, data),
  delete: (id) => api.delete(`/rooms/${id}`)
};

// Room Group APIs
export const roomGroupAPI = {
  getAll: () => api.get('/room-groups'),
  getById: (id) => api.get(`/room-groups/${id}`),
  create: (data) => api.post('/room-groups', data),
  update: (id, data) => api.put(`/room-groups/${id}`, data),
  delete: (id) => api.delete(`/room-groups/${id}`)
};

// Slot APIs - User only
export const slotAPI = {
  getAll: (params = {}) => api.get('/slots', { params }),
  getPublic: (params = {}) => api.get('/slots/public', { params }),
  getByRoom: (roomId, date) => {
    const params = date ? { date } : {};
    return api.get(`/slots/room/${roomId}`, { params });
  }
};

// Booking APIs - User only
export const bookingAPI = {
  getAll: (params = {}) => api.get('/bookings', { params }),
  create: (data) => api.post('/bookings/create', data)
};

// Export API - Removed for user-only version

export default api;

