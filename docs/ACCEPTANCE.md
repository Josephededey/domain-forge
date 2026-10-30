# Acceptance traceability (PRD section 18)

"Automated" means a test in this repository covers it. The **Checked** column is for you to tick after running it yourself.

| ID | Criterion | Automated evidence | Also needs | Checked |
|---|---|---|---|---|
| AC-01 | Valid query returns normalised results | `search.api.test.js`, `e2e/search.spec.js` | | ☐ |
| AC-02 | Invalid input rejected server-side, safely | `domain.test.js`, `search.api.test.js` | | ☐ |
| AC-03 | Simulated results always labelled | `search.api.test.js`, `e2e/search.spec.js` | Visual review | ☐ |
| AC-04 | Register, log in, log out | `auth.api.test.js`, `auth.service.test.js`, `e2e/auth.spec.js` | | ☐ |
| AC-05 | No cross-user access by changing an ID | `domains.api.test.js`, `orders.api.test.js` | Run with Postgres (`TEST_DATABASE_URL`) | ☐ |
| AC-06 | Orders use server prices and demo status | `orders.api.test.js`, `orders.unit.test.js` | | ☐ |
| AC-07 | Repeat confirmation has no duplicate effects | `orders.api.test.js` (sequential and concurrent) | Run with Postgres | ☐ |
| AC-08 | Loading, empty, success, failure states | `e2e/*.spec.js` | Manual walkthrough incl. offline API | ☐ |
| AC-09 | No secrets or personal data in repo | `npm run check:secrets` (CI) | Review before first push | ☐ |
| AC-10 | Clean checkout installs, migrates, tests, runs | CI workflow | Try it in a fresh clone | ☐ |
| AC-11 | Errors expose no internals | `security.test.js`, `search.api.test.js` | | ☐ |
| AC-12 | Keyboard operable, usable on mobile widths | `e2e/a11y.spec.js` (axe, keyboard, 320px) | Manual screen-reader and zoom check | ☐ |
