# ADR 0002 — Plain SQL migrations with `pg` instead of Prisma

**Status:** Accepted (deviation from the PRD's *default recommendation*, which allowed alternatives)

- The schema relies on Postgres features an ORM schema file expresses poorly: partial unique indexes
  (live domain per user, idempotency key per user), CHECK constraints, and an immutability trigger on price snapshots.
- Reviewers can read the exact DDL in `server/migrations/`. A ~40-line runner applies them transactionally with an advisory lock.
- Repositories will use parameterised `pg` queries, always scoped by `user_id` taken from the session.
- Cost: no generated types/client. Acceptable at this size; revisit if the model grows.
