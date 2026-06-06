import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

export interface HealthSettings {
  console_neglect_days: number;
  console_rotation_limit: number;
  console_backlog_limit: number;
  mobile_neglect_days: number;
  mobile_rotation_limit: number;
  mobile_backlog_limit: number;
}

const DEFAULTS: HealthSettings = {
  console_neglect_days:   14,
  console_rotation_limit:  3,
  console_backlog_limit:   6,
  mobile_neglect_days:    28,
  mobile_rotation_limit:   5,
  mobile_backlog_limit:    8,
};

async function ensureSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS health_settings (
      id                      INTEGER PRIMARY KEY DEFAULT 1,
      console_neglect_days    INTEGER NOT NULL DEFAULT 14,
      console_rotation_limit  INTEGER NOT NULL DEFAULT 3,
      console_backlog_limit   INTEGER NOT NULL DEFAULT 6,
      mobile_neglect_days     INTEGER NOT NULL DEFAULT 28,
      mobile_rotation_limit   INTEGER NOT NULL DEFAULT 5,
      mobile_backlog_limit    INTEGER NOT NULL DEFAULT 8,
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT single_row CHECK (id = 1)
    )
  `);
  await pool.query(`
    INSERT INTO health_settings (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);
}

ensureSettingsTable().catch(err => console.error("settings ensureTable:", err));

export async function loadSettings(): Promise<HealthSettings> {
  try {
    const { rows } = await pool.query(`SELECT * FROM health_settings WHERE id = 1`);
    if (!rows.length) return { ...DEFAULTS };
    const r = rows[0];
    return {
      console_neglect_days:   r.console_neglect_days   ?? DEFAULTS.console_neglect_days,
      console_rotation_limit: r.console_rotation_limit ?? DEFAULTS.console_rotation_limit,
      console_backlog_limit:  r.console_backlog_limit  ?? DEFAULTS.console_backlog_limit,
      mobile_neglect_days:    r.mobile_neglect_days    ?? DEFAULTS.mobile_neglect_days,
      mobile_rotation_limit:  r.mobile_rotation_limit  ?? DEFAULTS.mobile_rotation_limit,
      mobile_backlog_limit:   r.mobile_backlog_limit   ?? DEFAULTS.mobile_backlog_limit,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

router.get("/settings", async (_req, res) => {
  try {
    await ensureSettingsTable();
    res.json(await loadSettings());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/settings", async (req, res) => {
  try {
    await ensureSettingsTable();
    const {
      console_neglect_days,
      console_rotation_limit,
      console_backlog_limit,
      mobile_neglect_days,
      mobile_rotation_limit,
      mobile_backlog_limit,
    } = req.body as Partial<HealthSettings>;

    const clamp = (v: unknown, min: number, max: number, def: number) => {
      const n = Number(v);
      return isNaN(n) ? def : Math.max(min, Math.min(max, Math.round(n)));
    };

    const s: HealthSettings = {
      console_neglect_days:   clamp(console_neglect_days,   1, 90, DEFAULTS.console_neglect_days),
      console_rotation_limit: clamp(console_rotation_limit, 1, 20, DEFAULTS.console_rotation_limit),
      console_backlog_limit:  clamp(console_backlog_limit,  1, 30, DEFAULTS.console_backlog_limit),
      mobile_neglect_days:    clamp(mobile_neglect_days,    1, 180, DEFAULTS.mobile_neglect_days),
      mobile_rotation_limit:  clamp(mobile_rotation_limit,  1, 30, DEFAULTS.mobile_rotation_limit),
      mobile_backlog_limit:   clamp(mobile_backlog_limit,   1, 50, DEFAULTS.mobile_backlog_limit),
    };

    await pool.query(`
      INSERT INTO health_settings
        (id, console_neglect_days, console_rotation_limit, console_backlog_limit,
         mobile_neglect_days, mobile_rotation_limit, mobile_backlog_limit, updated_at)
      VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE SET
        console_neglect_days   = EXCLUDED.console_neglect_days,
        console_rotation_limit = EXCLUDED.console_rotation_limit,
        console_backlog_limit  = EXCLUDED.console_backlog_limit,
        mobile_neglect_days    = EXCLUDED.mobile_neglect_days,
        mobile_rotation_limit  = EXCLUDED.mobile_rotation_limit,
        mobile_backlog_limit   = EXCLUDED.mobile_backlog_limit,
        updated_at             = EXCLUDED.updated_at
    `, [s.console_neglect_days, s.console_rotation_limit, s.console_backlog_limit,
        s.mobile_neglect_days,  s.mobile_rotation_limit,  s.mobile_backlog_limit]);

    res.json(s);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
