BEGIN;
CREATE TABLE world_id_login_sessions (
  rp_id TEXT NOT NULL,
  wallet TEXT NOT NULL CHECK (wallet ~ '^0x[0-9a-f]{40}$'),
  session_id TEXT NOT NULL CHECK (session_id ~ '^session_[0-9a-f]{128}$'),
  wallet_auth_time BIGINT NOT NULL CHECK (wallet_auth_time > 0),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rp_id, wallet),
  UNIQUE (rp_id, session_id)
);
CREATE TABLE world_id_login_requests (
  nonce TEXT PRIMARY KEY CHECK (nonce ~ '^0x[0-9a-f]{64}$'),
  rp_id TEXT NOT NULL,
  wallet TEXT NOT NULL CHECK (wallet ~ '^0x[0-9a-f]{40}$'),
  wallet_auth_time BIGINT NOT NULL CHECK (wallet_auth_time > 0),
  expected_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX world_id_login_requests_wallet_created ON world_id_login_requests(wallet, created_at);
CREATE TABLE world_id_login_proofs (
  rp_id TEXT NOT NULL,
  nullifier NUMERIC(78, 0) NOT NULL CHECK (nullifier > 0 AND nullifier < power(2::numeric, 256)),
  proof_action NUMERIC(78, 0) NOT NULL CHECK (proof_action >= 0 AND proof_action < power(2::numeric, 256)),
  nonce TEXT NOT NULL UNIQUE REFERENCES world_id_login_requests(nonce),
  PRIMARY KEY (rp_id, nullifier, proof_action)
);
ALTER TABLE world_id_login_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_id_login_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_id_login_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON world_id_login_sessions, world_id_login_requests, world_id_login_proofs FROM PUBLIC;
COMMIT;
