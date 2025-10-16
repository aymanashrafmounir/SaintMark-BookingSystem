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

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses (token expired)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      // Don't try to refresh if the original request was already a refresh request
      if (originalRequest.url?.includes('/auth/refresh')) {
        // Refresh failed - clear token and redirect to login
        localStorage.removeItem('adminToken');
        window.dispatchEvent(new CustomEvent('authExpired'));
        return Promise.reject(error);
      }
      
      try {
        // Attempt to refresh token
        const refreshResponse = await api.post('/auth/refresh');
        const newToken = refreshResponse.data.token;
        
        // Update token in localStorage
        localStorage.setItem('adminToken', newToken);
        
        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear token and redirect to login
        localStorage.removeItem('adminToken');
        // Dispatch custom event to notify components
        window.dispatchEvent(new CustomEvent('authExpired'));
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  refresh: () => api.post('/auth/refresh'),
  validate: () => api.get('/auth/validate'),
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

// Room Group APIs
export const roomGroupAPI = {
  getAll: () => api.get('/room-groups'),
  getById: (id) => api.get(`/room-groups/${id}`),
  create: (data) => api.post('/room-groups', data),
  update: (id, data) => api.put(`/room-groups/${id}`, data),
  delete: (id) => api.delete(`/room-groups/${id}`)
};

// Slot APIs
export const slotAPI = {
  getAll: (params = {}) => api.get('/slots', { params }),
  getPublic: (params = {}) => api.get('/slots/public', { params }),
  getByRoom: (roomId, date) => {
    const params = date ? { date } : {};
    return api.get(`/slots/room/${roomId}`, { params });
  },
  create: (data) => api.post('/slots', data),
  bulkCreate: (data) => api.post('/slots/bulk', data),
  bulkUpdate: (data) => api.put('/slots/bulk-update', data),
  bulkDelete: (data) => api.post('/slots/bulk-delete', data),
  update: (id, data) => api.put(`/slots/${id}`, data),
  delete: (id) => api.delete(`/slots/${id}`)
};

// Booking APIs
export const bookingAPI = {
  getAll: (params = {}) => api.get('/bookings', { params }),
  getPending: () => api.get('/bookings/pending'),
  create: (data) => api.post('/bookings/create', data),
  approve: (id) => api.put(`/bookings/${id}/approve`),
  reject: (id) => api.put(`/bookings/${id}/reject`),
  delete: (id) => api.delete(`/bookings/${id}/delete`)
};

// Export API
export const exportAPI = {
  downloadSlotsJSON: () => {
    const token = localStorage.getItem('adminToken');
    return axios({
      url: `${API_URL}/export/slots/json`,
      method: 'GET',
      responseType: 'blob',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  }
};

export default api;

