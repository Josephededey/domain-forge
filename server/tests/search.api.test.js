import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

const config = loadConfig({ NODE_ENV: 'test', PROVIDER_TIMEOUT_MS: '50', SEARCH_RATE_LIMIT_MAX: '1000' });
const make = (provider, cfg = config) => createApp({ config: cfg, provider });

describe('GET /api/health', () => {
  it('returns ok with a request id and no internals', async () => {
    const res = await request(make()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

describe('GET /api/v1/domains/search', () => {
  it('returns labelled simulation results (AC-01, AC-03)', async () => {
    const res = await request(make()).get('/api/v1/domains/search?q=Example');
    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('simulation');
    expect(res.body.data.results.length).toBeGreaterThan(0);
    for (const r of res.body.data.results) {
      expect(r.source).toBe('simulation');
      expect(r.availability).toBe('unknown');
      expect(Number.isInteger(r.price.amountMinor)).toBe(true);
    }
  });

  it('honours the tlds filter and full-domain input', async () => {
    const a = await request(make()).get('/api/v1/domains/search?q=shop&tlds=com,ng');
    expect(a.body.data.results.map((r) => r.domain)).toEqual(['shop.com', 'shop.ng']);
    const b = await request(make()).get('/api/v1/domains/search?q=shop.io');
    expect(b.body.data.results.map((r) => r.domain)).toEqual(['shop.io']);
  });

  it.each(['', '-bad', 'a b', 'example.xyz'])('rejects invalid q %j with a safe envelope (AC-02)', async (q) => {
    const res = await request(make()).get('/api/v1/domains/search').query({ q });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('q');
    expect(res.body.error.requestId).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules/);
  });

  it('rejects missing q, repeated q and bad tlds', async () => {
    expect((await request(make()).get('/api/v1/domains/search')).status).toBe(400);
    expect((await request(make()).get('/api/v1/domains/search?q=a&q=b')).status).toBe(400);
    expect((await request(make()).get('/api/v1/domains/search?q=a&tlds=zzz')).status).toBe(400);
  });

  it('maps provider timeout to 504', async () => {
    const hang = { name: 'simulation', check: () => new Promise(() => {}) };
    const res = await request(make(hang)).get('/api/v1/domains/search?q=slow');
    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe('PROVIDER_TIMEOUT');
  });

  it('maps provider crash to 502 without leaking internals (AC-11)', async () => {
    const boom = { name: 'simulation', check: async () => { throw new Error('db password=SECRET at /srv/app.js'); } };
    const res = await request(make(boom)).get('/api/v1/domains/search?q=boom');
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET|\/srv/);
  });

  it('returns partial results with per-extension error state', async () => {
    const flaky = { name: 'simulation', check: async (fqdn) => { if (fqdn.endsWith('.io')) throw new Error('x'); return { domain: fqdn, isValid: true, availability: 'unknown', source: 'simulation' }; } };
    const res = await request(make(flaky)).get('/api/v1/domains/search?q=mix&tlds=com,io');
    expect(res.status).toBe(200);
    expect(res.body.data.results.find((r) => r.domain === 'mix.io').availability).toBe('error');
  });

  it('rate limits the public endpoint (FR-026)', async () => {
    const app = make(undefined, loadConfig({ NODE_ENV: 'test', SEARCH_RATE_LIMIT_MAX: '2' }));
    await request(app).get('/api/v1/domains/search?q=a');
    await request(app).get('/api/v1/domains/search?q=a');
    const res = await request(app).get('/api/v1/domains/search?q=a');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('error handling', () => {
  it('404s unknown routes in the standard shape', async () => {
    const res = await request(make()).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
  it('rejects malformed JSON bodies with 400', async () => {
    const res = await request(make()).post('/api/v1/anything').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_REQUEST');
  });
});
