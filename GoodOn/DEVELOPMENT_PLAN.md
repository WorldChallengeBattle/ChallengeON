# Good ON Development Plan

## Product Thesis

Good ON turns short-form upload mechanics into a culture of visible good deeds and praise relays. The first usable version should make it easy to upload a good-deed video, group it with similar acts, and invite warm responses that continue the chain.

## MVP Surfaces

- `Now ON`: upload and browse good-deed prompts.
- `Trend ON`: cluster videos by tags, captions, and theme.
- `Battle ON`: spotlight the strongest kindness trend of the moment.
- `Praise Relay`: add praise, thanks, encouragement, and follow-up acts to a video.

## First Refactor Pass

- Keep existing `challenge` tables and API routes as a compatibility layer.
- Rename visible UI copy from challenge competition language to good-deed and praise-relay language.
- Seed Good ON tags with `#GoodON #kindnesson #PraiseRelay`.
- Replace direct battle/prize wording with spotlight, support, and community impact wording.

## Next Backend Migration

- Add a `praise_comments` table for praise relay entries.
- Add `kindness_theme` metadata to existing `challenges` rows.
- Add trend scoring based on praise count, follow-up video count, verified upload count, and support count.
- Later rename `challenges` to `kindness_themes` once frontend and backend compatibility is stable.
