---
name: Express route restart requirement
description: API server new routes require workflow restart, not just file save
---

The api-server uses `tsx watch` (or nodemon) to watch for file changes. However, **new Express routes added to router files are only registered at module load time**. If you add new `router.get(...)` / `router.post(...)` calls to an existing routes file, the watcher may not trigger a full restart — or even if it does, verifying with `curl` after is essential.

**Why:** Express routers register routes when the module is first `require()`d. Hot-patching of router registrations is not supported. A process restart is needed for new routes to be active.

**How to apply:** After adding new API routes in any `artifacts/api-server/src/routes/*.ts` file, always restart the `artifacts/api-server: API Server` workflow and verify the route responds before considering the backend work done.
