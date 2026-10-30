import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from '../utils/AppError.js';

const digest = (value) => createHash('sha256').update(String(value ?? '')).digest();

/**
 * Optional lock: if PROXY_SHARED_SECRET is set, only requests that came through our edge proxy
 * (which adds the secret) are served. /api/health stays open for the host's health checks.
 */
export const proxyGate = (config) => (req, _res, next) => {
  const secret = config.PROXY_SHARED_SECRET;
  if (!secret || req.path === '/api/health') return next();
  if (timingSafeEqual(digest(req.get('X-Proxy-Secret')), digest(secret))) return next();
  next(new AppError(403, 'FORBIDDEN', 'This request was blocked.'));
};
