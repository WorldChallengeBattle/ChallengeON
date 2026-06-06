CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    google_id TEXT UNIQUE,
    points INTEGER DEFAULT 100,
    creator_handle TEXT UNIQUE,
    total_donations INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pending_donations (
    id SERIAL PRIMARY KEY,
    creator_handle TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    hashtags TEXT,
    region TEXT,
    viral_score INTEGER DEFAULT 0,
    participants INTEGER DEFAULT 0,
    bg_gradient TEXT,
    is_active BOOLEAN DEFAULT true,
    is_official BOOLEAN DEFAULT false,
    category TEXT DEFAULT 'Trending',
    created_by_uid TEXT,
    created_by_name TEXT,
    challenge_mode TEXT DEFAULT 'trend',
    notice TEXT,
    event_config JSONB DEFAULT '{}'::jsonb,
    reward_unon TEXT,
    challenge_type TEXT DEFAULT 'standard',
    prize_status TEXT DEFAULT 'none',
    prize_pool_unon TEXT,
    prize_pool_wei TEXT,
    prize_onchain_challenge_id TEXT,
    prize_manager_address TEXT,
    prize_create_tx_hash TEXT,
    prize_finalize_tx_hash TEXT,
    prize_submission_start TIMESTAMP,
    prize_submission_end TIMESTAMP,
    prize_voting_end TIMESTAMP,
    prize_winner_count INTEGER,
    prize_winner_splits_bps JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS challenge_videos (
    id TEXT PRIMARY KEY,
    challenge_id TEXT REFERENCES challenges(id) ON DELETE CASCADE,
    platform TEXT,
    author TEXT,
    author_uid TEXT,
    author_wallet_address TEXT,
    author_world_username TEXT,
    uploader_comment TEXT,
    view_count INTEGER DEFAULT 0,
    video_title TEXT,
    video_url TEXT,
    thumbnail_url TEXT,
    external_url TEXT,
    duration INTEGER DEFAULT 0,
    onchain_video_id TEXT,
    prize_eligible BOOLEAN DEFAULT false,
    entry_registered_tx TEXT,
    is_hidden BOOLEAN DEFAULT false,
    hidden_reason TEXT,
    hidden_at TIMESTAMP,
    hidden_by_uid TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id SERIAL PRIMARY KEY,
    actor_uid TEXT NOT NULL,
    actor_email TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_by_uid TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    cta_label TEXT,
    cta_target TEXT,
    is_active BOOLEAN DEFAULT true,
    is_important BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 999,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prize_video_votes (
    id SERIAL PRIMARY KEY,
    challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL REFERENCES challenge_videos(id) ON DELETE CASCADE,
    voter_uid TEXT NOT NULL,
    voter_wallet_address TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(challenge_id, video_id, voter_wallet_address)
);

CREATE TABLE IF NOT EXISTS unon_indexer_state (
    key TEXT PRIMARY KEY,
    token_address TEXT NOT NULL,
    onboarding_manager_address TEXT,
    from_block BIGINT NOT NULL DEFAULT 0,
    last_synced_block BIGINT NOT NULL DEFAULT -1,
    latest_block BIGINT,
    status TEXT NOT NULL DEFAULT 'idle',
    last_error TEXT,
    started_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS unon_holders (
    address TEXT PRIMARY KEY,
    balance_raw NUMERIC(78, 0) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS unon_transfers (
    token_address TEXT,
    tx_hash TEXT NOT NULL,
    log_index INTEGER NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMP,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    amount_raw NUMERIC(78, 0) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_unon_transfers_block ON unon_transfers (block_number DESC, log_index DESC);
CREATE INDEX IF NOT EXISTS idx_unon_transfers_token_block ON unon_transfers (token_address, block_number DESC, log_index DESC);
CREATE INDEX IF NOT EXISTS idx_unon_transfers_from ON unon_transfers (from_address);
CREATE INDEX IF NOT EXISTS idx_unon_transfers_to ON unon_transfers (to_address);

CREATE TABLE IF NOT EXISTS unon_welcome_claims (
    token_address TEXT,
    tx_hash TEXT NOT NULL,
    log_index INTEGER NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMP,
    identity_nullifier TEXT NOT NULL,
    recipient TEXT NOT NULL,
    amount_raw NUMERIC(78, 0) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_unon_welcome_claims_block ON unon_welcome_claims (block_number DESC, log_index DESC);
CREATE INDEX IF NOT EXISTS idx_unon_welcome_claims_token_block ON unon_welcome_claims (token_address, block_number DESC, log_index DESC);
CREATE INDEX IF NOT EXISTS idx_unon_welcome_claims_recipient ON unon_welcome_claims (recipient);

CREATE TABLE IF NOT EXISTS token_donations (
    id SERIAL PRIMARY KEY,
    video_id TEXT REFERENCES challenge_videos(id) ON DELETE SET NULL,
    challenge_id TEXT REFERENCES challenges(id) ON DELETE SET NULL,
    donor_uid TEXT,
    donor_wallet_address TEXT,
    creator_handle TEXT,
    creator_uid TEXT,
    creator_wallet_address TEXT,
    token_symbol TEXT NOT NULL DEFAULT 'UNON',
    token_address TEXT,
    amount_raw NUMERIC(78, 0) NOT NULL DEFAULT 0,
    amount_display NUMERIC(38, 18) NOT NULL DEFAULT 0,
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_token_donations_created ON token_donations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_donations_creator ON token_donations (creator_handle, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_donations_tx_hash ON token_donations (tx_hash) WHERE tx_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS follows (
    follower_uid TEXT NOT NULL,
    followed_uid TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_uid, followed_uid)
);

CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows (followed_uid);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    recipient_uid TEXT NOT NULL,
    actor_uid TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    world_push_status TEXT DEFAULT 'not_requested',
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_uid, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_permissions (
    user_uid TEXT PRIMARY KEY,
    world_username TEXT,
    wallet_address TEXT,
    world_app_notifications_enabled BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
