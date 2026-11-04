DomainForge

DomainForge is a full-stack domain search and demo-order platform I built as a portfolio project.

I started this project to explore how domain registration platforms work behind the scenes, particularly the relationship between domain searches, user accounts, domain management and orders.

As the project grew, I focused on building a proper backend, designing the database, implementing authentication, handling order workflows and making security an important part of the development process.

One important thing to mention: DomainForge currently uses simulated domain search results. It does not connect to a live domain registrar, register domains, modify DNS records or process real payments.

My development journey

1. Getting the project started

I began by setting up the project structure and deciding how the frontend, backend and database would communicate.

I chose React with Vite for the frontend and Node.js with Express for the API. I also planned the project around PostgreSQL and a set of automated tests.

2. Building the API foundation

I worked on the backend foundation, including configuration validation, error handling, request IDs, logging and health-check endpoints.

I wanted errors to follow a consistent format and make it easier to trace problems during development.

3. Implementing domain search

This was where the main idea started taking shape.

I implemented domain search with input validation, a simulated provider, API endpoints and a React interface.

The search results are deliberately simulated, so the platform never claims that a domain is genuinely available or unavailable.

4. Setting up PostgreSQL

I introduced PostgreSQL and wrote the database schema, SQL migrations and seed scripts.

I also added a readiness endpoint that checks whether the database is configured and accessible.

5. Adding authentication

I implemented registration, login, logout and server-side sessions.

I also worked on password hashing with Argon2id, CSRF protection and protected routes.

6. Building the user dashboard

After authentication, I added domain records and owner-scoped endpoints.

Users can manage their own demo domain records, while the backend prevents them from accessing another user's records.

7. Implementing demo orders

I added an order workflow with server-side pricing, order states, idempotent order creation and atomic confirmation.

These are demonstration orders only. No real transactions or domain registrations take place.

8. Testing and security improvements

I spent time improving the project beyond simply making the features work.

This included automated API tests, browser tests, accessibility checks, keyboard navigation, security headers, logging tests, secret scanning and dependency auditing.

9. Deployment

I configured the project for deployment using Cloudflare Workers for the static frontend, Render for the API and PostgreSQL for the database.

I also documented the deployment process, smoke tests and troubleshooting steps.

Where the project stands

The main development milestones are implemented, and deployment is configured.

Some database and browser tests still need to be run locally against the appropriate environments. The project is also intentionally limited to simulated domain operations.

Technology used

- React and Vite
- Node.js and Express
- PostgreSQL
- Vitest and Supertest
- Playwright
- GitHub Actions
- Cloudflare Workers
- Render

What's next?

I'd like to explore integrating a real domain registrar, improving the user dashboard and expanding the platform's functionality.

For now, DomainForge is a demonstration of my work building a full-stack application with authentication, database management, API design, testing and deployment.

---

Built by Ededey Joseph.