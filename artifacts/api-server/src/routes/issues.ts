import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_issues (
      id          SERIAL PRIMARY KEY,
      page        TEXT NOT NULL DEFAULT '',
      element     TEXT,
      description TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
ensureTable().catch(err => console.error("issues ensureTable:", err));

router.get("/issues", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM app_issues ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/issues", async (req, res) => {
  try {
    const { page, element, description } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO app_issues (page, element, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [page || '', element || '', description]);
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/issues/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(`
      UPDATE app_issues SET status = $2 WHERE id = $1 RETURNING *
    `, [req.params.id, status]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/issues/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM app_issues WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
