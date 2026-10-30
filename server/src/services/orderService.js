import { AppError } from '../utils/AppError.js';
import { generateOrderNumber } from '../utils/orderNumber.js';
import { buildOrderLines } from './orderPricing.js';
import { canTransition } from './orderState.js';

const notFound = () => new AppError(404, 'NOT_FOUND', 'That order does not exist.');
const fingerprint = (items) => items.map((i) => `${i.fqdn}:${i.termYears}`).sort().join('|');

export function createOrderService({ orders, domainRecords, transaction, newOrderNumber = generateOrderNumber, now = () => new Date() }) {
  async function replayOrConflict(userId, key, wanted) {
    const existing = await orders.findByIdempotencyKey(userId, key);
    if (!existing) return null;
    if (fingerprint(existing.items) !== fingerprint(wanted)) {
      throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'That request key was already used for a different order.');
    }
    return { order: existing, created: false };
  }

  async function get(userId, id) {
    const order = await orders.findForUser(id, userId); // scoped by owner; others' orders look missing
    if (!order) throw notFound();
    return order;
  }

  return {
    list: (userId) => orders.listByUser(userId),
    get,

    async create(userId, { items, idempotencyKey }) {
      if (idempotencyKey) {
        const replay = await replayOrConflict(userId, idempotencyKey, items);
        if (replay) return replay;
      }

      for (const [i, item] of items.entries()) {
        if (await domainRecords.findLiveByFqdn(userId, item.fqdn)) {
          throw new AppError(409, 'DOMAIN_ALREADY_IN_ACCOUNT', 'You already have a demo record for one of these domains.',
            [{ field: `items.${i}.domain`, issue: 'Already in your account.' }]);
        }
      }

      const priced = buildOrderLines(items);
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const order = await transaction((tx) =>
            tx.orders.create({
              userId,
              orderNumber: newOrderNumber(now()),
              status: 'pending_demo',
              currency: priced.currency,
              subtotalMinor: priced.subtotalMinor,
              totalMinor: priced.totalMinor,
              idempotencyKey: idempotencyKey ?? null,
              items: priced.lines,
            }),
          );
          return { order, created: true };
        } catch (err) {
          if (err.code === 'ORDER_NUMBER_TAKEN') continue;
          if (err.code === 'IDEMPOTENCY_KEY_TAKEN') {
            // Two identical requests raced; the other one won.
            const replay = await replayOrConflict(userId, idempotencyKey, items);
            if (replay) return replay;
          }
          throw err;
        }
      }
      throw new Error('Could not allocate an order number');
    },

    /** Demo confirmation. Never charges money and never contacts a registrar. Safe to repeat. */
    confirmDemo(userId, id) {
      return transaction(async (tx) => {
        const order = await tx.orders.findForUserForUpdate(id, userId);
        if (!order) throw notFound();
        if (order.status === 'completed_demo') return { order, alreadyConfirmed: true };
        if (!canTransition(order.status, 'completed_demo')) {
          throw new AppError(409, 'INVALID_ORDER_STATE', `This order is ${order.status.replace('_', ' ')} and cannot be confirmed.`);
        }
        for (const item of order.items) {
          const expiresAt = now();
          expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + item.termYears);
          try {
            await tx.domainRecords.create({ userId, fqdn: item.fqdn, status: 'demo_active', expiresAt });
          } catch (err) {
            if (err.code === 'RECORD_EXISTS') {
              throw new AppError(409, 'DOMAIN_ALREADY_IN_ACCOUNT', 'You already have a demo record for one of these domains.');
            }
            throw err;
          }
        }
        await tx.orders.markCompleted(id, userId);
        return { order: await tx.orders.findForUser(id, userId), alreadyConfirmed: false };
      });
    },

    cancel(userId, id) {
      return transaction(async (tx) => {
        const order = await tx.orders.findForUserForUpdate(id, userId);
        if (!order) throw notFound();
        if (order.status === 'cancelled') return order;
        if (!canTransition(order.status, 'cancelled')) {
          throw new AppError(409, 'INVALID_ORDER_STATE', `This order is ${order.status.replace('_', ' ')} and cannot be cancelled.`);
        }
        await tx.orders.markCancelled(id, userId);
        return tx.orders.findForUser(id, userId);
      });
    },
  };
}
