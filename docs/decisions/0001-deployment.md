# ADR 0001 — Cloudflare Workers deployment shape

**Status:** Accepted (revisit at M8)

## Context
The PRD specifies Express + PostgreSQL, and the chosen tooling includes Cloudflare Workers.
Workers run on V8 isolates, not a full Node.js process. Express depends on Node's `http` layer
and `pg` needs raw TCP (Workers need Hyperdrive/`nodejs_compat` for this). Running the Express
API there is possible but fragile and would distort the architecture.

## Decision
- **Frontend:** built with Vite, served as static assets from a Cloudflare Worker (`client/wrangler.jsonc`).
- **API:** stays a standard Node/Express service on a Node host with managed PostgreSQL (Render/Fly/Railway/Neon), configured via `CLIENT_URL` + CORS.
- The `/api` path is proxied in dev by Vite and in production by the Worker itself, so the browser always uses one origin (see ADR 0005).

## Alternative (post-MVP)
Port the API to Hono on Workers + Hyperdrive. The service/provider layering keeps controllers thin, so this is a contained change.
