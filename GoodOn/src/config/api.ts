// API Base URL Configuration
// In development (Vite dev server), the proxy handles /api -> localhost:8080
// In production/APK, we need the full server URL

const isDev = import.meta.env.DEV;

export const API_BASE = isDev 
  ? '' // Vite proxy handles it in dev
  : (import.meta.env.VITE_API_BASE_URL || 'http://211.205.183.23:8080');

export const apiUrl = (path: string) => `${API_BASE}${path}`;
