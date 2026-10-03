require('dotenv').config();
require('./runtime-secrets').loadRuntimeSecrets();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { matchesCronSecret } = require('./cron-auth');
const { CHALLENGE_TTL_MS, validateSiweContext, authenticatedRewardRecipient } = require('./wallet-auth-policy');
const { registerWorldIdRoutes, getWelcomeBinding, identityForClaim } = require('./world-id');
const { createHumanAccessGate } = require('./human-access');
const { registerWalletProfileRoutes } = require('./wallet-profile');

function loadFirebaseServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    return serviceAccount;
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    || path.join(__dirname, 'worldchallengebattle-firebase-adminsdk-fbsvc-1e9684a925.json');
  return JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
}

admin.initializeApp({
  credential: admin.credential.cert(loadFirebaseServiceAccount())
});
const ytSearch = require('yt-search');
const { ApifyClient } = require('apify-client');
const { Pool } = require('pg');
const multer = require('multer');
const { google } = require('googleapis');
const {
  scoreShortFormPreference,
  scoreVideoForChallenge,
  normalizeTag,
  selectDiverseVideos
} = require('./challenge-matcher');
const {
  inferRegionDetails,
  normalizeRegion,
  scoreRegionFit
} = require('./region-classifier');
const { loadNetworkConfig } = require('./network-config');

const UNON_NETWORK_CONFIG = loadNetworkConfig();
if (UNON_NETWORK_CONFIG.warnings.length > 0) {
  console.warn('[UNON-CONFIG]', UNON_NETWORK_CONFIG.warnings.join(' '));
}

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}
const upload = multer({ dest: 'uploads/' });

// YouTube OAuth Setup
const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI || 'http://localhost'
);
if (process.env.YOUTUBE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
}

// SQL Constants
const TABLE_CHALLENGES = 'challenges';
const TABLE_VIDEOS = 'challenge_videos';
const TABLE_ANNOUNCEMENTS = 'announcements';
const TABLE_ADMIN_AUDIT_LOGS = 'admin_audit_logs';
const TABLE_ADMIN_SETTINGS = 'admin_settings';
const TABLE_PRIZE_VIDEO_VOTES = 'prize_video_votes';
const TABLE_UNON_INDEXER_STATE = 'unon_indexer_state';
const TABLE_UNON_HOLDERS = 'unon_holders';
const TABLE_UNON_TRANSFERS = 'unon_transfers';
const TABLE_UNON_WELCOME_CLAIMS = 'unon_welcome_claims';
const TABLE_TOKEN_DONATIONS = 'token_donations';
const TABLE_FOLLOWS = 'follows';
const TABLE_NOTIFICATIONS = 'notifications';
const TABLE_NOTIFICATION_PERMISSIONS = 'notification_permissions';
const VIDEO_MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const VIDEO_MAINTENANCE_INITIAL_DELAY_MS = 5 * 60 * 1000;
const VIDEO_MAINTENANCE_LIMIT = parseInt(process.env.VIDEO_MAINTENANCE_LIMIT || '500', 10);
let isVideoMaintenanceRunning = false;
const WORLD_CHAIN_CHAIN_ID = UNON_NETWORK_CONFIG.chainId;
const IS_WORLDCHAIN_PRODUCTION = UNON_NETWORK_CONFIG.networkKey === 'worldchain';
const WORLD_CHAIN_NETWORK_NAME = UNON_NETWORK_CONFIG.networkName;
const WORLD_CHAIN_LABEL = UNON_NETWORK_CONFIG.label;
const DEFAULT_UNON_TOKEN_ADDRESS = UNON_NETWORK_CONFIG.contracts.unonToken || '';
const DEFAULT_ONBOARDING_MANAGER_ADDRESS = UNON_NETWORK_CONFIG.contracts.onboardingManager || '';

const PUBLIC_SETTING_DEFAULTS = {
  EDITORS_CHOICE_TITLE: "Mar 2026 Editor's Choice",
  EDITORS_CHOICE_SUBTITLE: 'Handpicked Global Trends',
  EDITORS_CHOICE_AI_BADGE: 'AI VERIFIED',
  EDITORS_CHOICE_DEFAULT_BADGE: 'MUST WATCH',
  EDITORS_CHOICE_PICK_BADGE: "EDITOR'S PICK",
  EDITORS_CHOICE_RANKING_PREFIX: 'TOP',
  EDITORS_CHOICE_RANKING_SUFFIX: 'INSIGHT',
  EDITORS_CHOICE_QUICK_NAV_LABEL: 'CHOICE'
};

const PUBLIC_SETTING_DESCRIPTIONS = {
  EDITORS_CHOICE_TITLE: "Homepage Editor's Choice section title",
  EDITORS_CHOICE_SUBTITLE: "Homepage Editor's Choice section subtitle",
  EDITORS_CHOICE_AI_BADGE: "Badge text for AI Editor's Choice cards",
  EDITORS_CHOICE_DEFAULT_BADGE: "Badge text for standard Editor's Choice cards",
  EDITORS_CHOICE_PICK_BADGE: "Expanded Editor's Choice badge text",
  EDITORS_CHOICE_RANKING_PREFIX: "Ranking text before the Editor's Choice rank number",
  EDITORS_CHOICE_RANKING_SUFFIX: "Ranking text after the Editor's Choice rank number",
  EDITORS_CHOICE_QUICK_NAV_LABEL: "Quick navigation label for the Editor's Choice section"
};

const ADMIN_EDITABLE_SETTING_KEYS = new Set([
  'MATCH_THRESHOLD_NOTE',
  'REGION_POLICY_NOTE',
  'VIDEO_MAINTENANCE_NOTE',
  ...Object.keys(PUBLIC_SETTING_DEFAULTS)
]);

// Initialize PostgreSQL
const pool = new Pool(process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  max: Math.max(1, parseInt(process.env.PGPOOL_MAX || '5', 10))
} : {
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'wcb_db',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT || 5432,
  max: Math.max(1, parseInt(process.env.PGPOOL_MAX || '10', 10))
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

async function initDb() {
    try {
        const startupDataMaintenanceEnabled = String(
          process.env.ENABLE_STARTUP_DATA_MAINTENANCE || 'true'
        ).toLowerCase() === 'true';
        await migrateLegacyUnonSchema();
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        await pool.query(schema);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS created_by_uid TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS created_by_name TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS challenge_mode TEXT DEFAULT 'trend'`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS notice TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS event_config JSONB DEFAULT '{}'::jsonb`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS reward_unon TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS dislikes INTEGER DEFAULT 0`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS challenge_type TEXT DEFAULT 'standard'`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS prize_status TEXT DEFAULT 'none'`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS prize_pool_unon TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS prize_pool_wei TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS prize_onchain_challenge_id TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS prize_manager_address TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS prize_create_tx_hash TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS prize_finalize_tx_hash TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS prize_submission_start TIMESTAMP`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS prize_submission_end TIMESTAMP`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS prize_voting_end TIMESTAMP`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS prize_winner_count INTEGER`);
        await pool.query(`ALTER TABLE ${TABLE_CHALLENGES} ADD COLUMN IF NOT EXISTS prize_winner_splits_bps JSONB DEFAULT '[]'::jsonb`);
        await pool.query(`ALTER TABLE ${TABLE_ANNOUNCEMENTS} ADD COLUMN IF NOT EXISTS cta_label TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_ANNOUNCEMENTS} ADD COLUMN IF NOT EXISTS cta_target TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_ANNOUNCEMENTS} ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`);
        await pool.query(`ALTER TABLE ${TABLE_ANNOUNCEMENTS} ADD COLUMN IF NOT EXISTS is_important BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE ${TABLE_ANNOUNCEMENTS} ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 999`);
        await pool.query(`ALTER TABLE ${TABLE_ANNOUNCEMENTS} ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP`);
        await pool.query(`ALTER TABLE ${TABLE_ANNOUNCEMENTS} ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP`);
        await pool.query(`ALTER TABLE ${TABLE_ANNOUNCEMENTS} ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        await pool.query(`ALTER TABLE ${TABLE_ANNOUNCEMENTS} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        await pool.query(`ALTER TABLE ${TABLE_VIDEOS} ADD COLUMN IF NOT EXISTS author_uid TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_VIDEOS} ADD COLUMN IF NOT EXISTS author_wallet_address TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_VIDEOS} ADD COLUMN IF NOT EXISTS author_world_username TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_VIDEOS} ADD COLUMN IF NOT EXISTS uploader_comment TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_VIDEOS} ADD COLUMN IF NOT EXISTS onchain_video_id TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_VIDEOS} ADD COLUMN IF NOT EXISTS prize_eligible BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE ${TABLE_VIDEOS} ADD COLUMN IF NOT EXISTS entry_registered_tx TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_VIDEOS} ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE ${TABLE_VIDEOS} ADD COLUMN IF NOT EXISTS hidden_reason TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_VIDEOS} ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP`);
        await pool.query(`ALTER TABLE ${TABLE_VIDEOS} ADD COLUMN IF NOT EXISTS hidden_by_uid TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_UNON_TRANSFERS} ADD COLUMN IF NOT EXISTS token_address TEXT`);
        await pool.query(`ALTER TABLE ${TABLE_UNON_WELCOME_CLAIMS} ADD COLUMN IF NOT EXISTS token_address TEXT`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_unon_transfers_token_block ON ${TABLE_UNON_TRANSFERS} (token_address, block_number DESC, log_index DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_unon_welcome_claims_token_block ON ${TABLE_UNON_WELCOME_CLAIMS} (token_address, block_number DESC, log_index DESC)`);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS ${TABLE_ADMIN_AUDIT_LOGS} (
            id SERIAL PRIMARY KEY,
            actor_uid TEXT NOT NULL,
            actor_email TEXT,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT,
            details JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS ${TABLE_ADMIN_SETTINGS} (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            description TEXT,
            updated_by_uid TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        for (const [key, value] of Object.entries(PUBLIC_SETTING_DEFAULTS)) {
          await pool.query(`
            INSERT INTO ${TABLE_ADMIN_SETTINGS} (key, value, description)
            VALUES ($1, $2, $3)
            ON CONFLICT (key) DO NOTHING
          `, [key, value, PUBLIC_SETTING_DESCRIPTIONS[key] || 'Public display setting']);
        }
        
        // Web3 Fan Support
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT UNIQUE`);
        
        if (startupDataMaintenanceEnabled) {
          // Cleanup: Time-based removal of inactive challenges
          // Crawler-created: 7 days, no videos, no likes
          const crawlerCleanup = await pool.query(`
            DELETE FROM ${TABLE_CHALLENGES}
            WHERE id IN (
              SELECT c.id FROM ${TABLE_CHALLENGES} c
              LEFT JOIN ${TABLE_VIDEOS} v ON c.id = v.challenge_id AND COALESCE(v.is_hidden, false) = false
              WHERE c.created_by_uid IS NULL
                AND c.created_at < NOW() - INTERVAL '7 days'
                AND COALESCE(c.likes, 0) = 0
              GROUP BY c.id
              HAVING COUNT(v.id) = 0
            )
          `);
          // User-created: 90 days, no videos, no likes, no participants
          const userCleanup = await pool.query(`
            DELETE FROM ${TABLE_CHALLENGES}
            WHERE id IN (
              SELECT c.id FROM ${TABLE_CHALLENGES} c
              LEFT JOIN ${TABLE_VIDEOS} v ON c.id = v.challenge_id AND COALESCE(v.is_hidden, false) = false
              WHERE c.created_by_uid IS NOT NULL
                AND c.created_at < NOW() - INTERVAL '90 days'
                AND COALESCE(c.likes, 0) = 0
                AND COALESCE(c.participants, 0) = 0
              GROUP BY c.id
              HAVING COUNT(v.id) = 0
            )
          `);
          console.log(`[CLEANUP] ${crawlerCleanup.rowCount} crawler (7d) + ${userCleanup.rowCount} user (90d) inactive challenges removed`);
        } else {
          console.log('[STARTUP] Data cleanup and seed maintenance disabled.');
        }

        // Create votes tracking table
        await pool.query(`
          CREATE TABLE IF NOT EXISTS challenge_votes (
            id SERIAL PRIMARY KEY,
            challenge_id TEXT NOT NULL,
            user_uid TEXT NOT NULL,
            vote_type TEXT NOT NULL CHECK (vote_type IN ('like', 'dislike')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(challenge_id, user_uid)
          )
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS ${TABLE_PRIZE_VIDEO_VOTES} (
            id SERIAL PRIMARY KEY,
            challenge_id TEXT NOT NULL REFERENCES ${TABLE_CHALLENGES}(id) ON DELETE CASCADE,
            video_id TEXT NOT NULL REFERENCES ${TABLE_VIDEOS}(id) ON DELETE CASCADE,
            voter_uid TEXT NOT NULL,
            voter_wallet_address TEXT NOT NULL,
            tx_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(challenge_id, video_id, voter_wallet_address)
          )
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS ${TABLE_TOKEN_DONATIONS} (
            id SERIAL PRIMARY KEY,
            video_id TEXT REFERENCES ${TABLE_VIDEOS}(id) ON DELETE SET NULL,
            challenge_id TEXT REFERENCES ${TABLE_CHALLENGES}(id) ON DELETE SET NULL,
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
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_token_donations_created ON ${TABLE_TOKEN_DONATIONS} (created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_token_donations_creator ON ${TABLE_TOKEN_DONATIONS} (creator_handle, created_at DESC)`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_token_donations_tx_hash ON ${TABLE_TOKEN_DONATIONS} (tx_hash) WHERE tx_hash IS NOT NULL`);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS ${TABLE_FOLLOWS} (
            follower_uid TEXT NOT NULL,
            followed_uid TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (follower_uid, followed_uid)
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_follows_followed ON ${TABLE_FOLLOWS} (followed_uid)`);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS ${TABLE_NOTIFICATIONS} (
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
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON ${TABLE_NOTIFICATIONS} (recipient_uid, created_at DESC)`);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS ${TABLE_NOTIFICATION_PERMISSIONS} (
            user_uid TEXT PRIMARY KEY,
            world_username TEXT,
            wallet_address TEXT,
            world_app_notifications_enabled BOOLEAN DEFAULT false,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        if (startupDataMaintenanceEnabled) {
          await seedInitialChallenges();
          await seedAnnouncements();
        }
        
        console.log('[DB] PostgreSQL Schema Verified/Initialized');
    } catch (err) {
        console.error('[!] PostgreSQL Init Error:', err.message);
        throw err;
    }
}
let databaseReady = false;
const dbReady = initDb().then(() => {
  databaseReady = true;
});

async function tableExists(tableName) {
  const result = await pool.query(
    `SELECT to_regclass($1) AS table_name`,
    [tableName]
  );
  return Boolean(result.rows[0]?.table_name);
}

async function columnExists(tableName, columnName) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
    [tableName, columnName]
  );
  return result.rowCount > 0;
}

async function migrateLegacyUnonSchema() {
  const tableRenames = [
    ['wct_indexer_state', 'unon_indexer_state'],
    ['wct_holders', 'unon_holders'],
    ['wct_transfers', 'unon_transfers'],
    ['wct_welcome_claims', 'unon_welcome_claims']
  ];

  for (const [oldName, newName] of tableRenames) {
    if ((await tableExists(oldName)) && !(await tableExists(newName))) {
      await pool.query(`ALTER TABLE ${oldName} RENAME TO ${newName}`);
    }
  }

  if ((await tableExists('challenges')) && (await columnExists('challenges', 'prize_pool_wct')) && !(await columnExists('challenges', 'prize_pool_unon'))) {
    await pool.query('ALTER TABLE challenges RENAME COLUMN prize_pool_wct TO prize_pool_unon');
  }

  if (await tableExists('unon_transfers')) {
    await pool.query(`ALTER TABLE ${TABLE_UNON_TRANSFERS} ADD COLUMN IF NOT EXISTS token_address TEXT`);
  }

  if (await tableExists('unon_welcome_claims')) {
    await pool.query(`ALTER TABLE ${TABLE_UNON_WELCOME_CLAIMS} ADD COLUMN IF NOT EXISTS token_address TEXT`);
  }
}

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN || 'DUMMY_TOKEN' });

const app = express();
app.set('trust proxy', process.env.K_SERVICE ? 1 : false);
const corsOrigins = new Set(String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean));
app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.size === 0 || corsOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  }
}));
app.use(express.json());
app.get('/health', (_req, res) => {
  res.status(databaseReady ? 200 : 503).json({ status: databaseReady ? 'ok' : 'starting' });
});

function requireCronSecret(req, res, next) {
  const expected = String(process.env.CRON_SECRET || '');
  const authorization = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const supplied = String(req.get('x-cron-secret') || authorization);

  if (!expected) return res.status(503).json({ error: 'Scheduled jobs are not configured.' });
  if (!matchesCronSecret(expected, supplied)) return res.status(401).json({ error: 'Invalid scheduled job credentials.' });
  return next();
}

const { SiweMessage, generateNonce } = require('siwe');
const { JsonRpcProvider } = require('ethers');

function parseAdminList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getAdminAllowlist() {
  return new Set([
    ...parseAdminList(process.env.ADMIN_UIDS),
    ...parseAdminList(process.env.ADMIN_WALLETS),
    ...parseAdminList(process.env.ADMIN_EMAILS)
  ]);
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function requireAuthenticatedUser(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing Firebase ID token' });
  }

  try {
    req.authUser = await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
  }
}

app.use('/api', createHumanAccessGate(pool, requireAuthenticatedUser));

function isAdminDecodedUser(decoded) {
  const allowlist = getAdminAllowlist();
  if (allowlist.size === 0) return false;

  const candidates = [
    decoded.uid,
    decoded.email,
    decoded.wallet_address,
    decoded.address
  ].map((item) => String(item || '').toLowerCase()).filter(Boolean);

  return candidates.some((candidate) => allowlist.has(candidate));
}

function requireAdmin(req, res, next) {
  if (!isAdminDecodedUser(req.authUser || {})) {
    return res.status(403).json({
      error: getAdminAllowlist().size === 0
        ? 'Admin allowlist is not configured. Set ADMIN_UIDS or ADMIN_WALLETS in backend .env.'
        : 'Admin access required'
    });
  }
  next();
}

async function logAdminAction(req, action, entityType, entityId = null, details = {}) {
  try {
    await pool.query(`
      INSERT INTO ${TABLE_ADMIN_AUDIT_LOGS} (actor_uid, actor_email, action, entity_type, entity_id, details)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      req.authUser?.uid || 'unknown',
      req.authUser?.email || null,
      action,
      entityType,
      entityId,
      JSON.stringify(details || {})
    ]);
  } catch (error) {
    console.error('[ADMIN-AUDIT] Failed to write audit log:', error.message);
  }
}

const adminRouter = express.Router();
adminRouter.use(requireAuthenticatedUser, requireAdmin);

// World Chain RPC provider. Production defaults to World Chain mainnet.
const WORLD_CHAIN_RPC = UNON_NETWORK_CONFIG.rpcUrl;
const provider = new JsonRpcProvider(WORLD_CHAIN_RPC, {
    chainId: WORLD_CHAIN_CHAIN_ID,
    name: WORLD_CHAIN_NETWORK_NAME
}, { staticNetwork: true });
const ethers = require('ethers');

const UNON_TOKEN_ADDRESS = UNON_NETWORK_CONFIG.contracts.unonToken || DEFAULT_UNON_TOKEN_ADDRESS;
const UNON_PRIZE_MANAGER_ADDRESS = parseOptionalAddress(UNON_NETWORK_CONFIG.contracts.prizeChallengeManager);
const UNON_STAKING_MANAGER_ADDRESS = parseOptionalAddress(UNON_NETWORK_CONFIG.contracts.stakingLevelManager);
const UNON_FAN_SUPPORT_MANAGER_ADDRESS = parseOptionalAddress(UNON_NETWORK_CONFIG.contracts.fanSupportManager);
const UNON_MISSION_REWARD_MANAGER_ADDRESS = parseOptionalAddress(UNON_NETWORK_CONFIG.contracts.missionRewardManager);
const WLD_TOKEN_ADDRESS = parseOptionalAddress(UNON_NETWORK_CONFIG.contracts.wldToken);
const UNON_EXPLORER_BASE_URL = UNON_NETWORK_CONFIG.explorerBaseUrl;
const UNON_TRANSFER_LOG_LIMIT = Math.min(parseInt(process.env.UNON_TRANSFER_LOG_LIMIT || process.env.WCT_TRANSFER_LOG_LIMIT || '20', 10) || 20, 200);
const UNON_RPC_READ_TIMEOUT_MS = Math.min(parseInt(process.env.UNON_RPC_READ_TIMEOUT_MS || process.env.WCT_RPC_READ_TIMEOUT_MS || '6000', 10) || 6000, 30000);
const UNON_RPC_LOG_TIMEOUT_MS = Math.min(parseInt(process.env.UNON_RPC_LOG_TIMEOUT_MS || process.env.WCT_RPC_LOG_TIMEOUT_MS || '9000', 10) || 9000, 45000);
const UNON_INDEX_FROM_BLOCK = UNON_NETWORK_CONFIG.deployment.startBlock || Math.max(0, parseInt(process.env.UNON_INDEX_FROM_BLOCK || process.env.WCT_INDEX_FROM_BLOCK || process.env.UNON_HOLDER_SCAN_FROM_BLOCK || process.env.WCT_HOLDER_SCAN_FROM_BLOCK || '0', 10) || 0);
const UNON_INDEX_CHUNK_BLOCKS = Math.min(Math.max(parseInt(process.env.UNON_INDEX_CHUNK_BLOCKS || process.env.WCT_INDEX_CHUNK_BLOCKS || process.env.UNON_HOLDER_SCAN_CHUNK_BLOCKS || process.env.WCT_HOLDER_SCAN_CHUNK_BLOCKS || '5000', 10) || 5000, 100), 100000);
const UNON_INDEX_MAX_CHUNKS_PER_RUN = Math.min(Math.max(parseInt(process.env.UNON_INDEX_MAX_CHUNKS_PER_RUN || process.env.WCT_INDEX_MAX_CHUNKS_PER_RUN || '20', 10) || 20, 1), 500);
const UNON_INDEX_INTERVAL_MS = Math.min(Math.max(parseInt(process.env.UNON_INDEX_INTERVAL_MS || process.env.WCT_INDEX_INTERVAL_MS || '120000', 10) || 120000, 30000), 3600000);
const UNON_INDEX_START_DELAY_MS = Math.min(Math.max(parseInt(process.env.UNON_INDEX_START_DELAY_MS || process.env.WCT_INDEX_START_DELAY_MS || '10000', 10) || 10000, 1000), 300000);
const UNON_HOLDER_LIMIT = Math.min(Math.max(parseInt(process.env.UNON_HOLDER_LIMIT || process.env.WCT_HOLDER_LIMIT || '100', 10) || 100, 5), 100);
const UNON_WELCOME_RECIPIENT_LIMIT = Math.min(Math.max(parseInt(process.env.UNON_WELCOME_RECIPIENT_LIMIT || process.env.WCT_WELCOME_RECIPIENT_LIMIT || '100', 10) || 100, 5), 200);
const UNON_MIGRATED_WELCOME_CLAIMS_PATH = process.env.UNON_MIGRATED_WELCOME_CLAIMS_PATH ||
  path.join(__dirname, 'data', 'migrated-welcome-claims.json');
const UNON_DEFAULT_ONBOARDING_REWARD = 100;
const UNON_TOKENOMICS_PLAN = [
  { key: 'onboarding', label: 'Community onboarding rewards', category: 'Rewards', percent: 30, amount: 3000000000 },
  { key: 'creator_rewards', label: 'Creator rewards and ecosystem incentives', category: 'Rewards', percent: 30, amount: 3000000000 },
  { key: 'treasury', label: 'Treasury and long-term operations', category: 'Treasury', percent: 15, amount: 1500000000 },
  { key: 'team', label: 'Team and core contributors', category: 'Operations', percent: 10, amount: 1000000000 },
  { key: 'marketing', label: 'Growth, partnerships, marketing', category: 'Growth', percent: 7, amount: 700000000 },
  { key: 'liquidity', label: 'Liquidity and exchange support', category: 'Liquidity', percent: 3, amount: 300000000 },
  { key: 'legacy_payout', label: 'Legacy immediate payout (completed)', category: 'Migration', percent: 5, amount: 500000000 }
];
const UNON_TOKENOMICS_PLAN_BY_KEY = new Map(UNON_TOKENOMICS_PLAN.map((row) => [row.key, row]));
const UNON_CONTRACT_ROLE_NOTES = [
  { key: 'token', label: 'UnonToken', role: 'Active ERC-20 token on World Chain', envKey: 'UNON_TOKEN_ADDRESS' },
  { key: 'onboarding', label: 'OnboardingManager', role: 'Verified signup reward distribution', envKey: 'UNON_ONBOARDING_MANAGER_ADDRESS' },
  { key: 'settlement', label: 'SettlementManager', role: 'Likes, fan support, and creator payout settlement', envKey: 'UNON_CREATOR_REWARDS_ADDRESS' },
  { key: 'staking', label: 'StakingLevelManager', role: 'UNON staking levels and challenge reservation locks', envKey: 'UNON_STAKING_MANAGER_ADDRESS' },
  { key: 'support', label: 'FanSupportManager', role: 'UNON/WLD Gold support with 95/5 settlement', envKey: 'UNON_FAN_SUPPORT_MANAGER_ADDRESS' },
  { key: 'mission', label: 'MissionRewardManager', role: 'Mission reward claims such as Say Hello 2 UNON', envKey: 'UNON_MISSION_REWARD_MANAGER_ADDRESS' },
  { key: 'prize', label: 'PrizeChallengeManager', role: 'Prize challenge escrow, staking reservation, UNON voting, and settlement', envKey: 'UNON_PRIZE_MANAGER_ADDRESS' },
  { key: 'treasury', label: 'TreasuryVault', role: 'Governance-controlled treasury custody', envKey: 'UNON_TREASURY_ADDRESS' },
  { key: 'vesting', label: 'VestingVault', role: 'Team/core contributor vesting custody', envKey: 'UNON_TEAM_ADDRESS' },
  { key: 'migration', label: 'MigrationManager', role: 'Internal legacy transition reserve custody, hidden from user UI', envKey: 'UNON_RESERVE_ADDRESS' }
].filter(row => row.key !== 'migration' || !!UNON_NETWORK_CONFIG.contracts.migrationManager);
function getUnonContractRoleAddress(contractKey, tokenAddress) {
  const contracts = UNON_NETWORK_CONFIG.contracts || {};
  const roleAddressByKey = {
    token: tokenAddress,
    onboarding: contracts.onboardingManager,
    settlement: contracts.settlementManager,
    staking: contracts.stakingLevelManager,
    support: contracts.fanSupportManager,
    mission: contracts.missionRewardManager,
    prize: contracts.prizeChallengeManager,
    treasury: contracts.treasuryVault,
    vesting: contracts.vestingVault,
    migration: contracts.migrationManager
  };

  return parseOptionalAddress(roleAddressByKey[contractKey]);
}
const UNON_OPERATING_POLICY = [
  'U&On / UNON v2 is the active production token for Challenge On.',
  'Public app flows should display U&On / UNON and use UnonToken, OnboardingManager, and SettlementManager.',
  'StakingLevelManager controls holder tiers; PLATINUM+ challenge creation reserves 10,000 UNON until settlement.',
  'FanSupportManager supports UNON/WLD Gold heart donations with a 95% creator and 5% platform fee split.',
  'PrizeChallengeManager escrows UNON prize pools and vote pools for PLATINUM staker prize challenges.',
  'MigrationManager is retained for internal legacy transition reserve custody only.',
  'Legacy SettlementManager split remains 95% creator, 3% treasury, and 2% burn until FanSupportManager becomes the default support path.'
];
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];
const UNON_TRANSFER_INTERFACE = new ethers.Interface(ERC20_ABI);
const ONBOARDING_MANAGER_ABI = [
  'function rewardAmount() view returns (uint256)',
  'function poolBalance() view returns (uint256)',
  'event Claimed(bytes32 indexed identityNullifier,address indexed recipient,uint256 amount)'
];
const ONBOARDING_MANAGER_INTERFACE = new ethers.Interface(ONBOARDING_MANAGER_ABI);

function loadMigratedWelcomeClaims(decimals, activeTokenAddress, warnings = []) {
  if (!UNON_MIGRATED_WELCOME_CLAIMS_PATH) return [];
  if (!fs.existsSync(UNON_MIGRATED_WELCOME_CLAIMS_PATH)) return [];

  try {
    const payload = JSON.parse(fs.readFileSync(UNON_MIGRATED_WELCOME_CLAIMS_PATH, 'utf8'));
    if (payload.enabled === false) return [];
    if (payload.networkKey && payload.networkKey !== UNON_NETWORK_CONFIG.networkKey) return [];
    if (payload.activeTokenAddress && ethers.isAddress(payload.activeTokenAddress)) {
      const configuredToken = ethers.getAddress(payload.activeTokenAddress).toLowerCase();
      if (configuredToken !== activeTokenAddress.toLowerCase()) return [];
    }

    return (payload.holders || [])
      .map((holder, index) => {
        const recipient = parseOptionalAddress(holder.address);
        if (!recipient) return null;

        let amountRaw;
        try {
          amountRaw = holder.rawAmount
            ? BigInt(String(holder.rawAmount))
            : ethers.parseUnits(String(holder.amount || UNON_DEFAULT_ONBOARDING_REWARD), decimals);
        } catch (error) {
          warnings.push(`migrated welcome claim ${holder.address}: ${error.message}`);
          return null;
        }

        return {
          source: payload.source || 'migrated-welcome',
          sourceTokenAddress: payload.sourceTokenAddress || null,
          identityNullifier: holder.identityNullifier || `migrated:${recipient.toLowerCase()}`,
          recipient,
          recipientKey: recipient.toLowerCase(),
          amountRaw,
          transactionHash: holder.transactionHash || `migrated-${payload.source || 'welcome'}-${index}`,
          logIndex: Number(holder.logIndex ?? index),
          blockNumber: Number(holder.blockNumber || payload.toBlock || 0),
          timestamp: holder.timestamp || payload.generatedAt || null,
          explorerUrl: holder.transactionHash ? makeExplorerUrl('tx', holder.transactionHash) : null,
          note: holder.note || payload.note || null
        };
      })
      .filter(Boolean);
  } catch (error) {
    warnings.push(`migrated welcome claims: ${error.message}`);
    return [];
  }
}
const PRIZE_CHALLENGE_MANAGER_ABI = [
  'function createChallenge(bytes32 challengeId,uint256 prizeAmount,uint64 submissionStart,uint64 submissionEnd,uint64 votingEnd,uint8 winnerCount,uint16[] winnerSplitsBps)',
  'function registerEntry(bytes32 challengeId,bytes32 videoId,address creator)',
  'function registerEntryWithSignature(bytes32 challengeId,bytes32 videoId,address creator,uint256 deadline,bytes signature)',
  'function voteVideo(bytes32 challengeId,bytes32 videoId)',
  'function finalize(bytes32 challengeId)',
  'function claimWinningVoterReward(bytes32 challengeId)',
  'function getChallenge(bytes32 challengeId) view returns (tuple(address creator,uint256 prizeAmount,uint64 submissionStart,uint64 submissionEnd,uint64 votingEnd,uint8 winnerCount,bool exists,bool finalized,bool noContest,bytes32 winningVideoId,uint256 winningVoteCount,uint256 voterRewardPerWinningVote))',
  'function getEntryCount(bytes32 challengeId) view returns (uint256)',
  'function getEntry(bytes32 challengeId,uint256 index) view returns (tuple(bytes32 videoId,address creator,uint256 votes))',
  'function hasVotedFor(bytes32 challengeId,bytes32 videoId,address voter) view returns (bool)',
  'function hasClaimedWinningVoterReward(bytes32 challengeId,address voter) view returns (bool)',
  'event PrizeChallengeCreated(bytes32 indexed challengeId,address indexed creator,uint256 prizeAmount,uint64 submissionStart,uint64 submissionEnd,uint64 votingEnd,uint8 winnerCount)',
  'event EntryRegistered(bytes32 indexed challengeId,bytes32 indexed videoId,address indexed creator,uint256 entryIndex)',
  'event VideoVoted(bytes32 indexed challengeId,bytes32 indexed videoId,address indexed voter,uint256 voteAmount,uint256 totalVotes)',
  'event PrizeChallengeFinalized(bytes32 indexed challengeId,bool noContest,bytes32 indexed winningVideoId,uint256 winningVoteCount,uint256 prizeFee,uint256 voteFee,uint256 voterRewardPerWinningVote)'
];
const PRIZE_MANAGER_INTERFACE = new ethers.Interface(PRIZE_CHALLENGE_MANAGER_ABI);

app.get('/api/chain-config', (req, res) => {
  res.json({
    success: true,
    data: {
      ...UNON_NETWORK_CONFIG.publicConfig,
      runtime: {
        source: 'central-json'
      }
    }
  });
});

function parseOptionalAddress(value) {
  const address = String(value || '').trim();
  return ethers.isAddress(address) ? ethers.getAddress(address) : null;
}

function getUnonTrackedWallets() {
  const contracts = UNON_NETWORK_CONFIG.contracts;
  const wallets = UNON_NETWORK_CONFIG.wallets;
  const base = [
    {
      key: 'onboarding',
      label: 'Welcome Bonus / Onboarding',
      category: 'Rewards',
      envKey: 'UNON_ONBOARDING_MANAGER_ADDRESS',
      address: parseOptionalAddress(contracts.onboardingManager || DEFAULT_ONBOARDING_MANAGER_ADDRESS)
    },
    {
      key: 'treasury',
      label: 'Treasury',
      category: 'Treasury',
      envKey: 'UNON_TREASURY_ADDRESS',
      address: parseOptionalAddress(contracts.treasuryVault)
    },
    {
      key: 'prize_manager',
      label: 'Prize Challenge Manager',
      category: 'Prize Challenges',
      envKey: 'UNON_PRIZE_MANAGER_ADDRESS',
      address: UNON_PRIZE_MANAGER_ADDRESS
    },
    {
      key: 'creator_rewards',
      label: 'Creator Rewards Pool',
      category: 'Rewards',
      envKey: 'UNON_CREATOR_REWARDS_ADDRESS',
      address: parseOptionalAddress(contracts.settlementManager)
    },
    {
      key: 'fan_support',
      label: 'Gold / Fan Support Pool',
      category: 'Fan Support',
      envKey: 'UNON_FAN_SUPPORT_ADDRESS',
      address: parseOptionalAddress(contracts.fanSupportManager || contracts.settlementManager)
    },
    {
      key: 'staking_rewards',
      label: 'Staking Reward Pool',
      category: 'Staking',
      envKey: 'UNON_STAKING_REWARD_POOL_ADDRESS',
      address: parseOptionalAddress(contracts.stakingRewardPool)
    },
    {
      key: 'mission_rewards',
      label: 'Mission Reward Manager',
      category: 'Rewards',
      envKey: 'UNON_MISSION_REWARD_MANAGER_ADDRESS',
      address: parseOptionalAddress(contracts.missionRewardManager)
    },
    {
      key: 'creator_awards',
      label: 'Creator Awards Distributor',
      category: 'Rewards',
      envKey: 'UNON_CREATOR_AWARDS_DISTRIBUTOR_ADDRESS',
      address: parseOptionalAddress(contracts.creatorAwardsDistributor)
    },
    {
      key: 'liquidity',
      label: 'Liquidity / Market Making',
      category: 'Liquidity',
      envKey: 'UNON_LIQUIDITY_ADDRESS',
      address: parseOptionalAddress(wallets.liquidityRecipient)
    },
    {
      key: 'marketing',
      label: 'Marketing / Community',
      category: 'Growth',
      envKey: 'UNON_MARKETING_ADDRESS',
      address: parseOptionalAddress(wallets.growthRecipient)
    },
    {
      key: 'team',
      label: 'Team / Operations',
      category: 'Operations',
      envKey: 'UNON_TEAM_ADDRESS',
      address: parseOptionalAddress(contracts.vestingVault)
    },
    {
      key: 'reserve',
      label: 'Reserve',
      category: 'Reserve',
      envKey: 'UNON_RESERVE_ADDRESS',
      address: parseOptionalAddress(contracts.migrationManager)
    }
  ];

  const extra = (wallets.trackedWallets || [])
    .map((wallet, index) => {
      const address = parseOptionalAddress(wallet.address);
      if (!wallet.label || !address) return null;
      return {
        key: wallet.key || `tracked_${index}_${wallet.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        label: wallet.label,
        category: wallet.category || 'Custom',
        envKey: 'central-config',
        address
      };
    })
    .filter(Boolean);

  const seen = new Set();
  return [...base, ...extra].filter((wallet) => {
    if (wallet.key === 'reserve' && !contracts.migrationManager) return false;
    const addressKey = String(wallet.address || '').toLowerCase();
    if (!addressKey) return true;
    if (seen.has(addressKey)) return false;
    seen.add(addressKey);
    return true;
  });
}

function formatTokenUnits(rawValue, decimals) {
  return ethers.formatUnits(rawValue || 0n, decimals);
}

function tokenAmountNumber(rawValue, decimals) {
  return Number(ethers.formatUnits(rawValue || 0n, decimals));
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function makeExplorerUrl(type, value) {
  if (!value) return null;
  const base = UNON_EXPLORER_BASE_URL.replace(/\/+$/, '');
  return `${base}/${type}/${value}`;
}

function getUnonIndexerKey() {
  const tokenAddress = parseOptionalAddress(UNON_TOKEN_ADDRESS);
  return tokenAddress ? `unon:${tokenAddress.toLowerCase()}` : 'unon:invalid-token';
}

function toNumericString(value) {
  if (typeof value === 'bigint') return value.toString();
  return BigInt(String(value || '0')).toString();
}

function rawDecimalToBigInt(value) {
  return BigInt(String(value || '0'));
}

function getLogIndex(log) {
  return Number(log.index ?? log.logIndex ?? 0);
}

async function ensureUnonIndexerState(client = pool) {
  const tokenAddress = parseOptionalAddress(UNON_TOKEN_ADDRESS);
  const onboardingAddress = parseOptionalAddress(UNON_NETWORK_CONFIG.contracts.onboardingManager);
  const key = getUnonIndexerKey();
  const initialLastSyncedBlock = UNON_INDEX_FROM_BLOCK - 1;

  const result = await client.query(`
    INSERT INTO ${TABLE_UNON_INDEXER_STATE}
      (key, token_address, onboarding_manager_address, from_block, last_synced_block, status, updated_at)
    VALUES ($1, $2, $3, $4, $5, 'idle', CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET
      token_address = EXCLUDED.token_address,
      onboarding_manager_address = EXCLUDED.onboarding_manager_address,
      from_block = LEAST(${TABLE_UNON_INDEXER_STATE}.from_block, EXCLUDED.from_block),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [key, tokenAddress || '', onboardingAddress, UNON_INDEX_FROM_BLOCK, initialLastSyncedBlock]);

  return result.rows[0];
}

async function updateUnonIndexerState(patch) {
  const current = await ensureUnonIndexerState();
  const next = {
    lastSyncedBlock: patch.lastSyncedBlock ?? current.last_synced_block,
    latestBlock: patch.latestBlock ?? current.latest_block,
    status: patch.status ?? current.status,
    lastError: Object.prototype.hasOwnProperty.call(patch, 'lastError') ? patch.lastError : current.last_error,
    startedAt: Object.prototype.hasOwnProperty.call(patch, 'startedAt') ? patch.startedAt : current.started_at
  };

  const result = await pool.query(`
    UPDATE ${TABLE_UNON_INDEXER_STATE}
    SET last_synced_block = $2,
        latest_block = $3,
        status = $4,
        last_error = $5,
        started_at = $6,
        updated_at = CURRENT_TIMESTAMP
    WHERE key = $1
    RETURNING *
  `, [
    current.key,
    next.lastSyncedBlock,
    next.latestBlock,
    next.status,
    next.lastError,
    next.startedAt
  ]);

  return result.rows[0];
}

async function getUnonIndexStatus({ refreshLatest = false } = {}) {
  const state = await ensureUnonIndexerState();
  let latestBlock = state.latest_block === null || state.latest_block === undefined ? null : Number(state.latest_block);
  const warnings = [];

  if (refreshLatest) {
    try {
      latestBlock = await withTimeout(provider.getBlockNumber(), UNON_RPC_READ_TIMEOUT_MS, 'unon latest block');
      await updateUnonIndexerState({ latestBlock });
    } catch (error) {
      warnings.push(`latest block: ${error.message}`);
    }
  }

  const fromBlock = Number(state.from_block ?? UNON_INDEX_FROM_BLOCK);
  const lastSyncedBlock = Number(state.last_synced_block ?? fromBlock - 1);
  const syncedThrough = Math.max(lastSyncedBlock, fromBlock - 1);
  const lagBlocks = latestBlock === null ? null : Math.max(0, latestBlock - syncedThrough);

  return {
    key: state.key,
    configured: !!parseOptionalAddress(UNON_TOKEN_ADDRESS),
    tokenAddress: parseOptionalAddress(UNON_TOKEN_ADDRESS),
    onboardingManagerAddress: parseOptionalAddress(UNON_NETWORK_CONFIG.contracts.onboardingManager),
    fromBlock,
    lastSyncedBlock: syncedThrough,
    latestBlock,
    lagBlocks,
    status: isUnonIndexing ? 'running' : state.status,
    isRunning: isUnonIndexing,
    lastError: state.last_error || null,
    startedAt: state.started_at || null,
    updatedAt: state.updated_at || null,
    chunkBlocks: UNON_INDEX_CHUNK_BLOCKS,
    maxChunksPerRun: UNON_INDEX_MAX_CHUNKS_PER_RUN,
    intervalMs: UNON_INDEX_INTERVAL_MS,
    warnings
  };
}

async function getBlockTimestampMap(blockNumbers) {
  const uniqueBlocks = Array.from(new Set(blockNumbers.map(Number).filter((block) => Number.isFinite(block))));
  const entries = await Promise.all(uniqueBlocks.map(async (blockNumber) => {
    try {
      const block = await withTimeout(provider.getBlock(blockNumber), UNON_RPC_READ_TIMEOUT_MS, `unon block ${blockNumber}`);
      return [blockNumber, block?.timestamp ? new Date(Number(block.timestamp) * 1000) : null];
    } catch (error) {
      console.warn(`[UNON-INDEX] Block timestamp failed for ${blockNumber}: ${error.message}`);
      return [blockNumber, null];
    }
  }));
  return new Map(entries);
}

async function applyUnonHolderDelta(client, address, deltaRaw) {
  const normalized = normalizeAddress(address);
  if (!normalized || normalized === ethers.ZeroAddress.toLowerCase()) return;

  await client.query(`
    INSERT INTO ${TABLE_UNON_HOLDERS} (address, balance_raw, updated_at)
    VALUES ($1, $2::numeric, CURRENT_TIMESTAMP)
    ON CONFLICT (address) DO UPDATE SET
      balance_raw = ${TABLE_UNON_HOLDERS}.balance_raw + EXCLUDED.balance_raw,
      updated_at = CURRENT_TIMESTAMP
  `, [normalized, toNumericString(deltaRaw)]);
}

async function syncUnonIndexChunk({ tokenAddress, onboardingAddress, fromBlock, toBlock }) {
  const normalizedTokenAddress = ethers.getAddress(tokenAddress).toLowerCase();
  const transferTopic = ethers.id('Transfer(address,address,uint256)');
  const claimedTopic = ethers.id('Claimed(bytes32,address,uint256)');
  const [transferLogs, claimLogs] = await Promise.all([
    withTimeout(provider.getLogs({
      address: tokenAddress,
      fromBlock,
      toBlock,
      topics: [transferTopic]
    }), UNON_RPC_LOG_TIMEOUT_MS, `unon transfers ${fromBlock}-${toBlock}`),
    onboardingAddress
      ? withTimeout(provider.getLogs({
        address: onboardingAddress,
        fromBlock,
        toBlock,
        topics: [claimedTopic]
      }), UNON_RPC_LOG_TIMEOUT_MS, `unon welcome claims ${fromBlock}-${toBlock}`)
      : Promise.resolve([])
  ]);

  const timestampByBlock = await getBlockTimestampMap([
    ...transferLogs.map((log) => log.blockNumber),
    ...claimLogs.map((log) => log.blockNumber)
  ]);

  const client = await pool.connect();
  let insertedTransfers = 0;
  let insertedClaims = 0;

  try {
    await client.query('BEGIN');

    for (const log of transferLogs) {
      const parsed = UNON_TRANSFER_INTERFACE.parseLog(log);
      const from = ethers.getAddress(parsed.args.from);
      const to = ethers.getAddress(parsed.args.to);
      const amountRaw = parsed.args.value;
      const logIndex = getLogIndex(log);
      const inserted = await client.query(`
        INSERT INTO ${TABLE_UNON_TRANSFERS}
          (token_address, tx_hash, log_index, block_number, block_timestamp, from_address, to_address, amount_raw)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric)
        ON CONFLICT (tx_hash, log_index) DO UPDATE SET
          token_address = COALESCE(${TABLE_UNON_TRANSFERS}.token_address, EXCLUDED.token_address)
        RETURNING (xmax = 0) AS inserted
      `, [
        normalizedTokenAddress,
        log.transactionHash,
        logIndex,
        log.blockNumber,
        timestampByBlock.get(Number(log.blockNumber)) || null,
        from.toLowerCase(),
        to.toLowerCase(),
        amountRaw.toString()
      ]);

      if (inserted.rowCount > 0 && inserted.rows[0]?.inserted === true) {
        insertedTransfers += 1;
        await applyUnonHolderDelta(client, from, -amountRaw);
        await applyUnonHolderDelta(client, to, amountRaw);
      } else if (inserted.rowCount > 0) {
        insertedTransfers += 1;
      }
    }

    for (const log of claimLogs) {
      const parsed = ONBOARDING_MANAGER_INTERFACE.parseLog(log);
      const recipient = ethers.getAddress(parsed.args.recipient);
      const logIndex = getLogIndex(log);
      const inserted = await client.query(`
        INSERT INTO ${TABLE_UNON_WELCOME_CLAIMS}
          (token_address, tx_hash, log_index, block_number, block_timestamp, identity_nullifier, recipient, amount_raw)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric)
        ON CONFLICT (tx_hash, log_index) DO UPDATE SET
          token_address = COALESCE(${TABLE_UNON_WELCOME_CLAIMS}.token_address, EXCLUDED.token_address)
        RETURNING (xmax = 0) AS inserted
      `, [
        normalizedTokenAddress,
        log.transactionHash,
        logIndex,
        log.blockNumber,
        timestampByBlock.get(Number(log.blockNumber)) || null,
        String(parsed.args.identityNullifier),
        recipient.toLowerCase(),
        parsed.args.amount.toString()
      ]);

      if (inserted.rowCount > 0) insertedClaims += 1;
    }

    await client.query(`
      UPDATE ${TABLE_UNON_INDEXER_STATE}
      SET last_synced_block = GREATEST(last_synced_block, $2),
          latest_block = GREATEST(COALESCE(latest_block, $2), $2),
          status = 'running',
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE key = $1
    `, [getUnonIndexerKey(), toBlock]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    fromBlock,
    toBlock,
    transferLogs: transferLogs.length,
    claimLogs: claimLogs.length,
    insertedTransfers,
    insertedClaims
  };
}

let isUnonIndexing = false;

async function resetUnonIndexForActiveToken() {
  const tokenAddress = parseOptionalAddress(UNON_TOKEN_ADDRESS);
  if (!tokenAddress) {
    throw new Error('UNON_TOKEN_ADDRESS is not a valid contract address');
  }

  const normalizedTokenAddress = tokenAddress.toLowerCase();
  const key = getUnonIndexerKey();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ${TABLE_UNON_TRANSFERS} WHERE token_address = $1`, [normalizedTokenAddress]);
    await client.query(`DELETE FROM ${TABLE_UNON_WELCOME_CLAIMS} WHERE token_address = $1`, [normalizedTokenAddress]);
    await client.query(`
      INSERT INTO ${TABLE_UNON_INDEXER_STATE}
        (key, token_address, onboarding_manager_address, from_block, last_synced_block, status, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'idle', CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        token_address = EXCLUDED.token_address,
        onboarding_manager_address = EXCLUDED.onboarding_manager_address,
        from_block = EXCLUDED.from_block,
        last_synced_block = EXCLUDED.last_synced_block,
        latest_block = NULL,
        status = 'idle',
        last_error = NULL,
        started_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    `, [
      key,
      normalizedTokenAddress,
      parseOptionalAddress(UNON_NETWORK_CONFIG.contracts.onboardingManager),
      UNON_INDEX_FROM_BLOCK,
      UNON_INDEX_FROM_BLOCK - 1
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runUnonIndexSync(options = {}) {
  const tokenAddress = parseOptionalAddress(UNON_TOKEN_ADDRESS);
  if (!tokenAddress) {
    await updateUnonIndexerState({ status: 'error', lastError: 'UNON_TOKEN_ADDRESS is not a valid contract address' });
    return { success: false, error: 'UNON_TOKEN_ADDRESS is not a valid contract address' };
  }

  const onboardingAddress = parseOptionalAddress(UNON_NETWORK_CONFIG.contracts.onboardingManager);
  if (options.reset === true) {
    await resetUnonIndexForActiveToken();
  }
  const maxChunks = Math.min(Math.max(parseInt(options.maxChunks, 10) || UNON_INDEX_MAX_CHUNKS_PER_RUN, 1), 500);
  const latestBlock = await withTimeout(provider.getBlockNumber(), UNON_RPC_READ_TIMEOUT_MS, 'unon latest block');
  const state = await updateUnonIndexerState({
    latestBlock,
    status: 'running',
    lastError: null,
    startedAt: new Date()
  });

  const fromBlock = Number(state.from_block ?? UNON_INDEX_FROM_BLOCK);
  let nextBlock = Math.max(Number(state.last_synced_block ?? fromBlock - 1) + 1, fromBlock);
  let chunksSynced = 0;
  let insertedTransfers = 0;
  let insertedClaims = 0;

  try {
    while (nextBlock <= latestBlock && chunksSynced < maxChunks) {
      const toBlock = Math.min(latestBlock, nextBlock + UNON_INDEX_CHUNK_BLOCKS - 1);
      const chunk = await syncUnonIndexChunk({ tokenAddress, onboardingAddress, fromBlock: nextBlock, toBlock });
      chunksSynced += 1;
      insertedTransfers += chunk.insertedTransfers;
      insertedClaims += chunk.insertedClaims;
      nextBlock = toBlock + 1;
      console.log(`[UNON-INDEX] Synced ${chunk.fromBlock}-${chunk.toBlock}: ${chunk.insertedTransfers}/${chunk.transferLogs} transfers, ${chunk.insertedClaims}/${chunk.claimLogs} claims`);
    }

    const finalStatus = nextBlock > latestBlock ? 'idle' : 'partial';
    const finalState = await updateUnonIndexerState({
      latestBlock,
      status: finalStatus,
      lastError: null,
      startedAt: null
    });

    return {
      success: true,
      status: finalStatus,
      chunksSynced,
      insertedTransfers,
      insertedClaims,
      lastSyncedBlock: Number(finalState.last_synced_block),
      latestBlock
    };
  } catch (error) {
    await updateUnonIndexerState({
      latestBlock,
      status: 'error',
      lastError: error.message,
      startedAt: null
    });
    throw error;
  }
}

async function startUnonIndexSync(options = {}) {
  if (isUnonIndexing) {
    return {
      started: false,
      reason: 'already_running',
      status: await getUnonIndexStatus({ refreshLatest: false })
    };
  }

  isUnonIndexing = true;
  const maxChunks = options.maxChunks || UNON_INDEX_MAX_CHUNKS_PER_RUN;
  setImmediate(() => {
    runUnonIndexSync({ maxChunks, reason: options.reason, reset: options.reset === true })
      .catch((error) => console.error('[UNON-INDEX] Sync failed:', error.message))
      .finally(() => {
        isUnonIndexing = false;
      });
  });

  return {
    started: true,
    status: await getUnonIndexStatus({ refreshLatest: false })
  };
}

function scheduleUnonIndexer() {
  setTimeout(() => {
    void startUnonIndexSync({ reason: 'startup' });
    setInterval(() => {
      void startUnonIndexSync({ reason: 'interval' });
    }, UNON_INDEX_INTERVAL_MS);
  }, UNON_INDEX_START_DELAY_MS);
  console.log(`[UNON-INDEX] Scheduled every ${Math.round(UNON_INDEX_INTERVAL_MS / 1000)}s after ${Math.round(UNON_INDEX_START_DELAY_MS / 1000)}s startup delay`);
}

function getPrizeManagerContract(runner = provider, managerAddress = UNON_PRIZE_MANAGER_ADDRESS) {
  const normalizedManagerAddress = parseOptionalAddress(managerAddress);
  if (!normalizedManagerAddress) {
    throw new Error('UNON_PRIZE_MANAGER_ADDRESS is not configured.');
  }
  return new ethers.Contract(normalizedManagerAddress, PRIZE_CHALLENGE_MANAGER_ABI, runner);
}

function toUnixSeconds(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value || ''));
  if (!Number.isFinite(time)) return null;
  return Math.floor(time / 1000);
}

function getPrizeStatusFromTimestamps(submissionStart, submissionEnd, votingEnd, finalized = false, noContest = false) {
  if (finalized) return noContest ? 'no_contest' : 'finalized';
  const now = Math.floor(Date.now() / 1000);
  if (now < submissionStart) return 'scheduled';
  if (now <= submissionEnd) return 'submitting';
  if (now <= votingEnd) return 'voting';
  return 'pending_finalize';
}

function makeOnchainChallengeId(localChallengeId, uid) {
  return ethers.keccak256(ethers.toUtf8Bytes(`wcb-prize:${localChallengeId}:${String(uid || '').toLowerCase()}`));
}

function makeOnchainVideoId(videoId) {
  return ethers.keccak256(ethers.toUtf8Bytes(`wcb-video:${videoId}`));
}

function normalizeAddress(value) {
  return ethers.isAddress(String(value || '')) ? ethers.getAddress(value).toLowerCase() : null;
}

async function verifyFirebaseTokenFromRequest(req) {
  const token = getBearerToken(req);
  if (!token) throw new Error('Missing Firebase ID token');
  return admin.auth().verifyIdToken(token);
}

async function verifyPrizeEvent(txHash, eventName, predicate, managerAddress = UNON_PRIZE_MANAGER_ADDRESS) {
  if (!isLikelyTransactionHash(txHash)) {
    throw new Error('Invalid transaction hash');
  }
  const expectedManagerAddress = parseOptionalAddress(managerAddress);
  if (!expectedManagerAddress) {
    throw new Error('Prize manager address is not configured.');
  }

  const receipt = await withTimeout(provider.getTransactionReceipt(txHash), UNON_RPC_READ_TIMEOUT_MS, `prize tx ${eventName}`);
  if (!receipt || receipt.status !== 1) {
    throw new Error('Prize transaction is not confirmed successfully.');
  }

  for (const log of receipt.logs || []) {
    if (String(log.address).toLowerCase() !== expectedManagerAddress.toLowerCase()) continue;
    try {
      const parsed = PRIZE_MANAGER_INTERFACE.parseLog(log);
      if (parsed?.name === eventName && (!predicate || predicate(parsed))) {
        return { receipt, event: parsed };
      }
    } catch (error) {
      // Ignore logs emitted by other contracts in the same transaction.
    }
  }

  throw new Error(`${eventName} event was not found in the transaction.`);
}

async function makePrizeEntryRegistration(challengeId, videoId, creator, managerAddress) {
  if (!prizeRegistrarWallet) {
    throw new Error('PRIZE_REGISTRAR_PRIVATE_KEY is not configured.');
  }
  const normalizedManager = parseOptionalAddress(managerAddress);
  const normalizedCreator = parseOptionalAddress(creator);
  if (!normalizedManager || !normalizedCreator) {
    throw new Error('Invalid prize entry registration payload.');
  }
  const deadline = Math.floor(Date.now() / 1000) + PRIZE_ENTRY_SIGNATURE_TTL_SECONDS;
  const digest = ethers.solidityPackedKeccak256(
    ['uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256'],
    [WORLD_CHAIN_CHAIN_ID, normalizedManager, challengeId, videoId, normalizedCreator, deadline]
  );
  const signature = await prizeRegistrarWallet.signMessage(ethers.getBytes(digest));

  return {
    chainId: WORLD_CHAIN_CHAIN_ID,
    prizeManagerAddress: normalizedManager,
    challengeId,
    videoId,
    creator: normalizedCreator,
    deadline,
    signature
  };
}

async function makeMissionRewardSignature(missionId, recipient, amountWei, managerAddress) {
  if (!onboardingWallet) {
    throw new Error('ONBOARDING_VERIFIER_PRIVATE_KEY is not configured.');
  }
  const normalizedManager = parseOptionalAddress(managerAddress);
  const normalizedRecipient = parseOptionalAddress(recipient);
  if (!normalizedManager || !normalizedRecipient) {
    throw new Error('Invalid mission reward payload.');
  }
  const deadline = Math.floor(Date.now() / 1000) + 900;
  const digest = ethers.solidityPackedKeccak256(
    ['uint256', 'address', 'bytes32', 'address', 'uint256', 'uint256'],
    [WORLD_CHAIN_CHAIN_ID, normalizedManager, missionId, normalizedRecipient, amountWei, deadline]
  );
  const signature = await onboardingWallet.signMessage(ethers.getBytes(digest));
  return {
    chainId: WORLD_CHAIN_CHAIN_ID,
    missionRewardManagerAddress: normalizedManager,
    missionId,
    recipient: normalizedRecipient,
    amount: amountWei.toString(),
    amountUnon: ethers.formatUnits(amountWei, 18),
    deadline,
    signature
  };
}

function isLikelyTransactionHash(value) {
  return /^0x[a-fA-F0-9]{64}$/.test(String(value || ''));
}

function mapChallengeRow(row) {
  return {
    id: row.id,
    title: row.title,
    hashtags: row.hashtags,
    region: row.region,
    viralScore: parseInt(row.viral_score) || 0,
    participants: parseInt(row.participants) || 0,
    bgGradient: row.bg_gradient,
    createdAt: row.created_at,
    videoCount: parseInt(row.video_count) || 0,
    userVideoCount: parseInt(row.user_video_count) || 0,
    externalVideoCount: parseInt(row.external_video_count) || 0,
    platforms: Array.isArray(row.platforms) ? row.platforms.filter(Boolean) : [],
    thumbnailUrl: row.thumbnail_url || null,
    latestVideoAt: row.latest_video_at || null,
    likes: parseInt(row.likes) || 0,
    dislikes: parseInt(row.dislikes) || 0,
    createdByUid: row.created_by_uid || null,
    creatorWalletAddress: row.creator_wallet_address || null,
    challengeMode: row.challenge_mode || (row.challenge_type === 'prize' ? 'battle' : 'trend'),
    notice: row.notice || null,
    eventConfig: row.event_config || {},
    rewardUnon: row.reward_unon || null,
    challengeType: row.challenge_type || 'standard',
    prizeStatus: row.prize_status || 'none',
    prizePoolUnon: row.prize_pool_unon || null,
    prizePoolWei: row.prize_pool_wei || null,
    prizeOnchainChallengeId: row.prize_onchain_challenge_id || null,
    prizeManagerAddress: row.prize_manager_address || null,
    prizeCreateTxHash: row.prize_create_tx_hash || null,
    prizeFinalizeTxHash: row.prize_finalize_tx_hash || null,
    prizeSubmissionStart: row.prize_submission_start || null,
    prizeSubmissionEnd: row.prize_submission_end || null,
    prizeVotingEnd: row.prize_voting_end || null,
    prizeWinnerCount: row.prize_winner_count || null,
    prizeWinnerSplitsBps: row.prize_winner_splits_bps || []
  };
}

function normalizeChallengeMode(value, fallback = 'trend') {
  const normalized = String(value || fallback).trim().toLowerCase();
  return ['trend', 'battle', 'now'].includes(normalized) ? normalized : fallback;
}

function normalizeRankingPeriod(value) {
  const normalized = String(value || 'month').trim().toLowerCase();
  if (normalized === 'quarter' || normalized === 'year') return normalized;
  return 'month';
}

function rankingPeriodSql(period) {
  if (period === 'quarter') return "date_trunc('quarter', NOW())";
  if (period === 'year') return "date_trunc('year', NOW())";
  return "date_trunc('month', NOW())";
}

async function createNotification({ recipientUid, actorUid = null, type, title, body, payload = {}, requestWorldPush = false }) {
  const pushStatus = requestWorldPush ? await sendWorldAppPush(recipientUid, title, body, payload) : 'not_requested';
  const result = await pool.query(`
    INSERT INTO ${TABLE_NOTIFICATIONS} (recipient_uid, actor_uid, type, title, body, payload, world_push_status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [recipientUid, actorUid, type, title, body, payload, pushStatus]);
  return result.rows[0];
}

async function sendWorldAppPush(recipientUid, title, body, payload = {}) {
  if (!process.env.WORLD_APP_PUSH_API_URL || !process.env.WORLD_APP_PUSH_API_KEY) {
    return 'not_configured';
  }

  const permission = await pool.query(
    `SELECT * FROM ${TABLE_NOTIFICATION_PERMISSIONS} WHERE user_uid = $1 AND world_app_notifications_enabled = true`,
    [recipientUid]
  );
  if (permission.rowCount === 0) return 'permission_missing';

  try {
    const response = await fetch(process.env.WORLD_APP_PUSH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WORLD_APP_PUSH_API_KEY}`
      },
      body: JSON.stringify({
        recipientUid,
        worldUsername: permission.rows[0].world_username,
        walletAddress: permission.rows[0].wallet_address,
        title,
        body,
        payload
      })
    });
    return response.ok ? 'sent' : `failed_${response.status}`;
  } catch (error) {
    console.warn('[PUSH] World App push failed:', error.message);
    return 'failed';
  }
}

// Onboarding verifier wallet must match the signer configured in the claim contract.
const rawOnboardingVerifierPrivateKey = process.env.ONBOARDING_VERIFIER_PRIVATE_KEY || null;
const ONBOARDING_VERIFIER_PRIVATE_KEY = rawOnboardingVerifierPrivateKey
  ? (rawOnboardingVerifierPrivateKey.startsWith('0x')
      ? rawOnboardingVerifierPrivateKey
      : `0x${rawOnboardingVerifierPrivateKey}`)
  : null;
const onboardingWallet = ONBOARDING_VERIFIER_PRIVATE_KEY
  ? new ethers.Wallet(ONBOARDING_VERIFIER_PRIVATE_KEY)
  : null;
const rawPrizeRegistrarPrivateKey = process.env.PRIZE_REGISTRAR_PRIVATE_KEY || process.env.UNON_PRIZE_REGISTRAR_PRIVATE_KEY || process.env.WCT_PRIZE_REGISTRAR_PRIVATE_KEY || null;
const PRIZE_REGISTRAR_PRIVATE_KEY = rawPrizeRegistrarPrivateKey
  ? (rawPrizeRegistrarPrivateKey.startsWith('0x')
      ? rawPrizeRegistrarPrivateKey
      : `0x${rawPrizeRegistrarPrivateKey}`)
  : null;
const prizeRegistrarWallet = PRIZE_REGISTRAR_PRIVATE_KEY
  ? new ethers.Wallet(PRIZE_REGISTRAR_PRIVATE_KEY)
  : null;
const PRIZE_ENTRY_SIGNATURE_TTL_SECONDS = Math.max(60, Number(process.env.PRIZE_ENTRY_SIGNATURE_TTL_SECONDS || 900));

if (onboardingWallet) {
  console.log(`[ONBOARDING] Wallet initialized: ${onboardingWallet.address} (using ENV key)`);
} else {
  console.error('[ONBOARDING] ONBOARDING_VERIFIER_PRIVATE_KEY is not configured. UNON onboarding claims are disabled until the authorized signer key is set.');
}

const loginChallengeRequests = new Map();

// Wallet login challenges are short-lived and consumed once across server instances.
app.get('/api/auth/nonce', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const nonce = generateNonce();
  const origin = req.get('origin');
  if (!origin || !corsOrigins.has(origin)) return res.status(403).json({ error: 'Login origin is not configured.' });
  const now = Date.now();
  for (const [key, value] of loginChallengeRequests) if (value.resetAt <= now) loginChallengeRequests.delete(key);
  const key = req.ip;
  const rate = loginChallengeRequests.get(key) || { count: 0, resetAt: now + 60000 };
  // Per-instance abuse guard; the shared Firestore transaction provides replay protection.
  if (rate.count >= 10 || loginChallengeRequests.size >= 1000) return res.status(429).json({ error: 'Too many wallet login attempts. Try again later.' });
  rate.count++;
  loginChallengeRequests.set(key, rate);
  try {
    const challenge = { nonce, origin, domain: new URL(origin).host, createdAt: Date.now(), expiresAt: Date.now() + CHALLENGE_TTL_MS };
    await admin.firestore().collection('_walletAuthChallenges').doc(nonce).create({ ...challenge, deleteAfter: new Date(challenge.expiresAt) });
    res.json({ success: true, nonce });
  } catch {
    res.status(503).json({ error: 'Wallet login is temporarily unavailable.' });
  }
});

// Verify wallet ownership; this does not establish a World ID human proof.
app.post('/api/auth/complete-siwe', async (req, res) => {
  const { payload, nonce } = req.body;
  
  // MiniKit v2 wraps auth data inside the 'data' property
  const authData = payload?.data;

  if (!authData || !authData.message || !authData.signature) {
    return res.status(400).json({ error: 'Missing SIWE data, message, or signature' });
  }

  try {
    const messageStr = typeof authData.message === 'string' ? authData.message.trim() : JSON.stringify(authData.message);
    const siweMessage = new SiweMessage(messageStr);
    if (!/^[a-zA-Z0-9]{8,128}$/.test(String(nonce || ''))) throw new Error('Invalid nonce');
    const challengeRef = admin.firestore().collection('_walletAuthChallenges').doc(nonce);
    const challenge = (await challengeRef.get()).data();
    validateSiweContext(siweMessage, challenge);
    
    // Verify using World Chain Provider to support Smart Contract Wallets (ERC-1271)
    const result = await siweMessage.verify({
        signature: authData.signature,
        nonce: nonce,
    }, { provider }); // Pass the RPC provider here

    if (!result.success) {
      console.error("[!] SIWE Verification Detailed Error:", result.error);
      throw new Error(result.error?.type || "SIWE Verification failed.");
    }
    
    const address = result.data.address.toLowerCase();
    if (authData.address && authData.address.toLowerCase() !== address) throw new Error('Wallet address mismatch');
    await admin.firestore().runTransaction(async transaction => {
      const fresh = (await transaction.get(challengeRef)).data();
      validateSiweContext(siweMessage, fresh);
      transaction.delete(challengeRef);
    });

    await pool.query(`
      INSERT INTO users (id, email, google_id, creator_handle, wallet_address)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE
      SET wallet_address = EXCLUDED.wallet_address
    `, [
      address,
      `${address}@worldid.local`,
      address,
      `world_${address.slice(2, 10)}`,
      address
    ]);

    // Generate a secure Firebase Custom Token using address as the UID
    const customToken = await admin.auth().createCustomToken(address, {
        wallet_verified: true,
        wallet_address: address,
        wallet_auth_version: 2
    });

    console.log(`[AUTH] Wallet authenticated: ${address}`);
    res.json({ success: true, customToken, address });

  } catch (error) {
    console.error('[AUTH] Wallet login failed:', error.message);
    res.status(401).json({ error: 'Wallet authentication failed. Request a new login challenge.' });
  }
});

// UNON Onboarding: Generate Signature for Claim Contract
registerWorldIdRoutes(app, pool, requireAuthenticatedUser);
registerWalletProfileRoutes(app, admin, provider, UNON_NETWORK_CONFIG.contracts.onboardingManager, requireAuthenticatedUser, pool);

app.post('/api/auth/onboarding-signature', requireAuthenticatedUser, async (req, res) => {
  let address;
  let binding;
  try {
    binding = await getWelcomeBinding(pool, String(req.authUser.wallet_address || ''));
    address = authenticatedRewardRecipient({ ...req.authUser, world_id_verified: Boolean(binding) }, req.body.address, process.env.ONBOARDING_REWARDS_ENABLED === 'true');
  } catch (error) {
    return res.status(403).json({ error: 'Welcome rewards require a recent wallet login, human verification and an enabled reward policy' });
  }
  
  if (!address) {
    return res.status(400).json({ error: 'Missing address' });
  }

  if (!onboardingWallet) {
    return res.status(503).json({
      error: 'Onboarding verifier is not configured. Set ONBOARDING_VERIFIER_PRIVATE_KEY to the contract-authorized signer key.',
    });
  }

  try {
    const identityNullifier = identityForClaim(binding.nullifier);
    
    // Match solidity: keccak256(abi.encodePacked(block.chainid, address(this), identityNullifier, recipient))
    const chainId = WORLD_CHAIN_CHAIN_ID;
    const contractAddress = parseOptionalAddress(UNON_NETWORK_CONFIG.contracts.onboardingManager);
    if (!contractAddress) {
      return res.status(503).json({ error: 'UNON onboarding manager is not configured for the selected network.' });
    }

    const onboardingContract = new ethers.Contract(contractAddress, [
      'function claimedIdentityNullifiers(bytes32) view returns (bool)',
      'function verifierSigner() view returns (address)'
    ], provider);
    const oldWalletIdentity = ethers.keccak256(ethers.toUtf8Bytes(address.toLowerCase()));
    const [claimed, restored, verifier] = await Promise.all([
      onboardingContract.claimedIdentityNullifiers(identityNullifier),
      onboardingContract.claimedIdentityNullifiers(oldWalletIdentity),
      onboardingContract.verifierSigner()
    ]);
    if (claimed || restored) return res.status(409).json({ error: 'This wallet or identity has already claimed its welcome reward' });
    if (verifier.toLowerCase() !== onboardingWallet.address.toLowerCase()) {
      return res.status(503).json({ error: 'Welcome reward signer is not configured for the current contract' });
    }

    const messageHash = ethers.solidityPackedKeccak256(
      ['uint256', 'address', 'bytes32', 'address'], 
      [chainId, contractAddress, identityNullifier, address]
    );
    
    // Sign the hash (Ethereum Signed Message formatting is automatically handled by the SDK)
    const messageHashBytes = ethers.getBytes(messageHash);
    const signature = await onboardingWallet.signMessage(messageHashBytes);
    
    console.log(`[ONBOARDING] Generated claim signature for ${address}`);
    
    res.json({
      success: true,
      identityNullifier,
      signature
    });
  } catch (error) {
    console.error("[!] Onboarding Signature Error:", error);
    res.status(500).json({ error: 'Failed to generate signature' });
  }
});

app.post('/api/user/sync', async (req, res) => {
  const { id, email, googleId, creatorHandle } = req.body;
  if (!id) return res.status(400).json({ error: 'id is required' });

  const walletAddress = normalizeAddress(id);
  try {
    const result = await pool.query(`
      INSERT INTO users (id, email, google_id, creator_handle, wallet_address)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE
      SET email = COALESCE(EXCLUDED.email, users.email),
          google_id = COALESCE(EXCLUDED.google_id, users.google_id),
          creator_handle = COALESCE(EXCLUDED.creator_handle, users.creator_handle),
          wallet_address = COALESCE(EXCLUDED.wallet_address, users.wallet_address)
      RETURNING *
    `, [
      String(id).toLowerCase(),
      email || `${String(id).toLowerCase()}@worldid.local`,
      googleId || id,
      creatorHandle || `world_${String(id).replace(/^0x/, '').slice(0, 8)}`,
      walletAddress
    ]);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'User wallet or handle already exists' });
    res.status(500).json({ error: err.message });
  }
});

async function seedInitialChallenges() {
    const reportChallenges = [
        // Cluster A: AI-Hybrid (USA)
        { tag: 'nanobanana', region: 'USA', grad: 'linear-gradient(135deg, #8A2BE2, #00FFFF)' },
        { tag: 'agenticAI', region: 'USA', grad: 'linear-gradient(135deg, #1e3a8a, #2dd4bf)' },
        { tag: 'generativevlog', region: 'USA', grad: 'linear-gradient(135deg, #7c3aed, #db2777)' },
        { tag: 'aifilterchallenge', region: 'USA', grad: 'linear-gradient(135deg, #3b82f6, #4f46e5)' },
        // Cluster B: Absurdist & Relatable Memes (Global)
        { tag: 'sealion', region: 'Global', grad: 'linear-gradient(135deg, #f97316, #fbbf24)' },
        { tag: 'jonhammdancing', region: 'Global', grad: 'linear-gradient(135deg, #3b82f6, #94a3b8)' },
        { tag: 'owlchallenge', region: 'Global', grad: 'linear-gradient(135deg, #a855f7, #ef4444)' },
        { tag: 'justgonnaputthetvon', region: 'Global', grad: 'linear-gradient(135deg, #475569, #06b6d4)' },
        { tag: 'lifemissioncarousel', region: 'Global', grad: 'linear-gradient(135deg, #10b981, #14b8a6)' },
        // Cluster C: High-Energy Performance (Global)
        { tag: 'takaladentro', region: 'Global', grad: 'linear-gradient(135deg, #ec4899, #f43f5e)' },
        { tag: '365buttons', region: 'Global', grad: 'linear-gradient(135deg, #0f172a, #fbbf24)' },
        { tag: 'kpopmashupmar2026', region: 'Global', grad: 'linear-gradient(135deg, #ff00ff, #ffffff)' },
        { tag: 'heavencanwait', region: 'Global', grad: 'linear-gradient(135deg, #0ea5e9, #fbbf24)' },
        // Cluster D: Discipline & Aesthetic (Global / SE Asia)
        { tag: 'goinganalogue', region: 'Global', grad: 'linear-gradient(135deg, #78350f, #d6d3d1)' },
        { tag: '75hard', region: 'Global', grad: 'linear-gradient(135deg, #000000, #dc2626)' },
        { tag: 'adminnight', region: 'Global', grad: 'linear-gradient(135deg, #312e81, #94a3b8)' },
        { tag: 'sunshineboy', region: 'South East Asia', grad: 'linear-gradient(135deg, #f59e0b, #fbbf24)' },
        // Cluster E: Niche & Obsession (Global)
        { tag: 'labubustyle', region: 'Global', grad: 'linear-gradient(135deg, #10b981, #f472b6)' },
        { tag: 'leveluppet', region: 'Global', grad: 'linear-gradient(135deg, #3b82f6, #facc15)' },
        { tag: 'draculajennie', region: 'Global', grad: 'linear-gradient(135deg, #991b1b, #000000)' }
    ];

    for (const c of reportChallenges) {
        const id = `trend_${c.tag}`;
        const title = formatChallengeTitle(c.tag);
        const hashtags = `#${c.tag} #UNON #challengeon #trending`;
        
        await pool.query(`
            INSERT INTO ${TABLE_CHALLENGES} (id, title, hashtags, region, viral_score, participants, bg_gradient, challenge_mode, is_active, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'trend', true, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                region = EXCLUDED.region,
                bg_gradient = EXCLUDED.bg_gradient,
                challenge_mode = 'trend',
                is_active = true
        `, [id, title, hashtags, c.region, 5000, 0, c.grad]);
    }

    await pool.query(`
        INSERT INTO ${TABLE_CHALLENGES} (
            id, title, hashtags, region, viral_score, participants, bg_gradient,
            challenge_mode, notice, event_config, reward_unon, is_official, is_active, created_at
        )
        VALUES (
            'mission_say_hello_2026',
            'Say Hello',
            '#sayhello #uon #weareone',
            'Global',
            9000,
            0,
            'linear-gradient(135deg, #111827, #f59e0b)',
            'now',
            '우리 다같이 인사하고 친해져요. Say Hello 영상을 업로드하면 2 UNON 미션 보상을 받을 수 있습니다.',
            $1::jsonb,
            '2',
            true,
            true,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
            challenge_mode = 'now',
            notice = EXCLUDED.notice,
            event_config = EXCLUDED.event_config,
            reward_unon = '2',
            is_active = true
    `, [JSON.stringify({ type: 'video_upload', missionId: 'say-hello', rewardUnon: 2, custom: true })]);
    console.log(`[SEED] Seeded ${reportChallenges.length} Mar 2026 Trend Insight challenges`);
}

async function seedAnnouncements() {
    const announcements = [
        {
            id: 'event_new_signup_100unon_2026',
            title: 'New User 100 UNON Welcome Event',
            body: 'New signups receive a 100 UNON reward. Event ends at 2026-12-31 00:00:00 UTC.',
            ctaLabel: 'View Profile',
            ctaTarget: 'profile',
            isImportant: true,
            displayOrder: 1,
            startsAt: null,
            endsAt: '2026-12-31T00:00:00Z'
        },
        {
            id: 'notice_unon_vote_battle_rules_2026',
            title: 'UNON Vote & Battle Rules',
            body: 'Prize battles are open to PLATINUM+ holders. Only WorldID-uploaded videos can enter prize battles. Each eligible video can receive one 1 UNON vote per voter, winners are finalized on-chain, and 3% is reserved for operations before prize and voter rewards are distributed.',
            ctaLabel: 'Create Battle',
            ctaTarget: 'create',
            isImportant: true,
            displayOrder: 2,
            startsAt: null,
            endsAt: null
        }
    ];

    for (const announcement of announcements) {
        await pool.query(`
            INSERT INTO ${TABLE_ANNOUNCEMENTS} (
                id, title, body, cta_label, cta_target, is_active, is_important, display_order, starts_at, ends_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                body = EXCLUDED.body,
                cta_label = EXCLUDED.cta_label,
                cta_target = EXCLUDED.cta_target,
                is_active = EXCLUDED.is_active,
                is_important = EXCLUDED.is_important,
                display_order = EXCLUDED.display_order,
                starts_at = EXCLUDED.starts_at,
                ends_at = EXCLUDED.ends_at,
                updated_at = CURRENT_TIMESTAMP
        `, [
            announcement.id,
            announcement.title,
            announcement.body,
            announcement.ctaLabel,
            announcement.ctaTarget,
            announcement.isImportant,
            announcement.displayOrder,
            announcement.startsAt,
            announcement.endsAt
        ]);
    }

    console.log(`[SEED] Seeded ${announcements.length} announcement(s)`);
}

// Helper for Pretty Challenge Titles
function formatChallengeTitle(tag) {
    if (!tag) return 'Discovery';
    let clean = tag.replace('#', '');
    clean = clean.replace(/([A-Z])/g, ' $1').trim();
    clean = clean.replace(/[_-]/g, ' ');
    return clean.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
        .trim();
}

function getYouTubeTagsForChallenge(challenge) {
  const hashtagTags = String(challenge?.hashtags || '')
    .split(/\s+/)
    .map((tag) => normalizeTag(tag))
    .filter(Boolean)
    .filter((tag) => tag.length <= 30);

  return Array.from(new Set([
    'shorts',
    'UNON',
    'challengeon',
    'challenge',
    normalizeTag(challenge?.title || ''),
    ...hashtagTags
  ].filter(Boolean))).slice(0, 15);
}

function getYouTubeUploadMetadata(challenge, fallbackTitle, authorLabel, uploaderComment = '', remixSource = null, authorIdentity = {}, userVideoTitle = '') {
  const challengeTitle = (challenge?.title || fallbackTitle || 'Challenge On').trim();
  const cleanVideoTitle = String(userVideoTitle || '').trim().replace(/\s+/g, ' ').slice(0, 90);
  const cleanComment = String(uploaderComment || '').trim().slice(0, 500);
  const cleanAuthorUid = String(authorIdentity.uid || '').trim().slice(0, 90);
  const cleanAuthorWallet = String(authorIdentity.walletAddress || '').trim().slice(0, 90);
  const cleanAuthorWorldUsername = String(authorIdentity.worldUsername || '').replace(/^@+/, '').trim().slice(0, 80);
  const cleanRemixTitle = String(remixSource?.title || '').trim().slice(0, 120);
  const cleanRemixAuthor = String(remixSource?.author || '').trim().slice(0, 80);
  const cleanRemixPlatform = String(remixSource?.platform || '').trim().slice(0, 30);
  const cleanRemixUrl = String(remixSource?.url || '').trim().slice(0, 300);
  const hashtags = String(challenge?.hashtags || '')
    .split(/\s+/)
    .filter((tag) => tag.startsWith('#'))
    .slice(0, 5)
    .join(' ');
  const title = cleanVideoTitle || `${challengeTitle} Entry`;
  const description = [
    `Challenge: ${challengeTitle}`,
    `Entry by: ${authorLabel || 'U&On Challenger'}`,
    cleanAuthorWorldUsername ? `World username: @${cleanAuthorWorldUsername}` : '',
    cleanAuthorWallet ? `World wallet: ${cleanAuthorWallet}` : (cleanAuthorUid ? `Uploader ID: ${cleanAuthorUid}` : ''),
    cleanRemixTitle ? `Try ON remix source: ${cleanRemixTitle}${cleanRemixAuthor ? ` by @${cleanRemixAuthor.replace(/^@+/, '')}` : ''}${cleanRemixPlatform ? ` on ${cleanRemixPlatform}` : ''}` : '',
    cleanRemixUrl ? `Original source: ${cleanRemixUrl}` : '',
    cleanComment ? `Uploader comment: ${cleanComment}` : '',
    hashtags ? `Tags: ${hashtags}` : '',
    '',
    'Uploaded from U&On.',
    '#UNON #challengeon #Shorts'
  ].filter(Boolean).join('\n');

  return {
    title: title.length > 100 ? `${title.slice(0, 97)}...` : title,
    description,
    tags: getYouTubeTagsForChallenge({ ...challenge, title: challengeTitle })
  };
}

function toMatcherVideo(row) {
  return {
    id: row.id,
    platform: row.platform,
    author: row.author,
    viewCount: row.view_count,
    videoTitle: row.video_title,
    video_title: row.video_title,
    videoUrl: row.video_url,
    video_url: row.video_url,
    thumbnailUrl: row.thumbnail_url,
    externalUrl: row.external_url,
    external_url: row.external_url,
    durationSeconds: row.duration_seconds || row.duration || null
  };
}

function toMatcherChallenge(row) {
  return {
    id: row.id,
    title: row.title,
    hashtags: row.hashtags,
    tag: row.hashtags ? row.hashtags.split(/\s+/)[0] : '',
    region: normalizeRegion(row.region),
    isOfficial: row.is_official
  };
}

function parseYouTubeVideoId(input) {
  try {
    const url = new URL(String(input || '').trim());
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] || null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/').filter(Boolean)[1] || null;
      }
      if (url.pathname === '/watch') {
        return url.searchParams.get('v');
      }
      if (url.pathname.startsWith('/embed/')) {
        return url.pathname.split('/').filter(Boolean)[1] || null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeYouTubeShortsUrl(input) {
  const videoId = parseYouTubeVideoId(input);
  if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;
  return {
    videoId,
    videoUrl: `https://www.youtube.com/shorts/${videoId}`,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  };
}

function scoreVideoForChallengeWithRegion(video, challenge) {
  const match = scoreVideoForChallenge(video, challenge);
  const regionFit = scoreRegionFit(video, challenge.region);
  return {
    ...match,
    regionFit,
    score: match.score + regionFit.score,
    accepted: match.accepted && regionFit.score >= -40
  };
}

function findBestChallengeForVideoWithRegion(video, challenges) {
  let bestChallenge = null;
  let bestResult = { score: -1, accepted: false, reasons: [], signals: {}, regionFit: null };

  for (const challenge of challenges) {
    const result = scoreVideoForChallengeWithRegion(video, challenge);
    if (
      result.score > bestResult.score
      || (result.score === bestResult.score && bestChallenge && result.signals.primaryTag.length > (bestResult.signals.primaryTag || '').length)
    ) {
      bestChallenge = challenge;
      bestResult = result;
    }
  }

  return {
    challenge: bestChallenge,
    ...bestResult
  };
}

async function recalculateChallengeScore(challengeId) {
  if (!challengeId) return;
  await pool.query(`
    UPDATE ${TABLE_CHALLENGES} c
    SET viral_score = GREATEST(
      COALESCE(c.likes, 0) * 100
      + COALESCE(c.participants, 0) * 500
      + COALESCE(v.video_count, 0) * 2000
      + COALESCE(v.view_score, 0),
      0
    )
    FROM (
      SELECT challenge_id, COUNT(*) AS video_count, FLOOR(COALESCE(SUM(view_count), 0) / 10)::INTEGER AS view_score
      FROM ${TABLE_VIDEOS}
      WHERE challenge_id = $1
        AND COALESCE(is_hidden, false) = false
      GROUP BY challenge_id
    ) v
    WHERE c.id = $1 AND c.id = v.challenge_id
  `, [challengeId]);

  await pool.query(`
    UPDATE ${TABLE_CHALLENGES}
    SET viral_score = GREATEST(COALESCE(likes, 0) * 100 + COALESCE(participants, 0) * 500, 0)
    WHERE id = $1
      AND NOT EXISTS (SELECT 1 FROM ${TABLE_VIDEOS} WHERE challenge_id = $1 AND COALESCE(is_hidden, false) = false)
  `, [challengeId]);
}

async function runVideoMaintenance(options = {}) {
  if (isVideoMaintenanceRunning) {
    return { skipped: true, reason: 'already_running' };
  }

  isVideoMaintenanceRunning = true;
  const limit = Math.min(parseInt(options.limit, 10) || VIDEO_MAINTENANCE_LIMIT || 500, 2000);
  const dryRun = options.dryRun === true;
  const touchedChallengeIds = new Set();
  const moved = [];
  const deleted = [];
  const kept = [];

  try {
    const challengesRes = await pool.query(`
      SELECT id, title, hashtags, region, is_official
      FROM ${TABLE_CHALLENGES}
      WHERE is_active = true
        AND hashtags IS NOT NULL
        AND hashtags <> ''
    `);
    const challenges = challengesRes.rows.map(toMatcherChallenge);
    const challengeById = new Map(challenges.map((challenge) => [challenge.id, challenge]));
    const regionUpdates = [];

    for (const row of challengesRes.rows) {
      const inferred = inferRegionDetails({ title: row.title, hashtags: row.hashtags });
      const currentRegion = normalizeRegion(row.region);
      if (inferred.score >= 68 && inferred.region !== currentRegion) {
        regionUpdates.push({
          id: row.id,
          title: row.title,
          from: row.region,
          to: inferred.region,
          score: inferred.score,
          reasons: inferred.reasons
        });

        if (!dryRun) {
          await pool.query(
            `UPDATE ${TABLE_CHALLENGES} SET region = $1 WHERE id = $2`,
            [inferred.region, row.id]
          );
        }

        const cached = challengeById.get(row.id);
        if (cached) cached.region = inferred.region;
      }
    }

    const videosRes = await pool.query(`
      SELECT
        v.*,
        c.title AS current_challenge_title,
        c.hashtags AS current_challenge_hashtags,
        c.region AS current_challenge_region,
        c.is_official AS current_challenge_is_official
      FROM ${TABLE_VIDEOS} v
      JOIN ${TABLE_CHALLENGES} c ON c.id = v.challenge_id
      WHERE COALESCE(v.is_hidden, false) = false
      ORDER BY COALESCE(v.updated_at, NOW() - INTERVAL '30 days') ASC
      LIMIT $1
    `, [limit]);

    for (const row of videosRes.rows) {
      const video = toMatcherVideo(row);
      const currentChallenge = toMatcherChallenge({
        id: row.challenge_id,
        title: row.current_challenge_title,
        hashtags: row.current_challenge_hashtags,
        region: row.current_challenge_region,
        is_official: row.current_challenge_is_official
      });
      const currentMatch = scoreVideoForChallengeWithRegion(video, currentChallenge);
      const bestMatch = findBestChallengeForVideoWithRegion(video, challenges);
      const bestChallenge = bestMatch.challenge;

      const shouldMove = bestChallenge
        && bestMatch.accepted
        && bestChallenge.id !== row.challenge_id
        && (!currentMatch.accepted || bestMatch.score >= currentMatch.score + 40);

      if (shouldMove) {
        moved.push({
          id: row.id,
          title: row.video_title,
          from: row.challenge_id,
          to: bestChallenge.id,
          currentScore: currentMatch.score,
          bestScore: bestMatch.score,
          reasons: bestMatch.reasons
        });
        touchedChallengeIds.add(row.challenge_id);
        touchedChallengeIds.add(bestChallenge.id);

        if (!dryRun) {
          await pool.query(
            `UPDATE ${TABLE_VIDEOS} SET challenge_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [bestChallenge.id, row.id]
          );
        }
        continue;
      }

      if (!currentMatch.accepted) {
        deleted.push({
          id: row.id,
          title: row.video_title,
          challengeId: row.challenge_id,
          currentScore: currentMatch.score,
          bestChallengeId: bestChallenge?.id || null,
          bestScore: bestMatch.score,
          reasons: bestMatch.reasons
        });
        touchedChallengeIds.add(row.challenge_id);

        if (!dryRun) {
          await pool.query(`
            UPDATE ${TABLE_VIDEOS}
            SET is_hidden = true,
                hidden_reason = 'maintenance_no_matching_challenge',
                hidden_at = CURRENT_TIMESTAMP,
                hidden_by_uid = 'system',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [row.id]);
        }
        continue;
      }

      kept.push({
        id: row.id,
        challengeId: row.challenge_id,
        score: currentMatch.score,
        inferredRegion: currentMatch.regionFit?.inferred?.region || null
      });

      if (!dryRun) {
        await pool.query(`UPDATE ${TABLE_VIDEOS} SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [row.id]);
      }
    }

    if (!dryRun) {
      for (const challengeId of touchedChallengeIds) {
        await recalculateChallengeScore(challengeId);
      }
    }

    const summary = {
      success: true,
      dryRun,
      scanned: videosRes.rows.length,
      challengeCount: challengeById.size,
      moved: moved.length,
      deleted: deleted.length,
      kept: kept.length,
      regionUpdated: regionUpdates.length,
      movedSamples: moved.slice(0, 10),
      deletedSamples: deleted.slice(0, 10),
      regionUpdateSamples: regionUpdates.slice(0, 10)
    };

    console.log(`[VIDEO-MAINTENANCE] scanned=${summary.scanned} moved=${summary.moved} deleted=${summary.deleted} kept=${summary.kept} regionUpdated=${summary.regionUpdated} dryRun=${dryRun}`);
    return summary;
  } finally {
    isVideoMaintenanceRunning = false;
  }
}

// API: Get Videos
app.post('/api/challenge-videos', async (req, res) => {
  const { challengeId } = req.body;
  const mode = req.body?.mode ? normalizeChallengeMode(req.body.mode, '') : '';
  const userVideoSql = `(v.author_uid IS NOT NULL OR v.author_wallet_address IS NOT NULL OR v.author_world_username IS NOT NULL)`;
  const surfaceFilter = mode === 'trend'
    ? `AND NOT ${userVideoSql}`
    : (mode === 'battle' || mode === 'now' ? `AND ${userVideoSql}` : '');
  const videoOrder = mode === 'trend' ? 'v.platform_rank ASC, RANDOM()' : 'RANDOM()';
  try {
    const result = await pool.query(`
      WITH ranked_videos AS (
        SELECT v.*,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(COALESCE(v.platform, 'external'))
            ORDER BY v.view_count DESC NULLS LAST, v.updated_at DESC
          ) AS platform_rank
        FROM ${TABLE_VIDEOS} v
        WHERE v.challenge_id = $1
          AND COALESCE(v.is_hidden, false) = false
          ${surfaceFilter}
      )
      SELECT v.*, u.wallet_address AS uploader_wallet_address
      FROM ranked_videos v
      LEFT JOIN users u ON v.author_uid = u.id
      ORDER BY ${videoOrder}
      LIMIT 15
    `, [challengeId]);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get Announcements
app.get('/api/announcements', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM ${TABLE_ANNOUNCEMENTS}
      WHERE is_active = true
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (ends_at IS NULL OR ends_at >= NOW())
      ORDER BY is_important DESC, display_order ASC, created_at DESC
    `);

    const rows = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      ctaLabel: row.cta_label || null,
      ctaTarget: row.cta_target || null,
      isImportant: !!row.is_important,
      displayOrder: Number(row.display_order || 999),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      createdAt: row.created_at
    }));

    const important = rows
      .filter((item) => item.isImportant)
      .sort((a, b) => (a.displayOrder - b.displayOrder) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

    const regular = rows
      .filter((item) => !item.isImportant)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const selected = important.slice(0, 3);
    if (selected.length < 3) {
      selected.push(...regular.slice(0, 3 - selected.length));
    }

    res.json({ success: true, data: selected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public-settings', async (req, res) => {
  try {
    const keys = Object.keys(PUBLIC_SETTING_DEFAULTS);
    const result = await pool.query(
      `SELECT key, value FROM ${TABLE_ADMIN_SETTINGS} WHERE key = ANY($1::text[])`,
      [keys]
    );
    const settings = { ...PUBLIC_SETTING_DEFAULTS };
    result.rows.forEach((row) => {
      if (Object.prototype.hasOwnProperty.call(settings, row.key)) {
        settings[row.key] = row.value;
      }
    });

    res.json({
      success: true,
      data: {
        editorsChoice: {
          title: settings.EDITORS_CHOICE_TITLE,
          subtitle: settings.EDITORS_CHOICE_SUBTITLE,
          aiBadge: settings.EDITORS_CHOICE_AI_BADGE,
          defaultBadge: settings.EDITORS_CHOICE_DEFAULT_BADGE,
          pickBadge: settings.EDITORS_CHOICE_PICK_BADGE,
          rankingPrefix: settings.EDITORS_CHOICE_RANKING_PREFIX,
          rankingSuffix: settings.EDITORS_CHOICE_RANKING_SUFFIX,
          quickNavLabel: settings.EDITORS_CHOICE_QUICK_NAV_LABEL
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get Challenges
app.get('/api/challenges', async (req, res) => {
  try {
    const mode = req.query.mode ? normalizeChallengeMode(req.query.mode) : null;
    const values = [];
    const modeFilter = mode === 'battle'
      ? `AND (
          COALESCE(c.challenge_mode, CASE WHEN c.challenge_type = 'prize' THEN 'battle' ELSE 'trend' END) = $1
          OR EXISTS (
            SELECT 1
            FROM ${TABLE_VIDEOS} uv
            WHERE uv.challenge_id = c.id
              AND COALESCE(uv.is_hidden, false) = false
              AND (uv.author_uid IS NOT NULL OR uv.author_wallet_address IS NOT NULL OR uv.author_world_username IS NOT NULL)
          )
        )`
      : (mode ? `AND COALESCE(c.challenge_mode, CASE WHEN c.challenge_type = 'prize' THEN 'battle' ELSE 'trend' END) = $1` : '');
    if (mode) values.push(mode);
    const query = `
      SELECT c.*,
        COUNT(v.id) as video_count,
        COUNT(v.id) FILTER (WHERE v.author_uid IS NOT NULL OR v.author_wallet_address IS NOT NULL OR v.author_world_username IS NOT NULL) as user_video_count,
        COUNT(v.id) FILTER (WHERE v.author_uid IS NULL AND v.author_wallet_address IS NULL AND v.author_world_username IS NULL) as external_video_count,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT v.platform), NULL) as platforms,
        (ARRAY_AGG(NULLIF(v.thumbnail_url, '') ORDER BY v.view_count DESC NULLS LAST)
          FILTER (WHERE NULLIF(v.thumbnail_url, '') IS NOT NULL AND CASE WHEN COALESCE(c.challenge_mode, CASE WHEN c.challenge_type = 'prize' THEN 'battle' ELSE 'trend' END) = 'trend'
            THEN v.author_uid IS NULL AND v.author_wallet_address IS NULL AND v.author_world_username IS NULL
            ELSE v.author_uid IS NOT NULL OR v.author_wallet_address IS NOT NULL OR v.author_world_username IS NOT NULL END))[1] as thumbnail_url,
        MAX(v.updated_at) as latest_video_at,
        u.wallet_address as creator_wallet_address
      FROM ${TABLE_CHALLENGES} c
      LEFT JOIN ${TABLE_VIDEOS} v ON c.id = v.challenge_id AND COALESCE(v.is_hidden, false) = false
      LEFT JOIN users u ON c.created_by_uid = u.id
      WHERE c.is_active = true
      ${modeFilter}
      GROUP BY c.id, u.wallet_address
      ORDER BY (c.viral_score * RANDOM()) DESC
    `;
    const result = await pool.query(query, values);
    const challenges = result.rows.map(mapChallengeRow);
    res.json({ success: true, data: challenges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/on-sections', async (req, res) => {
  try {
    const sectionQuery = async (mode, limit = 12) => {
      const modeCondition = mode === 'battle'
        ? `(
            COALESCE(c.challenge_mode, CASE WHEN c.challenge_type = 'prize' THEN 'battle' ELSE 'trend' END) = $1
            OR EXISTS (
              SELECT 1
              FROM ${TABLE_VIDEOS} uv
              WHERE uv.challenge_id = c.id
                AND COALESCE(uv.is_hidden, false) = false
                AND (uv.author_uid IS NOT NULL OR uv.author_wallet_address IS NOT NULL OR uv.author_world_username IS NOT NULL)
            )
          )`
        : `COALESCE(c.challenge_mode, CASE WHEN c.challenge_type = 'prize' THEN 'battle' ELSE 'trend' END) = $1`;
      const result = await pool.query(`
        SELECT c.*,
          COUNT(v.id) as video_count,
          COUNT(v.id) FILTER (WHERE v.author_uid IS NOT NULL OR v.author_wallet_address IS NOT NULL OR v.author_world_username IS NOT NULL) as user_video_count,
          COUNT(v.id) FILTER (WHERE v.author_uid IS NULL AND v.author_wallet_address IS NULL AND v.author_world_username IS NULL) as external_video_count,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT v.platform), NULL) as platforms,
          (ARRAY_AGG(NULLIF(v.thumbnail_url, '') ORDER BY v.view_count DESC NULLS LAST)
            FILTER (WHERE NULLIF(v.thumbnail_url, '') IS NOT NULL AND CASE WHEN COALESCE(c.challenge_mode, CASE WHEN c.challenge_type = 'prize' THEN 'battle' ELSE 'trend' END) = 'trend'
              THEN v.author_uid IS NULL AND v.author_wallet_address IS NULL AND v.author_world_username IS NULL
              ELSE v.author_uid IS NOT NULL OR v.author_wallet_address IS NOT NULL OR v.author_world_username IS NOT NULL END))[1] as thumbnail_url,
          MAX(v.updated_at) as latest_video_at,
          u.wallet_address as creator_wallet_address
        FROM ${TABLE_CHALLENGES} c
        LEFT JOIN ${TABLE_VIDEOS} v ON c.id = v.challenge_id AND COALESCE(v.is_hidden, false) = false
        LEFT JOIN users u ON c.created_by_uid = u.id
        WHERE c.is_active = true
          AND ${modeCondition}
        GROUP BY c.id, u.wallet_address
        ORDER BY c.created_at DESC, c.viral_score DESC
        LIMIT $2
      `, [mode, limit]);
      return result.rows.map(mapChallengeRow);
    };

    const [trendOn, battleOn, nowOn] = await Promise.all([
      sectionQuery('trend', 15),
      sectionQuery('battle', 15),
      sectionQuery('now', 10)
    ]);

    res.json({
      success: true,
      data: {
        trendOn,
        battleOn,
        nowOn,
        tutorial: [
          { id: 'welcome-bonus', title: 'Claim Welcome Bonus', reward: '100 UNON', activeUntil: '2026-12-31' },
          { id: 'say-hello', title: 'Upload Say Hello', reward: '2 UNON' },
          { id: 'gold-support', title: 'Send Gold heart support', reward: 'Community ranking boost' },
          { id: 'ranking-check', title: 'Check live donation ranking', reward: 'Track monthly creators' }
        ]
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Create Challenge
app.post('/api/challenges', async (req, res) => {
  const {
    title,
    hashtags,
    region,
    viralScore,
    participants,
    bgGradient,
    createdByUid,
    createdByName,
    challengeMode,
    notice,
    eventConfig,
    inspiredByChallengeId,
    rewardUnon
  } = req.body;
  const id = `user_${Date.now()}`;
  try {
    const inferredRegion = inferRegionDetails({ title, hashtags });
    const requestedRegion = normalizeRegion(region);
    const finalRegion = requestedRegion.includes('Global') && inferredRegion.score >= 68
      ? inferredRegion.region
      : requestedRegion;
    const mode = normalizeChallengeMode(challengeMode, 'battle');
    let finalEventConfig = eventConfig && typeof eventConfig === 'object' ? { ...eventConfig } : {};
    if (inspiredByChallengeId && mode === 'battle') {
      const source = await pool.query(`
        SELECT id, title, hashtags
        FROM ${TABLE_CHALLENGES}
        WHERE id = $1
          AND is_active = true
          AND COALESCE(challenge_mode, CASE WHEN challenge_type = 'prize' THEN 'battle' ELSE 'trend' END) = 'trend'
        LIMIT 1
      `, [inspiredByChallengeId]);
      if (source.rows[0]) {
        finalEventConfig.inspiredBy = {
          challengeId: source.rows[0].id,
          title: source.rows[0].title,
          hashtags: source.rows[0].hashtags
        };
      }
    }
    const queryStr = `
      INSERT INTO ${TABLE_CHALLENGES} (
        id, title, hashtags, region, viral_score, participants, bg_gradient,
        created_by_uid, created_by_name, challenge_mode, notice, event_config, reward_unon, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
      RETURNING *
    `;
    const result = await pool.query(queryStr, [
      id,
      title,
      hashtags,
      finalRegion,
      viralScore || 0,
      participants || 0,
      bgGradient,
      createdByUid || null,
      createdByName || null,
      mode,
      notice || null,
      finalEventConfig,
      rewardUnon || null
    ]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rankings/donations', async (req, res) => {
  try {
    const period = normalizeRankingPeriod(req.query.period);
    const token = String(req.query.token || 'all').trim().toUpperCase();
    const params = [];
    let tokenFilter = '';
    if (token !== 'ALL') {
      params.push(token);
      tokenFilter = `AND upper(token_symbol) = $${params.length}`;
    }
    const periodSql = rankingPeriodSql(period);
    const result = await pool.query(`
      SELECT
        COALESCE(NULLIF(creator_handle, ''), creator_uid, creator_wallet_address, 'Unknown Creator') AS creator,
        creator_uid,
        creator_wallet_address,
        token_symbol,
        SUM(amount_display)::TEXT AS donated_amount,
        COUNT(*)::INTEGER AS support_count
      FROM ${TABLE_TOKEN_DONATIONS}
      WHERE status = 'confirmed'
        AND created_at >= ${periodSql}
        ${tokenFilter}
      GROUP BY creator, creator_uid, creator_wallet_address, token_symbol
      ORDER BY SUM(amount_display) DESC, support_count DESC
      LIMIT 50
    `, params);

    res.json({ success: true, data: result.rows, period, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/video-support', async (req, res) => {
  const { userId, videoAuthor, videoId, challengeId, tokenSymbol = 'UNON', amount = 1, txHash = null } = req.body;
  try {
    const normalizedAmount = Number(amount) > 0 ? Number(amount) : 1;
    const result = await pool.query(`
      INSERT INTO ${TABLE_TOKEN_DONATIONS} (
        video_id, challenge_id, donor_uid, creator_handle, token_symbol, amount_raw, amount_display, tx_hash, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed')
      ON CONFLICT (tx_hash) WHERE tx_hash IS NOT NULL DO NOTHING
      RETURNING *
    `, [
      videoId || null,
      challengeId || null,
      userId || null,
      videoAuthor || 'Unknown Creator',
      String(tokenSymbol || 'UNON').toUpperCase(),
      Math.round(normalizedAmount * 1e6).toString(),
      normalizedAmount,
      txHash || null
    ]);

    if (videoAuthor) {
      await pool.query(`UPDATE users SET total_donations = COALESCE(total_donations, 0) + $1 WHERE creator_handle = $2`, [Math.round(normalizedAmount), videoAuthor]);
    }

    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/video-support/confirm', requireAuthenticatedUser, async (req, res) => {
  const { videoId, challengeId, creatorHandle, creatorUid, creatorWalletAddress, tokenSymbol, tokenAddress, amountRaw, amountDisplay, txHash, donorWalletAddress } = req.body;
  try {
    if (!isLikelyTransactionHash(txHash)) return res.status(400).json({ error: 'Invalid transaction hash.' });
    const normalizedToken = String(tokenSymbol || 'UNON').toUpperCase();
    if (!['UNON', 'WLD'].includes(normalizedToken)) return res.status(400).json({ error: 'Unsupported support token.' });

    const result = await pool.query(`
      INSERT INTO ${TABLE_TOKEN_DONATIONS} (
        video_id, challenge_id, donor_uid, donor_wallet_address, creator_handle, creator_uid, creator_wallet_address,
        token_symbol, token_address, amount_raw, amount_display, tx_hash, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'confirmed')
      ON CONFLICT (tx_hash) WHERE tx_hash IS NOT NULL DO NOTHING
      RETURNING *
    `, [
      videoId || null,
      challengeId || null,
      req.authUser.uid,
      donorWalletAddress || null,
      creatorHandle || null,
      creatorUid || null,
      creatorWalletAddress || null,
      normalizedToken,
      tokenAddress || null,
      String(amountRaw || '0'),
      Number(amountDisplay || 0),
      txHash
    ]);

    if (creatorUid) {
      await createNotification({
        recipientUid: creatorUid,
        actorUid: req.authUser.uid,
        type: 'video_support',
        title: 'New Gold support',
        body: `Your video received ${amountDisplay || 0} ${normalizedToken}.`,
        payload: { videoId, challengeId, tokenSymbol: normalizedToken, txHash },
        requestWorldPush: true
      });
    }

    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/follows', requireAuthenticatedUser, async (req, res) => {
  const { followedUid } = req.body;
  try {
    if (!followedUid || followedUid === req.authUser.uid) {
      return res.status(400).json({ error: 'Invalid followed user.' });
    }
    await pool.query(`
      INSERT INTO ${TABLE_FOLLOWS} (follower_uid, followed_uid)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [req.authUser.uid, followedUid]);
    await createNotification({
      recipientUid: followedUid,
      actorUid: req.authUser.uid,
      type: 'new_follower',
      title: 'New follower',
      body: 'Someone followed your U&On profile.',
      payload: { followerUid: req.authUser.uid },
      requestWorldPush: true
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/follows/:followedUid', requireAuthenticatedUser, async (req, res) => {
  try {
    await pool.query(`DELETE FROM ${TABLE_FOLLOWS} WHERE follower_uid = $1 AND followed_uid = $2`, [req.authUser.uid, req.params.followedUid]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/follows/me', requireAuthenticatedUser, async (req, res) => {
  try {
    const [following, followers] = await Promise.all([
      pool.query(`SELECT followed_uid, created_at FROM ${TABLE_FOLLOWS} WHERE follower_uid = $1 ORDER BY created_at DESC`, [req.authUser.uid]),
      pool.query(`SELECT follower_uid, created_at FROM ${TABLE_FOLLOWS} WHERE followed_uid = $1 ORDER BY created_at DESC`, [req.authUser.uid])
    ]);
    res.json({ success: true, data: { following: following.rows, followers: followers.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications', requireAuthenticatedUser, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM ${TABLE_NOTIFICATIONS}
      WHERE recipient_uid = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [req.authUser.uid]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/:id/read', requireAuthenticatedUser, async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE ${TABLE_NOTIFICATIONS}
      SET read_at = COALESCE(read_at, NOW())
      WHERE id = $1 AND recipient_uid = $2
      RETURNING *
    `, [req.params.id, req.authUser.uid]);
    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/permissions', requireAuthenticatedUser, async (req, res) => {
  const { worldUsername, walletAddress, enabled } = req.body;
  try {
    await pool.query(`
      INSERT INTO ${TABLE_NOTIFICATION_PERMISSIONS} (user_uid, world_username, wallet_address, world_app_notifications_enabled, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_uid) DO UPDATE SET
        world_username = EXCLUDED.world_username,
        wallet_address = EXCLUDED.wallet_address,
        world_app_notifications_enabled = EXCLUDED.world_app_notifications_enabled,
        updated_at = NOW()
    `, [req.authUser.uid, worldUsername || null, walletAddress || null, Boolean(enabled)]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/missions/say-hello/reward-signature', requireAuthenticatedUser, async (req, res) => {
  const { recipient } = req.body;
  try {
    if (!UNON_MISSION_REWARD_MANAGER_ADDRESS) {
      return res.status(503).json({ error: 'UNON_MISSION_REWARD_MANAGER_ADDRESS is not configured.' });
    }
    const wallet = parseOptionalAddress(recipient || req.authUser.uid);
    if (!wallet) return res.status(400).json({ error: 'A valid recipient wallet is required.' });

    const uploaded = await pool.query(`
      SELECT 1
      FROM ${TABLE_VIDEOS} v
      JOIN ${TABLE_CHALLENGES} c ON c.id = v.challenge_id
      WHERE v.author_uid = $1
        AND COALESCE(c.challenge_mode, '') = 'now'
        AND lower(c.title) LIKE '%say hello%'
      LIMIT 1
    `, [req.authUser.uid]);
    if (uploaded.rowCount === 0) {
      return res.status(400).json({ error: 'Upload a Say Hello mission video before claiming the 2 UNON reward.' });
    }

    const signature = await makeMissionRewardSignature(
      ethers.id('say-hello'),
      wallet,
      ethers.parseUnits('2', 18),
      UNON_MISSION_REWARD_MANAGER_ADDRESS
    );
    res.json({ success: true, data: signature });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prize-challenges/prepare', requireAuthenticatedUser, async (req, res) => {
  try {
    if (!UNON_PRIZE_MANAGER_ADDRESS) {
      return res.status(503).json({ error: 'UNON_PRIZE_MANAGER_ADDRESS is not configured.' });
    }

    const localChallengeId = `prize_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const onchainChallengeId = makeOnchainChallengeId(localChallengeId, req.authUser.uid);

    res.json({
      success: true,
      data: {
        localChallengeId,
        onchainChallengeId,
        tokenAddress: UNON_TOKEN_ADDRESS,
        prizeManagerAddress: UNON_PRIZE_MANAGER_ADDRESS,
        stakingManagerAddress: UNON_STAKING_MANAGER_ADDRESS,
        platinumMinimumUnon: 10000,
        voteAmountUnon: 1,
        maxEntries: 100,
        maxWinners: 10,
        operationsFeeBps: 300
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prize-challenges/confirm', requireAuthenticatedUser, async (req, res) => {
  const {
    localChallengeId,
    onchainChallengeId,
    txHash,
    title,
    hashtags,
    region,
    prizePoolUnon,
    submissionStart,
    submissionEnd,
    votingEnd,
    winnerCount,
    winnerSplitsBps,
    bgGradient,
    createdByName
  } = req.body;

  try {
    if (!UNON_PRIZE_MANAGER_ADDRESS) {
      return res.status(503).json({ error: 'UNON_PRIZE_MANAGER_ADDRESS is not configured.' });
    }
    if (!localChallengeId || !/^0x[a-fA-F0-9]{64}$/.test(String(onchainChallengeId || ''))) {
      return res.status(400).json({ error: 'Invalid prize challenge id.' });
    }
    if (!title || !hashtags) return res.status(400).json({ error: 'Title and hashtags are required.' });

    const splits = Array.isArray(winnerSplitsBps) ? winnerSplitsBps.map((item) => Number(item)) : [];
    const normalizedWinnerCount = Number(winnerCount);
    if (!Number.isInteger(normalizedWinnerCount) || normalizedWinnerCount < 1 || normalizedWinnerCount > 10) {
      return res.status(400).json({ error: 'winnerCount must be between 1 and 10.' });
    }
    if (splits.length !== normalizedWinnerCount || splits.some((item) => !Number.isInteger(item) || item <= 0)) {
      return res.status(400).json({ error: 'Winner splits must match the winner count.' });
    }
    if (splits.reduce((sum, item) => sum + item, 0) !== 10000) {
      return res.status(400).json({ error: 'Winner splits must total 10000 bps.' });
    }

    const submissionStartSec = toUnixSeconds(submissionStart);
    const submissionEndSec = toUnixSeconds(submissionEnd);
    const votingEndSec = toUnixSeconds(votingEnd);
    if (!submissionStartSec || !submissionEndSec || !votingEndSec || !(submissionStartSec < submissionEndSec && submissionEndSec < votingEndSec)) {
      return res.status(400).json({ error: 'Invalid submission/voting period.' });
    }

    const prizePoolWei = ethers.parseUnits(String(prizePoolUnon || '0'), 18);
    if (prizePoolWei <= 0n) return res.status(400).json({ error: 'Prize pool must be greater than 0.' });

    await verifyPrizeEvent(txHash, 'PrizeChallengeCreated', (event) =>
      String(event.args.challengeId).toLowerCase() === String(onchainChallengeId).toLowerCase() &&
      String(event.args.creator).toLowerCase() === String(req.authUser.uid).toLowerCase() &&
      BigInt(event.args.prizeAmount) === prizePoolWei
    );

    const inferredRegion = inferRegionDetails({ title, hashtags });
    const requestedRegion = normalizeRegion(region);
    const finalRegion = requestedRegion.includes('Global') && inferredRegion.score >= 68
      ? inferredRegion.region
      : requestedRegion;
    const status = getPrizeStatusFromTimestamps(submissionStartSec, submissionEndSec, votingEndSec);

    const result = await pool.query(`
      INSERT INTO ${TABLE_CHALLENGES} (
        id, title, hashtags, region, viral_score, participants, bg_gradient, created_by_uid, created_by_name, is_active,
        challenge_mode, notice, event_config,
        challenge_type, prize_status, prize_pool_unon, prize_pool_wei, prize_onchain_challenge_id, prize_manager_address,
        prize_create_tx_hash, prize_submission_start, prize_submission_end, prize_voting_end, prize_winner_count,
        prize_winner_splits_bps
      )
      VALUES ($1, $2, $3, $4, 1000, 0, $5, $6, $7, true, 'battle', $8, $9::jsonb, 'prize', $10, $11, $12, $13, $14, $15, to_timestamp($16), to_timestamp($17), to_timestamp($18), $19, $20::jsonb)
      RETURNING *
    `, [
      localChallengeId,
      title,
      hashtags,
      finalRegion,
      bgGradient || 'linear-gradient(135deg, #111827, #f59e0b)',
      String(req.authUser.uid).toLowerCase(),
      createdByName || req.authUser.name || 'Prize Host',
      `Prize pool: ${prizePoolUnon} UNON`,
      JSON.stringify({ type: 'video_submission_vote', custom: true }),
      status,
      String(prizePoolUnon),
      prizePoolWei.toString(),
      onchainChallengeId,
      UNON_PRIZE_MANAGER_ADDRESS,
      txHash,
      submissionStartSec,
      submissionEndSec,
      votingEndSec,
      normalizedWinnerCount,
      JSON.stringify(splits)
    ]);

    res.json({ success: true, data: mapChallengeRow(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prize-challenges/:id/status', async (req, res) => {
  try {
    const challengeRes = await pool.query(`SELECT * FROM ${TABLE_CHALLENGES} WHERE id = $1`, [req.params.id]);
    const challenge = challengeRes.rows[0];
    if (!challenge || challenge.challenge_type !== 'prize') {
      return res.status(404).json({ error: 'Prize challenge not found.' });
    }

    let onchain = null;
    const challengePrizeManagerAddress = parseOptionalAddress(challenge.prize_manager_address) || UNON_PRIZE_MANAGER_ADDRESS;
    if (challengePrizeManagerAddress && challenge.prize_onchain_challenge_id) {
      const contract = getPrizeManagerContract(provider, challengePrizeManagerAddress);
      const onchainChallenge = await contract.getChallenge(challenge.prize_onchain_challenge_id);
      const entryCount = Number(await contract.getEntryCount(challenge.prize_onchain_challenge_id));
      const entries = [];
      for (let i = 0; i < Math.min(entryCount, 100); i++) {
        const entry = await contract.getEntry(challenge.prize_onchain_challenge_id, i);
        entries.push({
          videoId: entry.videoId,
          creator: entry.creator,
          votes: Number(entry.votes || 0n)
        });
      }
      onchain = {
        creator: onchainChallenge.creator,
        prizeAmount: onchainChallenge.prizeAmount.toString(),
        finalized: onchainChallenge.finalized,
        noContest: onchainChallenge.noContest,
        winningVideoId: onchainChallenge.winningVideoId,
        winningVoteCount: Number(onchainChallenge.winningVoteCount || 0n),
        voterRewardPerWinningVote: onchainChallenge.voterRewardPerWinningVote.toString(),
        entries
      };

      const nextStatus = getPrizeStatusFromTimestamps(
        Number(onchainChallenge.submissionStart),
        Number(onchainChallenge.submissionEnd),
        Number(onchainChallenge.votingEnd),
        onchainChallenge.finalized,
        onchainChallenge.noContest
      );
      if (nextStatus !== challenge.prize_status) {
        await pool.query(`UPDATE ${TABLE_CHALLENGES} SET prize_status = $1 WHERE id = $2`, [nextStatus, req.params.id]);
        challenge.prize_status = nextStatus;
      }
    }

    res.json({ success: true, data: { challenge: mapChallengeRow(challenge), onchain } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prize-challenges/:id/videos/:videoId/register/confirm', requireAuthenticatedUser, async (req, res) => {
  const { txHash } = req.body;
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.prize_onchain_challenge_id,
        c.prize_manager_address,
        v.id AS video_id,
        v.onchain_video_id,
        v.author_wallet_address
      FROM ${TABLE_CHALLENGES} c
      JOIN ${TABLE_VIDEOS} v ON v.challenge_id = c.id
      WHERE c.id = $1 AND v.id = $2 AND c.challenge_type = 'prize'
    `, [req.params.id, req.params.videoId]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Prize video not found.' });
    if (!row.onchain_video_id) return res.status(400).json({ error: 'Video is missing its on-chain video id.' });

    const expectedCreator = normalizeAddress(row.author_wallet_address || req.authUser.uid);
    if (!expectedCreator || expectedCreator !== normalizeAddress(req.authUser.uid)) {
      return res.status(403).json({ error: 'Prize entry registration user mismatch.' });
    }

    await verifyPrizeEvent(txHash, 'EntryRegistered', (event) => (
      String(event.args.challengeId).toLowerCase() === String(row.prize_onchain_challenge_id).toLowerCase() &&
      String(event.args.videoId).toLowerCase() === String(row.onchain_video_id).toLowerCase() &&
      String(event.args.creator).toLowerCase() === expectedCreator
    ), row.prize_manager_address || UNON_PRIZE_MANAGER_ADDRESS);

    const update = await pool.query(`
      UPDATE ${TABLE_VIDEOS}
      SET prize_eligible = true,
          entry_registered_tx = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [txHash, req.params.videoId]);

    res.json({ success: true, data: update.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prize-challenges/:id/videos/:videoId/vote/confirm', requireAuthenticatedUser, async (req, res) => {
  const { txHash } = req.body;
  try {
    const result = await pool.query(`
      SELECT c.id, c.prize_onchain_challenge_id, c.prize_manager_address, v.id AS video_id, v.onchain_video_id
      FROM ${TABLE_CHALLENGES} c
      JOIN ${TABLE_VIDEOS} v ON v.challenge_id = c.id
      WHERE c.id = $1 AND v.id = $2 AND c.challenge_type = 'prize'
    `, [req.params.id, req.params.videoId]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Prize video not found.' });
    if (!row.onchain_video_id) return res.status(400).json({ error: 'Video is not registered on-chain.' });

    await verifyPrizeEvent(txHash, 'VideoVoted', (event) => (
      String(event.args.challengeId).toLowerCase() === String(row.prize_onchain_challenge_id).toLowerCase() &&
      String(event.args.videoId).toLowerCase() === String(row.onchain_video_id).toLowerCase() &&
      String(event.args.voter).toLowerCase() === String(req.authUser.uid).toLowerCase()
    ), row.prize_manager_address || UNON_PRIZE_MANAGER_ADDRESS);

    await pool.query(`
      INSERT INTO ${TABLE_PRIZE_VIDEO_VOTES} (challenge_id, video_id, voter_uid, voter_wallet_address, tx_hash)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (challenge_id, video_id, voter_wallet_address) DO UPDATE
      SET tx_hash = EXCLUDED.tx_hash
    `, [req.params.id, req.params.videoId, req.authUser.uid, String(req.authUser.uid).toLowerCase(), txHash]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prize-challenges/:id/finalize/confirm', requireAuthenticatedUser, async (req, res) => {
  const { txHash } = req.body;
  try {
    const challengeRes = await pool.query(`SELECT * FROM ${TABLE_CHALLENGES} WHERE id = $1 AND challenge_type = 'prize'`, [req.params.id]);
    const challenge = challengeRes.rows[0];
    if (!challenge) return res.status(404).json({ error: 'Prize challenge not found.' });

    const verification = await verifyPrizeEvent(txHash, 'PrizeChallengeFinalized', (event) => (
      String(event.args.challengeId).toLowerCase() === String(challenge.prize_onchain_challenge_id).toLowerCase()
    ), challenge.prize_manager_address || UNON_PRIZE_MANAGER_ADDRESS);
    const nextStatus = verification.event.args.noContest ? 'no_contest' : 'finalized';

    const update = await pool.query(`
      UPDATE ${TABLE_CHALLENGES}
      SET prize_status = $1, prize_finalize_tx_hash = $2
      WHERE id = $3
      RETURNING *
    `, [nextStatus, txHash, req.params.id]);

    res.json({ success: true, data: mapChallengeRow(update.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Upload Video directly to YouTube Shorts & DB
app.post('/api/videos/upload', upload.single('video'), async (req, res) => {
  const {
    challengeId,
    challengeTitle,
    videoTitle,
    author,
    authorUid,
    authorWorldUsername,
    uploaderComment,
    remixSourceVideoId,
    remixSourceTitle,
    remixSourceAuthor,
    remixSourcePlatform,
    remixSourceUrl
  } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No video file provided' });
  if (!process.env.YOUTUBE_REFRESH_TOKEN) {
    fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: 'YouTube API is not configured on the server.' });
  }

  try {
    let authorWalletAddress = null;
    if (authorUid) {
      const userRes = await pool.query('SELECT wallet_address FROM users WHERE id = $1', [authorUid]);
      authorWalletAddress = userRes.rows[0]?.wallet_address || normalizeAddress(authorUid);
    }
    const challengeRes = await pool.query(
      `SELECT id, title, hashtags, challenge_type, prize_onchain_challenge_id, prize_manager_address FROM ${TABLE_CHALLENGES} WHERE id = $1`,
      [challengeId]
    );
    const challenge = challengeRes.rows[0] || { id: challengeId, title: challengeTitle || challengeId, hashtags: '' };
    const isPrizeChallenge = challenge.challenge_type === 'prize';
    const videoId = `vid_${Date.now()}`;

    if (isPrizeChallenge) {
      if (!challenge.prize_onchain_challenge_id) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Prize challenge is missing its on-chain challenge id.' });
      }
      const challengePrizeManagerAddress = parseOptionalAddress(challenge.prize_manager_address);
      if (!UNON_PRIZE_MANAGER_ADDRESS || !challengePrizeManagerAddress || challengePrizeManagerAddress.toLowerCase() !== UNON_PRIZE_MANAGER_ADDRESS.toLowerCase()) {
        fs.unlinkSync(req.file.path);
        return res.status(409).json({ error: 'This prize challenge uses a legacy prize manager. Create a new prize challenge for gas-sponsored entry registration.' });
      }
      if (!prizeRegistrarWallet) {
        fs.unlinkSync(req.file.path);
        return res.status(503).json({ error: 'Prize entry signer is not configured on the backend.' });
      }
      let decoded;
      try {
        decoded = await verifyFirebaseTokenFromRequest(req);
      } catch (authError) {
        fs.unlinkSync(req.file.path);
        return res.status(401).json({ error: authError.message || 'Authentication required for prize challenge uploads.' });
      }
      if (String(decoded.uid).toLowerCase() !== String(authorUid || '').toLowerCase()) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ error: 'Prize challenge upload user mismatch.' });
      }
      if (!authorWalletAddress) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Prize challenge uploads require a World ID wallet address.' });
      }
    }

    const authorLabel = author || authorWorldUsername || authorUid || 'U&On Challenger';
    const cleanUploaderComment = String(uploaderComment || '').trim().slice(0, 500);
    const remixSource = remixSourceVideoId || remixSourceTitle ? {
      videoId: remixSourceVideoId || null,
      title: remixSourceTitle || null,
      author: remixSourceAuthor || null,
      platform: remixSourcePlatform || null,
      url: remixSourceUrl || null
    } : null;
    const uploadMetadata = getYouTubeUploadMetadata(
      challenge,
      challengeTitle || challengeId,
      authorLabel,
      cleanUploaderComment,
      remixSource,
      {
        uid: authorUid || null,
        walletAddress: authorWalletAddress || null,
        worldUsername: authorWorldUsername || null
      },
      videoTitle
    );

    console.log(`[YOUTUBE] Uploading video to YouTube for challenge ${challengeId}...`);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    // Step 1: Upload to YouTube Shorts
    const resUpload = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: uploadMetadata.title,
          description: uploadMetadata.description,
          tags: uploadMetadata.tags,
          categoryId: '24' // Entertainment
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: fs.createReadStream(req.file.path)
      }
    });

    const youtubeVideoId = resUpload.data.id;
    const finalUrl = `https://youtube.com/shorts/${youtubeVideoId}`;
    console.log(`[YOUTUBE] Upload success: ${finalUrl}`);
    
    // Cleanup temporary file
    fs.unlinkSync(req.file.path);

    // Step 2: Insert into challenge_videos
    const insertQ = `
      INSERT INTO ${TABLE_VIDEOS} (
        id, challenge_id, platform, author, author_uid, author_wallet_address, author_world_username, uploader_comment,
        view_count, video_title, video_url, external_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $10) RETURNING *
    `;
    const dbResult = await pool.query(insertQ, [
      videoId,
      challengeId,
      'youtube',
      author || authorWorldUsername || 'U&On Challenger',
      authorUid || null,
      authorWalletAddress,
      authorWorldUsername || null,
      cleanUploaderComment || null,
      uploadMetadata.title,
      finalUrl
    ]);

    if (authorUid) {
      const followers = await pool.query(`SELECT follower_uid FROM ${TABLE_FOLLOWS} WHERE followed_uid = $1`, [authorUid]);
      await Promise.all(followers.rows.slice(0, 200).map((row) => createNotification({
        recipientUid: row.follower_uid,
        actorUid: authorUid,
        type: 'new_video',
        title: 'New U&On video',
        body: `${authorLabel} posted a new challenge video.`,
        payload: { videoId, challengeId, videoUrl: finalUrl },
        requestWorldPush: true
      })));
    }

    let responseRow = dbResult.rows[0];
    let entryRegistration = null;

    if (isPrizeChallenge) {
      const onchainVideoId = makeOnchainVideoId(videoId);
      const updateRes = await pool.query(`
        UPDATE ${TABLE_VIDEOS}
        SET onchain_video_id = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `, [onchainVideoId, videoId]);
      responseRow = updateRes.rows[0] || responseRow;
      entryRegistration = await makePrizeEntryRegistration(
        challenge.prize_onchain_challenge_id,
        onchainVideoId,
        ethers.getAddress(authorWalletAddress),
        UNON_PRIZE_MANAGER_ADDRESS
      );
    }

    res.json({ success: true, data: responseRow, entryRegistration });
  } catch (err) {
    console.error('[!] YouTube Upload Error:', err.message);
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    const isInvalidGrant = err.message === 'invalid_grant' || err.response?.data?.error === 'invalid_grant';
    res.status(500).json({
      error: isInvalidGrant
        ? 'YouTube authorization expired or was revoked. Reconnect the U&On YouTube channel and update YOUTUBE_REFRESH_TOKEN.'
        : err.message
    });
  }
});

// Playback failures are session-local; only administrators can delete stored videos.
app.delete('/api/videos/:id', requireAuthenticatedUser, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM ${TABLE_VIDEOS} WHERE id = $1 RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Video not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update User Wallet
app.put('/api/users/:uid/wallet', async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) return res.status(400).json({ error: 'walletAddress is required' });
  try {
    const result = await pool.query(
      `UPDATE users SET wallet_address = $1 WHERE id = $2 RETURNING *`,
      [walletAddress.toLowerCase(), req.params.uid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Wallet address already in use' });
    res.status(500).json({ error: err.message });
  }
});

// API: Join Challenge
app.post('/api/challenges/:id/join', async (req, res) => {
  try {
    const result = await pool.query(`UPDATE ${TABLE_CHALLENGES} SET participants = participants + 1, viral_score = viral_score + 500 WHERE id = $1 RETURNING *`, [req.params.id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update Challenge
app.put('/api/challenges/:id', async (req, res) => {
  const { title, hashtags } = req.body;
  try {
    const current = await pool.query(`SELECT region FROM ${TABLE_CHALLENGES} WHERE id = $1`, [req.params.id]);
    const inferredRegion = inferRegionDetails({ title, hashtags });
    const currentRegion = normalizeRegion(current.rows[0]?.region);
    const nextRegion = currentRegion.includes('Global') && inferredRegion.score >= 68
      ? inferredRegion.region
      : current.rows[0]?.region;
    const result = await pool.query(
      `UPDATE ${TABLE_CHALLENGES} SET title = $1, hashtags = $2, region = $3 WHERE id = $4 RETURNING *`,
      [title, hashtags, nextRegion, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Challenge not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Delete Challenge (Only if no videos)
app.delete('/api/challenges/:id', async (req, res) => {
  try {
    // 1. Check video count
    const videoCheck = await pool.query(`SELECT COUNT(*) FROM ${TABLE_VIDEOS} WHERE challenge_id = $1`, [req.params.id]);
    const videoCount = parseInt(videoCheck.rows[0].count);
    
    if (videoCount > 0) {
      return res.status(400).json({ error: 'Cannot delete challenge with existing videos' });
    }

    const result = await pool.query(`DELETE FROM ${TABLE_CHALLENGES} WHERE id = $1 RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Challenge not found' });
    res.json({ success: true, message: 'Challenge deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Vote on Challenge (like or dislike) - requires userId
app.post('/api/challenges/:id/vote', async (req, res) => {
  const { userId, voteType } = req.body;
  if (!userId) return res.status(401).json({ error: 'Login required' });
  if (!['like', 'dislike'].includes(voteType)) return res.status(400).json({ error: 'Invalid vote type' });

  try {
    const challengeTypeRes = await pool.query(`SELECT challenge_type FROM ${TABLE_CHALLENGES} WHERE id = $1`, [req.params.id]);
    if (challengeTypeRes.rows[0]?.challenge_type === 'prize') {
      return res.status(400).json({ error: 'Prize challenges use 1 UNON on-chain video votes.' });
    }

    // Check existing vote
    const existing = await pool.query(
      'SELECT vote_type FROM challenge_votes WHERE challenge_id = $1 AND user_uid = $2',
      [req.params.id, userId]
    );

    if (existing.rows.length > 0) {
      const oldVote = existing.rows[0].vote_type;
      if (oldVote === voteType) {
        // Same vote = toggle off (remove vote)
        await pool.query('DELETE FROM challenge_votes WHERE challenge_id = $1 AND user_uid = $2', [req.params.id, userId]);
        const scoreChange = voteType === 'like' ? -100 : 200;
        const field = voteType === 'like' ? 'likes' : 'dislikes';
        await pool.query(`UPDATE ${TABLE_CHALLENGES} SET ${field} = GREATEST(${field} - 1, 0), viral_score = GREATEST(viral_score + $1, 0) WHERE id = $2`, [scoreChange, req.params.id]);
        const updated = await pool.query(`SELECT * FROM ${TABLE_CHALLENGES} WHERE id = $1`, [req.params.id]);
        return res.json({ success: true, data: updated.rows[0], userVote: null });
      } else {
        // Switching vote
        await pool.query('UPDATE challenge_votes SET vote_type = $1 WHERE challenge_id = $2 AND user_uid = $3', [voteType, req.params.id, userId]);
        const oldField = oldVote === 'like' ? 'likes' : 'dislikes';
        const newField = voteType === 'like' ? 'likes' : 'dislikes';
        const scoreChange = voteType === 'like' ? 300 : -300; // +100 for like, -(200) for dislike = net 300
        await pool.query(`UPDATE ${TABLE_CHALLENGES} SET ${oldField} = GREATEST(${oldField} - 1, 0), ${newField} = ${newField} + 1, viral_score = GREATEST(viral_score + $1, 0) WHERE id = $2`, [scoreChange, req.params.id]);
      }
    } else {
      // New vote
      await pool.query('INSERT INTO challenge_votes (challenge_id, user_uid, vote_type) VALUES ($1, $2, $3)', [req.params.id, userId, voteType]);
      const field = voteType === 'like' ? 'likes' : 'dislikes';
      const scoreChange = voteType === 'like' ? 100 : -200;
      await pool.query(`UPDATE ${TABLE_CHALLENGES} SET ${field} = ${field} + 1, viral_score = GREATEST(viral_score + $1, 0) WHERE id = $2`, [scoreChange, req.params.id]);
    }

    // Check weighted auto-delete
    const updated = await pool.query(`SELECT * FROM ${TABLE_CHALLENGES} WHERE id = $1`, [req.params.id]);
    const challenge = updated.rows[0];
    if (challenge) {
      const likes = parseInt(challenge.likes) || 0;
      const dislikes = parseInt(challenge.dislikes) || 0;
      const totalVotes = likes + dislikes;
      const dislikeRatio = totalVotes > 0 ? dislikes / totalVotes : 0;

      if (totalVotes >= 50 && dislikeRatio >= 0.8) {
        await pool.query(`DELETE FROM ${TABLE_VIDEOS} WHERE challenge_id = $1`, [req.params.id]);
        await pool.query('DELETE FROM challenge_votes WHERE challenge_id = $1', [req.params.id]);
        await pool.query(`DELETE FROM ${TABLE_CHALLENGES} WHERE id = $1`, [req.params.id]);
        console.log(`[MODERATION] Challenge ${req.params.id} auto-deleted (${dislikes}/${totalVotes} = ${(dislikeRatio*100).toFixed(0)}% dislikes)`);
        return res.json({ success: true, deleted: true, message: 'Challenge removed by community' });
      }
    }

    res.json({ success: true, data: challenge, userVote: voteType });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get user's votes for challenges
app.get('/api/user/votes/:uid', async (req, res) => {
  try {
    const result = await pool.query('SELECT challenge_id, vote_type FROM challenge_votes WHERE user_uid = $1', [req.params.uid]);
    const votes = {};
    result.rows.forEach((r) => { votes[r.challenge_id] = r.vote_type; });
    res.json({ success: true, data: votes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get User Challenges History
app.get('/api/user/challenges/:uid', async (req, res) => {
  const { uid } = req.params;
  try {
    const query = `
      SELECT c.*, COUNT(v.id) as video_count
      FROM ${TABLE_CHALLENGES} c
      LEFT JOIN ${TABLE_VIDEOS} v ON c.id = v.challenge_id AND COALESCE(v.is_hidden, false) = false
      WHERE c.created_by_uid = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `;
    const result = await pool.query(query, [uid]);
    const challenges = result.rows.map(mapChallengeRow);
    res.json({ success: true, data: challenges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Submit Link
app.post('/api/submit-link', async (req, res) => {
  const { challengeId, username, socialUrl, platform } = req.body;
  try {
    const id = `user_submit_${Date.now()}`;
    let thumbnailUrl = 'https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg';
    const queryStr = `INSERT INTO ${TABLE_VIDEOS} (id, challenge_id, platform, author, video_url, external_url, thumbnail_url, video_title, view_count, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP) RETURNING *`;
    const result = await pool.query(queryStr, [id, challengeId, platform || 'external', username || 'Guest', socialUrl, socialUrl, thumbnailUrl, `Entry by ${username}`, 0]);
    await pool.query(`UPDATE ${TABLE_CHALLENGES} SET participants = participants + 1 WHERE id = $1`, [challengeId]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BACKGROUND SCRAPER
async function startBackgroundScraper() {
  console.log('[BACKGROUND] Worker starting sync...');
  if (process.env.APIFY_API_TOKEN === 'DUMMY_TOKEN') return;

  const batchSize = Math.min(Math.max(parseInt(process.env.TREND_SYNC_BATCH_SIZE, 10) || 2, 1), 20);
  const tasks = [];

  // Rotate through active Trend ON topics so scheduled runs stay within the crawler budget.
  try {
    const trendRes = await pool.query(`
      SELECT c.id, c.title, c.hashtags, c.region
      FROM ${TABLE_CHALLENGES} c
      LEFT JOIN ${TABLE_VIDEOS} v ON c.id = v.challenge_id AND COALESCE(v.is_hidden, false) = false
      WHERE c.is_active = true
        AND COALESCE(c.challenge_mode, CASE WHEN c.challenge_type = 'prize' THEN 'battle' ELSE 'trend' END) = 'trend'
        AND c.hashtags IS NOT NULL
        AND c.hashtags <> ''
      GROUP BY c.id
      ORDER BY c.event_config->>'lastTrendSyncAt' ASC NULLS FIRST, COALESCE(c.created_at, NOW()) DESC
      LIMIT $1
    `, [batchSize]);
    trendRes.rows.forEach(row => {
      const tag = row.hashtags.split(' ')[0].replace('#', '');
      if (tag) tasks.push({ id: row.id, title: row.title, hashtags: row.hashtags, tag, region: row.region });
    });
  } catch (e) {}

  for (const t of tasks) {
    await syncSingleChallenge(t);
  }
}

async function syncEmptyChallengesNow(limit = 30) {
  const emptyRes = await pool.query(`
    SELECT c.id, c.title, c.hashtags, c.region
    FROM ${TABLE_CHALLENGES} c
    LEFT JOIN ${TABLE_VIDEOS} v ON c.id = v.challenge_id AND COALESCE(v.is_hidden, false) = false
    WHERE c.is_active = true
      AND COALESCE(c.challenge_mode, CASE WHEN c.challenge_type = 'prize' THEN 'battle' ELSE 'trend' END) = 'trend'
      AND c.hashtags IS NOT NULL
      AND c.hashtags <> ''
    GROUP BY c.id
    HAVING COUNT(v.id) = 0
    ORDER BY COALESCE(c.created_at, NOW()) DESC
    LIMIT $1
  `, [limit]);

  let synced = 0;
  for (const row of emptyRes.rows) {
    const tag = row.hashtags.split(' ')[0].replace('#', '');
    if (!tag) continue;
    await syncSingleChallenge({ id: row.id, title: row.title, hashtags: row.hashtags, tag, region: row.region });
    synced++;
  }

  return { requested: emptyRes.rows.length, synced };
}

async function searchYouTubeFallback(challenge, tag, acceptItem) {
  try {
    const result = await ytSearch(`#${tag} shorts`);
    const videos = (result.videos || []).slice(0, 12);
    const accepted = [];

    for (const item of videos) {
      if (!item.videoId || !item.url) continue;

      const video = {
        id: `youtube_${item.videoId}`,
        challengeId: challenge.id,
        platform: 'youtube',
        author: item.author?.name || 'YouTube Creator',
        viewCount: item.views || 0,
        videoTitle: item.title || `#${tag}`,
        videoUrl: item.url,
        thumbnailUrl: item.thumbnail || '',
        externalUrl: item.url,
        durationSeconds: item.seconds || item.duration || null
      };

      if (acceptItem(video)) accepted.push(video);
      if (accepted.length >= 3) break;
    }

    if (accepted.length > 0) {
      console.log(`[YT-FALLBACK] #${tag}: accepted ${accepted.length} YouTube result(s)`);
    }
    return accepted;
  } catch (err) {
    console.error(`[YT-FALLBACK] #${tag}:`, err.message);
    return [];
  }
}

async function syncSingleChallenge(challenge) {
  try {
    const rawTag = (challenge.tag || (challenge.hashtags ? challenge.hashtags.split(' ')[0] : '')) || '';
    const tag = normalizeTag(rawTag);
    if (!tag) return;
    
    console.log(`[SYNC] Syncing #${tag}`);

    const [insta, tiktok] = await Promise.allSettled([
      client.actor('apify/instagram-hashtag-scraper').call({
        hashtags: [tag],
        resultsType: 'reels',
        resultsLimit: 3
      }),
      client.actor('clockworks/tiktok-scraper').call({
        hashtags: [tag],
        resultsPerPage: 3,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        commentsPerPost: 0,
        maxFollowersPerProfile: 0,
        maxFollowingPerProfile: 0,
        maxRepliesPerComment: 0,
        topLevelCommentsPerPost: 0,
        proxyCountryCode: 'None'
      })
    ]);

    const merged = [];
    const rejected = [];
    const mapItem = (item, platform) => {
        const sourceId = platform === 'instagram' ? (item.shortCode || item.id) : item.id;
        if (!sourceId) return null;
        const directVideoUrl = item.videoUrl || item.mediaUrls?.[0] || '';
        const externalUrl = item.url || item.webVideoUrl || directVideoUrl;
        const vUrl = platform === 'instagram'
          ? (item.url || directVideoUrl)
          : platform === 'tiktok'
            ? (item.webVideoUrl || item.url || directVideoUrl)
            : directVideoUrl;
        if (!vUrl) return null;
        const videoTitle = item.caption || item.title || item.text || '';
        return {
            id: `${platform}_${sourceId}`,
            challengeId: challenge.id,
            platform,
            author: item.ownerUsername || item.authorMeta?.nickname || item.channelName || 'Creator',
            viewCount: item.videoPlayCount || item.playCount || item.viewCount || 0,
            videoTitle: videoTitle || `#${tag}`,
            videoUrl: vUrl,
            thumbnailUrl: item.displayUrl || item.covers?.default || item.thumbnailUrl || item.videoMeta?.coverUrl || '',
            externalUrl,
            durationSeconds: item.duration || item.durationSeconds || item.videoDuration || item.lengthSeconds || item.videoMeta?.duration || null
        };
    };

    const acceptItem = (item) => {
        const match = scoreVideoForChallenge(item, { ...challenge, tag });
        if (!match.accepted) {
            rejected.push({ platform: item.platform, score: match.score });
            return false;
        }
        item.matchScore = match.score;
        item.shortFormScore = match.shortForm?.score || 0;
        return true;
    };

    if (insta.status === 'fulfilled') {
        const { items } = await client.dataset(insta.value.defaultDatasetId).listItems();
        items.forEach(i => { const m = mapItem(i, 'instagram'); if(m && acceptItem(m)) merged.push(m); });
    }
    if (tiktok.status === 'fulfilled') {
        const { items } = await client.dataset(tiktok.value.defaultDatasetId).listItems();
        items.forEach(i => { const m = mapItem(i, 'tiktok'); if(m && acceptItem(m)) merged.push(m); });
    }
    if (insta.status === 'rejected') console.error(`[SCRAPER] Instagram #${tag}: ${insta.reason?.message || 'failed'}`);
    if (tiktok.status === 'rejected') console.error(`[SCRAPER] TikTok #${tag}: ${tiktok.reason?.message || 'failed'}`);

    if (rejected.length > 0) {
      console.log(`[FILTER] #${tag}: rejected ${rejected.length} weak matches`);
    }

    const youtubeFallback = await searchYouTubeFallback(challenge, tag, acceptItem);
    merged.push(...youtubeFallback);

    if (merged.length > 0) {
      const sortedVideos = selectDiverseVideos(merged
        .map((video) => ({
          ...video,
          shortFormScore: video.shortFormScore ?? scoreShortFormPreference(video).score
        }))
        .sort((a, b) => (
          (b.shortFormScore - a.shortFormScore)
          || ((b.matchScore || 0) - (a.matchScore || 0))
          || ((b.viewCount || 0) - (a.viewCount || 0))
        )), 6, 2);

      for (const v of sortedVideos) {
        await pool.query(`INSERT INTO ${TABLE_VIDEOS} (id, challenge_id, platform, author, view_count, video_title, video_url, thumbnail_url, external_url, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET view_count = EXCLUDED.view_count`, [v.id, v.challengeId, v.platform, v.author, v.viewCount, v.videoTitle, v.videoUrl, v.thumbnailUrl, v.externalUrl]);
      }
      const score = (sortedVideos.length * 2000) + Math.floor(sortedVideos.reduce((s, x) => s + x.viewCount, 0) / 10);
      await pool.query(`UPDATE ${TABLE_CHALLENGES} SET viral_score = $1 WHERE id = $2`, [score, challenge.id]);
    }
  } catch (err) {
    console.error(`[-] Sync Error:`, err.message);
  } finally {
    try {
      await pool.query(`
        UPDATE ${TABLE_CHALLENGES}
        SET event_config = COALESCE(event_config, '{}'::jsonb) || jsonb_build_object('lastTrendSyncAt', NOW())
        WHERE id = $1
      `, [challenge.id]);
    } catch (err) {
      console.error(`[SYNC] Failed to record sync time for ${challenge.id}:`, err.message);
    }
  }
}

app.post('/api/internal/jobs/:job', requireCronSecret, async (req, res) => {
  try {
    if (req.params.job === 'trend-sync') {
      await startBackgroundScraper();
      return res.json({ success: true, job: req.params.job });
    }

    if (req.params.job === 'video-maintenance') {
      const result = await runVideoMaintenance({ limit: req.body?.limit });
      return res.json({ success: true, job: req.params.job, result });
    }

    if (req.params.job === 'unon-sync') {
      if (isUnonIndexing) return res.status(409).json({ error: 'UNON sync is already running.' });
      isUnonIndexing = true;
      try {
        const result = await runUnonIndexSync({ reason: 'scheduled' });
        return res.json({ success: true, job: req.params.job, result });
      } finally {
        isUnonIndexing = false;
      }
    }

    return res.status(404).json({ error: 'Unknown scheduled job.' });
  } catch (err) {
    console.error(`[SCHEDULED-JOB] ${req.params.job} failed:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sync-now', requireCronSecret, async (req, res) => {
  try {
    await startBackgroundScraper();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync-empty-now', requireCronSecret, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.body?.limit, 10) || 30, 60);
    const result = await syncEmptyChallengesNow(limit);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/videos/maintenance', requireCronSecret, async (req, res) => {
  try {
    const result = await runVideoMaintenance({
      limit: req.body?.limit,
      dryRun: req.body?.dryRun === true
    });
    res.json(result);
  } catch (err) {
    console.error('[VIDEO-MAINTENANCE] Manual run failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/me', (req, res) => {
  res.json({
    success: true,
    user: {
      uid: req.authUser.uid,
      email: req.authUser.email || null
    },
    allowlistConfigured: getAdminAllowlist().size > 0
  });
});

adminRouter.get('/summary', async (req, res) => {
  try {
    const [
      challengeStats,
      videoStats,
      emptyStats,
      auditStats,
      regionStats,
      platformStats,
      challengeTypeStats,
      prizeStatusStats,
      dailyChallengeStats,
      dailyVideoStats,
      topChallengeStats
    ] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::INTEGER AS total,
          COUNT(*) FILTER (WHERE is_active = true)::INTEGER AS active,
          COUNT(*) FILTER (WHERE created_by_uid IS NOT NULL)::INTEGER AS user_created,
          COUNT(*) FILTER (WHERE is_official = true)::INTEGER AS official
        FROM ${TABLE_CHALLENGES}
      `),
      pool.query(`
        SELECT
          COUNT(*)::INTEGER AS total,
          COUNT(*) FILTER (WHERE COALESCE(is_hidden, false) = false)::INTEGER AS active,
          COUNT(*) FILTER (WHERE COALESCE(is_hidden, false) = true)::INTEGER AS hidden,
          COUNT(*) FILTER (WHERE platform = 'youtube')::INTEGER AS youtube,
          COUNT(*) FILTER (WHERE platform = 'tiktok')::INTEGER AS tiktok,
          COUNT(*) FILTER (WHERE platform = 'instagram')::INTEGER AS instagram
        FROM ${TABLE_VIDEOS}
      `),
      pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM ${TABLE_CHALLENGES} c
        LEFT JOIN ${TABLE_VIDEOS} v ON c.id = v.challenge_id AND COALESCE(v.is_hidden, false) = false
        WHERE c.is_active = true
        GROUP BY c.id
        HAVING COUNT(v.id) = 0
      `),
      pool.query(`SELECT COUNT(*)::INTEGER AS total FROM ${TABLE_ADMIN_AUDIT_LOGS}`),
      pool.query(`
        SELECT COALESCE(NULLIF(region, ''), 'Global') AS label, COUNT(*)::INTEGER AS value
        FROM ${TABLE_CHALLENGES}
        WHERE is_active = true
        GROUP BY COALESCE(NULLIF(region, ''), 'Global')
        ORDER BY value DESC, label ASC
        LIMIT 10
      `),
      pool.query(`
        SELECT COALESCE(NULLIF(platform, ''), 'unknown') AS label, COUNT(*)::INTEGER AS value
        FROM ${TABLE_VIDEOS}
        WHERE COALESCE(is_hidden, false) = false
        GROUP BY COALESCE(NULLIF(platform, ''), 'unknown')
        ORDER BY value DESC, label ASC
      `),
      pool.query(`
        SELECT COALESCE(NULLIF(challenge_type, ''), 'standard') AS label, COUNT(*)::INTEGER AS value
        FROM ${TABLE_CHALLENGES}
        WHERE is_active = true
        GROUP BY COALESCE(NULLIF(challenge_type, ''), 'standard')
        ORDER BY value DESC, label ASC
      `),
      pool.query(`
        SELECT COALESCE(NULLIF(prize_status, ''), 'none') AS label, COUNT(*)::INTEGER AS value
        FROM ${TABLE_CHALLENGES}
        WHERE challenge_type = 'prize'
        GROUP BY COALESCE(NULLIF(prize_status, ''), 'none')
        ORDER BY value DESC, label ASC
      `),
      pool.query(`
        SELECT day::DATE AS day, COALESCE(counts.value, 0)::INTEGER AS value
        FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') AS day
        LEFT JOIN (
          SELECT DATE(created_at) AS created_day, COUNT(*) AS value
          FROM ${TABLE_CHALLENGES}
          WHERE created_at >= CURRENT_DATE - INTERVAL '13 days'
          GROUP BY DATE(created_at)
        ) counts ON counts.created_day = day::DATE
        ORDER BY day ASC
      `),
      pool.query(`
        SELECT day::DATE AS day, COALESCE(counts.value, 0)::INTEGER AS value
        FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') AS day
        LEFT JOIN (
          SELECT DATE(updated_at) AS updated_day, COUNT(*) AS value
          FROM ${TABLE_VIDEOS}
          WHERE updated_at >= CURRENT_DATE - INTERVAL '13 days'
          GROUP BY DATE(updated_at)
        ) counts ON counts.updated_day = day::DATE
        ORDER BY day ASC
      `),
      pool.query(`
        SELECT
          c.id,
          c.title,
          COALESCE(NULLIF(c.region, ''), 'Global') AS region,
          c.viral_score,
          COUNT(v.id)::INTEGER AS video_count
        FROM ${TABLE_CHALLENGES} c
        LEFT JOIN ${TABLE_VIDEOS} v ON v.challenge_id = c.id AND COALESCE(v.is_hidden, false) = false
        WHERE c.is_active = true
        GROUP BY c.id, c.title, c.region, c.viral_score
        ORDER BY COUNT(v.id) DESC, c.viral_score DESC NULLS LAST
        LIMIT 8
      `)
    ]);

    res.json({
      success: true,
      data: {
        challenges: challengeStats.rows[0],
        videos: videoStats.rows[0],
        emptyChallenges: emptyStats.rowCount,
        auditLogCount: auditStats.rows[0]?.total || 0,
        jobs: {
          videoMaintenanceEnabled: process.env.VIDEO_MAINTENANCE_ENABLED !== 'false',
          videoMaintenanceIntervalHours: VIDEO_MAINTENANCE_INTERVAL_MS / 3600000,
          videoMaintenanceLimit: VIDEO_MAINTENANCE_LIMIT,
          isVideoMaintenanceRunning
        },
        integrations: {
          youtubeConfigured: !!process.env.YOUTUBE_REFRESH_TOKEN,
          apifyConfigured: !!process.env.APIFY_API_TOKEN && process.env.APIFY_API_TOKEN !== 'DUMMY_TOKEN'
        },
        visualization: {
          regions: regionStats.rows,
          platforms: platformStats.rows,
          challengeTypes: challengeTypeStats.rows,
          prizeStatuses: prizeStatusStats.rows,
          dailyChallenges: dailyChallengeStats.rows,
          dailyVideos: dailyVideoStats.rows,
          topChallenges: topChallengeStats.rows
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/videos', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const status = String(req.query.status || 'active');
    const q = String(req.query.q || '').trim();
    const challengeId = String(req.query.challengeId || '').trim();
    const params = [];
    const where = [];

    if (status === 'hidden') {
      where.push('COALESCE(v.is_hidden, false) = true');
    } else if (status !== 'all') {
      where.push('COALESCE(v.is_hidden, false) = false');
    }

    if (challengeId) {
      params.push(challengeId);
      where.push(`v.challenge_id = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      where.push(`(v.video_title ILIKE $${params.length} OR v.author ILIKE $${params.length} OR v.video_url ILIKE $${params.length} OR c.title ILIKE $${params.length})`);
    }

    params.push(limit);
    const result = await pool.query(`
      SELECT
        v.id,
        v.challenge_id,
        c.title AS challenge_title,
        c.region AS challenge_region,
        v.platform,
        v.author,
        v.view_count,
        v.video_title,
        v.video_url,
        v.external_url,
        v.thumbnail_url,
        v.is_hidden,
        v.hidden_reason,
        v.hidden_at,
        v.updated_at
      FROM ${TABLE_VIDEOS} v
      LEFT JOIN ${TABLE_CHALLENGES} c ON c.id = v.challenge_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY COALESCE(v.updated_at, NOW() - INTERVAL '30 days') DESC
      LIMIT $${params.length}
    `, params);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/videos/add-url', async (req, res) => {
  const challengeId = String(req.body?.challengeId || '').trim();
  const rawUrl = String(req.body?.url || '').trim();
  const title = String(req.body?.title || '').trim().slice(0, 180);
  const author = String(req.body?.author || '').trim().slice(0, 100);

  if (!challengeId) return res.status(400).json({ error: 'challengeId is required' });
  if (!rawUrl) return res.status(400).json({ error: 'Shorts URL is required' });

  const parsed = normalizeYouTubeShortsUrl(rawUrl);
  if (!parsed) {
    return res.status(400).json({ error: 'Enter a valid YouTube Shorts, YouTube watch, or youtu.be URL' });
  }

  try {
    const challenge = await pool.query(`SELECT id, title FROM ${TABLE_CHALLENGES} WHERE id = $1`, [challengeId]);
    if (challenge.rows.length === 0) return res.status(404).json({ error: 'Challenge not found' });

    const videoId = `youtube_${parsed.videoId}`;
    const existing = await pool.query(`SELECT id, challenge_id FROM ${TABLE_VIDEOS} WHERE id = $1`, [videoId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `This YouTube video is already registered in challenge ${existing.rows[0].challenge_id}` });
    }

    const result = await pool.query(`
      INSERT INTO ${TABLE_VIDEOS} (
        id, challenge_id, platform, author, view_count, video_title, video_url, thumbnail_url, external_url, updated_at
      )
      VALUES ($1, $2, 'youtube', $3, 0, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      videoId,
      challengeId,
      author || 'Admin curated',
      title || `${challenge.rows[0].title} Shorts`,
      parsed.videoUrl,
      parsed.thumbnailUrl,
      parsed.videoUrl
    ]);

    await recalculateChallengeScore(challengeId);
    await logAdminAction(req, 'video.add_url', 'video', videoId, {
      challengeId,
      sourceUrl: rawUrl,
      normalizedUrl: parsed.videoUrl
    });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/videos/:id/hide', async (req, res) => {
  const reason = String(req.body?.reason || 'admin_hidden').slice(0, 500);
  try {
    const result = await pool.query(`
      UPDATE ${TABLE_VIDEOS}
      SET is_hidden = true,
          hidden_reason = $1,
          hidden_at = CURRENT_TIMESTAMP,
          hidden_by_uid = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [reason, req.authUser.uid, req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Video not found' });
    await logAdminAction(req, 'video.hide', 'video', req.params.id, { reason });
    await recalculateChallengeScore(result.rows[0].challenge_id);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/videos/:id/restore', async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE ${TABLE_VIDEOS}
      SET is_hidden = false,
          hidden_reason = NULL,
          hidden_at = NULL,
          hidden_by_uid = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Video not found' });
    await logAdminAction(req, 'video.restore', 'video', req.params.id, {});
    await recalculateChallengeScore(result.rows[0].challenge_id);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.delete('/videos/:id', async (req, res) => {
  try {
    const current = await pool.query(`SELECT id, challenge_id, is_hidden FROM ${TABLE_VIDEOS} WHERE id = $1`, [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Video not found' });
    if (current.rows[0].is_hidden !== true) {
      return res.status(400).json({ error: 'Only hidden videos can be permanently deleted from admin' });
    }

    const challengeId = current.rows[0].challenge_id;
    const result = await pool.query(`DELETE FROM ${TABLE_VIDEOS} WHERE id = $1 RETURNING *`, [req.params.id]);
    await logAdminAction(req, 'video.delete', 'video', req.params.id, { challengeId });
    await recalculateChallengeScore(challengeId);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/videos/:id/move', async (req, res) => {
  const targetChallengeId = String(req.body?.challengeId || '').trim();
  if (!targetChallengeId) return res.status(400).json({ error: 'challengeId is required' });

  try {
    const target = await pool.query(`SELECT id, title FROM ${TABLE_CHALLENGES} WHERE id = $1`, [targetChallengeId]);
    if (target.rows.length === 0) return res.status(404).json({ error: 'Target challenge not found' });

    const current = await pool.query(`SELECT challenge_id FROM ${TABLE_VIDEOS} WHERE id = $1`, [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Video not found' });

    const fromChallengeId = current.rows[0].challenge_id;
    const result = await pool.query(`
      UPDATE ${TABLE_VIDEOS}
      SET challenge_id = $1,
          is_hidden = false,
          hidden_reason = NULL,
          hidden_at = NULL,
          hidden_by_uid = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [targetChallengeId, req.params.id]);

    await logAdminAction(req, 'video.move', 'video', req.params.id, { fromChallengeId, toChallengeId: targetChallengeId });
    await recalculateChallengeScore(fromChallengeId);
    await recalculateChallengeScore(targetChallengeId);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/challenges', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.title, c.hashtags, c.region, c.is_active, COUNT(v.id)::INTEGER AS video_count
      FROM ${TABLE_CHALLENGES} c
      LEFT JOIN ${TABLE_VIDEOS} v ON v.challenge_id = c.id AND COALESCE(v.is_hidden, false) = false
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 300
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/challenges/:id/update', async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const hashtags = String(req.body?.hashtags || '').trim();
  const region = normalizeRegion(req.body?.region || '');
  const isActive = req.body?.isActive;
  if (!title || !hashtags || !region) return res.status(400).json({ error: 'title, hashtags, and region are required' });

  try {
    const result = await pool.query(`
      UPDATE ${TABLE_CHALLENGES}
      SET title = $1,
          hashtags = $2,
          region = $3,
          is_active = COALESCE($4, is_active)
      WHERE id = $5
      RETURNING *
    `, [title, hashtags, region, typeof isActive === 'boolean' ? isActive : null, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Challenge not found' });
    await logAdminAction(req, 'challenge.update', 'challenge', req.params.id, { title, hashtags, region, isActive });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/jobs/video-maintenance', async (req, res) => {
  try {
    const result = await runVideoMaintenance({
      limit: req.body?.limit,
      dryRun: req.body?.dryRun === true
    });
    await logAdminAction(req, req.body?.dryRun === true ? 'job.video_maintenance.dry_run' : 'job.video_maintenance.run', 'job', 'video-maintenance', result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/jobs/sync-empty', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.body?.limit, 10) || 30, 60);
    const result = await syncEmptyChallengesNow(limit);
    await logAdminAction(req, 'job.sync_empty.run', 'job', 'sync-empty', result);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function buildUnonAdminReport(options = {}) {
  if (!ethers.isAddress(UNON_TOKEN_ADDRESS)) {
    throw new Error('UNON_TOKEN_ADDRESS is not a valid contract address');
  }

  const tokenAddress = ethers.getAddress(UNON_TOKEN_ADDRESS);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const warnings = [];
  const trackedWallets = getUnonTrackedWallets();
  const validWallets = trackedWallets.filter((wallet) => wallet.address);

  const safeRead = async (label, fallback, reader, timeoutMs = UNON_RPC_READ_TIMEOUT_MS) => {
    try {
      return await withTimeout(Promise.resolve().then(reader), timeoutMs, label);
    } catch (error) {
      warnings.push(`${label}: ${error.message}`);
      return fallback;
    }
  };

  const [network, latestBlock, name, symbol, decimals, totalSupply] = await Promise.all([
    safeRead('network', { chainId: BigInt(WORLD_CHAIN_CHAIN_ID) }, () => provider.getNetwork()),
    safeRead('latest block', 0, () => provider.getBlockNumber()),
    safeRead('token name', 'U&On', () => token.name()),
    safeRead('token symbol', 'UNON', () => token.symbol()),
    safeRead('token decimals', 18, () => token.decimals()),
    safeRead('token total supply', 0n, () => token.totalSupply())
  ]);

  const normalizedDecimals = Number(decimals || 18);
  const activeTokenAddress = tokenAddress.toLowerCase();
  const migratedWelcomeClaims = loadMigratedWelcomeClaims(normalizedDecimals, activeTokenAddress, warnings);
  const migratedWelcomeClaimAmountRaw = migratedWelcomeClaims.reduce((sum, claim) => sum + claim.amountRaw, 0n);
  const indexedWalletBalances = new Map();
  if (validWallets.length > 0) {
    try {
      const indexedBalanceResult = await pool.query(`
        WITH wallet_addresses AS (
          SELECT UNNEST($1::text[]) AS address
        ),
        deltas AS (
          SELECT to_address AS address, amount_raw AS delta_raw
          FROM ${TABLE_UNON_TRANSFERS}
          WHERE token_address = $2 AND to_address = ANY($1::text[])
          UNION ALL
          SELECT from_address AS address, -amount_raw AS delta_raw
          FROM ${TABLE_UNON_TRANSFERS}
          WHERE token_address = $2 AND from_address = ANY($1::text[])
        )
        SELECT w.address, COALESCE(SUM(d.delta_raw), 0)::text AS balance_raw
        FROM wallet_addresses w
        LEFT JOIN deltas d ON d.address = w.address
        GROUP BY w.address
      `, [validWallets.map((wallet) => wallet.address.toLowerCase()), activeTokenAddress]);
      indexedBalanceResult.rows.forEach((row) => {
        indexedWalletBalances.set(row.address, rawDecimalToBigInt(row.balance_raw));
      });
    } catch (error) {
      warnings.push(`indexed wallet balances: ${error.message}`);
    }
  }

  const balanceResults = await Promise.all(
    trackedWallets.map(async (wallet) => {
      if (!wallet.address) {
        return {
          ...wallet,
          rawBalance: 0n,
          balance: '0',
          balanceNumber: 0,
          shareOfSupply: 0,
          configured: false,
          balanceReadOk: false,
          balanceReadError: 'address not configured',
          rpcBalanceReadOk: false,
          rpcBalanceReadError: 'address not configured',
          balanceSource: 'missing'
        };
      }

      let rawBalance = 0n;
      let rpcBalanceReadOk = true;
      let rpcBalanceReadError = null;
      let balanceReadOk = true;
      let balanceReadError = null;
      let balanceSource = 'onchain';
      try {
        rawBalance = await withTimeout(token.balanceOf(wallet.address), Math.max(UNON_RPC_READ_TIMEOUT_MS, 15000), `balance ${wallet.label}`);
      } catch (firstError) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 350));
          rawBalance = await withTimeout(token.balanceOf(wallet.address), Math.max(UNON_RPC_READ_TIMEOUT_MS, 15000), `balance retry ${wallet.label}`);
        } catch (error) {
        rpcBalanceReadOk = false;
        rpcBalanceReadError = error.message;
        const indexedBalance = indexedWalletBalances.get(wallet.address.toLowerCase());
        if (indexedBalance !== undefined) {
          rawBalance = indexedBalance;
          balanceSource = 'indexed-cache';
          warnings.push(`balance ${wallet.label}: ${error.message}; using indexed UNON holder balance`);
        } else {
          balanceReadOk = false;
          balanceReadError = error.message;
          balanceSource = 'unavailable';
          warnings.push(`balance ${wallet.label}: ${error.message}`);
        }
        }
      }
      const shareOfSupply = totalSupply > 0n ? Number((rawBalance * 1000000n) / totalSupply) / 10000 : 0;
      const plannedAmount = UNON_TOKENOMICS_PLAN_BY_KEY.get(wallet.key)?.amount || 0;
      const plannedRaw = plannedAmount > 0 ? ethers.parseUnits(String(plannedAmount), normalizedDecimals) : 0n;
      return {
        ...wallet,
        rawBalance,
        balance: formatTokenUnits(rawBalance, normalizedDecimals),
        balanceNumber: tokenAmountNumber(rawBalance, normalizedDecimals),
        plannedRaw,
        plannedAmount,
        plannedAmountNumber: plannedAmount,
        releasedRaw: plannedRaw > rawBalance ? plannedRaw - rawBalance : 0n,
        releasedNumber: plannedRaw > rawBalance ? tokenAmountNumber(plannedRaw - rawBalance, normalizedDecimals) : 0,
        remainingShareOfPlan: plannedRaw > 0n ? Number((rawBalance * 1000000n) / plannedRaw) / 10000 : null,
        shareOfSupply,
        configured: true,
        balanceReadOk,
        balanceReadError,
        rpcBalanceReadOk,
        rpcBalanceReadError,
        balanceSource,
        explorerUrl: makeExplorerUrl('address', wallet.address)
      };
    })
  );

  const trackedRaw = balanceResults.reduce((sum, row) => sum + (row.rawBalance || 0n), 0n);
  const untrackedRaw = totalSupply > trackedRaw ? totalSupply - trackedRaw : 0n;
  const untrackedNumber = tokenAmountNumber(untrackedRaw, normalizedDecimals);
  const locationSummary = balanceResults
    .filter((row) => row.configured && Number(row.balanceNumber || 0) > 0)
    .map((row) => ({
      key: row.key,
      label: row.label,
      category: row.category,
      envKey: row.envKey,
      address: row.address,
      balance: row.balance,
      balanceNumber: row.balanceNumber,
      plannedAmountNumber: row.plannedAmountNumber || 0,
      releasedNumber: row.releasedNumber || 0,
      shareOfSupply: row.shareOfSupply,
      remainingShareOfPlan: row.remainingShareOfPlan,
      balanceReadOk: row.balanceReadOk,
      balanceReadError: row.balanceReadError,
      rpcBalanceReadOk: row.rpcBalanceReadOk,
      rpcBalanceReadError: row.rpcBalanceReadError,
      balanceSource: row.balanceSource,
      explorerUrl: row.explorerUrl || null
    }))
    .sort((a, b) => b.balanceNumber - a.balanceNumber);
  if (untrackedRaw > 0n) {
    locationSummary.push({
      key: 'untracked',
      label: 'Untracked holders',
      category: 'Outside configured wallets',
      envKey: 'UNON_TRACKED_WALLETS',
      address: null,
      balance: formatTokenUnits(untrackedRaw, normalizedDecimals),
      balanceNumber: untrackedNumber,
      plannedAmountNumber: 0,
      releasedNumber: 0,
      shareOfSupply: totalSupply > 0n ? Number((untrackedRaw * 1000000n) / totalSupply) / 10000 : 0,
      remainingShareOfPlan: null,
      explorerUrl: null
    });
  }
  const categoryMap = new Map();
  const onboardingWallet = balanceResults.find((row) => row.key === 'onboarding');
  const onboardingPlan = UNON_TOKENOMICS_PLAN.find((row) => row.key === 'onboarding');
  let onboardingRewardRaw = ethers.parseUnits(String(UNON_DEFAULT_ONBOARDING_REWARD), normalizedDecimals);

  if (onboardingWallet?.address) {
    const onboardingContract = new ethers.Contract(onboardingWallet.address, ONBOARDING_MANAGER_ABI, provider);
    onboardingRewardRaw = await safeRead(
      'onboarding reward amount',
      onboardingRewardRaw,
      () => onboardingContract.rewardAmount()
    );
  }

  const onboardingPlanRaw = ethers.parseUnits(String(onboardingPlan?.amount || 0), normalizedDecimals);
  const onboardingCurrentRaw = onboardingWallet?.rawBalance || 0n;
  let onboardingUsedRaw = onboardingPlanRaw > onboardingCurrentRaw ? onboardingPlanRaw - onboardingCurrentRaw : 0n;
  let onboardingClaimedCount = onboardingRewardRaw > 0n ? Number(onboardingUsedRaw / onboardingRewardRaw) : 0;

  balanceResults.forEach((row) => {
    const category = row.category || 'Uncategorized';
    const current = categoryMap.get(category) || { category, rawBalance: 0n, wallets: 0 };
    current.rawBalance += row.rawBalance || 0n;
    current.wallets += row.configured ? 1 : 0;
    categoryMap.set(category, current);
  });

  const categorySummary = Array.from(categoryMap.values())
    .map((row) => ({
      category: row.category,
      wallets: row.wallets,
      balance: formatTokenUnits(row.rawBalance, normalizedDecimals),
      balanceNumber: tokenAmountNumber(row.rawBalance, normalizedDecimals),
      shareOfSupply: totalSupply > 0n ? Number((row.rawBalance * 1000000n) / totalSupply) / 10000 : 0
    }))
    .sort((a, b) => b.balanceNumber - a.balanceNumber);

  const movementByAddress = new Map(
    validWallets.map((wallet) => [
      wallet.address.toLowerCase(),
      {
        key: wallet.key,
        label: wallet.label,
        category: wallet.category,
        address: wallet.address,
        inboundRaw: 0n,
        outboundRaw: 0n,
        transferCount: 0
      }
    ])
  );

  const walletByAddress = new Map(validWallets.map((wallet) => [wallet.address.toLowerCase(), wallet]));
  const indexStatus = await getUnonIndexStatus({ refreshLatest: false });
  const fromBlock = indexStatus.fromBlock;
  const toBlock = indexStatus.lastSyncedBlock;
  const walletAddresses = validWallets.map((wallet) => wallet.address.toLowerCase());

  if (walletAddresses.length > 0) {
    const [inboundRows, outboundRows] = await Promise.all([
      pool.query(`
        SELECT to_address AS address, COALESCE(SUM(amount_raw), 0)::text AS amount_raw, COUNT(*)::INTEGER AS transfer_count
        FROM ${TABLE_UNON_TRANSFERS}
        WHERE token_address = $2 AND to_address = ANY($1::text[])
        GROUP BY to_address
      `, [walletAddresses, activeTokenAddress]),
      pool.query(`
        SELECT from_address AS address, COALESCE(SUM(amount_raw), 0)::text AS amount_raw, COUNT(*)::INTEGER AS transfer_count
        FROM ${TABLE_UNON_TRANSFERS}
        WHERE token_address = $2 AND from_address = ANY($1::text[])
        GROUP BY from_address
      `, [walletAddresses, activeTokenAddress])
    ]);

    inboundRows.rows.forEach((row) => {
      const movement = movementByAddress.get(row.address);
      if (!movement) return;
      movement.inboundRaw = rawDecimalToBigInt(row.amount_raw);
      movement.transferCount += Number(row.transfer_count || 0);
    });

    outboundRows.rows.forEach((row) => {
      const movement = movementByAddress.get(row.address);
      if (!movement) return;
      movement.outboundRaw = rawDecimalToBigInt(row.amount_raw);
      movement.transferCount += Number(row.transfer_count || 0);
    });
  }

  const recentTransferResult = walletAddresses.length > 0
    ? await pool.query(`
      SELECT tx_hash, log_index, block_number, block_timestamp, from_address, to_address, amount_raw::text AS amount_raw
      FROM ${TABLE_UNON_TRANSFERS}
      WHERE token_address = $3 AND (from_address = ANY($1::text[]) OR to_address = ANY($1::text[]))
      ORDER BY block_number DESC, log_index DESC
      LIMIT $2
    `, [walletAddresses, UNON_TRANSFER_LOG_LIMIT, activeTokenAddress])
    : { rows: [] };

  const recentTransfers = recentTransferResult.rows.map((row) => {
    const from = ethers.getAddress(row.from_address);
    const to = ethers.getAddress(row.to_address);
    const rawAmount = rawDecimalToBigInt(row.amount_raw);
    const fromTracked = walletByAddress.get(row.from_address);
    const toTracked = walletByAddress.get(row.to_address);
    return {
      transactionHash: row.tx_hash,
      blockNumber: Number(row.block_number),
      logIndex: Number(row.log_index),
      from,
      to,
      fromLabel: fromTracked?.label || null,
      toLabel: toTracked?.label || null,
      amount: formatTokenUnits(rawAmount, normalizedDecimals),
      amountNumber: tokenAmountNumber(rawAmount, normalizedDecimals),
      timestamp: row.block_timestamp instanceof Date ? row.block_timestamp.toISOString() : row.block_timestamp,
      explorerUrl: makeExplorerUrl('tx', row.tx_hash)
    };
  });

  const mergeHolderIdentity = (target, address, identity) => {
    if (!address || !identity) return;
    const key = String(address).toLowerCase();
    const current = target.get(key) || {};
    target.set(key, {
      ...current,
      ...Object.fromEntries(Object.entries(identity).filter(([, value]) => value !== null && value !== undefined && value !== ''))
    });
  };

  const [holderCountResult, transferCountResult, topHolderResult, claimStatsResult, claimRowsResult] = await Promise.all([
    pool.query(`
      WITH deltas AS (
        SELECT to_address AS address, amount_raw AS delta_raw
        FROM ${TABLE_UNON_TRANSFERS}
        WHERE token_address = $1
        UNION ALL
        SELECT from_address AS address, -amount_raw AS delta_raw
        FROM ${TABLE_UNON_TRANSFERS}
        WHERE token_address = $1
      ),
      balances AS (
        SELECT address, SUM(delta_raw) AS balance_raw
        FROM deltas
        GROUP BY address
        HAVING SUM(delta_raw) > 0
      )
      SELECT COUNT(*)::INTEGER AS count FROM balances
    `, [activeTokenAddress]),
    pool.query(`SELECT COUNT(*)::INTEGER AS count FROM ${TABLE_UNON_TRANSFERS} WHERE token_address = $1`, [activeTokenAddress]),
    pool.query(`
      WITH deltas AS (
        SELECT to_address AS address, amount_raw AS delta_raw
        FROM ${TABLE_UNON_TRANSFERS}
        WHERE token_address = $2
        UNION ALL
        SELECT from_address AS address, -amount_raw AS delta_raw
        FROM ${TABLE_UNON_TRANSFERS}
        WHERE token_address = $2
      ),
      balances AS (
        SELECT address, SUM(delta_raw) AS balance_raw
        FROM deltas
        GROUP BY address
        HAVING SUM(delta_raw) > 0
      ),
      top_holders AS (
        SELECT address, balance_raw FROM balances
        ORDER BY balance_raw DESC
        LIMIT $1
      ),
      inbound AS (
        SELECT to_address AS address, COALESCE(SUM(amount_raw), 0) AS inbound_raw, COUNT(*)::INTEGER AS inbound_count, MAX(block_number) AS last_inbound_block
        FROM ${TABLE_UNON_TRANSFERS}
        WHERE token_address = $2 AND to_address IN (SELECT address FROM top_holders)
        GROUP BY to_address
      ),
      outbound AS (
        SELECT from_address AS address, COALESCE(SUM(amount_raw), 0) AS outbound_raw, COUNT(*)::INTEGER AS outbound_count, MAX(block_number) AS last_outbound_block
        FROM ${TABLE_UNON_TRANSFERS}
        WHERE token_address = $2 AND from_address IN (SELECT address FROM top_holders)
        GROUP BY from_address
      )
      SELECT
        h.address,
        h.balance_raw::text AS balance_raw,
        COALESCE(i.inbound_raw, 0)::text AS inbound_raw,
        COALESCE(o.outbound_raw, 0)::text AS outbound_raw,
        COALESCE(i.inbound_count, 0)::INTEGER AS inbound_count,
        COALESCE(o.outbound_count, 0)::INTEGER AS outbound_count,
        GREATEST(COALESCE(i.last_inbound_block, 0), COALESCE(o.last_outbound_block, 0)) AS last_movement_block
      FROM top_holders h
      LEFT JOIN inbound i ON i.address = h.address
      LEFT JOIN outbound o ON o.address = h.address
      ORDER BY h.balance_raw DESC
    `, [UNON_HOLDER_LIMIT, activeTokenAddress]),
    pool.query(`
      SELECT COUNT(*)::INTEGER AS claim_count, COALESCE(SUM(amount_raw), 0)::text AS amount_raw
      FROM ${TABLE_UNON_WELCOME_CLAIMS}
      WHERE token_address = $1
    `, [activeTokenAddress]),
    pool.query(`
      WITH claim_rows AS (
        SELECT tx_hash, log_index, block_number, block_timestamp, identity_nullifier, recipient, amount_raw
        FROM ${TABLE_UNON_WELCOME_CLAIMS}
        WHERE token_address = $2
        ORDER BY block_number DESC, log_index DESC
        LIMIT $1
      ),
      recipients AS (
        SELECT DISTINCT recipient FROM claim_rows
      ),
      inbound AS (
        SELECT to_address AS recipient, COALESCE(SUM(amount_raw), 0) AS inbound_raw, COUNT(*)::INTEGER AS inbound_count
        FROM ${TABLE_UNON_TRANSFERS}
        WHERE token_address = $2 AND to_address IN (SELECT recipient FROM recipients)
        GROUP BY to_address
      ),
      outbound AS (
        SELECT from_address AS recipient, COALESCE(SUM(amount_raw), 0) AS outbound_raw, COUNT(*)::INTEGER AS outbound_count
        FROM ${TABLE_UNON_TRANSFERS}
        WHERE token_address = $2 AND from_address IN (SELECT recipient FROM recipients)
        GROUP BY from_address
      )
      SELECT
        c.tx_hash,
        c.log_index,
        c.block_number,
        c.block_timestamp,
        c.identity_nullifier,
        c.recipient,
        c.amount_raw::text AS amount_raw,
        '0'::text AS current_balance_raw,
        COALESCE(i.inbound_raw, 0)::text AS inbound_raw,
        COALESCE(o.outbound_raw, 0)::text AS outbound_raw,
        COALESCE(i.inbound_count, 0)::INTEGER AS inbound_count,
        COALESCE(o.outbound_count, 0)::INTEGER AS outbound_count
      FROM claim_rows c
      LEFT JOIN inbound i ON i.recipient = c.recipient
      LEFT JOIN outbound o ON o.recipient = c.recipient
      ORDER BY c.block_number DESC, c.log_index DESC
    `, [UNON_WELCOME_RECIPIENT_LIMIT, activeTokenAddress])
  ]);

  const topHolderAddresses = topHolderResult.rows.map((row) => String(row.address || '').toLowerCase()).filter(Boolean);
  const holderIdentityByAddress = new Map();
  const topHolderBalanceByAddress = new Map();

  validWallets.forEach((wallet) => {
    if (!wallet.address) return;
    mergeHolderIdentity(holderIdentityByAddress, wallet.address, {
      label: wallet.label,
      category: wallet.category,
      identityType: 'ops_wallet'
    });
  });

  if (topHolderAddresses.length > 0) {
    await Promise.all([
      ...topHolderAddresses.map(async (address) => {
        try {
          const checksummed = ethers.getAddress(address);
          const rawBalance = await withTimeout(
            token.balanceOf(checksummed),
            Math.max(UNON_RPC_READ_TIMEOUT_MS, 15000),
            `top holder balance ${checksummed}`
          );
          topHolderBalanceByAddress.set(address, rawBalance);
        } catch (error) {
          warnings.push(`top holder balance ${address}: ${error.message}; using indexed cache`);
        }
      }),
      pool.query(`
        SELECT LOWER(wallet_address) AS address, creator_handle, id
        FROM users
        WHERE wallet_address IS NOT NULL AND LOWER(wallet_address) = ANY($1::text[])
      `, [topHolderAddresses])
        .then((result) => {
          result.rows.forEach((row) => mergeHolderIdentity(holderIdentityByAddress, row.address, {
            worldId: row.creator_handle ? `@${String(row.creator_handle).replace(/^@+/, '')}` : `World ID ${String(row.id || '').slice(0, 10)}`,
            identityType: 'world_id_user'
          }));
        })
        .catch((error) => warnings.push(`holder user identity lookup: ${error.message}`)),
      pool.query(`
        SELECT DISTINCT ON (LOWER(author_wallet_address))
          LOWER(author_wallet_address) AS address,
          author_world_username,
          author_uid,
          author
        FROM ${TABLE_VIDEOS}
        WHERE author_wallet_address IS NOT NULL AND LOWER(author_wallet_address) = ANY($1::text[])
        ORDER BY LOWER(author_wallet_address), updated_at DESC NULLS LAST
      `, [topHolderAddresses])
        .then((result) => {
          result.rows.forEach((row) => {
            const worldUsername = row.author_world_username ? `@${String(row.author_world_username).replace(/^@+/, '')}` : null;
            mergeHolderIdentity(holderIdentityByAddress, row.address, {
              worldId: worldUsername || row.author || null,
              identityType: worldUsername ? 'world_username' : 'video_author'
            });
          });
        })
        .catch((error) => warnings.push(`holder video identity lookup: ${error.message}`)),
      pool.query(`
        SELECT DISTINCT ON (LOWER(wallet_address))
          LOWER(wallet_address) AS address,
          world_username
        FROM ${TABLE_NOTIFICATION_PERMISSIONS}
        WHERE wallet_address IS NOT NULL AND LOWER(wallet_address) = ANY($1::text[])
        ORDER BY LOWER(wallet_address), updated_at DESC NULLS LAST
      `, [topHolderAddresses])
        .then((result) => {
          result.rows.forEach((row) => mergeHolderIdentity(holderIdentityByAddress, row.address, {
            worldId: row.world_username ? `@${String(row.world_username).replace(/^@+/, '')}` : null,
            identityType: 'world_username'
          }));
        })
        .catch((error) => warnings.push(`holder notification identity lookup: ${error.message}`)),
      pool.query(`
        SELECT DISTINCT ON (recipient)
          recipient AS address,
          identity_nullifier
        FROM ${TABLE_UNON_WELCOME_CLAIMS}
        WHERE token_address = $2 AND recipient = ANY($1::text[])
        ORDER BY recipient, block_number DESC, log_index DESC
      `, [topHolderAddresses, activeTokenAddress])
        .then((result) => {
          result.rows.forEach((row) => mergeHolderIdentity(holderIdentityByAddress, row.address, {
            worldId: `World ID ${String(row.identity_nullifier || '').slice(0, 10)}...`,
            identityNullifier: row.identity_nullifier,
            identityType: 'welcome_claim'
          }));
        })
        .catch((error) => warnings.push(`holder welcome identity lookup: ${error.message}`))
    ]);
  }

  migratedWelcomeClaims.forEach((claim) => {
    if (!topHolderAddresses.includes(claim.recipientKey)) return;
    mergeHolderIdentity(holderIdentityByAddress, claim.recipientKey, {
      worldId: 'Migrated welcome claim',
      identityNullifier: claim.identityNullifier,
      identityType: 'migrated_welcome_claim'
    });
  });

  const topHolders = topHolderResult.rows.map((row) => {
    const address = ethers.getAddress(row.address);
    const rawBalance = topHolderBalanceByAddress.get(row.address) ?? rawDecimalToBigInt(row.balance_raw);
    const inboundRaw = rawDecimalToBigInt(row.inbound_raw || '0');
    const outboundRaw = rawDecimalToBigInt(row.outbound_raw || '0');
    const netRaw = inboundRaw - outboundRaw;
    const knownWallet = walletByAddress.get(row.address);
    const holderIdentity = holderIdentityByAddress.get(row.address) || {};
    return {
      address,
      label: knownWallet?.label || holderIdentity.label || null,
      category: knownWallet?.category || holderIdentity.category || null,
      worldId: holderIdentity.worldId || null,
      identityType: holderIdentity.identityType || null,
      identityNullifier: holderIdentity.identityNullifier || null,
      isKnownWallet: Boolean(knownWallet || holderIdentity.identityType === 'ops_wallet'),
      balance: formatTokenUnits(rawBalance, normalizedDecimals),
      balanceNumber: tokenAmountNumber(rawBalance, normalizedDecimals),
      inbound: formatTokenUnits(inboundRaw, normalizedDecimals),
      inboundNumber: tokenAmountNumber(inboundRaw, normalizedDecimals),
      outbound: formatTokenUnits(outboundRaw, normalizedDecimals),
      outboundNumber: tokenAmountNumber(outboundRaw, normalizedDecimals),
      net: formatTokenUnits(netRaw, normalizedDecimals),
      netNumber: tokenAmountNumber(netRaw, normalizedDecimals),
      inboundCount: Number(row.inbound_count || 0),
      outboundCount: Number(row.outbound_count || 0),
      transferCount: Number(row.inbound_count || 0) + Number(row.outbound_count || 0),
      lastMovementBlock: row.last_movement_block ? Number(row.last_movement_block) : null,
      shareOfSupply: totalSupply > 0n ? Number((rawBalance * 1000000n) / totalSupply) / 10000 : 0,
      explorerUrl: makeExplorerUrl('address', address)
    };
  });

  const indexedClaimAmountRaw = rawDecimalToBigInt(claimStatsResult.rows[0]?.amount_raw || '0');
  const indexedClaimCount = Number(claimStatsResult.rows[0]?.claim_count || 0);
  onboardingClaimedCount = indexedClaimCount + migratedWelcomeClaims.length;
  const totalWelcomeClaimAmountRaw = indexedClaimAmountRaw + migratedWelcomeClaimAmountRaw;
  if (totalWelcomeClaimAmountRaw > 0n) {
    onboardingUsedRaw = totalWelcomeClaimAmountRaw;
  }

  const allWelcomeRecipientResult = await pool.query(`
    SELECT DISTINCT recipient
    FROM ${TABLE_UNON_WELCOME_CLAIMS}
    WHERE token_address = $1
  `, [activeTokenAddress]);
  const welcomeRecipientAddresses = Array.from(new Set([
    ...allWelcomeRecipientResult.rows.map((row) => String(row.recipient || '').toLowerCase()).filter(Boolean),
    ...migratedWelcomeClaims.map((claim) => claim.recipientKey)
  ]));
  const welcomeRecipientTotalsResult = welcomeRecipientAddresses.length > 0
    ? await pool.query(`
      WITH recipients AS (
        SELECT UNNEST($2::text[]) AS recipient
      ),
      inbound AS (
        SELECT COALESCE(SUM(amount_raw), 0) AS inbound_raw
        FROM ${TABLE_UNON_TRANSFERS}
        WHERE token_address = $1 AND to_address IN (SELECT recipient FROM recipients)
      ),
      outbound AS (
        SELECT COALESCE(SUM(amount_raw), 0) AS outbound_raw
        FROM ${TABLE_UNON_TRANSFERS}
        WHERE token_address = $1 AND from_address IN (SELECT recipient FROM recipients)
      )
      SELECT
        (SELECT COUNT(*)::INTEGER FROM recipients) AS unique_recipient_count,
        COALESCE((SELECT inbound_raw FROM inbound), 0)::text AS inbound_raw,
        COALESCE((SELECT outbound_raw FROM outbound), 0)::text AS outbound_raw,
        '0'::text AS current_balance_raw
    `, [activeTokenAddress, welcomeRecipientAddresses])
    : { rows: [{ unique_recipient_count: 0, inbound_raw: '0', outbound_raw: '0', current_balance_raw: '0' }] };
  const welcomeRecipientBalanceByAddress = new Map();
  await Promise.all(welcomeRecipientAddresses.map(async (recipient) => {
    try {
      const checksummed = ethers.getAddress(recipient);
      const rawBalance = await withTimeout(
        token.balanceOf(checksummed),
        Math.max(UNON_RPC_READ_TIMEOUT_MS, 15000),
        `welcome recipient balance ${checksummed}`
      );
      welcomeRecipientBalanceByAddress.set(recipient.toLowerCase(), rawBalance);
    } catch (error) {
      warnings.push(`welcome recipient balance ${recipient}: ${error.message}; using indexed cache`);
    }
  }));

  const indexedWelcomeRecipients = claimRowsResult.rows.map((row) => {
    const recipient = ethers.getAddress(row.recipient);
    const rawAmount = rawDecimalToBigInt(row.amount_raw);
    const currentBalanceRaw =
      welcomeRecipientBalanceByAddress.get(row.recipient.toLowerCase()) ??
      rawDecimalToBigInt(row.current_balance_raw || '0');
    const inboundRaw = rawDecimalToBigInt(row.inbound_raw || '0');
    const outboundRaw = rawDecimalToBigInt(row.outbound_raw || '0');
    return {
      identityNullifier: row.identity_nullifier,
      recipient,
      amount: formatTokenUnits(rawAmount, normalizedDecimals),
      amountNumber: tokenAmountNumber(rawAmount, normalizedDecimals),
      currentBalance: formatTokenUnits(currentBalanceRaw, normalizedDecimals),
      currentBalanceNumber: tokenAmountNumber(currentBalanceRaw, normalizedDecimals),
      inbound: formatTokenUnits(inboundRaw, normalizedDecimals),
      inboundNumber: tokenAmountNumber(inboundRaw, normalizedDecimals),
      outbound: formatTokenUnits(outboundRaw, normalizedDecimals),
      outboundNumber: tokenAmountNumber(outboundRaw, normalizedDecimals),
      net: formatTokenUnits(inboundRaw - outboundRaw, normalizedDecimals),
      netNumber: tokenAmountNumber(inboundRaw - outboundRaw, normalizedDecimals),
      inboundCount: Number(row.inbound_count || 0),
      outboundCount: Number(row.outbound_count || 0),
      transactionHash: row.tx_hash,
      blockNumber: Number(row.block_number),
      logIndex: Number(row.log_index),
      timestamp: row.block_timestamp instanceof Date ? row.block_timestamp.toISOString() : row.block_timestamp,
      explorerUrl: makeExplorerUrl('tx', row.tx_hash),
      recipientExplorerUrl: makeExplorerUrl('address', recipient)
    };
  });

  const migratedWelcomeRecipients = migratedWelcomeClaims.map((claim) => {
    const currentBalanceRaw =
      welcomeRecipientBalanceByAddress.get(claim.recipientKey) ??
      0n;
    return {
      identityNullifier: claim.identityNullifier,
      recipient: claim.recipient,
      amount: formatTokenUnits(claim.amountRaw, normalizedDecimals),
      amountNumber: tokenAmountNumber(claim.amountRaw, normalizedDecimals),
      currentBalance: formatTokenUnits(currentBalanceRaw, normalizedDecimals),
      currentBalanceNumber: tokenAmountNumber(currentBalanceRaw, normalizedDecimals),
      inbound: '0',
      inboundNumber: 0,
      outbound: '0',
      outboundNumber: 0,
      net: '0',
      netNumber: 0,
      inboundCount: 0,
      outboundCount: 0,
      transactionHash: claim.transactionHash,
      blockNumber: claim.blockNumber,
      logIndex: claim.logIndex,
      timestamp: claim.timestamp,
      explorerUrl: claim.explorerUrl,
      recipientExplorerUrl: makeExplorerUrl('address', claim.recipient),
      source: claim.source,
      note: claim.note
    };
  });

  const welcomeRecipients = [...indexedWelcomeRecipients, ...migratedWelcomeRecipients]
    .sort((a, b) => Number(b.blockNumber || 0) - Number(a.blockNumber || 0))
    .slice(0, UNON_WELCOME_RECIPIENT_LIMIT);

  const welcomeRecipientTotals = welcomeRecipientTotalsResult.rows[0] || {};
  const allWelcomeRecipientBalancesResolved = welcomeRecipientAddresses.every((recipient) =>
    welcomeRecipientBalanceByAddress.has(recipient.toLowerCase())
  );
  const welcomeRecipientCurrentBalanceRaw = allWelcomeRecipientBalancesResolved
    ? welcomeRecipientAddresses.reduce((sum, recipient) => sum + welcomeRecipientBalanceByAddress.get(recipient.toLowerCase()), 0n)
    : rawDecimalToBigInt(welcomeRecipientTotals.current_balance_raw || '0');
  const welcomeRecipientInboundRaw = rawDecimalToBigInt(welcomeRecipientTotals.inbound_raw || '0');
  const welcomeRecipientOutboundRaw = rawDecimalToBigInt(welcomeRecipientTotals.outbound_raw || '0');

  const holderScan = {
    fromBlock,
    toBlock,
    scannedBlocks: toBlock >= fromBlock ? toBlock - fromBlock + 1 : 0,
    completeFromGenesis: fromBlock === 0,
    transferEvents: Number(transferCountResult.rows[0]?.count || 0),
    holderCount: Number(holderCountResult.rows[0]?.count || 0),
    source: 'indexed-db',
    status: indexStatus.status,
    lagBlocks: indexStatus.lagBlocks
  };

  const movementSummary = Array.from(movementByAddress.values())
    .map((row) => {
      const netRaw = row.inboundRaw - row.outboundRaw;
      return {
        key: row.key,
        label: row.label,
        category: row.category,
        address: row.address,
        inbound: formatTokenUnits(row.inboundRaw, normalizedDecimals),
        inboundNumber: tokenAmountNumber(row.inboundRaw, normalizedDecimals),
        outbound: formatTokenUnits(row.outboundRaw, normalizedDecimals),
        outboundNumber: tokenAmountNumber(row.outboundRaw, normalizedDecimals),
        net: formatTokenUnits(netRaw, normalizedDecimals),
        netNumber: tokenAmountNumber(netRaw, normalizedDecimals),
        transferCount: row.transferCount,
        explorerUrl: makeExplorerUrl('address', row.address)
      };
    })
    .sort((a, b) => b.transferCount - a.transferCount);

  return {
    token: {
      address: tokenAddress,
      name,
      symbol,
      decimals: normalizedDecimals,
      totalSupply: formatTokenUnits(totalSupply, normalizedDecimals),
      totalSupplyNumber: tokenAmountNumber(totalSupply, normalizedDecimals),
      explorerUrl: makeExplorerUrl('token', tokenAddress)
    },
    network: {
      chainId: Number(network.chainId || BigInt(WORLD_CHAIN_CHAIN_ID)),
      label: WORLD_CHAIN_LABEL,
      rpcUrl: WORLD_CHAIN_RPC,
      latestBlock,
      scanFromBlock: fromBlock,
      scanToBlock: toBlock,
      scannedBlocks: holderScan.scannedBlocks,
      maxScanBlocks: null,
      holderScanFromBlock: fromBlock,
      holderScanChunkBlocks: UNON_INDEX_CHUNK_BLOCKS,
      readTimeoutMs: UNON_RPC_READ_TIMEOUT_MS,
      logTimeoutMs: UNON_RPC_LOG_TIMEOUT_MS
    },
    distribution: balanceResults
      .map((row) => ({
        key: row.key,
        label: row.label,
        category: row.category,
        envKey: row.envKey,
        address: row.address,
        configured: row.configured,
        balance: row.balance,
        balanceNumber: row.balanceNumber,
        balanceReadOk: row.balanceReadOk,
        balanceReadError: row.balanceReadError,
        rpcBalanceReadOk: row.rpcBalanceReadOk,
        rpcBalanceReadError: row.rpcBalanceReadError,
        balanceSource: row.balanceSource,
        plannedAmountNumber: row.plannedAmountNumber || 0,
        releasedNumber: row.releasedNumber || 0,
        remainingShareOfPlan: row.remainingShareOfPlan,
        shareOfSupply: row.shareOfSupply,
        explorerUrl: row.explorerUrl || null
      }))
      .sort((a, b) => b.balanceNumber - a.balanceNumber),
    categorySummary,
    locations: locationSummary,
    totals: {
      tracked: formatTokenUnits(trackedRaw, normalizedDecimals),
      trackedNumber: tokenAmountNumber(trackedRaw, normalizedDecimals),
      trackedShareOfSupply: totalSupply > 0n ? Number((trackedRaw * 1000000n) / totalSupply) / 10000 : 0,
      untracked: formatTokenUnits(untrackedRaw, normalizedDecimals),
      untrackedNumber,
      untrackedShareOfSupply: totalSupply > 0n ? Number((untrackedRaw * 1000000n) / totalSupply) / 10000 : 0
    },
    movement: {
      transferCount: holderScan.transferEvents,
      recentTransferLimit: UNON_TRANSFER_LOG_LIMIT,
      byWallet: movementSummary,
      recentTransfers
    },
    holders: {
      scan: holderScan,
      top: topHolders
    },
    overview: {
      tokenomicsPlan: UNON_TOKENOMICS_PLAN,
      contractRoles: UNON_CONTRACT_ROLE_NOTES.map((contract) => {
        const roleAddress = getUnonContractRoleAddress(contract.key, tokenAddress);
        const linkedWallet = roleAddress
          ? balanceResults.find((row) => row.address?.toLowerCase() === roleAddress.toLowerCase())
          : null;
        return {
          ...contract,
          address: roleAddress || null,
          configured: !!roleAddress,
          balanceNumber: linkedWallet?.balanceNumber ?? null,
          explorerUrl: roleAddress
            ? makeExplorerUrl(contract.key === 'token' ? 'token' : 'address', roleAddress)
            : null
        };
      }),
      operatingPolicy: UNON_OPERATING_POLICY,
      onboardingRewards: {
        managerAddress: onboardingWallet?.address || null,
        plannedPool: formatTokenUnits(onboardingPlanRaw, normalizedDecimals),
        plannedPoolNumber: tokenAmountNumber(onboardingPlanRaw, normalizedDecimals),
        currentPool: formatTokenUnits(onboardingCurrentRaw, normalizedDecimals),
        currentPoolNumber: tokenAmountNumber(onboardingCurrentRaw, normalizedDecimals),
        used: formatTokenUnits(onboardingUsedRaw, normalizedDecimals),
        usedNumber: tokenAmountNumber(onboardingUsedRaw, normalizedDecimals),
        rewardAmount: formatTokenUnits(onboardingRewardRaw, normalizedDecimals),
        rewardAmountNumber: tokenAmountNumber(onboardingRewardRaw, normalizedDecimals),
        claimedCount: onboardingClaimedCount,
        eventClaimCount: indexedClaimCount,
        migratedClaimCount: migratedWelcomeClaims.length,
        migratedClaimAmount: formatTokenUnits(migratedWelcomeClaimAmountRaw, normalizedDecimals),
        migratedClaimAmountNumber: tokenAmountNumber(migratedWelcomeClaimAmountRaw, normalizedDecimals),
        uniqueRecipientCount: Number(welcomeRecipientTotals.unique_recipient_count || 0),
        currentHeldByRecipients: formatTokenUnits(welcomeRecipientCurrentBalanceRaw, normalizedDecimals),
        currentHeldByRecipientsNumber: tokenAmountNumber(welcomeRecipientCurrentBalanceRaw, normalizedDecimals),
        totalInboundToRecipients: formatTokenUnits(welcomeRecipientInboundRaw, normalizedDecimals),
        totalInboundToRecipientsNumber: tokenAmountNumber(welcomeRecipientInboundRaw, normalizedDecimals),
        totalOutboundFromRecipients: formatTokenUnits(welcomeRecipientOutboundRaw, normalizedDecimals),
        totalOutboundFromRecipientsNumber: tokenAmountNumber(welcomeRecipientOutboundRaw, normalizedDecimals),
        netHeldByRecipients: formatTokenUnits(welcomeRecipientInboundRaw - welcomeRecipientOutboundRaw, normalizedDecimals),
        netHeldByRecipientsNumber: tokenAmountNumber(welcomeRecipientInboundRaw - welcomeRecipientOutboundRaw, normalizedDecimals),
        recentRecipients: welcomeRecipients,
        source: migratedWelcomeClaims.length > 0
          ? 'OnboardingManager Claimed events + migrated welcome make-whole records'
          : 'OnboardingManager Claimed events'
      },
      settlement: {
        creatorSharePercent: 95,
        treasurySharePercent: 3,
        burnPercent: 2,
        totalFeePercent: 5
      }
    },
    config: {
      tokenConfigured: !!UNON_NETWORK_CONFIG.contracts.unonToken,
      trackedWalletsConfigured: validWallets.length,
      indexFromBlock: UNON_INDEX_FROM_BLOCK,
      indexChunkBlocks: UNON_INDEX_CHUNK_BLOCKS,
      indexIntervalMs: UNON_INDEX_INTERVAL_MS,
      readFailedWallets: balanceResults
        .filter((wallet) => wallet.configured && wallet.balanceReadOk === false)
        .map((wallet) => ({
          key: wallet.key,
          label: wallet.label,
          address: wallet.address,
          error: wallet.balanceReadError
        })),
      indexedFallbackWallets: balanceResults
        .filter((wallet) => wallet.configured && wallet.balanceSource === 'indexed-cache')
        .map((wallet) => ({
          key: wallet.key,
          label: wallet.label,
          address: wallet.address,
          rpcError: wallet.rpcBalanceReadError
        })),
      missingWallets: trackedWallets
        .filter((wallet) => !wallet.address)
        .map((wallet) => ({ key: wallet.key, label: wallet.label, envKey: wallet.envKey }))
    },
    sync: indexStatus,
    warnings
  };
}

adminRouter.get('/unon-report', async (req, res) => {
  try {
    const report = await buildUnonAdminReport();
    res.json({ success: true, data: report });
  } catch (err) {
    console.error('[UNON-ADMIN] Report failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/unon-sync-status', async (req, res) => {
  try {
    const status = await getUnonIndexStatus({ refreshLatest: true });
    res.json({ success: true, data: status });
  } catch (err) {
    console.error('[UNON-ADMIN] Sync status failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/jobs/unon-sync', async (req, res) => {
  try {
    const maxChunks = req.body?.maxChunks ? parseInt(req.body.maxChunks, 10) : UNON_INDEX_MAX_CHUNKS_PER_RUN;
    const reset = req.body?.reset === true;
    const result = await startUnonIndexSync({ reason: reset ? 'manual-reset' : 'manual', maxChunks, reset });
    await logAdminAction(req, reset ? 'job.unon_sync.reset_start' : 'job.unon_sync.start', 'job', 'unon-sync', result);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[UNON-ADMIN] Sync start failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/settings', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM ${TABLE_ADMIN_SETTINGS} ORDER BY key ASC`);
    res.json({
      success: true,
      data: result.rows,
      env: {
        adminAllowlistConfigured: getAdminAllowlist().size > 0,
        videoMaintenanceEnabled: process.env.VIDEO_MAINTENANCE_ENABLED !== 'false',
        videoMaintenanceLimit: VIDEO_MAINTENANCE_LIMIT,
        youtubeConfigured: !!process.env.YOUTUBE_REFRESH_TOKEN,
        apifyConfigured: !!process.env.APIFY_API_TOKEN && process.env.APIFY_API_TOKEN !== 'DUMMY_TOKEN'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.put('/settings/:key', async (req, res) => {
  const key = String(req.params.key || '').trim();
  const value = String(req.body?.value || '').slice(0, 2000);
  const description = String(req.body?.description || '').slice(0, 500);
  if (!ADMIN_EDITABLE_SETTING_KEYS.has(key)) return res.status(400).json({ error: 'This setting key is not editable from the admin UI' });

  try {
    const result = await pool.query(`
      INSERT INTO ${TABLE_ADMIN_SETTINGS} (key, value, description, updated_by_uid, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        description = EXCLUDED.description,
        updated_by_uid = EXCLUDED.updated_by_uid,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [key, value, description, req.authUser.uid]);
    await logAdminAction(req, 'setting.update', 'setting', key, { value, description });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/audit-logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const result = await pool.query(`
      SELECT *
      FROM ${TABLE_ADMIN_AUDIT_LOGS}
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/admin', adminRouter);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[SERVER] Backend running on ${PORT}`));

function scheduleInProcessJobs() {
  scheduleUnonIndexer();
  void startBackgroundScraper();
  setInterval(() => void startBackgroundScraper(), 3600000);

  if (process.env.VIDEO_MAINTENANCE_ENABLED !== 'false') {
    setTimeout(() => {
      runVideoMaintenance().catch((err) => console.error('[VIDEO-MAINTENANCE] Scheduled run failed:', err.message));
    }, VIDEO_MAINTENANCE_INITIAL_DELAY_MS);

    setInterval(() => {
      runVideoMaintenance().catch((err) => console.error('[VIDEO-MAINTENANCE] Scheduled run failed:', err.message));
    }, VIDEO_MAINTENANCE_INTERVAL_MS);

    console.log(`[VIDEO-MAINTENANCE] Scheduled every ${VIDEO_MAINTENANCE_INTERVAL_MS / 3600000} hours`);
  }
}

dbReady
  .then(() => {
    if (process.env.ENABLE_IN_PROCESS_JOBS === 'false') {
      console.log('[SCHEDULED-JOB] In-process schedules disabled; waiting for protected external triggers.');
      return;
    }
    scheduleInProcessJobs();
  })
  .catch((err) => console.error('[STARTUP] Database initialization failed:', err.message));
