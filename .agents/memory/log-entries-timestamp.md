---
name: log_entries timestamp casting
description: The timestamp column in log_entries is TEXT — must cast when comparing to intervals
---

## Rule
`log_entries.timestamp` is stored as TEXT (ISO string), not TIMESTAMPTZ.

Any SQL that compares it against NOW() or an INTERVAL must cast it:
```sql
WHERE timestamp::timestamptz > NOW() - INTERVAL '7 days'
MAX(timestamp::timestamptz)
ORDER BY timestamp::timestamptz DESC
```

**Why:** The column predates the Drizzle schema and was created as TEXT. Forgetting the cast causes "operator does not exist: text > timestamp with time zone" errors at runtime.

**How to apply:** Every new SQL query touching log_entries timestamps needs `::timestamptz`. Check new route files before restarting the API server.
