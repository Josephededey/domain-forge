import pg from 'pg';

export function createPool(config) {
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required to create a database pool.');
  return new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10_000,
  });
}
