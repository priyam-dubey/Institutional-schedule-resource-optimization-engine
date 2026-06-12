import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('samayak_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('samayak_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// WebSocket singleton
let ws: WebSocket | null = null;
const wsListeners = new Set<(data: any) => void>();

export function connectWebSocket() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${window.location.host}/ws`);

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      wsListeners.forEach(fn => fn(data));
    } catch {}
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 3000);
  };
}

export function onWsMessage(fn: (data: any) => void) {
  wsListeners.add(fn);
  return () => wsListeners.delete(fn);
}
