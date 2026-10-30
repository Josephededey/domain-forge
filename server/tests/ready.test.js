import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

const config = loadConfig({ NODE_ENV: 'test' });

describe('GET /api/ready', () => {
  it('is ready when no database is configured', async () => {
    expect((await request(createApp({ config })).get('/api/ready')).body).toEqual({ status: 'ready' });
  });
  it('is ready when the database answers', async () => {
    const db = { query: async () => ({ rows: [{ '?column?': 1 }] }) };
    expect((await request(createApp({ config, db })).get('/api/ready')).status).toBe(200);
  });
  it('returns 503 without leaking details when the database is down', async () => {
    const db = { query: async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'); } };
    const res = await request(createApp({ config, db })).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('NOT_READY');
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|hunter2/);
  });
});
