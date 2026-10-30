import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../../src/db/migrate.js';
import { createInMemoryRepositories } from '../../src/repositories/inMemory.js';
import { createPgRepositories } from '../../src/repositories/pg.js';

export const uniqueEmail = () => `u${randomUUID().slice(0, 8)}@example.test`;

/** Backends the same API tests run against: memory always; Postgres when TEST_DATABASE_URL is set. */
export function backendNames() {
  return process.env.TEST_DATABASE_URL ? ['memory', 'postgres'] : ['memory'];
}

export async function createBackend(name) {
  if (name === 'memory') return { appDeps: () => ({ repos: createInMemoryRepositories() }), close: async () => {} };

  const schema = `df_auth_${process.pid}_${Date.now()}`;
  const url = process.env.TEST_DATABASE_URL;
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 });
  await migrate(pool);
  return {
    appDeps: () => ({ db: pool, repos: createPgRepositories(pool) }),
    close: async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}
