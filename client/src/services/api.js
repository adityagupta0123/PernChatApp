import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Auth
export const register = (data) => api.post('/auth/register', data);
export const login = (data) => api.post('/auth/login', data);

// Save public key
export const savePublicKey = (publicKey) => api.post('/chat/keys', { publicKey });

// Users
export const getUsers = () => api.get('/chat/users');

// Messages
export const getMessages = (recipientId) => api.get(`/chat/messages/${recipientId}`);
export const sendMessage = (data) => api.post('/chat/messages', data);

// Groups
export const getGroups = () => api.get('/groups');
export const createGroup = (data) => api.post('/groups', data);
export const getGroupMessages = (groupId) => api.get(`/groups/${groupId}/messages`);
export const getGroupMembers = (groupId) => api.get(`/groups/${groupId}/members`);
export const sendGroupMessage = (groupId, data) => api.post(`/groups/${groupId}/messages`, data);

export default api;
