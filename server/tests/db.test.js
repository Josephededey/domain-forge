// Runs only when TEST_DATABASE_URL points at a throwaway Postgres database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { migrate } from '../src/db/migrate.js';

const url = process.env.TEST_DATABASE_URL;
const SCHEMA = `df_test_${process.pid}`;

describe.skipIf(!url)('database schema (M3)', () => {
  let admin;
  let pool;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url, max: 1 });
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${SCHEMA}`, max: 4 });
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin?.end();
  });

  const user = async (email) =>
    (await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id', [email, 'x'])).rows[0].id;
  const order = (userId, n, extra = {}) =>
    pool.query(
      `INSERT INTO orders (user_id, order_number, status, currency, subtotal_minor_units, total_minor_units, idempotency_key)
       VALUES ($1, $2, $3, 'NGN', 100, 100, $4) RETURNING id`,
      [userId, n, extra.status ?? 'draft', extra.key ?? null],
    );

  it('migrates a fresh database and is idempotent', async () => {
    expect(await migrate(pool)).toEqual(['001_init.sql']);
    expect(await migrate(pool)).toEqual([]);
  });

  it('enforces normalised, unique emails', async () => {
    await user('a@example.test');
    await expect(user('a@example.test')).rejects.toThrow(/duplicate key/);
    await expect(user('A@Example.test')).rejects.toThrow(/check constraint/);
  });

  it('rejects unknown order statuses (no "paid" state in the MVP)', async () => {
    const u = await user('b@example.test');
    await expect(order(u, 'DF-1', { status: 'paid' })).rejects.toThrow(/check constraint/);
  });

  it('prevents duplicate idempotency keys per user but allows them across users', async () => {
    const u1 = await user('c@example.test');
    const u2 = await user('d@example.test');
    await order(u1, 'DF-2', { key: 'idem-key-0001' });
    await expect(order(u1, 'DF-3', { key: 'idem-key-0001' })).rejects.toThrow(/duplicate key/);
    await expect(order(u2, 'DF-4', { key: 'idem-key-0001' })).resolves.toBeTruthy();
  });

  it('keeps order item price snapshots immutable', async () => {
    const u = await user('e@example.test');
    const { rows } = await order(u, 'DF-5');
    const item = await pool.query(
      `INSERT INTO order_items (order_id, fqdn, term_years, unit_price_minor_units, currency)
       VALUES ($1, 'shop.com', 1, 1500000, 'NGN') RETURNING id`,
      [rows[0].id],
    );
    await expect(pool.query('UPDATE order_items SET unit_price_minor_units = 1 WHERE id = $1', [item.rows[0].id])).rejects.toThrow(/immutable/);
    await expect(pool.query(`UPDATE order_items SET item_status = 'fulfilled_demo' WHERE id = $1`, [item.rows[0].id])).resolves.toBeTruthy();
  });

  it('scopes live domain names per user and frees cancelled names', async () => {
    const u1 = await user('f@example.test');
    const u2 = await user('g@example.test');
    const add = (u, s = 'demo_pending') => pool.query(`INSERT INTO domain_records (user_id, fqdn, status) VALUES ($1, 'same.com', $2)`, [u, s]);
    await add(u1);
    await expect(add(u1)).rejects.toThrow(/duplicate key/);
    await expect(add(u2)).resolves.toBeTruthy();
    await pool.query(`UPDATE domain_records SET status = 'cancelled' WHERE user_id = $1`, [u1]);
    await expect(add(u1)).resolves.toBeTruthy();
  });

  it('cascades deletes from user to owned rows', async () => {
    const u = await user('h@example.test');
    await order(u, 'DF-6');
    await pool.query('DELETE FROM users WHERE id = $1', [u]);
    expect((await pool.query('SELECT 1 FROM orders WHERE user_id = $1', [u])).rowCount).toBe(0);
  });
});
