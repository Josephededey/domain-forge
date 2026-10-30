const RECORD_COLS = 'id, fqdn, source_mode, status, label, auto_renew_demo, expires_at, created_at, updated_at';
const EDITABLE = { label: 'label', autoRenewDemo: 'auto_renew_demo' };
const ORDER_COLS = 'id, order_number, status, currency, subtotal_minor_units, total_minor_units, created_at, updated_at';
const ITEM_COLS = 'id, order_id, fqdn, term_years, unit_price_minor_units, currency, item_status';

const toRecord = (r) => ({
  id: r.id,
  fqdn: r.fqdn,
  sourceMode: r.source_mode,
  status: r.status,
  label: r.label,
  autoRenewDemo: r.auto_renew_demo,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toItem = (r) => ({
  id: r.id,
  fqdn: r.fqdn,
  termYears: r.term_years,
  unitPriceMinor: Number(r.unit_price_minor_units), // bigint arrives as a string
  currency: r.currency,
  itemStatus: r.item_status,
});

const toOrder = (r, items) => ({
  id: r.id,
  orderNumber: r.order_number,
  status: r.status,
  currency: r.currency,
  subtotalMinor: Number(r.subtotal_minor_units),
  totalMinor: Number(r.total_minor_units),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  items,
});

const coded = (code) => Object.assign(new Error(code), { code });

/** Builds repositories over any object with .query() (a Pool, or one client inside a transaction). */
function buildRepositories(q) {
  const users = {
    async create({ email, passwordHash }) {
      try {
        const { rows } = await q.query(
          'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, status',
          [email, passwordHash],
        );
        return rows[0];
      } catch (err) {
        if (err.code === '23505') throw coded('EMAIL_TAKEN');
        throw err;
      }
    },
    async findByEmail(email) {
      const { rows } = await q.query('SELECT id, email, status, password_hash FROM users WHERE email = $1', [email]);
      const r = rows[0];
      return r ? { id: r.id, email: r.email, status: r.status, passwordHash: r.password_hash } : null;
    },
  };

  const sessions = {
    async create({ tokenHash, userId, expiresAt }) {
      await q.query('DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()', [userId]);
      await q.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash, userId, expiresAt]);
    },
    async findValid(tokenHash) {
      const { rows } = await q.query(
        `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'`,
        [tokenHash],
      );
      return rows[0] ?? null;
    },
    async delete(tokenHash) {
      await q.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    },
  };

  // Every query below filters by user_id, so a record can only ever be read or changed by its owner.
  const domainRecords = {
    async listByUser(userId) {
      const { rows } = await q.query(
        `SELECT ${RECORD_COLS} FROM domain_records WHERE user_id = $1 ORDER BY created_at DESC, id`,
        [userId],
      );
      return rows.map(toRecord);
    },
    async findForUser(id, userId) {
      const { rows } = await q.query(
        `SELECT ${RECORD_COLS} FROM domain_records WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async findLiveByFqdn(userId, fqdn) {
      const { rows } = await q.query(
        `SELECT ${RECORD_COLS} FROM domain_records WHERE user_id = $1 AND fqdn = $2 AND status <> 'cancelled'`,
        [userId, fqdn],
      );
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async updateForUser(id, userId, changes) {
      const keys = Object.keys(changes).filter((k) => k in EDITABLE);
      if (keys.length === 0) return this.findForUser(id, userId);
      const sets = keys.map((k, i) => `${EDITABLE[k]} = $${i + 1}`);
      const values = keys.map((k) => changes[k]);
      const { rows } = await q.query(
        `UPDATE domain_records SET ${sets.join(', ')}, updated_at = now()
         WHERE id = $${keys.length + 1} AND user_id = $${keys.length + 2} RETURNING ${RECORD_COLS}`,
        [...values, id, userId],
      );
      return rows[0] ? toRecord(rows[0]) : null;
    },
    // Not exposed over HTTP; used by order confirmation, the seed script and tests.
    async create({ userId, fqdn, status = 'demo_pending', label = null, expiresAt = null }) {
      try {
        const { rows } = await q.query(
          `INSERT INTO domain_records (user_id, fqdn, status, label, expires_at)
           VALUES ($1, $2, $3, $4, $5) RETURNING ${RECORD_COLS}`,
          [userId, fqdn, status, label, expiresAt],
        );
        return toRecord(rows[0]);
      } catch (err) {
        if (err.code === '23505') throw coded('RECORD_EXISTS');
        throw err;
      }
    },
  };

  async function attachItems(orderRows) {
    if (orderRows.length === 0) return [];
    const { rows } = await q.query(
      `SELECT ${ITEM_COLS} FROM order_items WHERE order_id = ANY($1::uuid[]) ORDER BY fqdn`,
      [orderRows.map((o) => o.id)],
    );
    return orderRows.map((o) => toOrder(o, rows.filter((i) => i.order_id === o.id).map(toItem)));
  }

  const oneOrder = async (sql, params) => (await attachItems((await q.query(sql, params)).rows))[0] ?? null;

  const orders = {
    async create({ userId, orderNumber, status, currency, subtotalMinor, totalMinor, idempotencyKey, items }) {
      let row;
      try {
        ({ rows: [row] } = await q.query(
          `INSERT INTO orders (user_id, order_number, status, currency, subtotal_minor_units, total_minor_units, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${ORDER_COLS}`,
          [userId, orderNumber, status, currency, subtotalMinor, totalMinor, idempotencyKey],
        ));
      } catch (err) {
        if (err.code === '23505') {
          throw coded(err.constraint === 'orders_user_idempotency_key' ? 'IDEMPOTENCY_KEY_TAKEN' : 'ORDER_NUMBER_TAKEN');
        }
        throw err;
      }
      const itemRows = [];
      for (const it of items) {
        const { rows } = await q.query(
          `INSERT INTO order_items (order_id, fqdn, term_years, unit_price_minor_units, currency)
           VALUES ($1, $2, $3, $4, $5) RETURNING ${ITEM_COLS}`,
          [row.id, it.fqdn, it.termYears, it.unitPriceMinor, it.currency],
        );
        itemRows.push(toItem(rows[0]));
      }
      return toOrder(row, itemRows);
    },
    findForUser: (id, userId) =>
      oneOrder(`SELECT ${ORDER_COLS} FROM orders WHERE id = $1 AND user_id = $2`, [id, userId]),
    // Row lock: concurrent confirms of the same order queue up instead of both acting.
    findForUserForUpdate: (id, userId) =>
      oneOrder(`SELECT ${ORDER_COLS} FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`, [id, userId]),
    findByIdempotencyKey: (userId, key) =>
      oneOrder(`SELECT ${ORDER_COLS} FROM orders WHERE user_id = $1 AND idempotency_key = $2`, [userId, key]),
    async listByUser(userId) {
      const { rows } = await q.query(
        `SELECT ${ORDER_COLS} FROM orders WHERE user_id = $1 ORDER BY created_at DESC, id`,
        [userId],
      );
      return attachItems(rows);
    },
    async markCompleted(id, userId) {
      await q.query(`UPDATE order_items SET item_status = 'fulfilled_demo' WHERE order_id = $1`, [id]);
      await q.query(`UPDATE orders SET status = 'completed_demo', updated_at = now() WHERE id = $1 AND user_id = $2`, [id, userId]);
    },
    async markCancelled(id, userId) {
      await q.query(`UPDATE order_items SET item_status = 'cancelled' WHERE order_id = $1`, [id]);
      await q.query(`UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1 AND user_id = $2`, [id, userId]);
    },
  };

  return { users, sessions, domainRecords, orders };
}

export function createPgRepositories(pool) {
  return {
    ...buildRepositories(pool),
    /** Runs fn with repositories bound to one connection inside BEGIN/COMMIT; any throw rolls everything back. */
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(buildRepositories(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
