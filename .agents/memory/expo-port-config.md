---
name: Expo port configuration for Replit
description: Why Expo workflows fail with DIDNT_OPEN_A_PORT and how to fix it
---

## Rule

An Expo artifact's `localPort` in `artifact.toml` MUST correspond to a port already listed in `.replit`'s `[[ports]]` section, or the workflow system cannot detect the port and fails with `DIDNT_OPEN_A_PORT` — even though Metro starts and responds on localhost.

**Why:** Replit's workflow port-detection routes checks through its proxy layer. Only ports that appear in `.replit [[ports]]` are routable. Unregistered ports (like 18115) are invisible to the platform's health checks.

**How to apply:** When an Expo artifact is created and the workflow fails with `DIDNT_OPEN_A_PORT`:
1. Check `.replit` for existing `[[ports]]` entries
2. Find an unused mapped port (e.g., `localPort = 8082` maps to `externalPort = 3003`)
3. Update `artifact.toml` via `verifyAndReplaceArtifactToml` to change `localPort` and `[services.env] PORT` to that port
4. Remove `--localhost` flag from the Expo dev command (it restricts Metro to loopback only)
5. Restart the workflow

The working ports in this project: 8080 (API), 8082 (Expo mobile, → 3003), 23811 (web dashboard, → 3000).
