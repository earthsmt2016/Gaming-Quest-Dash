import { Router } from "express";
import { db } from "@workspace/db";
import { logEntriesTable } from "@workspace/db/schema";

const router = Router();

// GET /api/logs — return all entries ordered by created_at
router.get("/logs", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(logEntriesTable)
      .orderBy(logEntriesTable.createdAt);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

// POST /api/logs — insert one or many entries
router.post("/logs", async (req, res) => {
  try {
    const body = req.body as unknown[];
    if (!Array.isArray(body) || body.length === 0) {
      return res.json([]);
    }

    const values = body.map((item: any) => {
      if (
        typeof item.timestamp !== "string" ||
        typeof item.game !== "string" ||
        typeof item.action !== "string" ||
        typeof item.minutes !== "number" ||
        typeof item.type !== "string"
      ) {
        throw new Error("Invalid entry shape");
      }
      return {
        timestamp: item.timestamp,
        game: item.game,
        action: item.action,
        minutes: item.minutes,
        type: item.type,
      };
    });

    const inserted = await db
      .insert(logEntriesTable)
      .values(values)
      .returning();

    res.json(inserted);
  } catch (err) {
    res.status(400).json({ error: "Invalid log entries", detail: String(err) });
  }
});

// DELETE /api/logs — clear all entries
router.delete("/logs", async (_req, res) => {
  try {
    await db.delete(logEntriesTable);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to clear logs" });
  }
});

export default router;
