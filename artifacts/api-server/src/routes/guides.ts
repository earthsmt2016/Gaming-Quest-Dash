import { Router } from 'express';
import { pool } from "@workspace/db";

const router = Router();

const ensureTable = () => pool.query(`
  CREATE TABLE IF NOT EXISTS game_guides (
    game TEXT PRIMARY KEY,
    url  TEXT NOT NULL
  )
`);

router.get('/guides', async (_req, res) => {
  await ensureTable();
  const result = await pool.query('SELECT game, url FROM game_guides ORDER BY game');
  res.json(result.rows);
});

router.post('/guides/:game', async (req, res) => {
  await ensureTable();
  const game = decodeURIComponent(req.params.game);
  const { url } = req.body as { url?: string };
  if (!url) { res.status(400).json({ error: 'url required' }); return; }
  await pool.query(
    `INSERT INTO game_guides (game, url) VALUES ($1, $2)
     ON CONFLICT (game) DO UPDATE SET url = $2`,
    [game, url]
  );
  res.json({ game, url });
});

router.delete('/guides/:game', async (req, res) => {
  await ensureTable();
  const game = decodeURIComponent(req.params.game);
  await pool.query('DELETE FROM game_guides WHERE game = $1', [game]);
  res.json({ deleted: true });
});

export default router;
