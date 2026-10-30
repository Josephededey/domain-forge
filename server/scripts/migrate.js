import { loadDatabaseConfig } from '../src/config/env.js';
import { createPool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';

let pool;
try {
  pool = createPool(loadDatabaseConfig());
  const ran = await migrate(pool);
  console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Database is up to date.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
