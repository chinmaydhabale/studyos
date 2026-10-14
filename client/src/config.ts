/**
 * StudyOS Cloud & Environment Configuration
 * Automatically detects whether running locally, on the VPS directly,
 * or on Vercel with automatic failover to the active Cloudflare tunnel.
 */

// Active production endpoint (set VITE_API_URL in production environment)
export const DEFAULT_PRODUCTION_TUNNEL = (import.meta as any).env?.VITE_API_URL || '';

const resolveApiBaseUrl = (): string => {
  if (typeof window === 'undefined') return 'http://localhost:4000';

  // 1. Check if user passed ?api=... or ?server=... in URL query
  try {
    const params = new URLSearchParams(window.location.search);
    const queryApi = params.get('api') || params.get('server');
    if (queryApi && queryApi.trim().startsWith('http')) {
      const clean = queryApi.trim().replace(/\/+$/, '');
      localStorage.setItem('studyos_custom_api_url', clean);
      return clean;
    }
  } catch (e) {}

  // 2. Check if user set custom backend in localStorage
  try {
    const saved = localStorage.getItem('studyos_custom_api_url');
    if (saved && saved.trim().startsWith('http')) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch (e) {}

  const host = window.location.hostname;

  // 3. If running on same origin on a VPS or reverse proxy
  if (!host.includes('vercel.app') && host !== 'localhost' && host !== '127.0.0.1') {
    return ''; // Relative paths point directly to the same-origin server
  }

  // 4. If running locally
  if (host === 'localhost' || host === '127.0.0.1') {
    const envUrl = (import.meta as any).env?.VITE_API_URL;
    return envUrl && envUrl.trim() ? envUrl.trim().replace(/\/+$/, '') : 'http://localhost:4000';
  }

  // 5. If running on Vercel or remote host
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  return DEFAULT_PRODUCTION_TUNNEL;
};

export const API_BASE_URL: string = resolveApiBaseUrl();
export const SOCKET_URL: string | undefined = API_BASE_URL || undefined;

export const setCustomServerUrl = (newUrl: string) => {
  if (typeof window !== 'undefined') {
    const clean = newUrl.trim().replace(/\/+$/, '');
    if (clean) {
      localStorage.setItem('studyos_custom_api_url', clean);
    } else {
      localStorage.removeItem('studyos_custom_api_url');
    }
    window.location.reload();
  }
};
