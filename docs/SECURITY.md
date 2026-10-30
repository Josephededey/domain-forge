# Security notes

DomainForge is a portfolio demo. It stores real email addresses and password hashes if you register, so use fictional
details. It takes no payments and registers no domains.

## Controls in place
| Area | Control | Where |
|---|---|---|
| Passwords | Argon2id (19 MiB, t=2, p=1), 12–128 chars, never logged | `services/passwordHasher.js` |
| Sessions | 256-bit random token; only its SHA-256 is stored; HttpOnly, SameSite=Lax, Secure in production; new token per login; logout deletes the row | `services/authService.js`, `utils/cookies.js` |
| CSRF | Origin allow-list on all browser writes + per-session HMAC token in `X-CSRF-Token` for authenticated writes | `middleware/auth.js` |
| Authorization | Owner comes only from the session; every record/order query filters by `user_id`; others' data returns 404 | `repositories/pg.js`, services |
| Mass assignment | Record updates are a strict allow-list; order creation ignores prices, totals, status and owner | `validators/` |
| Input | Server-side validation with zod on every body, query and id; malformed ids are 404 | `validators/` |
| Money | Prices only from server config, integer minor units, immutable item snapshot (DB trigger) | `services/orderPricing.js`, migration 001 |
| Replays | Idempotency keys; row-locked, transactional confirmation | `services/orderService.js` |
| Abuse | Rate limits on search and auth; 10 kB body limit | `routes/index.js`, `app.js` |
| Headers | Helmet on the API; CSP and friends for the static site | `app.js`, `client/public/_headers` |
| Errors | Stable envelope, request IDs, no stack/SQL/paths in responses | `middleware/errorHandler.js` |
| Logging | Structured; cookies, auth and CSRF headers redacted; bodies not logged | `utils/logger.js` |
| Edge | Worker proxy keeps one origin; API only accepts requests carrying a shared secret (except `/api/health`); forwarded client IP set by the Worker | `client/worker/index.js`, `middleware/proxyGate.js` |
| Supply chain | Lockfile, `npm audit` in CI, Dependabot, repository secret scan | `.github/`, `scripts/check-secrets.mjs` |

## Known limitations
- Registering with an existing email returns 409, so registration reveals whether an address has an account. Login does not. Rate limiting mitigates this.
- No email verification, password reset, 2FA or account lockout (rate limiting only).
- Rate-limit counters live in process memory. Behind several instances they would need a shared store.
- The seed script creates a local account with a published password. It refuses to run in production.
- The API and the site must share an origin (Vite proxy in dev, the Worker in production). A cross-site deployment needs `SameSite=None; Secure` and a fresh review.
- Data retention and deletion are not defined, so do not store real customer data.

## Investigating an error
Every error response contains `requestId`. Search the server logs for that value to find the matching entry and its full detail.
Logs are JSON; pipe them through `npx pino-pretty` locally if you want them readable.
