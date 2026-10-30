import { AppError } from '../utils/AppError.js';
import { SESSION_COOKIE } from '../utils/cookies.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Rejects cross-origin browser writes. Requests without an Origin header (non-browser clients) pass here; CSRF token still applies to authenticated routes. */
export const originGuard = (config) => (req, _res, next) => {
  const origin = req.get('Origin');
  if (UNSAFE.has(req.method) && origin && !config.CLIENT_ORIGINS.includes(origin)) {
    return next(new AppError(403, 'FORBIDDEN_ORIGIN', 'This request was blocked.'));
  }
  next();
};

export const requireAuth = (authService) => async (req, _res, next) => {
  try {
    const session = await authService.authenticate(req.cookies?.[SESSION_COOKIE]);
    if (!session) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    req.session = session;
    req.user = session.user; // owner ID always comes from here, never from the request body (FR-045)
    next();
  } catch (err) {
    next(err);
  }
};

export const requireCsrf = (authService) => (req, _res, next) => {
  if (!authService.csrfMatches(req.session.token, req.get('X-CSRF-Token'))) {
    return next(new AppError(403, 'CSRF_FAILED', 'Your session could not be verified. Refresh the page and try again.'));
  }
  next();
};
