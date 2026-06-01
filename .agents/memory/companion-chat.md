---
name: AI Companion Chat
description: Architecture decisions for the AI Gaming Companion Chat feature (Issue #8)
---

## Route
`artifacts/api-server/src/routes/companion.ts` — registered in routes/index.ts

## Table
`ai_conversations (id SERIAL, role TEXT, content TEXT, created_at TIMESTAMPTZ)`
Auto-created via `ensureTable()` at module load.

## Context injection
Every POST /companion/chat rebuilds context fresh from DB:
- `user_profile WHERE id=1` — preferred difficulty, types, personality summary
- `quests WHERE status='active'` (last 5)
- `quest_logs` (last 5 completions)
- `log_entries` (last 12 sessions)

Context is injected into the system prompt, not as a separate message.

## History management
- Fetch last 20 rows for the messages array passed to the model
- After saving new turn pair, trim to last 100 rows total
- GET /companion/history returns last 60 (oldest-first) for frontend load

## Frontend
`artifacts/gaming-quest/src/components/CompanionChat.tsx`
- Placed on Dashboard in App.tsx, below `<ActiveQuestsWidget />`
- Collapsible header, 360px message viewport, auto-grow textarea
- Renders markdown: code blocks, bold, bullets, numbered lists
- Quick-action buttons shown on empty state AND after each AI response
- Copy button on every AI message

## Model
gpt-5.4 (matches pattern used in quests.ts)

**Why context per-request vs stored summary:** Keeps data always fresh and avoids stale profile bugs. Performance is acceptable since context is small SQL queries.
