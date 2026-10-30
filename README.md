# DomainForge

A full-stack domain search and demo-order platform built as a portfolio project.

> **Demo disclaimer:** All domain results are **simulated**. DomainForge does not verify availability,
> register domains, change DNS, or take payments. See [PRD](docs/) and "Limitations" below.

## Status
| Milestone | State |
|---|---|
| M0 Repo & architecture | ✅ scaffolded |
| M1 API foundation (config validation, error envelope, request IDs, logging, health) | ✅ |
| M2 Domain search (validation, mock provider, API, React UI, rate limit) | ✅ |
| M3 PostgreSQL schema, SQL migrations, seed, readiness check | ✅ written (DB tests need Postgres to run) |
| M4 Authentication (Argon2id, server-side sessions, CSRF, login/register UI, protected routes) | ✅ written — run tests locally |
| M5 Dashboard & domain records (owner-scoped API, editable demo fields, cross-user tests) | ✅ written — run tests locally |
| M6 Demo orders (server pricing, state machine, idempotent create, atomic confirm) | ✅ written — run tests locally |
| M7 Quality & security pass (axe + keyboard tests, security/logging tests, secret scan, audit, CSP headers) | ✅ written — run tests locally |
| M8 Deploy (Cloudflare Worker + Render + Postgres, screenshots script) | ✅ configured — follow `docs/DEPLOYMENT.md` |

## Stack
React + Vite · Node.js + Express · PostgreSQL (from M3) · Vitest + Supertest · Playwright · GitHub Actions · Cloudflare Workers (static frontend; see `docs/decisions/0001-deployment.md`).

## Quick start
```bash
npm install
cp .env.example server/.env     # then set SESSION_SECRET (see comments inside)
docker compose up -d db          # local Postgres (throwaway credentials)
npm run migrate -w server        # apply SQL migrations
npm run seed -w server           # optional: fictional data; login demo.user@example.test / demo-password-123
npm run dev:server     # http://localhost:3001
npm run dev:client     # http://localhost:5173 (proxies /api)
```

## Tests
```bash
npm test                                   # unit + API integration (Vitest/Supertest)
TEST_DATABASE_URL=postgresql://domainforge:change-me@localhost:5433/domainforge_test npm test   # also runs schema tests
npx playwright install chromium && npm run e2e   # browser tests, desktop + mobile
```

## API (so far)
- `GET /api/health` (liveness) · `GET /api/ready` (checks DB if configured)
- `GET /api/v1/domains/search?q=example[&tlds=com,net]` → `{ data: { query, source, results[] } }`
- `POST /api/v1/auth/register` · `POST /api/v1/auth/login` → `{ data: { user, csrfToken } }` + HttpOnly session cookie
- `GET /api/v1/domains` · `GET /api/v1/domains/:id` (auth, owner-scoped; another user's record returns 404)
- `PATCH /api/v1/domains/:id` (auth + CSRF) accepts only `label` and `autoRenewDemo`; any other field is a 400
- `POST /api/v1/orders` (auth + CSRF, optional `Idempotency-Key` header) · `GET /api/v1/orders` · `GET /api/v1/orders/:id`
- `POST /api/v1/orders/:id/confirm-demo` (safe to repeat) · `POST /api/v1/orders/:id/cancel`. These never charge or register anything.
- `GET /api/v1/auth/me` (auth) · `POST /api/v1/auth/logout` (auth + `X-CSRF-Token` header → 204)

Auth model: random 256-bit session token in an HttpOnly, SameSite=Lax cookie (Secure in production); only its SHA-256 hash is stored.
CSRF: per-session HMAC token sent in `X-CSRF-Token`, plus an Origin allow-list on all browser writes. See `docs/decisions/0003-auth.md`.

Errors: `{ error: { code, message, details?, requestId } }`. Never contains stack traces or internals.

## Search semantics
`availability` is `unknown` for every simulated result and `source` is always `simulation`. Only a trusted provider
may ever return `available`/`unavailable`. Syntax validity is separate from availability.

## Deployment
Website: Cloudflare Worker (static build + `/api` proxy). API and database: Render (`render.yaml`).
Step-by-step instructions, a smoke-test checklist and troubleshooting are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
Free tiers sleep when idle and the free database expires, which the guide explains.

## Quality and security checks
```bash
npm test                 # unit + API tests (add TEST_DATABASE_URL to include Postgres)
npm run e2e              # browser tests, including accessibility (axe) and keyboard checks
npm run check:secrets    # fails if secrets or .env files are tracked
npm run audit            # known-vulnerability check for production dependencies
```
See `docs/SECURITY.md` (controls, limitations, how to trace an error by `requestId`) and `docs/ACCEPTANCE.md` (PRD criteria mapped to tests).

## Limitations
- Simulated provider only; no live registrar or payments.
- Internationalised domain names are rejected with an explicit message (FR-014).
- Prices are illustrative NGN values in integer minor units (kobo).

## Structure
`server/src/{routes,controllers,services,validators,providers,middleware,config,utils}` · `client/src` · `e2e/` · `docs/decisions/`
