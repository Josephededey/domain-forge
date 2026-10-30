import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { backendNames, createBackend, uniqueEmail } from './helpers/backends.js';

const config = loadConfig({ NODE_ENV: 'test', SESSION_SECRET: 'x'.repeat(40), AUTH_RATE_LIMIT_MAX: '1000' });
const V1 = '/api/v1';
const name = () => `n${randomUUID().slice(0, 8)}`;

describe.each(backendNames())('orders API [%s backend]', (backendName) => {
  let backend;
  beforeAll(async () => { backend = await createBackend(backendName); });
  afterAll(async () => { await backend.close(); });

  async function signUp(app) {
    const agent = request.agent(app);
    const res = await agent.post(`${V1}/auth/register`).send({ email: uniqueEmail(), password: 'correct horse battery' });
    return { agent, id: res.body.data.user.id, csrf: res.body.data.csrfToken };
  }
  async function world() {
    const deps = backend.appDeps();
    const app = createApp({ config, ...deps });
    return { app, deps, a: await signUp(app), b: await signUp(app) };
  }
  const place = (u, body, key) => {
    const r = u.agent.post(`${V1}/orders`).set('X-CSRF-Token', u.csrf);
    return (key ? r.set('Idempotency-Key', key) : r).send(body);
  };
  const confirm = (u, id) => u.agent.post(`${V1}/orders/${id}/confirm-demo`).set('X-CSRF-Token', u.csrf);
  const cancel = (u, id) => u.agent.post(`${V1}/orders/${id}/cancel`).set('X-CSRF-Token', u.csrf);
  const domains = async (u) => (await u.agent.get(`${V1}/domains`)).body.data.records;

  it('requires a session, and a CSRF token for writes', async () => {
    const { app, a } = await world();
    const id = randomUUID();
    expect((await request(app).get(`${V1}/orders`)).status).toBe(401);
    expect((await request(app).get(`${V1}/orders/${id}`)).status).toBe(401);
    expect((await request(app).post(`${V1}/orders`).send({})).status).toBe(401);
    expect((await a.agent.post(`${V1}/orders`).send({ items: [{ domain: 'x.com' }] })).status).toBe(403);
    expect((await a.agent.post(`${V1}/orders/${id}/confirm-demo`)).status).toBe(403);
  });

  it('creates a pending demo order with server-calculated prices and ignores client totals (AC-06)', async () => {
    const { a, b } = await world();
    const d = `${name()}.com`;
    const res = await place(a, {
      items: [{ domain: d, termYears: 2, unitPriceMinor: 1, price: 1, total: 1 }],
      total: 1, totalMinor: 1, subtotalMinor: 1, currency: 'USD', status: 'completed_demo', userId: b.id,
    });
    expect(res.status).toBe(201);
    const { order, notice } = res.body.data;
    expect(notice).toMatch(/no payment/i);
    expect(order).toMatchObject({ status: 'pending_demo', currency: 'NGN', subtotalMinor: 3_000_000, totalMinor: 3_000_000 });
    expect(order.orderNumber).toMatch(/^DF-\d{8}-[A-Z2-9]{6}$/);
    expect(order.items).toEqual([expect.objectContaining({ fqdn: d, termYears: 2, unitPriceMinor: 1_500_000, currency: 'NGN', itemStatus: 'pending' })]);
    expect((await b.agent.get(`${V1}/orders`)).body.data.orders).toHaveLength(0);
    expect(JSON.stringify(res.body)).not.toMatch(/user_?id|idempotency/i);
  });

  it.each([
    ['no items', { items: [] }],
    ['no body', {}],
    ['missing extension', { items: [{ domain: 'shop' }] }],
    ['unsupported extension', { items: [{ domain: 'shop.xyz' }] }],
    ['invalid syntax', { items: [{ domain: 'bad_name.com' }] }],
    ['bad term', { items: [{ domain: 'a.com', termYears: 11 }] }],
    ['duplicate items', { items: [{ domain: 'a.com' }, { domain: 'a.com' }] }],
  ])('rejects invalid order: %s', async (_n, body) => {
    const { a } = await world();
    const res = await place(a, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect((await a.agent.get(`${V1}/orders`)).body.data.orders).toHaveLength(0);
  });

  it('replays an identical request with the same Idempotency-Key instead of creating a duplicate', async () => {
    const { a, b } = await world();
    const body = { items: [{ domain: `${name()}.com` }] };
    const key = `key-${randomUUID()}`;
    const first = await place(a, body, key);
    const second = await place(a, body, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.order.id).toBe(first.body.data.order.id);
    expect((await a.agent.get(`${V1}/orders`)).body.data.orders).toHaveLength(1);

    const other = await place(a, { items: [{ domain: `${name()}.com` }] }, key);
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

    const theirs = await place(b, body, key); // keys are scoped per user
    expect(theirs.status).toBe(201);
    expect(theirs.body.data.order.id).not.toBe(first.body.data.order.id);
  });

  it('rejects a malformed Idempotency-Key', async () => {
    const { a } = await world();
    expect((await place(a, { items: [{ domain: `${name()}.com` }] }, 'short')).status).toBe(400);
  });

  it('refuses to order a domain the user already holds', async () => {
    const { a, deps } = await world();
    const d = `${name()}.com`;
    await deps.repos.domainRecords.create({ userId: a.id, fqdn: d, status: 'demo_active' });
    const res = await place(a, { items: [{ domain: d }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOMAIN_ALREADY_IN_ACCOUNT');
  });

  it('confirming creates demo records and completes the order, with no charge', async () => {
    const { a } = await world();
    const d1 = `${name()}.com`;
    const d2 = `${name()}.ng`;
    const { order } = (await place(a, { items: [{ domain: d1, termYears: 2 }, { domain: d2 }] })).body.data;
    const res = await confirm(a, order.id);
    expect(res.status).toBe(200);
    expect(res.body.data.alreadyConfirmed).toBe(false);
    expect(res.body.data.order.status).toBe('completed_demo');
    expect(res.body.data.order.items.every((i) => i.itemStatus === 'fulfilled_demo')).toBe(true);
    expect(res.body.data.order.totalMinor).toBe(order.totalMinor); // snapshot unchanged

    const recs = await domains(a);
    expect(recs.map((r) => r.fqdn).sort()).toEqual([d1, d2].sort());
    const r1 = recs.find((r) => r.fqdn === d1);
    expect(r1).toMatchObject({ status: 'demo_active', sourceMode: 'demo' });
    const years = (new Date(r1.expiresAt) - Date.now()) / (365 * 24 * 3600 * 1000);
    expect(years).toBeGreaterThan(1.9);
    expect(years).toBeLessThan(2.1);
  });

  it('repeated confirmation has no duplicate effects (AC-07)', async () => {
    const { a } = await world();
    const { order } = (await place(a, { items: [{ domain: `${name()}.com` }] })).body.data;
    const first = await confirm(a, order.id);
    const second = await confirm(a, order.id);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.alreadyConfirmed).toBe(true);
    expect(await domains(a)).toHaveLength(1);
    expect((await a.agent.get(`${V1}/orders`)).body.data.orders).toHaveLength(1);
  });

  it('simultaneous confirmations still create exactly one record', async () => {
    const { a } = await world();
    const { order } = (await place(a, { items: [{ domain: `${name()}.com` }] })).body.data;
    const results = await Promise.all([confirm(a, order.id), confirm(a, order.id), confirm(a, order.id)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.filter((r) => !r.body.data.alreadyConfirmed)).toHaveLength(1);
    expect(await domains(a)).toHaveLength(1);
  });

  it('rolls back everything if one item cannot be fulfilled', async () => {
    const { a, deps } = await world();
    const d1 = `${name()}.com`;
    const d2 = `${name()}.com`;
    const { order } = (await place(a, { items: [{ domain: d1 }, { domain: d2 }] })).body.data;
    // d2 becomes taken after the order was placed.
    await deps.repos.domainRecords.create({ userId: a.id, fqdn: d2, status: 'demo_active' });

    const res = await confirm(a, order.id);
    expect(res.status).toBe(409);
    expect((await domains(a)).map((r) => r.fqdn)).toEqual([d2]); // d1 was not left behind
    const after = await a.agent.get(`${V1}/orders/${order.id}`);
    expect(after.body.data.order.status).toBe('pending_demo');
  });

  it('keeps other users’ orders invisible and untouchable', async () => {
    const { a, b } = await world();
    const { order } = (await place(a, { items: [{ domain: `${name()}.com` }] })).body.data;
    expect((await b.agent.get(`${V1}/orders/${order.id}`)).status).toBe(404);
    expect((await confirm(b, order.id)).status).toBe(404);
    expect((await cancel(b, order.id)).status).toBe(404);
    expect((await b.agent.get(`${V1}/orders`)).body.data.orders).toHaveLength(0);
    expect((await a.agent.get(`${V1}/orders/${order.id}`)).body.data.order.status).toBe('pending_demo');
    expect(await domains(b)).toHaveLength(0);
  });

  it('treats malformed order ids as not found', async () => {
    const { a } = await world();
    expect((await a.agent.get(`${V1}/orders/not-a-uuid`)).status).toBe(404);
    expect((await confirm(a, 'nope')).status).toBe(404);
  });

  it('cancels a pending order, repeats safely, and blocks confirming afterwards', async () => {
    const { a } = await world();
    const { order } = (await place(a, { items: [{ domain: `${name()}.com` }] })).body.data;
    const c1 = await cancel(a, order.id);
    expect(c1.status).toBe(200);
    expect(c1.body.data.order.status).toBe('cancelled');
    expect((await cancel(a, order.id)).status).toBe(200);
    const late = await confirm(a, order.id);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_ORDER_STATE');
    expect(await domains(a)).toHaveLength(0);
  });

  it('cannot cancel a completed order', async () => {
    const { a } = await world();
    const { order } = (await place(a, { items: [{ domain: `${name()}.com` }] })).body.data;
    await confirm(a, order.id);
    const res = await cancel(a, order.id);
    expect(res.status).toBe(409);
    expect((await a.agent.get(`${V1}/orders/${order.id}`)).body.data.order.status).toBe('completed_demo');
  });
});
