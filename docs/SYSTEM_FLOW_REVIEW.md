# System and Experience Review

Reviewed: 2026-10-01 (Asia/Seoul). Scope: ChallengeON, not the independent GoodOn copy.

## System Map

| Layer | Current role | Verification |
| --- | --- | --- |
| GitHub / Vercel | Vite frontend, Git-based release | Local build; no publication in this change |
| Cloud Run | Express API, collection, upload, signatures | Public challenge and chain-config reads |
| Supabase PostgreSQL | Challenge/video metadata, donations, missions | Preview SELECT executed inside BEGIN READ ONLY |
| Firebase / World App | User sessions, wallet authentication, MiniKit | Code paths reviewed; real-device login not exercised |
| World Chain | UNON support, staking, prize escrow | Live chain config confirms mainnet chain 480; no transactions sent |
| Cloud Scheduler | Protected collection and video maintenance | Enabled at 03:00 and 03:30 Asia/Seoul respectively; schedules unchanged |
| External platforms | YouTube search, Instagram/TikTok collection and embeds | Existing collectors retained; no additional crawler runs in this change |

## User Flow

1. Trend ON: search title/tags, filter platform/region, order by score, stored video update time or video count, save topics.
2. Watch: expand a topic; only that section's video cache is loaded. Returning to a topic restores the same mode-aware cache.
3. Try ON: existing camera/upload entry flow reuses the topic and optional source video. User entries surface in Battle ON.
4. Battle ON from a Trend: existing builder carries title, hashtags, region and source-topic reference. Source links clear incompatible filters.
5. Battle ON / Now ON: explicit Join challenge action opens the existing entry picker.
6. Ranking: loading, valid-empty and request-failure states are separate; changing period/token aborts superseded requests.
7. Settings: playback, mute, language and region controls work immediately. Playback/region/saved preferences persist on this browser/device, not across accounts/devices.

## Changes and Reasons

- Connected the formerly inert search input to real title/tag/notice matching.
- Normalized region labels, including different Global emoji and country labels with/without flags.
- Replaced text-only discovery cards with source-video thumbnails. The API returns a non-empty thumbnail from the highest-view eligible video, excluding hidden videos; source image failures fall back to the existing brand asset.
- Added deterministic ordering. Recently updated uses stored video timestamps, not the time of an unsuccessful collection attempt.
- Added loading placeholders, refresh, retry and filter reset. Failed requests no longer invent videos, fake successful creation or successful joins.
- Kept the existing upload, World ID and financial workflows. Microphone permission now starts when the user chooses recording, not when merely browsing.
- Fixed truncated source IDs: underscores inside YouTube IDs and Instagram shortcodes are retained.
- Removed browser-triggered database deletion on playback failure in both current and legacy render paths. The legacy delete endpoint now requires authenticated administrator access.
- Replaced vertical/rotated playback metadata with normal horizontal text; removed active-player scaling that could clip the viewport.
- Made card opening, navigation and region choices keyboard-operable. Settings trap focus, restore the previous focus and dismiss with Escape. Reduced-motion preference is respected by CSS and Framer Motion.
- Load camera/editor and admin modules only when opened. Main JS changed from approximately 1,288 KB / 385 KB gzip to 1,146 KB / 353 KB gzip. A large-bundle warning remains; this is not a complete performance audit.

The design uses the existing React, native CSS and Lucide stack, not a new component framework. Adaptive layout and accessible interaction were informed by [Material foundations](https://m3.material.io/foundations/); this is not an official Material implementation. Discovery uses neutral surfaces with lime/cyan accents and bounded type sizes rather than adding decorative marketing sections.

## Checks

- `npm run build`: passed.
- `npm run test:discovery`: search, region, modes, saved filters, ordering, source-ID regression and playback-delete safety checks.
- `npm --prefix backend run test:matcher`: existing matching and region checks passed.
- `node --check backend/server.js`: passed.
- New aggregate SQL executed read-only against the current database: 77 active challenges, 72 with a selected cover at the time of the check.
- Playwright: 72 visible Trend cards from a live read-only snapshot; search, platform filters, saved persistence, settings, failure/retry, mode-aware restoration and navigation passed.
- Playwright screenshots and layout bounds checked at 320x740, 390x844 and 1440x900. Playback-error simulation sent zero DELETE requests. Browser exception count was zero; mocked 503 responses intentionally produced request-error logs.
- Screenshots are generated in ignored `tmp/`; browser state/log artifacts are also ignored.

## Local Preview and Browser Check

```powershell
$env:DEV_API_TARGET = 'https://challengeon-api-84209014292.asia-northeast3.run.app'
npm run dev -- --host 127.0.0.1 --port 5174
```

The normal local preview reads the unchanged production API. Thumbnail and update-time fields appear after backend deployment; otherwise brand covers and challenge creation times are used.

To check the new SELECT before deployment, `node scripts/capture-discovery-snapshot.cjs` uses backend/.env DATABASE_URL (or a process-only COLLECTION_DB_URL override) and writes a public-data snapshot to ignored tmp/. It never starts backend initialization or writes to the database. Do not paste credentials into terminal output, chat or Git.

```powershell
npx --yes --package @playwright/cli playwright-cli open http://127.0.0.1:5174
npx --yes --package @playwright/cli playwright-cli run-code --filename=scripts/experience.browser.js
```

The browser check substitutes the new API response from that snapshot and mocks video/API errors; it is not real-account upload or transaction E2E. It expects the current demo catalog's two Agentic AI topics and clears saved preferences in the test browser.

## Release Gates and Remaining Work

1. Deploy the backend changes before publishing the frontend, then verify covers, timestamps and an unauthenticated DELETE rejection without touching an existing video ID. No schema migration is required.
2. Test login, filming/gallery upload, moderation, prize entry, support and voting inside World App with a controlled account. Mainnet transactions require explicit approval and measured limits.
3. The existing 19-language selector is retained. New discovery/error/settings copy currently has English and Korean translations; other locales use the established English fallback. Complete those translations before declaring a fully localized release.
4. Platform embeds may impose login, regional, playback and mute restrictions. Native and YouTube players receive the mute preference; Instagram/TikTok embeds may use their own sound controls. External playback is not guaranteed by these UI checks.
5. Some historical topics are broad tags, dated topics or test topics. Matching tags does not prove semantic relevance or regional provenance. Content moderation, freshness thresholds and regional source verification remain separate operational work.
6. The administrator-only video-delete fix is not a complete authorization audit. Legacy challenge/user write endpoints still need their own permission and identity review before claiming system-wide security coverage.
7. Existing large source images and the remaining main bundle deserve measured optimization. No image recompression, database cleanup, new subscriptions, Git push or cloud deployment was performed here.
