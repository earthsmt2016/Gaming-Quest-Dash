---
name: Issue Code Diagnosis
description: How/why the issue reporter's AI code-diagnosis works and its review-only boundary
---

# Issue Code Diagnosis (review-only)

The "Report an Issue" reporter, when triage resolves to `log` (a real bug),
additionally runs an AI code diagnosis that points at the likely source
file/lines and proposes a fix. It is surfaced in the `logged` view as a
read-only panel (current vs proposed code + "Copy proposed change").

**Rule: diagnosis is REVIEW-ONLY. Never add auto-edit or auto-commit.**
**Why:** The user was offered full-auto (app edits + git-commits its own
source) and explicitly chose the safe middle ground — diagnose + suggest,
human applies in the editor. Auto-committing code from a free-text bug
report is a security/safety risk (prompt-injection -> arbitrary changes,
can break the live app). Do not regress this without re-asking the user.

**How it works (api-server `routes/issues.ts`):** two-pass — (1) give the
model the source-file list, get up to 3 candidate files; (2) read those
files with line numbers, get the diagnosis JSON. Gated behind its own
`issue-diagnosis` AI feature toggle; best-effort (never throws); the issue
is always logged regardless.

**Guards worth preserving:** reads restricted to allowed SOURCE_ROOTS
(no path traversal), file-size + total-prompt-char budget caps, and an
anti-hallucination check — the model's `currentCode` must actually exist
in the file (whitespace-normalized) or the diagnosis is dropped. This is
what keeps proposed diffs from being fabricated.
