import axios from 'axios';

// For production, update REACT_APP_API_URL environment variable with your deployed backend URL
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth APIs
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  changePassword: (data) => api.post('/auth/change-password', data)
};

// Room APIs
export const roomAPI = {
  getAll: () => api.get('/rooms'),
  getById: (id) => api.get(`/rooms/${id}`),
  create: (data) => api.post('/rooms', data),
  update: (id, data) => api.put(`/rooms/${id}`, data),
  delete: (id) => api.delete(`/rooms/${id}`)
};

// Slot APIs
export const slotAPI = {
  getAll: () => api.get('/slots'),
  getByRoom: (roomId, date) => {
    const params = date ? { date } : {};
    return api.get(`/slots/room/${roomId}`, { params });
  },
  create: (data) => api.post('/slots', data),
  bulkCreate: (data) => api.post('/slots/bulk', data),
  update: (id, data) => api.put(`/slots/${id}`, data),
  delete: (id) => api.delete(`/slots/${id}`)
};

// Booking APIs
export const bookingAPI = {
  getAll: () => api.get('/bookings'),
  getPending: () => api.get('/bookings/pending'),
  create: (data) => api.post('/bookings', data),
  approve: (id) => api.put(`/bookings/${id}/approve`),
  reject: (id) => api.put(`/bookings/${id}/reject`),
  delete: (id) => api.delete(`/bookings/${id}`)
};

// Export API
export const exportAPI = {
  downloadExcel: () => {
    const token = localStorage.getItem('adminToken');
    return axios({
      url: `${API_URL}/export/excel`,
      method: 'GET',
      responseType: 'blob',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  }
};

export default api;

