import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL, SESSION_COOKIE_NAME } from '@/constants/api';

export const TOKEN_KEY = 'scalestation_auth_token';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    // Send as NextAuth session cookie so middleware validates it normally
    config.headers.Cookie = `${SESSION_COOKIE_NAME}=${token}`;
    // Bearer header kept as secondary auth for future API flexibility
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
    return Promise.reject(error);
  }
);

export default api;
