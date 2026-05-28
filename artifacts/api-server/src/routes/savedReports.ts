import { Router } from 'express';
import { pool } from '@workspace/db';
import { generateWeeklyReport } from '../scheduler';

const router = Router();

// POST /api/reports/generate-now — manual trigger; saves as 'manual' so it never blocks the auto-scheduler
router.post('/reports/generate-now', async (_req, res) => {
  try {
    const result = await generateWeeklyReport('manual');
    if (!result) {
      res.status(422).json({ error: 'No log entries found to generate a report from.' });
      return;
    }
    res.json({ ok: true, periodFrom: result.periodFrom, periodTo: result.periodTo });
  } catch (err) {
    res.status(500).json({ error: 'Generation failed', detail: String(err) });
  }
});

const ensureTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_schedule (
      id SERIAL PRIMARY KEY,
      day_of_week SMALLINT NOT NULL DEFAULT 0,
      hour SMALLINT NOT NULL DEFAULT 17,
      minute SMALLINT NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT false
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_reports (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      period_from DATE NOT NULL,
      period_to DATE NOT NULL,
      logs_json JSONB NOT NULL DEFAULT '[]',
      ai_insights_json JSONB NOT NULL DEFAULT '{}',
      trigger_type TEXT NOT NULL DEFAULT 'manual',
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

ensureTables().catch(err => console.error('savedReports ensureTables:', err));

// GET /api/report-schedule
router.get('/report-schedule', async (_req, res) => {
  try {
    await ensureTables();
    const result = await pool.query('SELECT * FROM report_schedule ORDER BY id LIMIT 1');
    if (!result.rows.length) {
      res.json({ id: null, day_of_week: 0, hour: 17, minute: 0, enabled: false });
    } else {
      res.json(result.rows[0]);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch schedule', detail: String(err) });
  }
});

// POST /api/report-schedule
router.post('/report-schedule', async (req, res) => {
  try {
    await ensureTables();
    const { day_of_week, hour, minute, enabled } = req.body as {
      day_of_week: number; hour: number; minute: number; enabled: boolean;
    };
    const existing = await pool.query('SELECT id FROM report_schedule LIMIT 1');
    if (!existing.rows.length) {
      const r = await pool.query(
        'INSERT INTO report_schedule (day_of_week, hour, minute, enabled) VALUES ($1,$2,$3,$4) RETURNING *',
        [day_of_week, hour, minute, enabled]
      );
      res.json(r.rows[0]);
    } else {
      const r = await pool.query(
        'UPDATE report_schedule SET day_of_week=$1, hour=$2, minute=$3, enabled=$4 WHERE id=$5 RETURNING *',
        [day_of_week, hour, minute, enabled, existing.rows[0].id]
      );
      res.json(r.rows[0]);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to save schedule', detail: String(err) });
  }
});

// GET /api/saved-reports — list (metadata only, no full logs)
router.get('/saved-reports', async (_req, res) => {
  try {
    await ensureTables();
    const result = await pool.query(
      `SELECT id, title, period_from, period_to, trigger_type, generated_at,
              jsonb_array_length(logs_json) AS log_count
       FROM saved_reports ORDER BY generated_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports', detail: String(err) });
  }
});

// GET /api/saved-reports/:id — full report
router.get('/saved-reports/:id', async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const result = await pool.query('SELECT * FROM saved_reports WHERE id=$1', [id]);
    if (!result.rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch report', detail: String(err) });
  }
});

// POST /api/saved-reports — save a report
router.post('/saved-reports', async (req, res) => {
  try {
    await ensureTables();
    const { title, period_from, period_to, logs_json, ai_insights_json, trigger_type } = req.body;
    const result = await pool.query(
      `INSERT INTO saved_reports (title, period_from, period_to, logs_json, ai_insights_json, trigger_type)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        title,
        period_from,
        period_to,
        JSON.stringify(logs_json ?? []),
        JSON.stringify(ai_insights_json ?? {}),
        trigger_type ?? 'manual',
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save report', detail: String(err) });
  }
});

// PATCH /api/saved-reports/:id — update AI insights after generation
router.patch('/saved-reports/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { ai_insights_json } = req.body;
    const r = await pool.query(
      'UPDATE saved_reports SET ai_insights_json=$1 WHERE id=$2 RETURNING *',
      [JSON.stringify(ai_insights_json ?? {}), id]
    );
    if (!r.rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update report', detail: String(err) });
  }
});

// DELETE /api/saved-reports/:id
router.delete('/saved-reports/:id', async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    await pool.query('DELETE FROM saved_reports WHERE id=$1', [id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete report', detail: String(err) });
  }
});

export default router;
