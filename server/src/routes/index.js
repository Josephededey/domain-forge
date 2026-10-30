import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { searchController } from '../controllers/searchController.js';
import { authController } from '../controllers/authController.js';
import { domainRecordController } from '../controllers/domainRecordController.js';
import { orderController } from '../controllers/orderController.js';
import { requireAuth, requireCsrf } from '../middleware/auth.js';

const limiter = (limit, message) =>
  rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message, requestId: req.id } }),
  });

export function createRoutes({ searchService, authService, recordService, orderService, config }) {
  const router = Router();
  router.get('/domains/search', limiter(config.SEARCH_RATE_LIMIT_MAX, 'Too many searches. Wait a minute and try again.'), searchController(searchService));

  if (authService) {
    const auth = authController({ authService, config });
    const authLimit = limiter(config.AUTH_RATE_LIMIT_MAX, 'Too many attempts. Wait a minute and try again.');
    const needAuth = requireAuth(authService);
    const needCsrf = requireCsrf(authService);
    router.post('/auth/register', authLimit, auth.register);
    router.post('/auth/login', authLimit, auth.login);
    router.post('/auth/logout', needAuth, needCsrf, auth.logout);
    router.get('/auth/me', needAuth, auth.me);

    if (recordService) {
      const records = domainRecordController(recordService);
      // '/domains/search' is registered above, so it is never captured by '/domains/:id'.
      router.get('/domains', needAuth, records.list);
      router.get('/domains/:id', needAuth, records.get);
      router.patch('/domains/:id', needAuth, needCsrf, records.update);
    }

    if (orderService) {
      const orders = orderController(orderService);
      router.post('/orders', needAuth, needCsrf, orders.create);
      router.get('/orders', needAuth, orders.list);
      router.get('/orders/:id', needAuth, orders.get);
      router.post('/orders/:id/confirm-demo', needAuth, needCsrf, orders.confirm);
      router.post('/orders/:id/cancel', needAuth, needCsrf, orders.cancel);
    }
  }
  return router;
}
