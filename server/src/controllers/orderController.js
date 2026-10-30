import { asyncHandler } from '../utils/asyncHandler.js';
import { parseOrderId, validateCreateOrder } from '../validators/order.js';

export const DEMO_NOTICE = 'Demo order: no payment was taken and no domain was registered.';

// The owner is always req.user.id. Prices are computed on the server.
export function orderController(service) {
  const send = (res, status, data) => res.status(status).json({ data: { ...data, notice: DEMO_NOTICE } });
  return {
    create: asyncHandler(async (req, res) => {
      const input = validateCreateOrder(req.body, req.get('Idempotency-Key') ?? undefined);
      const { order, created } = await service.create(req.user.id, input);
      send(res, created ? 201 : 200, { order });
    }),
    list: asyncHandler(async (req, res) => send(res, 200, { orders: await service.list(req.user.id) })),
    get: asyncHandler(async (req, res) => send(res, 200, { order: await service.get(req.user.id, parseOrderId(req.params.id)) })),
    confirm: asyncHandler(async (req, res) => {
      const { order, alreadyConfirmed } = await service.confirmDemo(req.user.id, parseOrderId(req.params.id));
      send(res, 200, { order, alreadyConfirmed });
    }),
    cancel: asyncHandler(async (req, res) => send(res, 200, { order: await service.cancel(req.user.id, parseOrderId(req.params.id)) })),
  };
}
