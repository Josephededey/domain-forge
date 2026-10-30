# ADR 0004 — Demo order model

**Status:** Accepted

- **States:** `pending_demo → completed_demo | cancelled | failed`. Terminal states have no exits (`server/src/services/orderState.js`). `draft` exists in the schema but is unused for now.
- **Pricing:** computed server-side from `config/pricing.js`; unit price is per year, total = sum(unit × term). Client-supplied prices, totals, currency, status and user IDs are never read. Each item stores an immutable price snapshot (database trigger).
- **Idempotency:** `Idempotency-Key` header, unique per user. Same key and same items replays the original order (200); same key with different items is a 409.
- **Confirm:** one transaction with a row lock (`SELECT … FOR UPDATE`). Repeating it returns the completed order and creates nothing new. If any item fails, nothing is created and the order stays pending.
- **Addition to the PRD:** `POST /orders/:id/cancel` so a pending order can reach the `cancelled` state.
- **Still simulated:** no payment, no registrar. Confirming creates `demo_active` records only.
