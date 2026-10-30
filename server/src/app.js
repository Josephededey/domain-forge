import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { requestId } from './middleware/requestId.js';
import { originGuard } from './middleware/auth.js';
import { proxyGate } from './middleware/proxyGate.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { createRoutes } from './routes/index.js';
import { createSearchService } from './services/searchService.js';
import { createAuthService } from './services/authService.js';
import { createDomainRecordService } from './services/domainRecordService.js';
import { createOrderService } from './services/orderService.js';
import { passwordHasher } from './services/passwordHasher.js';
import { createPgRepositories } from './repositories/pg.js';
import { MockDomainProvider } from './providers/mockDomainProvider.js';
import { createLogger } from './utils/logger.js';

/**
 * @param db    optional pg Pool (enables readiness check + auth)
 * @param repos optional { users, sessions } override (tests); takes precedence over db
 */
export function createApp({ config, provider = new MockDomainProvider(), logger = createLogger(config), db = null, repos = null }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);

  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => req.id }));
  app.use(proxyGate(config));
  app.use(helmet());
  app.use(cors({ origin: config.CLIENT_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use(originGuard(config));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // Readiness: checks configured dependencies only; reveals no credentials or topology (FR-064).
  app.get('/api/ready', async (req, res) => {
    if (!db) return res.json({ status: 'ready' });
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ready' });
    } catch (err) {
      logger.error({ err, requestId: req.id }, 'readiness check failed');
      res.status(503).json({ error: { code: 'NOT_READY', message: 'The service is not ready yet.', requestId: req.id } });
    }
  });

  const searchService = createSearchService({ provider, timeoutMs: config.PROVIDER_TIMEOUT_MS, logger });
  const repositories = repos ?? (db ? createPgRepositories(db) : null);
  const authService = repositories
    ? createAuthService({ ...repositories, hasher: passwordHasher, config })
    : null;
  const recordService = repositories?.domainRecords
    ? createDomainRecordService({ records: repositories.domainRecords })
    : null;
  const orderService = repositories?.orders
    ? createOrderService({
        orders: repositories.orders,
        domainRecords: repositories.domainRecords,
        transaction: repositories.transaction,
      })
    : null;
  app.use('/api/v1', createRoutes({ searchService, authService, recordService, orderService, config }));

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
