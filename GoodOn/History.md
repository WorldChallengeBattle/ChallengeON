# Development History - Good ON

### [Rebrand Cleanup] Canonical good-deed tags (2026-06-04)
*   Replaced legacy challenge dump tags with `#GoodON #kindnesson #PraiseRelay`.
*   Updated seed challenge hashtags so reseeding preserves the U&On / Good ON brand tags.
*   Ran the backend DB hashtag migration so all `challenges.hashtags` rows include `#GoodON #kindnesson #PraiseRelay` and no legacy project tags remain.
*   Renamed package metadata and project rationale documents away from the old project name.
*   Kept legacy DB names, cleanup queries, and signature hash salts unchanged where changing them would break existing data compatibility.

### [Phase 4] Multi-Platform Global Sync & Dynamic Discovery (2026-03-30)
*   **Dynamic Trend Discovery**: Implemented an automated SNS trend miner that extracts high-velocity hashtags (e.g., #funny, #tiktok, #couple) directly from trending YouTube Shorts.
*   **Definitive Scraper Integration**: Refined Apify actor mapping for Instagram Reels, TikTok, and YouTube Shorts to ensure high-fidelity metadata (author, views, thumbnails).
*   **YouTube Embed Support**: Integrated a specialized `iframe` component to correctly play and display thumbnails for YouTube Shorts metadata.
*   **Backend-Driven Feed**: Switched the frontend to fetch all challenges and videos via backend API, bypassing client-side Firestore permission blocks.

### [Phase 3] DB-First Architecture & Firebase Auth (2026-03-29)
- **Core Focus:** Establishing the visual identity, routing, and mobile-first experience.
- **Key Deliverables:**
  - Initialized Vite + React + TypeScript + TailwindCSS project.
  - Implemented the core UI components (`ChallengeCard`, `NavigationBar`, `AuthModal`, etc.).
  - Built the `Home` (Explore) Feed, `Arena` Leaderboard Tab, `Create` Challenge Flow, and `Profile` views.
  - Implemented fluid Framer Motion animations (swiping, accordion expansion).
  - Mocked out all initial states to prove the responsive design.

## Phase 2: Live Aggregation & Dynamic Scraping
- **Date:** 2026-03-29
- **Core Focus:** Fetching real hashtag data across multiple platforms.
- **Key Deliverables:**
  - Designed the backend Node.js + Express server pattern.
  - Integrated `apify-client` for parallel scraping (`Promise.allSettled`) across Instagram, TikTok, and YouTube.
  - Built cross-platform normalization logic (`mapItem`) to convert diverse actor outputs into a unified `<ChallengeCard>` schema.

## Phase 3: DB-First Architecture & Stability Fixes
- **Date:** 2026-03-30
- **Core Focus:** Eliminating 20s+ loading delays and bypassing API rate limits.
- **Key Deliverables:**
  - Initialized **Firebase Admin SDK** in the backend for metadata persistence.
  - Converted the scraper into a proactive **Background Worker** that crawls hourly, saving data directly to Firestore.
  - Shifted `/api/challenge-videos` to instantly query the DB instead of triggering live web scrapers.
  - **Critical Fallback Fix:** When Apify actors failed due to rate limits/bot blocks returning empty results, an intelligent 2-stage fallback was created:
    - Attempted generalized Instagram scrapers.
    - Successfully integrated completely free and rapid `yt-search` module as the primary engine for YouTube Shorts, proving the DB-First architecture works with real data on the frontend within < 200ms dynamically.

## Phase 4: Firebase Authentication (In Progress)
- **Date:** 2026-03-30
- **Core Focus:** Implementing real user registration, secure sessions, and profile persistence.
- **Planned Work:**
  - Sync Vite `.env` with actual Firebase credentials.
  - Create global `AuthContext` to manage `currentUser` state.

### [Phase 5] Strategic Curation & Trend Insight (2026-03-30)
*   **Editor's Choice Curation**: Transitioned from purely automated "blind" scraping to a curated "Top 20" model based on deep browser-led analysis of TikTok, IG, YT, and Google Trends (Mar 2026).
*   **Challenge Clustering**: Categorized trend discovery into 5 strategic clusters (AI-Hybrid, Absurdist, Performance, Discipline, Niche) to maximize user engagement sensing.
*   **DB Seeding & Priority Scraping**: Implemented `seed-top-challenges.js` to pre-populate PostgreSQL with premium hashtags and updated the background worker to prioritize these keys.
*   **Insight Discovery Report**: Created `Trend_Insight_Mar2026.md` as a living roadmap for platform-wide challenge discovery.
