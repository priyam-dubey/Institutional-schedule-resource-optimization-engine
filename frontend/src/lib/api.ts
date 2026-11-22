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
    // A 401 from the login call itself is a wrong password, not an expired session:
    // let the form show the error instead of reloading the page.
    const isLogin = String(err.config?.url ?? '').includes('/auth/login');
    if (err.response?.status === 401 && !isLogin) {
      localStorage.removeItem('samayak_token');
      localStorage.removeItem('samayak_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── WebSocket singleton (authenticated: the server rejects sockets without a valid JWT) ──
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wantConnected = false;
const wsListeners = new Set<(data: any) => void>();

export function connectWebSocket() {
  const token = localStorage.getItem('samayak_token');
  if (!token) return;
  wantConnected = true;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      wsListeners.forEach(fn => fn(data));
    } catch { /* ignore malformed frames */ }
  };

  ws.onclose = () => {
    ws = null;
    if (wantConnected) reconnectTimer = setTimeout(connectWebSocket, 3000);
  };
}

export function disconnectWebSocket() {
  wantConnected = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  ws?.close();
  ws = null;
}

export function onWsMessage(fn: (data: any) => void): () => void {
  wsListeners.add(fn);
  return () => { wsListeners.delete(fn); };
}
