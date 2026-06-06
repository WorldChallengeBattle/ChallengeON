# Good ON Backend

The backend handles good-deed video metadata, uploads, YouTube upload integration, admin operations, ON section routing, praise/support activity, follows, notifications, and trend grouping.

## ON Product APIs

- `GET /api/on-sections`: returns `Trend ON`, `Battle ON`, `Now ON`, and onboarding checklist data.
- `GET /api/challenges?mode=trend|battle|now`: compatibility endpoint for good-deed themes while the fork still uses the Good ON data model.
- `GET /api/challenge-videos`: returns good-deed videos grouped under a theme.
- `POST /api/video-support/confirm`: records confirmed support for a good-deed creator.
- `POST /api/follows`, `DELETE /api/follows/:followedUid`, `GET /api/follows/me`: follow graph.
- `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/permissions`: in-app notification and World App push fallback.

## Current Compatibility Layer

Good ON keeps the existing `challenges` and `challenge_videos` tables for the initial fork. In product language:

- `challenge` means a good-deed theme or prompt.
- `challenge_videos` means uploaded good-deed videos.
- `hashtags` should include `#GoodON #kindnesson #PraiseRelay`.
- `Battle ON` highlights the strongest kindness trend instead of direct user-versus-user competition.

## Future Migration

Later migrations should rename tables and API routes toward `kindness_themes`, `kindness_videos`, and `praise_relays` once the product direction is stable.
