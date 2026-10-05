BEGIN;
CREATE TABLE world_id_human_login_requests (
  nonce TEXT PRIMARY KEY CHECK (nonce ~ '^0x[0-9a-f]{64}$'),
  rp_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action = 'challengeon-human-login'),
  wallet TEXT NOT NULL CHECK (wallet ~ '^0x[0-9a-f]{40}$'),
  wallet_auth_time BIGINT NOT NULL CHECK (wallet_auth_time > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at),
  consumed_at TIMESTAMPTZ
);
CREATE INDEX world_id_human_login_requests_wallet_created ON world_id_human_login_requests(wallet, created_at);
CREATE TABLE world_id_human_logins (
  rp_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action = 'challengeon-human-login'),
  wallet TEXT NOT NULL CHECK (wallet ~ '^0x[0-9a-f]{40}$'),
  protocol_version TEXT NOT NULL,
  identifier TEXT NOT NULL,
  nullifier NUMERIC(78,0) NOT NULL CHECK (nullifier > 0 AND nullifier < power(2::numeric,256)),
  wallet_auth_time BIGINT NOT NULL CHECK (wallet_auth_time > 0),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((protocol_version = '4.0' AND identifier = 'proof_of_human') OR (protocol_version = '3.0' AND identifier = 'orb')),
  PRIMARY KEY (rp_id, action, wallet),
  UNIQUE (rp_id, action, protocol_version, identifier, nullifier)
);
ALTER TABLE world_id_human_login_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_id_human_logins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON world_id_human_login_requests, world_id_human_logins FROM PUBLIC;
COMMIT;
