import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '../utils/AppError.js';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function createAuthService({ users, sessions, hasher, config }) {
  const ttlMs = config.SESSION_TTL_HOURS * 3600 * 1000;
  // Verified against when the email is unknown, so timing does not reveal account existence.
  const dummyHash = hasher.hash(randomBytes(16).toString('hex'));

  async function startSession(userId) {
    const token = randomBytes(32).toString('base64url'); // new token on every login/register
    await sessions.create({ tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + ttlMs) });
    return token;
  }

  const publicUser = (u) => ({ id: u.id, email: u.email });

  return {
    async register({ email, password }) {
      const passwordHash = await hasher.hash(password);
      let user;
      try {
        user = await users.create({ email, passwordHash });
      } catch (err) {
        if (err.code === 'EMAIL_TAKEN') {
          throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email may already exist. Try signing in.');
        }
        throw err;
      }
      return { user: publicUser(user), token: await startSession(user.id) };
    },

    async login({ email, password }) {
      const user = await users.findByEmail(email);
      const ok = await hasher.verify(user?.passwordHash ?? (await dummyHash), password);
      if (!user || !ok || user.status !== 'active') {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      return { user: publicUser(user), token: await startSession(user.id) };
    },

    async authenticate(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
      const row = await sessions.findValid(sha256(token));
      return row ? { user: publicUser(row), token } : null;
    },

    logout: (token) => sessions.delete(sha256(token)),

    /** Stateless per-session CSRF token: HMAC(server secret, hash of session token). */
    csrfFor: (token) => createHmac('sha256', config.SESSION_SECRET).update(sha256(token)).digest('hex'),

    csrfMatches(token, supplied) {
      if (typeof supplied !== 'string') return false;
      const a = Buffer.from(this.csrfFor(token));
      const b = Buffer.from(supplied);
      return a.length === b.length && timingSafeEqual(a, b);
    },
  };
}
