import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { backendNames, createBackend, uniqueEmail } from './helpers/backends.js';

const env = { NODE_ENV: 'test', SESSION_SECRET: 'x'.repeat(40), AUTH_RATE_LIMIT_MAX: '1000' };
const PASSWORD = 'correct horse battery';
const V1 = '/api/v1';

describe.each(backendNames())('auth API [%s backend]', (name) => {
  let backend;
  beforeAll(async () => { backend = await createBackend(name); });
  afterAll(async () => { await backend.close(); });

  const makeApp = (extra = {}) => createApp({ config: loadConfig({ ...env, ...extra }), ...backend.appDeps() });
  const cookieOf = (res) => (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('df_session='));

  async function register(app, email = uniqueEmail()) {
    const res = await request(app).post(`${V1}/auth/register`).send({ email, password: PASSWORD });
    return { res, email };
  }

  it('registers, sets a hardened session cookie and never returns hashes (AC-04)', async () => {
    const { res, email } = await register(makeApp());
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('validates registration input with field-level messages', async () => {
    const res = await request(makeApp()).post(`${V1}/auth/register`).send({ email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['email', 'password']);
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('rejects duplicate emails regardless of case or padding', async () => {
    const app = makeApp();
    const { email } = await register(app);
    const res = await request(app).post(`${V1}/auth/register`).send({ email: `  ${email.toUpperCase()} `, password: PASSWORD });
    expect(res.status).toBe(409);
  });

  it('returns identical failures for wrong password and unknown email', async () => {
    const app = makeApp();
    const { email } = await register(app);
    const wrong = await request(app).post(`${V1}/auth/login`).send({ email, password: 'wrong password!!' });
    const unknown = await request(app).post(`${V1}/auth/login`).send({ email: uniqueEmail(), password: 'wrong password!!' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    const strip = ({ error: { requestId, ...rest } }) => rest;
    expect(strip(wrong.body)).toEqual(strip(unknown.body));
  });

  it('logs in and issues a new session token each time', async () => {
    const app = makeApp();
    const { email } = await register(app);
    const a = await request(app).post(`${V1}/auth/login`).send({ email, password: PASSWORD });
    const b = await request(app).post(`${V1}/auth/login`).send({ email, password: PASSWORD });
    expect(a.status).toBe(200);
    expect(cookieOf(a)).not.toEqual(cookieOf(b));
  });

  it('protects /auth/me and returns the current user with a session', async () => {
    const app = makeApp();
    expect((await request(app).get(`${V1}/auth/me`)).status).toBe(401);
    const agent = request.agent(app);
    const email = uniqueEmail();
    await agent.post(`${V1}/auth/register`).send({ email, password: PASSWORD });
    const me = await agent.get(`${V1}/auth/me`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(email);
  });

  it('rejects forged session cookies', async () => {
    const res = await request(makeApp()).get(`${V1}/auth/me`).set('Cookie', 'df_session=' + 'a'.repeat(43));
    expect(res.status).toBe(401);
  });

  it('logout needs a CSRF token, then invalidates the session server-side', async () => {
    const app = makeApp();
    const agent = request.agent(app);
    const reg = await agent.post(`${V1}/auth/register`).send({ email: uniqueEmail(), password: PASSWORD });
    const stolen = cookieOf(reg).split(';')[0];

    expect((await agent.post(`${V1}/auth/logout`)).status).toBe(403);
    expect((await agent.post(`${V1}/auth/logout`).set('X-CSRF-Token', 'f'.repeat(64))).status).toBe(403);
    expect((await agent.post(`${V1}/auth/logout`).set('X-CSRF-Token', reg.body.data.csrfToken)).status).toBe(204);

    expect((await agent.get(`${V1}/auth/me`)).status).toBe(401);
    // Replaying the old cookie must fail too: the session row is gone (AC-04).
    expect((await request(app).get(`${V1}/auth/me`).set('Cookie', stolen)).status).toBe(401);
  });

  it('blocks cross-origin browser writes', async () => {
    const res = await request(makeApp())
      .post(`${V1}/auth/login`).set('Origin', 'https://evil.example').send({ email: uniqueEmail(), password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ORIGIN');
  });

  it('allows the configured client origin', async () => {
    const res = await request(makeApp())
      .post(`${V1}/auth/login`).set('Origin', 'http://localhost:5173').send({ email: uniqueEmail(), password: PASSWORD });
    expect(res.status).toBe(401); // reached the handler
  });

  it('rate limits auth endpoints', async () => {
    const app = makeApp({ AUTH_RATE_LIMIT_MAX: '2' });
    const hit = () => request(app).post(`${V1}/auth/login`).send({ email: uniqueEmail(), password: 'x' });
    await hit(); await hit();
    expect((await hit()).status).toBe(429);
  });
});
