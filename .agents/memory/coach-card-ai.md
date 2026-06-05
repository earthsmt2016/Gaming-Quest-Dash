---
name: Coach Card AI
description: POST /api/ai/coach-card, caching, fulfillment tracking, and backlog health endpoint
---

## Route file
`artifacts/api-server/src/routes/coachCard.ts` — registered in routes/index.ts

## Endpoints
- `POST /api/ai/coach-card` — GPT-5.4 generates nightly recommendation; returns headline, game, suggested_minutes, why[] (data-cited bullets), alternative_game, alternative_why, confidence_score (0-1). Stores in ai_recommendations table.
- `GET /api/ai/coach-card/latest` — returns most recent row from ai_recommendations. No AI call. Client caches for 30 min (CACHE_TTL_MS in CoachCard.tsx).
- `GET /api/backlog-health` — pure SQL; returns health_score 0-100, label, active_games, neglected_count, neglected_games, rotating_this_week, risks[].

## Tables
- `ai_recommendations`: id, game, headline, suggested_minutes, reasoning (jsonb array), alternative_game, alternative_why, confidence_score, fulfilled (bool), fulfilled_at, created_at

## Behavioral learning (Phase 3)
`markRecommendationFulfilled(games[])` exported from coachCard.ts — called fire-and-forget in logEntries.ts POST /api/logs after insert. Marks any unfulfilled recommendation for those games created within last 24h as fulfilled.

**Why:** Tracks whether recommendations are acted on without requiring explicit user input — passive learning from log imports.

## Frontend
`artifacts/gaming-quest/src/components/CoachCard.tsx` — inserted in App.tsx dashboard between DailyCheckin and CompanionChat. Dark gradient card, live backlog health badge, risk warnings, recommendation box with bullet reasoning, alternative, confidence %, fresh/stale indicator.
