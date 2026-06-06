# Good ON

Good ON is a World App mini app for uploading good-deed videos and turning them into praise relays. Users post proof of small acts of kindness, other people add encouragement and support, and the app groups those moments into visible movements.

## Product Direction

- `Trend ON`: groups good-deed videos by tags, captions, and detected themes so similar acts gather together.
- `Battle ON`: selects the most meaningful trend among active kindness trends. This is not a fight between users; it is a spotlight for the trend that moved the community most.
- `Now ON`: the main place to upload diverse good-deed videos, from helping neighbors to cleanup, donation, care, mentoring, rescue, volunteering, and everyday kindness.
- `Praise Relay`: every video should invite compliments, thanks, encouragement, follow-up stories, and proof that one good action inspired another.
- `Ranking`: tracks praise, support, continuity, and verified positive impact instead of simple competition.

## Culture

Good ON should feel like a living archive of people making the world less cold. The app should reward sincerity, repeatable kindness, and warm community response more than spectacle.

Canonical tags:

```text
#GoodON #kindnesson #PraiseRelay
```

## Implementation Notes

This project is forked from Challenge On, so some internal API names still use `challenge` while the product surface has shifted to good-deed videos and praise relays. Keep compatibility during the first fork, then rename backend tables and API resources in a later migration.

## Verification

```bash
npm run build
node --check backend/server.js
node backend/challenge-matcher.test.js
node backend/region-classifier.test.js
```
