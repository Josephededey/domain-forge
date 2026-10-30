import { describe, it, expect } from 'vitest';
import { buildOrderLines } from '../src/services/orderPricing.js';
import { canTransition } from '../src/services/orderState.js';
import { generateOrderNumber } from '../src/utils/orderNumber.js';
import { createOrderService } from '../src/services/orderService.js';
import { createInMemoryRepositories } from '../src/repositories/inMemory.js';
import { validateCreateOrder } from '../src/validators/order.js';

describe('buildOrderLines', () => {
  it('prices from server config in integer minor units', () => {
    const r = buildOrderLines([
      { fqdn: 'a.com', tld: 'com', termYears: 2 },
      { fqdn: 'b.ng', tld: 'ng', termYears: 1 },
    ]);
    expect(r.currency).toBe('NGN');
    expect(r.lines[0]).toMatchObject({ unitPriceMinor: 1_500_000, termYears: 2 });
    expect(r.totalMinor).toBe(1_500_000 * 2 + 800_000);
    expect(Number.isInteger(r.totalMinor)).toBe(true);
    expect(r.subtotalMinor).toBe(r.totalMinor);
  });
});

describe('order state machine', () => {
  it.each([
    ['pending_demo', 'completed_demo', true],
    ['pending_demo', 'cancelled', true],
    ['pending_demo', 'failed', true],
    ['completed_demo', 'cancelled', false],
    ['completed_demo', 'pending_demo', false],
    ['cancelled', 'completed_demo', false],
    ['failed', 'pending_demo', false],
    ['nonsense', 'completed_demo', false],
  ])('%s -> %s is %s', (from, to, ok) => expect(canTransition(from, to)).toBe(ok));
});

describe('generateOrderNumber', () => {
  it('has the expected shape', () => {
    expect(generateOrderNumber(new Date('2026-10-29T10:00:00Z'))).toMatch(/^DF-20261029-[A-Z2-9]{6}$/);
  });
});

describe('validateCreateOrder', () => {
  const ok = { items: [{ domain: 'Shop.COM' }] };
  it('normalises the domain and defaults the term to 1 year', () => {
    expect(validateCreateOrder(ok).items).toEqual([{ fqdn: 'shop.com', tld: 'com', termYears: 1 }]);
  });
  it.each([
    ['no items', { items: [] }],
    ['missing extension', { items: [{ domain: 'shop' }] }],
    ['unsupported extension', { items: [{ domain: 'shop.xyz' }] }],
    ['bad syntax', { items: [{ domain: '-x-.com' }] }],
    ['term 0', { items: [{ domain: 'a.com', termYears: 0 }] }],
    ['term 11', { items: [{ domain: 'a.com', termYears: 11 }] }],
    ['fractional term', { items: [{ domain: 'a.com', termYears: 1.5 }] }],
    ['duplicates', { items: [{ domain: 'a.com' }, { domain: 'A.com' }] }],
    ['too many', { items: Array.from({ length: 11 }, (_, i) => ({ domain: `d${i}.com` })) }],
  ])('rejects %s', (_n, body) => expect(() => validateCreateOrder(body)).toThrow(/check the order/));
  it('rejects a malformed idempotency key', () => expect(() => validateCreateOrder(ok, 'short')).toThrow());
});

describe('order number collisions', () => {
  it('retries with a new number when one is taken', async () => {
    const repos = createInMemoryRepositories();
    const seq = ['DF-X', 'DF-X', 'DF-Y'];
    const svc = createOrderService({ orders: repos.orders, domainRecords: repos.domainRecords, transaction: repos.transaction, newOrderNumber: () => seq.shift() });
    const items = [{ fqdn: 'a.com', tld: 'com', termYears: 1 }];
    const first = await svc.create('u1', { items });
    const second = await svc.create('u1', { items: [{ fqdn: 'b.com', tld: 'com', termYears: 1 }] });
    expect(first.order.orderNumber).toBe('DF-X');
    expect(second.order.orderNumber).toBe('DF-Y');
  });
});
