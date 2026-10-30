import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const LOCK_KEY = 726_001; // arbitrary constant: serialises concurrent migrators

/** Applies pending *.sql files in name order, each in its own transaction. Returns names applied. */
export async function migrate(pool, dir = defaultDir) {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  const ran = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        ran.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
  return ran;
}
