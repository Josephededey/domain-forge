import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createInMemoryRepositories } from '../src/repositories/inMemory.js';
import { createLogger } from '../src/utils/logger.js';

const config = loadConfig({ NODE_ENV: 'test', SESSION_SECRET: 'x'.repeat(40), AUTH_RATE_LIMIT_MAX: '1000' });

describe('request logging (US-10)', () => {
  it('records requests with a correlation id but never secrets', async () => {
    const lines = [];
    const logger = createLogger(config, { stream: { write: (s) => lines.push(s) }, level: 'info' });
    const app = createApp({ config, repos: createInMemoryRepositories(), logger });
    const password = 'correct horse battery';

    const agent = request.agent(app);
    const reg = await agent.post('/api/v1/auth/register').send({ email: 'log@example.test', password });
    const sessionToken = reg.headers['set-cookie'][0].split(';')[0].split('=')[1];
    const csrf = reg.body.data.csrfToken;
    await agent.get('/api/v1/auth/me');
    await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrf);

    const out = lines.join('');
    expect(out).toContain(reg.headers['x-request-id']); // proves requests were logged and correlated
    for (const secret of [password, sessionToken, csrf]) {
      expect(out).not.toContain(secret);
    }
    expect(out).not.toMatch(/df_session=/); // cookie headers are redacted in both directions
  });
});
