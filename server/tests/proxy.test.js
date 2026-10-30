import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createInMemoryRepositories } from '../src/repositories/inMemory.js';

const SECRET = 'a-long-shared-secret-for-tests';
const base = { NODE_ENV: 'test', SESSION_SECRET: 'x'.repeat(40) };
const make = (extra = {}) => createApp({ config: loadConfig({ ...base, ...extra }), repos: createInMemoryRepositories() });

describe('proxy shared-secret gate', () => {
  const app = make({ PROXY_SHARED_SECRET: SECRET });

  it('blocks requests without the secret, including wrong values', async () => {
    const none = await request(app).get('/api/v1/domains/search?q=a');
    expect(none.status).toBe(403);
    expect(none.body.error.code).toBe('FORBIDDEN');
    expect((await request(app).get('/api/v1/domains/search?q=a').set('X-Proxy-Secret', 'nope')).status).toBe(403);
  });

  it('serves requests that carry the secret', async () => {
    expect((await request(app).get('/api/v1/domains/search?q=a').set('X-Proxy-Secret', SECRET)).status).toBe(200);
  });

  it('keeps the health check open for the host', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('is off when no secret is configured', async () => {
    expect((await request(make()).get('/api/v1/domains/search?q=a')).status).toBe(200);
  });
});

describe('trusted proxy hops', () => {
  it('rate limits per forwarded client IP when two proxies are trusted', async () => {
    const app = make({ TRUST_PROXY_HOPS: '2', SEARCH_RATE_LIMIT_MAX: '1' });
    const hit = (clientIp) => request(app).get('/api/v1/domains/search?q=a').set('X-Forwarded-For', `${clientIp}, 9.9.9.9`);
    expect((await hit('1.1.1.1')).status).toBe(200);
    expect((await hit('2.2.2.2')).status).toBe(200); // a different visitor has their own allowance
    expect((await hit('1.1.1.1')).status).toBe(429);
  });
});

describe('production configuration safety', () => {
  it('refuses to trust extra proxy hops without the shared secret', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '2' })).toThrow(/PROXY_SHARED_SECRET/);
    expect(loadConfig({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '2', PROXY_SHARED_SECRET: SECRET }).TRUST_PROXY_HOPS).toBe(2);
  });
  it('rejects a short shared secret', () => {
    expect(() => loadConfig({ PROXY_SHARED_SECRET: 'short' })).toThrow(/PROXY_SHARED_SECRET/);
  });
});
