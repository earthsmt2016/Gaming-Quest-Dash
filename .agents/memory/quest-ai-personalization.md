---
name: Quest AI Personalization System
description: How the user profile, feedback, and CoT generation work together in the quest system
---

## Pattern
`user_profile` is a singleton table (always id=1). Use INSERT ... ON CONFLICT (id) DO UPDATE to upsert it.

`quest_feedback` stores thumbs up/down (rating=1 or -1) per quest_id. One row per quest.

`quests.reasoning` (TEXT, nullable) stores the AI's Chain-of-Thought justification per quest.

`buildUserProfile()` is called non-blocking (fire-and-forget) after feedback submission and quest completion. It regenerates the AI personality summary only when ≥2 quests are completed (to avoid wasting tokens on new users).

**Why:** The profile evolves passively. Calling it synchronously would add latency to every feedback submit/complete action.

**How to apply:** Never await buildUserProfile() in endpoint handlers — always `.catch(err => console.error(...))` to avoid silently swallowing errors.

## Generation prompt structure
1. Player profile block (difficulty, types, avoided types, session length, personality summary)
2. Recent liked/disliked feedback examples (up to 4 each)
3. CoT reasoning instructions (4 numbered questions the AI must answer before generating)
4. Quest schema including `reasoning` field

Auto-retry: on JSON parse failure, a second call is made with a stricter instruction. If both fail, an empty array is returned (no silent fallback quests).
