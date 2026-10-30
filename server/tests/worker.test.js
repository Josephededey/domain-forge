import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { buildApiRequest } from '../../client/worker/index.js';

const env = { API_ORIGIN: 'https://api.example.test', PROXY_SHARED_SECRET: 'shared-secret-value-123' };
const site = 'https://site.example.test';

afterEach(() => vi.unstubAllGlobals());

describe('buildApiRequest', () => {
  it('targets the API origin, keeping path and query', () => {
    const req = new Request(`${site}/api/v1/domains/search?q=shop&tlds=com`);
    expect(buildApiRequest(req, env).url).toBe('https://api.example.test/api/v1/domains/search?q=shop&tlds=com');
  });

  it('replaces client-supplied forwarding and secret headers', () => {
    const req = new Request(`${site}/api/health`, {
      headers: { 'CF-Connecting-IP': '203.0.113.7', 'X-Forwarded-For': '6.6.6.6', 'X-Proxy-Secret': 'attacker', Host: 'site.example.test' },
    });
    const out = buildApiRequest(req, env);
    expect(out.headers.get('x-forwarded-for')).toBe('203.0.113.7');
    expect(out.headers.get('x-proxy-secret')).toBe(env.PROXY_SHARED_SECRET);
  });

  it('drops a forged forwarding header when no client IP is known, and any forged secret when none is configured', () => {
    const req = new Request(`${site}/api/health`, { headers: { 'X-Forwarded-For': '6.6.6.6', 'X-Proxy-Secret': 'attacker' } });
    const out = buildApiRequest(req, { API_ORIGIN: env.API_ORIGIN });
    expect(out.headers.get('x-forwarded-for')).toBeNull();
    expect(out.headers.get('x-proxy-secret')).toBeNull();
  });

  it('forwards method, body and the browser Origin and cookies', async () => {
    const req = new Request(`${site}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: site, cookie: 'df_session=abc' },
      body: '{"a":1}',
    });
    const out = buildApiRequest(req, env);
    expect(out.method).toBe('POST');
    expect(await out.text()).toBe('{"a":1}');
    expect(out.headers.get('origin')).toBe(site);
    expect(out.headers.get('cookie')).toBe('df_session=abc');
  });
});

describe('worker fetch', () => {
  it('sends non-API paths to the static assets (SPA fallback)', async () => {
    const ASSETS = { fetch: vi.fn(async () => new Response('<html></html>')) };
    const res = await worker.fetch(new Request(`${site}/dashboard`), { ...env, ASSETS });
    expect(ASSETS.fetch).toHaveBeenCalledOnce();
    expect(await res.text()).toBe('<html></html>');
  });

  it('proxies API calls, keeps status and cookies, and forbids caching', async () => {
    const upstream = new Response('{"data":{}}', { status: 201, headers: { 'set-cookie': 'df_session=abc; HttpOnly', 'content-type': 'application/json' } });
    const fetchStub = vi.fn(async () => upstream);
    vi.stubGlobal('fetch', fetchStub);
    const res = await worker.fetch(new Request(`${site}/api/v1/auth/register`, { method: 'POST', body: '{}' }), { ...env, ASSETS: {} });
    expect(fetchStub).toHaveBeenCalledOnce();
    expect(res.status).toBe(201);
    expect(res.headers.get('set-cookie')).toContain('df_session=abc');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 503 when the API address is missing and 502 when the API is unreachable', async () => {
    expect((await worker.fetch(new Request(`${site}/api/health`), { ASSETS: {} })).status).toBe(503);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED 10.0.0.1'); }));
    const res = await worker.fetch(new Request(`${site}/api/health`), { ...env, ASSETS: {} });
    expect(res.status).toBe(502);
    expect(await res.text()).not.toMatch(/ECONNREFUSED|10\.0\.0\.1/);
  });
});
