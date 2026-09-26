const isDev = import.meta.env.DEV;
const configuredBase = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
const productionBase = configuredBase && !/^https?:\/\//i.test(configuredBase)
  ? `https://${configuredBase}`
  : configuredBase;

export const API_BASE = isDev 
  ? ''
  : productionBase;

export const apiUrl = (path: string) => `${API_BASE}${path}`;
