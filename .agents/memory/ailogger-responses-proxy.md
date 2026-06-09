---
name: aiLogger responses proxy bug
description: The loggedOpenai/aiForRoute proxy wrapper had a broken responses.create handler
---

# aiLogger `responses.create` proxy bug

`artifacts/api-server/src/lib/aiLogger.ts` wraps the OpenAI client in nested Proxies to log token usage per route. The `chat.completions` path uses TWO proxy levels (chat → completions → create), so its inner handler correctly calls `cTarget[cProp].create()` where `cTarget`=chat, `cProp`="completions".

The `responses` path has only ONE proxy level (responses → create). The bug: the handler called `rTarget[rProp].create(...)` where `rProp` is already `"create"`, evaluating to `responses.create.create(...)` → `TypeError: rTarget[rProp].create is not a function`. This 500'd every `responses.create` call (e.g. radar discover web-search).

**Fix:** call the captured function directly with preserved `this`: `rVal.call(rTarget, params, options)` (guard `typeof rVal === "function"`).

**Why:** the single-vs-double proxy nesting difference is easy to miss — the two code paths look symmetric but aren't. Adding the `loggedOpenai` import alone does NOT fix this; the proxy internals must be correct.

**How to apply:** any route using `(loggedOpenai as any).responses.create(...)` (web_search_preview, etc.) depends on this. Test the actual endpoint, not just that the import resolves.
