import { loadConfig } from './config/env.js';
import { createApp } from './app.js';
import { createPool } from './db/pool.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const db = config.DATABASE_URL ? createPool(config) : null;
const app = createApp({ config, db });
const server = app.listen(config.PORT, () =>
  console.log(`DomainForge API listening on :${config.PORT} (${config.NODE_ENV}, db ${db ? 'on' : 'off'})`),
);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(async () => { await db?.end(); process.exit(0); }));
}
