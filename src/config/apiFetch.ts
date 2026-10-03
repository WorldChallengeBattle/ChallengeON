import { auth } from '../firebase';
import { apiUrl } from './api';

export async function apiFetch(input: string, init?: RequestInit) {
  const base = new URL(apiUrl('/api/'), window.location.origin);
  const target = new URL(input, window.location.origin);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) return fetch(input, init);
  if (!auth.currentUser) throw new Error('Wallet login required');
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
  return fetch(input, { ...init, headers });
}
