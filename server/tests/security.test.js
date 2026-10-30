import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createInMemoryRepositories } from '../src/repositories/inMemory.js';
import { createLogger } from '../src/utils/logger.js';

const base = { NODE_ENV: 'test', SESSION_SECRET: 'x'.repeat(40), AUTH_RATE_LIMIT_MAX: '1000' };
const make = (extra = {}, deps = {}) =>
  createApp({ config: loadConfig({ ...base, ...extra }), repos: createInMemoryRepositories(), ...deps });
const creds = { email: 'sec@example.test', password: 'correct horse battery' };

describe('HTTP hardening', () => {
  it('sets security headers and hides the framework', async () => {
    const res = await request(make()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['strict-transport-security']).toBeTruthy();
  });

  it('answers CORS only for the configured origin', async () => {
    const app = make();
    const bad = await request(app).options('/api/v1/auth/login')
      .set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();

    const ok = await request(app).options('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects oversized request bodies', async () => {
    const res = await request(make()).post('/api/v1/auth/login').send({ email: 'a@example.test', password: 'x'.repeat(20_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('marks the session cookie Secure in production', async () => {
    const res = await request(make({ NODE_ENV: 'production' })).post('/api/v1/auth/register').send(creds);
    expect(res.status).toBe(201);
    expect(res.headers['set-cookie'][0]).toMatch(/;\s*Secure/i);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
  });
});

describe('unexpected failures (AC-11)', () => {
  it('returns a generic 500 with a request id and logs the detail privately', async () => {
    const lines = [];
    const logger = createLogger(loadConfig(base), { stream: { write: (s) => lines.push(s) }, level: 'error' });
    const repos = createInMemoryRepositories();
    repos.users.findByEmail = async () => {
      throw new Error("SELECT * FROM users WHERE password='hunter2' at /srv/app/server.js:42");
    };
    const res = await request(createApp({ config: loadConfig(base), repos, logger })).post('/api/v1/auth/login').send(creds);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    expect(JSON.stringify(res.body)).not.toMatch(/SELECT|hunter2|\/srv|server\.js|stack/i);
    expect(lines.join('')).toContain(res.body.error.requestId); // operators can correlate
  });
});
