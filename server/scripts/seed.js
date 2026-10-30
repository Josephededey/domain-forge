// Fictional data only. Local demo login: demo.user@example.test / demo-password-123 (never use in production).
import { loadDatabaseConfig } from '../src/config/env.js';
import { createPool } from '../src/db/pool.js';
import { passwordHasher } from '../src/services/passwordHasher.js';

let config;
try {
  config = loadDatabaseConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
if (config.NODE_ENV === 'production') {
  console.error('Refusing to seed in production.');
  process.exit(1);
}
const pool = createPool(config);
try {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ('demo.user@example.test', $1)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now() RETURNING id`,
    [await passwordHasher.hash('demo-password-123')],
  );
  const userId = rows[0].id;
  await pool.query(
    `INSERT INTO domain_records (user_id, fqdn, status, label) VALUES ($1, 'sample-bakery.com', 'demo_active', 'Demo record')
     ON CONFLICT DO NOTHING`,
    [userId],
  );
  const order = await pool.query(
    `INSERT INTO orders (user_id, order_number, status, currency, subtotal_minor_units, total_minor_units, idempotency_key)
     VALUES ($1, 'DF-DEMO-0001', 'completed_demo', 'NGN', 1500000, 1500000, 'seed-order-0001')
     ON CONFLICT DO NOTHING RETURNING id`,
    [userId],
  );
  if (order.rows[0]) {
    await pool.query(
      `INSERT INTO order_items (order_id, fqdn, term_years, unit_price_minor_units, currency, item_status)
       VALUES ($1, 'sample-bakery.com', 1, 1500000, 'NGN', 'fulfilled_demo')`,
      [order.rows[0].id],
    );
  }
  console.log('Seeded fictional demo data.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
