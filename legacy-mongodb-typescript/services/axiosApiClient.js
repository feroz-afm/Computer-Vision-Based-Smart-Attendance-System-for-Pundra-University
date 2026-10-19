import axios from 'axios';

/**
 * Centralized Axios API Client
 * Configured with base URL, timeout, and request/response interceptors.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT Token if available in localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('attendeye_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Format errors and handle common status codes
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const customError = {
      status: error.response?.status || 500,
      message: error.response?.data?.message || error.message || 'Something went wrong',
      details: error.response?.data || null,
    };

    if (customError.status === 401) {
      // Optional: Clear token on unauthorized response
      localStorage.removeItem('attendeye_token');
    }

    return Promise.reject(customError);
  }
);

// API Service Methods
export const systemAPI = {
  getHealth: () => api.get('/health'),
};

export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getCurrentUser: () => api.get('/auth/me'),
};

export const attendanceAPI = {
  verifyFace: (payload) => api.post('/attendance/verify', payload),
  getHistory: (params) => api.get('/attendance/history', { params }),
};

export default api;
