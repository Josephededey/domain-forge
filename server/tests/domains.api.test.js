import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { backendNames, createBackend, uniqueEmail } from './helpers/backends.js';

const config = loadConfig({ NODE_ENV: 'test', SESSION_SECRET: 'x'.repeat(40), AUTH_RATE_LIMIT_MAX: '1000' });
const V1 = '/api/v1';
const uniqueName = () => `n${randomUUID().slice(0, 8)}.com`;

describe.each(backendNames())('domain records API [%s backend]', (name) => {
  let backend;
  beforeAll(async () => { backend = await createBackend(name); });
  afterAll(async () => { await backend.close(); });

  async function signUp(app) {
    const agent = request.agent(app);
    const res = await agent.post(`${V1}/auth/register`).send({ email: uniqueEmail(), password: 'correct horse battery' });
    return { agent, id: res.body.data.user.id, csrf: res.body.data.csrfToken };
  }

  async function world() {
    const deps = backend.appDeps();
    const app = createApp({ config, ...deps });
    const a = await signUp(app);
    const b = await signUp(app);
    const make = (user, extra = {}) => deps.repos.domainRecords.create({ userId: user.id, fqdn: uniqueName(), ...extra });
    return { app, a, b, make };
  }

  it('requires a session for every record route', async () => {
    const { app } = await world();
    const id = randomUUID();
    expect((await request(app).get(`${V1}/domains`)).status).toBe(401);
    expect((await request(app).get(`${V1}/domains/${id}`)).status).toBe(401);
    expect((await request(app).patch(`${V1}/domains/${id}`).send({ label: 'x' })).status).toBe(401);
  });

  it('lists only the signed-in user’s records (AC-05)', async () => {
    const { a, b, make } = await world();
    const r1 = await make(a);
    const r2 = await make(a);
    const rb = await make(b);

    const listA = await a.agent.get(`${V1}/domains`);
    expect(listA.status).toBe(200);
    expect(listA.body.data.records.map((r) => r.id).sort()).toEqual([r1.id, r2.id].sort());
    expect(JSON.stringify(listA.body)).not.toMatch(/user_?id/i);

    const listB = await b.agent.get(`${V1}/domains`);
    expect(listB.body.data.records.map((r) => r.id)).toEqual([rb.id]);
  });

  it('ignores an owner id supplied in the query string', async () => {
    const { a, b, make } = await world();
    const mine = await make(a);
    await make(b);
    const res = await a.agent.get(`${V1}/domains`).query({ userId: b.id, user_id: b.id });
    expect(res.body.data.records.map((r) => r.id)).toEqual([mine.id]);
  });

  it('returns an owned record', async () => {
    const { a, make } = await world();
    const rec = await make(a, { status: 'demo_active' });
    const res = await a.agent.get(`${V1}/domains/${rec.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.record).toMatchObject({ id: rec.id, fqdn: rec.fqdn, sourceMode: 'demo', status: 'demo_active' });
  });

  it('answers 404 for another user’s record on read and write, and leaves it unchanged', async () => {
    const { a, b, make } = await world();
    const rec = await make(a, { label: 'original' });

    expect((await b.agent.get(`${V1}/domains/${rec.id}`)).status).toBe(404);
    const patch = await b.agent.patch(`${V1}/domains/${rec.id}`).set('X-CSRF-Token', b.csrf).send({ label: 'hijacked' });
    expect(patch.status).toBe(404);
    expect(patch.body.error.code).toBe('NOT_FOUND');

    const still = await a.agent.get(`${V1}/domains/${rec.id}`);
    expect(still.body.data.record.label).toBe('original');
  });

  it('treats malformed and unknown ids as not found', async () => {
    const { a } = await world();
    expect((await a.agent.get(`${V1}/domains/not-a-uuid`)).status).toBe(404);
    expect((await a.agent.get(`${V1}/domains/${randomUUID()}`)).status).toBe(404);
    expect((await a.agent.get(`${V1}/domains/1%27%20OR%201=1`)).status).toBe(404);
  });

  it('updates the permitted demo fields', async () => {
    const { a, make } = await world();
    const rec = await make(a);
    const res = await a.agent.patch(`${V1}/domains/${rec.id}`).set('X-CSRF-Token', a.csrf).send({ label: '  My shop  ', autoRenewDemo: true });
    expect(res.status).toBe(200);
    expect(res.body.data.record).toMatchObject({ label: 'My shop', autoRenewDemo: true, fqdn: rec.fqdn, status: rec.status });
    expect(new Date(res.body.data.record.updatedAt) >= new Date(rec.updatedAt)).toBe(true);

    const cleared = await a.agent.patch(`${V1}/domains/${rec.id}`).set('X-CSRF-Token', a.csrf).send({ label: '   ' });
    expect(cleared.body.data.record.label).toBeNull();
  });

  it('rejects attempts to change owner, name, status or id (mass assignment)', async () => {
    const { a, b, make } = await world();
    const rec = await make(a);
    const res = await a.agent.patch(`${V1}/domains/${rec.id}`).set('X-CSRF-Token', a.csrf)
      .send({ label: 'ok', userId: b.id, user_id: b.id, fqdn: 'evil.com', status: 'demo_active', id: randomUUID() });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['fqdn', 'id', 'status', 'userId', 'user_id']);

    const after = await a.agent.get(`${V1}/domains/${rec.id}`);
    expect(after.body.data.record).toMatchObject({ fqdn: rec.fqdn, status: rec.status, label: null });
    expect((await b.agent.get(`${V1}/domains`)).body.data.records).toHaveLength(0);
  });

  it.each([
    ['empty body', {}],
    ['label too long', { label: 'x'.repeat(61) }],
    ['label not a string', { label: 42 }],
    ['autoRenewDemo not a boolean', { autoRenewDemo: 'yes' }],
  ])('rejects invalid update: %s', async (_n, body) => {
    const { a, make } = await world();
    const rec = await make(a);
    const res = await a.agent.patch(`${V1}/domains/${rec.id}`).set('X-CSRF-Token', a.csrf).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('needs the CSRF token and an allowed origin for updates', async () => {
    const { a, make } = await world();
    const rec = await make(a);
    expect((await a.agent.patch(`${V1}/domains/${rec.id}`).send({ label: 'x' })).status).toBe(403);
    const origin = await a.agent.patch(`${V1}/domains/${rec.id}`).set('X-CSRF-Token', a.csrf).set('Origin', 'https://evil.example').send({ label: 'x' });
    expect(origin.status).toBe(403);
  });

  it('does not allow editing cancelled records', async () => {
    const { a, make } = await world();
    const rec = await make(a, { status: 'cancelled' });
    const res = await a.agent.patch(`${V1}/domains/${rec.id}`).set('X-CSRF-Token', a.csrf).send({ label: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RECORD_NOT_EDITABLE');
  });

  it('still routes /domains/search to the public search', async () => {
    const { app } = await world();
    const res = await request(app).get(`${V1}/domains/search?q=shop`);
    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('simulation');
  });
});
