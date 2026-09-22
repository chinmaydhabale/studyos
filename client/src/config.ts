/**
 * StudyOS Cloud & Environment Configuration
 * Automatically detects whether running locally (http://localhost:4000)
 * or in production on cloud platforms (Render, Railway, Vercel).
 */
const metaEnv = (import.meta as any).env;

export const API_BASE_URL: string = 
  metaEnv?.VITE_API_URL !== undefined && metaEnv?.VITE_API_URL !== ''
    ? metaEnv.VITE_API_URL
    : typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? '' // In production, relative path points directly to same-origin server
    : 'http://localhost:4000';

export const SOCKET_URL: string | undefined = API_BASE_URL || undefined;
