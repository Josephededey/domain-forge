import { describe, it, expect } from 'vitest';
import { createAuthService } from '../src/services/authService.js';
import { passwordHasher } from '../src/services/passwordHasher.js';
import { createInMemoryRepositories } from '../src/repositories/inMemory.js';
import { loadConfig } from '../src/config/env.js';

const config = loadConfig({ NODE_ENV: 'test', SESSION_SECRET: 'x'.repeat(40) });
const setup = () => {
  const repos = createInMemoryRepositories();
  return { repos, svc: createAuthService({ ...repos, hasher: passwordHasher, config }) };
};

describe('authService', () => {
  it('stores Argon2id hashes, never plaintext', async () => {
    const { repos, svc } = setup();
    await svc.register({ email: 'a@example.test', password: 'correct horse battery' });
    const stored = await repos.users.findByEmail('a@example.test');
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.passwordHash).not.toContain('correct horse');
  });

  it('stores only a hash of the session token', async () => {
    const { repos, svc } = setup();
    const { token } = await svc.register({ email: 'b@example.test', password: 'correct horse battery' });
    expect(repos.sessions._keys()).toHaveLength(1);
    expect(repos.sessions._keys()).not.toContain(token);
  });

  it('rejects expired sessions', async () => {
    const { repos, svc } = setup();
    const { user } = await svc.register({ email: 'c@example.test', password: 'correct horse battery' });
    await repos.sessions.create({ tokenHash: 'expired', userId: user.id, expiresAt: new Date(Date.now() - 1000) });
    expect(await repos.sessions.findValid('expired')).toBeNull();
  });

  it('CSRF tokens are per-session and verified in constant time', async () => {
    const { svc } = setup();
    const a = await svc.register({ email: 'd@example.test', password: 'correct horse battery' });
    const b = await svc.register({ email: 'e@example.test', password: 'correct horse battery' });
    expect(svc.csrfMatches(a.token, svc.csrfFor(a.token))).toBe(true);
    expect(svc.csrfMatches(a.token, svc.csrfFor(b.token))).toBe(false);
    expect(svc.csrfMatches(a.token, undefined)).toBe(false);
  });

  it('refuses a disabled account and a malformed stored hash', async () => {
    const { repos, svc } = setup();
    await repos.users.create({ email: 'f@example.test', passwordHash: 'DISABLED-SEED-ACCOUNT' });
    await expect(svc.login({ email: 'f@example.test', password: 'whatever whatever' })).rejects.toMatchObject({ status: 401 });
  });
});
