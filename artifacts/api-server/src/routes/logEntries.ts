import { Router } from "express";
import { eq } from "drizzle-orm";
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

// PATCH /api/logs/:id — update a single entry
router.patch("/logs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const { game, action, minutes, type, timestamp } = req.body as any;
    const patch: Record<string, unknown> = {};
    if (game      !== undefined) patch.game      = String(game);
    if (action    !== undefined) patch.action    = String(action);
    if (minutes   !== undefined) patch.minutes   = Number(minutes);
    if (type      !== undefined) patch.type      = String(type);
    if (timestamp !== undefined) patch.timestamp = String(timestamp);
    if (Object.keys(patch).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
    const [updated] = await db
      .update(logEntriesTable)
      .set(patch)
      .where(eq(logEntriesTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Entry not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update entry", detail: String(err) });
  }
});

// DELETE /api/logs/:id — delete a single entry
router.delete("/logs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(logEntriesTable).where(eq(logEntriesTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete entry" });
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
