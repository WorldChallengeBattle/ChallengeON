BEGIN;
CREATE TABLE IF NOT EXISTS world_id_requests (
  nonce TEXT PRIMARY KEY,
  rp_id TEXT NOT NULL,
  action TEXT NOT NULL,
  wallet TEXT NOT NULL CHECK (wallet = lower(wallet)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS world_id_requests_wallet_created ON world_id_requests(wallet, created_at);
CREATE TABLE IF NOT EXISTS world_id_welcome_bindings (
  rp_id TEXT NOT NULL,
  action TEXT NOT NULL,
  nullifier NUMERIC(78, 0) NOT NULL CHECK (nullifier > 0 AND nullifier < power(2::numeric, 256)),
  wallet TEXT NOT NULL CHECK (wallet = lower(wallet)),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rp_id, action, nullifier),
  UNIQUE (rp_id, action, wallet)
);
-- No client policies: only the trusted backend DB role may access these records.
ALTER TABLE world_id_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_id_welcome_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON world_id_requests, world_id_welcome_bindings FROM PUBLIC;
COMMIT;
