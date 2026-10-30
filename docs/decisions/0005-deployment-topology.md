# ADR 0005 — Same-origin deployment through a Cloudflare Worker

**Status:** Accepted (supersedes the "API origin" note in ADR 0001)

## Context
The site (Cloudflare) and the API (Render) live on different registrable domains. A session cookie set by the API would be
third-party to the site: blocked or dropped by modern browsers, and incompatible with `SameSite=Lax`, which ADR 0003 relies on.

## Decision
A small Worker serves the static build and proxies `/api/*` to Render (`run_worker_first: ["/api/*"]`, SPA fallback for everything else).
The browser sees one origin, so the cookie is first-party, no CORS is needed, and the CSP can stay `connect-src 'self'`.

## Consequences
- **Client IP:** the API only sees Cloudflare and Render in front of it. The Worker overwrites `X-Forwarded-For` with the address
  Cloudflare observed, and the API trusts 2 hops (`TRUST_PROXY_HOPS=2`) so per-visitor rate limits work.
- **Safety of that trust:** a forged `X-Forwarded-For` would only be believable if requests could bypass the Worker. So the Worker also
  sends `X-Proxy-Secret`, and the API (`PROXY_SHARED_SECRET`) rejects everything without it except `/api/health`. Production start-up
  refuses `TRUST_PROXY_HOPS > 1` without the secret.
- **Responses** passing through the Worker get `Cache-Control: no-store`.
- Worker invocations for `/api/*` count against Cloudflare's free-plan request limits; fine for a demo.
- Render's free plan sleeps when idle; the first API call after a pause is slow. This is documented, not hidden.
