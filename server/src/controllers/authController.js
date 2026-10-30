import { validateLogin, validateRegister } from '../validators/auth.js';
import { clearSessionCookie, setSessionCookie } from '../utils/cookies.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function authController({ authService, config }) {
  const reply = (res, status, { user, token }) => {
    setSessionCookie(res, token, config);
    res.status(status).json({ data: { user, csrfToken: authService.csrfFor(token) } });
  };
  return {
    register: asyncHandler(async (req, res) => reply(res, 201, await authService.register(validateRegister(req.body)))),
    login: asyncHandler(async (req, res) => reply(res, 200, await authService.login(validateLogin(req.body)))),
    me: (req, res) => res.json({ data: { user: req.user, csrfToken: authService.csrfFor(req.session.token) } }),
    logout: asyncHandler(async (req, res) => {
      await authService.logout(req.session.token);
      clearSessionCookie(res, config);
      res.status(204).end();
    }),
  };
}
