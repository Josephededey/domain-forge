-- DomainForge initial schema. Money = integer minor units (kobo). Timestamps = UTC timestamptz.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
  password_hash text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (email);

-- Only a hash of the session token is stored, never the raw token.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE domain_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  fqdn        text NOT NULL CHECK (fqdn = lower(fqdn) AND length(fqdn) <= 253),
  source_mode text NOT NULL DEFAULT 'demo' CHECK (source_mode IN ('demo')),
  status      text NOT NULL DEFAULT 'demo_pending'
              CHECK (status IN ('demo_pending', 'demo_active', 'failed', 'cancelled')),
  -- Editable demo settings (everything else is immutable via the API):
  label       text CHECK (label IS NULL OR length(label) <= 60),
  auto_renew_demo boolean NOT NULL DEFAULT false,
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- A user may hold one live demo record per name; cancelled records free the name.
CREATE UNIQUE INDEX domain_records_user_fqdn_live_key ON domain_records (user_id, fqdn) WHERE status <> 'cancelled';
CREATE INDEX domain_records_user_id_idx ON domain_records (user_id);

CREATE TABLE orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  order_number        text NOT NULL UNIQUE,
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'pending_demo', 'completed_demo', 'cancelled', 'failed')),
  currency            char(3) NOT NULL CHECK (currency = upper(currency)),
  subtotal_minor_units bigint NOT NULL CHECK (subtotal_minor_units >= 0),
  total_minor_units    bigint NOT NULL CHECK (total_minor_units >= 0),
  idempotency_key     text CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 8 AND 128),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX orders_user_idempotency_key ON orders (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX orders_user_id_created_idx ON orders (user_id, created_at DESC);

CREATE TABLE order_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  fqdn                  text NOT NULL CHECK (fqdn = lower(fqdn)),
  term_years            integer NOT NULL CHECK (term_years BETWEEN 1 AND 10),
  unit_price_minor_units bigint NOT NULL CHECK (unit_price_minor_units >= 0),
  currency              char(3) NOT NULL CHECK (currency = upper(currency)),
  item_status           text NOT NULL DEFAULT 'pending'
                        CHECK (item_status IN ('pending', 'fulfilled_demo', 'cancelled')),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_id_idx ON order_items (order_id);

-- The price snapshot is immutable once an order item exists (FR-051).
CREATE FUNCTION forbid_price_snapshot_change() RETURNS trigger AS $$
BEGIN
  IF NEW.unit_price_minor_units IS DISTINCT FROM OLD.unit_price_minor_units
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.fqdn IS DISTINCT FROM OLD.fqdn
     OR NEW.term_years IS DISTINCT FROM OLD.term_years THEN
    RAISE EXCEPTION 'order_items price snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_items_snapshot_immutable
  BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION forbid_price_snapshot_change();
