import { randomUUID } from 'node:crypto';

const coded = (code) => Object.assign(new Error(code), { code });
const copy = (v) => structuredClone(v);

/** Same contract as the pg repositories; used for fast tests without a database. */
export function createInMemoryRepositories() {
  const byEmail = new Map();
  const byId = new Map();
  const store = new Map();
  const records = new Map();
  const orderStore = new Map();

  const users = {
    async create({ email, passwordHash }) {
      if (byEmail.has(email)) throw coded('EMAIL_TAKEN');
      const u = { id: randomUUID(), email, status: 'active', passwordHash };
      byEmail.set(email, u);
      byId.set(u.id, u);
      return { id: u.id, email, status: u.status };
    },
    async findByEmail(email) {
      return byEmail.get(email) ?? null;
    },
  };

  const sessions = {
    async create({ tokenHash, userId, expiresAt }) {
      store.set(tokenHash, { userId, expiresAt });
    },
    async findValid(tokenHash) {
      const s = store.get(tokenHash);
      const u = s && byId.get(s.userId);
      return s && s.expiresAt > new Date() && u?.status === 'active' ? { id: u.id, email: u.email } : null;
    },
    async delete(tokenHash) {
      store.delete(tokenHash);
    },
    _keys: () => [...store.keys()],
  };

  const view = ({ userId, ...rest }) => copy(rest);
  const domainRecords = {
    async listByUser(userId) {
      return [...records.values()].filter((r) => r.userId === userId).sort((a, b) => b.createdAt - a.createdAt).map(view);
    },
    async findForUser(id, userId) {
      const r = records.get(id);
      return r && r.userId === userId ? view(r) : null;
    },
    async findLiveByFqdn(userId, fqdn) {
      const r = [...records.values()].find((x) => x.userId === userId && x.fqdn === fqdn && x.status !== 'cancelled');
      return r ? view(r) : null;
    },
    async updateForUser(id, userId, changes) {
      const r = records.get(id);
      if (!r || r.userId !== userId) return null;
      if ('label' in changes) r.label = changes.label;
      if ('autoRenewDemo' in changes) r.autoRenewDemo = changes.autoRenewDemo;
      r.updatedAt = new Date(Date.now() + 1000); // always visibly newer in tests
      return view(r);
    },
    async create({ userId, fqdn, status = 'demo_pending', label = null, expiresAt = null }) {
      const live = [...records.values()].some((x) => x.userId === userId && x.fqdn === fqdn && x.status !== 'cancelled');
      if (live && status !== 'cancelled') throw coded('RECORD_EXISTS');
      const now = new Date();
      const r = { id: randomUUID(), userId, fqdn, sourceMode: 'demo', status, label, autoRenewDemo: false, expiresAt, createdAt: now, updatedAt: now };
      records.set(r.id, r);
      return view(r);
    },
  };

  const orderView = ({ userId, idempotencyKey, ...rest }) => copy(rest);
  const owned = (id, userId) => {
    const o = orderStore.get(id);
    return o && o.userId === userId ? orderView(o) : null;
  };
  const orders = {
    async create({ userId, orderNumber, status, currency, subtotalMinor, totalMinor, idempotencyKey, items }) {
      if ([...orderStore.values()].some((o) => o.orderNumber === orderNumber)) throw coded('ORDER_NUMBER_TAKEN');
      if (idempotencyKey && [...orderStore.values()].some((o) => o.userId === userId && o.idempotencyKey === idempotencyKey)) {
        throw coded('IDEMPOTENCY_KEY_TAKEN');
      }
      const now = new Date();
      const o = {
        id: randomUUID(), userId, orderNumber, status, currency, subtotalMinor, totalMinor, idempotencyKey,
        createdAt: now, updatedAt: now,
        items: items.map((i) => ({ id: randomUUID(), fqdn: i.fqdn, termYears: i.termYears, unitPriceMinor: i.unitPriceMinor, currency: i.currency, itemStatus: 'pending' })),
      };
      orderStore.set(o.id, o);
      return orderView(o);
    },
    async findForUser(id, userId) {
      return owned(id, userId);
    },
    async findForUserForUpdate(id, userId) {
      return owned(id, userId); // transactions below are serialised, which stands in for the row lock
    },
    async findByIdempotencyKey(userId, key) {
      const o = [...orderStore.values()].find((x) => x.userId === userId && x.idempotencyKey === key);
      return o ? orderView(o) : null;
    },
    async listByUser(userId) {
      return [...orderStore.values()].filter((o) => o.userId === userId).sort((a, b) => b.createdAt - a.createdAt).map(orderView);
    },
    async markCompleted(id, userId) {
      const o = orderStore.get(id);
      if (!o || o.userId !== userId) return;
      o.status = 'completed_demo';
      o.items.forEach((i) => { i.itemStatus = 'fulfilled_demo'; });
      o.updatedAt = new Date();
    },
    async markCancelled(id, userId) {
      const o = orderStore.get(id);
      if (!o || o.userId !== userId) return;
      o.status = 'cancelled';
      o.items.forEach((i) => { i.itemStatus = 'cancelled'; });
      o.updatedAt = new Date();
    },
  };

  const repos = { users, sessions, domainRecords, orders };

  // Serialised, with snapshot rollback, so tests see the same atomicity the database gives.
  let chain = Promise.resolve();
  repos.transaction = (fn) => {
    const run = chain.then(async () => {
      const snapshot = { records: copy([...records]), orders: copy([...orderStore]) };
      try {
        return await fn(repos);
      } catch (err) {
        records.clear();
        snapshot.records.forEach(([k, v]) => records.set(k, v));
        orderStore.clear();
        snapshot.orders.forEach(([k, v]) => orderStore.set(k, v));
        throw err;
      }
    });
    chain = run.catch(() => {});
    return run;
  };
  return repos;
}
