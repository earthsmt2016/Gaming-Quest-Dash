---
name: Issue Code Diagnosis
description: How/why the issue reporter's AI code-diagnosis works and the apply-fix safety boundary
---

# Issue Code Diagnosis

The "Report an Issue" reporter, when triage resolves to `log` (a real bug),
additionally runs an AI code diagnosis that points at the likely source
file/lines and proposes a fix. It is surfaced in the `logged` view as a panel
(current vs proposed code, Copy, and — for frontend files — an "Apply fix"
button).

**Apply boundary (current decision):** auto-apply writes the proposed change
directly to the file, but ONLY for frontend dashboard files
(`artifacts/gaming-quest/src`, enforced server-side via `APPLY_ROOTS`). The
server NEVER auto-writes its own backend code (`api-server/src`) — that would
be a remote code-tampering vector since backend code auto-restarts and runs
with full privileges. Backend diagnoses show Copy-only in the UI (`canApply`).
**Why:** the user first chose review-only, then later explicitly asked for an
apply button. The frontend-only restriction is the proportionate middle ground
(the app has no auth; an unauthenticated file-write to executable server code
is the dangerous part, UI source is lower-risk and checkpoint-recoverable).
Do not widen `APPLY_ROOTS` to backend without re-asking the user + adding authz.

**How diagnosis works (api-server `routes/issues.ts`):** two-pass — (1) give
the model the source-file list, get up to 3 candidate files; (2) read those
files with line numbers, get the diagnosis JSON. Gated behind its own
`issue-diagnosis` AI feature toggle; best-effort (never throws); the issue is
always logged regardless.

**Apply guards worth preserving (`POST /issues/apply-fix`):** path must resolve
inside `APPLY_ROOTS`; `currentCode` must match the file content EXACTLY exactly
once (0 → 409, >1 → 409) so it can't mispatch or corrupt; proposedCode size cap.
Diagnosis-time guards: reads restricted to `SOURCE_ROOTS` (no traversal),
file-size + total-prompt-char budget caps, and an anti-hallucination check —
the model's `currentCode` must exist in the file (whitespace-normalized) or the
diagnosis is dropped. NOTE: diagnosis acceptance uses whitespace-normalized
matching but apply requires exact bytes, so apply can 409 even on a valid
diagnosis (indentation drift) — Copy is the fallback.

**Settings:** both `issue-triage` and `issue-diagnosis` are togglable AI
features. The frontend `AiCostSettingsPage.tsx` keeps its OWN hardcoded
`FEATURES`/`PRESET_MAP` separate from the backend `aiCostConfig.ts` — any new
AI feature must be added to BOTH or it won't show in settings.
