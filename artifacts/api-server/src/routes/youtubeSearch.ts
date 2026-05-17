import { Router } from 'express';

const router = Router();

const INNERTUBE_URL =
  'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';

const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20240101',
    hl: 'en',
    gl: 'US',
  },
};

/** Safely dig into a nested object by key name (BFS). */
function findKey(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in (obj as Record<string, unknown>)) return (obj as Record<string, unknown>)[key];
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const found = findKey(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function getText(runs: unknown): string {
  if (!Array.isArray(runs)) return '';
  return (runs as { text?: string }[]).map(r => r.text ?? '').join('');
}

router.get('/youtube-guides/:game', async (req, res) => {
  const game = decodeURIComponent(req.params.game);
  const hint = ((req.query.hint as string) || '').trim();
  const query = hint ? `${game} ${hint} guide` : `${game} walkthrough guide tips`;

  try {
    const response = await fetch(INNERTUBE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-Youtube-Client-Name': '1',
        'X-Youtube-Client-Version': '2.20240101',
      },
      body: JSON.stringify({ context: INNERTUBE_CONTEXT, query }),
    });

    if (!response.ok) {
      res.status(502).json({ error: 'YouTube API unavailable' });
      return;
    }

    const data = await response.json() as Record<string, unknown>;

    // Pull out all videoRenderer objects from the response tree
    const contents: unknown[] = [];
    function collectRenderers(obj: unknown) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) { obj.forEach(collectRenderers); return; }
      const o = obj as Record<string, unknown>;
      if ('videoRenderer' in o) { contents.push(o['videoRenderer']); return; }
      for (const v of Object.values(o)) collectRenderers(v);
    }
    collectRenderers(data);

    const videos = contents.slice(0, 6).map((v: unknown) => {
      const renderer = v as Record<string, unknown>;
      const videoId = renderer['videoId'] as string;

      const titleRuns = (findKey(renderer['title'], 'runs') ?? []) as { text?: string }[];
      const title = getText(titleRuns) || (findKey(renderer['title'], 'simpleText') as string) || '';

      const thumbs = (findKey(renderer['thumbnail'], 'thumbnails') ?? []) as { url: string }[];
      const thumbnail =
        thumbs.find(t => t.url.includes('mqdefault'))?.url ||
        thumbs.slice(-1)[0]?.url ||
        `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

      const duration = (findKey(renderer['lengthText'], 'simpleText') as string) ||
        getText((findKey(renderer['lengthText'], 'runs') ?? []) as { text?: string }[]) || '';

      const viewText = (findKey(renderer['viewCountText'], 'simpleText') as string) ||
        getText((findKey(renderer['viewCountText'], 'runs') ?? []) as { text?: string }[]) || '';
      const views = parseInt(viewText.replace(/[^0-9]/g, ''), 10) || 0;

      return { id: videoId, title, thumbnail, duration, views };
    }).filter(v => v.id && v.title);

    res.json(videos);
  } catch (err) {
    console.error('YouTube InnerTube error:', err);
    res.status(500).json({ error: 'Failed to search YouTube' });
  }
});

export default router;
