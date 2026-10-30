# Deployment guide

**Shape:** the browser talks only to one address, a Cloudflare Worker. The Worker serves the React build and forwards `/api/*`
to the Express API on Render, which uses Render Postgres. See `docs/decisions/0005-deployment-topology.md` for why.

```
Browser ──► Cloudflare Worker ──(adds X-Proxy-Secret)──► Render web service ──► Render Postgres
            (static site + /api proxy)                    (Express API)
```

Free-tier facts to know (checked Oct 2026; verify on Render's dashboard):
- A free Render web service **sleeps after about 15 minutes idle**, and the next request takes about a minute.
- Free Render Postgres is **limited in size and expires after a fixed period** (reported as 30 days, with a short grace period).
  A demo that outlives it needs a paid database, or a fresh database and a re-run of migrations (the API does that on start).

## 0. Before you push
```bash
npm run check:secrets      # must pass
git status                 # server/.env must NOT be listed
```

## 1. GitHub (your account)
Create an empty repository (no README), then from the project folder:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
Check the **Actions** tab: the CI workflow should go green. (It needs the `.github/` folder, so make sure it is in your copy.)

## 2. API and database on Render
1. Render dashboard → **New → Blueprint** → pick your repository. Render reads `render.yaml`.
2. It asks for the two values marked `sync: false`:
   - `PROXY_SHARED_SECRET`: generate one and **keep it, you need it again in step 3**:
     `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
   - `CLIENT_URL`: put `https://placeholder.example` for now (you will fix it in step 4).
3. Apply. Wait for the deploy; the start command runs migrations, then starts the API.
4. Note your API address, like `https://domainforge-api-xxxx.onrender.com`.
5. Check: open `<api-address>/api/health` → `{"status":"ok"}`.
   Then open `<api-address>/api/v1/domains/search?q=test` → it should be **403 blocked**. That proves the lock works.

## 3. Website on Cloudflare
1. In `client/wrangler.jsonc`, set `API_ORIGIN` to your Render address (no trailing slash).
2. Deploy (first time it opens a browser to log in to Cloudflare):
   ```bash
   npm install
   npx wrangler login
   npm run deploy:web
   ```
3. Add the secret, using the **same value** as `PROXY_SHARED_SECRET` on Render:
   ```bash
   cd client
   npx wrangler secret put PROXY_SHARED_SECRET
   ```
4. Note your site address, like `https://domainforge-web.<your-subdomain>.workers.dev`.

## 4. Connect them
On Render → your service → **Environment**, set `CLIENT_URL` to your site address (exactly, no trailing slash). It saves and redeploys.
This is the browser origin the API accepts for writes (the CSRF origin check).

## 5. Smoke test (about 5 minutes)
- [ ] Open the site. The first load may take about a minute while the free API wakes.
- [ ] Search a name: results appear, labelled **Simulated**.
- [ ] Create an account with a fictional email, land on the dashboard, reload (still signed in).
- [ ] Search, **Start demo order**, **Confirm**, see the record on the dashboard.
- [ ] Sign out, then open `/dashboard`: you are sent to sign in.
- [ ] In dev tools → Application → Cookies: `df_session` is **HttpOnly** and **Secure**.

## 6. Optional: deploy the site from GitHub
Add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then run **Deploy web (Cloudflare Worker)** from the Actions tab.
Render redeploys the API automatically on every push to `main`.

## Screenshots for the README
With the database running and seeded (`npm run seed -w server`):
```bash
npm run screenshots
```
Images land in `docs/screenshots/` (fictional seed data only). Commit them, then add to the README, for example:
```md
![Search](docs/screenshots/01-search-desktop.png)
![Dashboard](docs/screenshots/03-dashboard-desktop.png)
```

## Troubleshooting
| Symptom | Likely cause |
|---|---|
| Site loads, API calls return `MISCONFIGURED` | `API_ORIGIN` is still the placeholder in `wrangler.jsonc`; redeploy |
| API calls return 403 `FORBIDDEN` | Worker secret and `PROXY_SHARED_SECRET` on Render differ, or the Worker secret is not set |
| Sign-in or ordering returns 403 `FORBIDDEN_ORIGIN` | `CLIENT_URL` on Render does not exactly match the site address |
| Sign-in works but you are signed out on reload | Calling the API directly instead of through the Worker (cookie on the wrong host) |
| Everything is slow after idle | Free web service waking up |
| API logs show `Invalid environment configuration` | A required variable is missing; the message names which one, never its value |
| Errors in the UI show a "Reference" code | Search the Render logs for that request id |

## Describing the project accurately
Say what is real and what is simulated: *"Domain search and checkout are simulated; no live registrar or payment provider is connected."*
Be ready to explain the design decisions in `docs/decisions/`, because reviewers will ask. If AI tools helped you build it, say so in your own words.
