import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/search?prettyPrint=false";
const INNERTUBE_CONTEXT = { client: { clientName: "WEB", clientVersion: "2.20240101", hl: "en", gl: "US" } };

function findKey(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  if (key in (obj as Record<string, unknown>)) return (obj as Record<string, unknown>)[key];
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const found = findKey(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function getText(runs: unknown): string {
  if (!Array.isArray(runs)) return "";
  return (runs as { text?: string }[]).map(r => r.text ?? "").join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const game = url.searchParams.get("game") ?? "";
    const hint = (url.searchParams.get("hint") ?? "").trim();
    const query = hint ? `${game} ${hint} guide` : `${game} walkthrough guide tips`;

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(INNERTUBE_URL, {
        method: "POST",
        signal: abort.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "X-Youtube-Client-Name": "1",
          "X-Youtube-Client-Version": "2.20240101",
        },
        body: JSON.stringify({ context: INNERTUBE_CONTEXT, query }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return new Response(JSON.stringify({ unavailable: true, videos: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json() as Record<string, unknown>;
    const contents: unknown[] = [];

    function collectRenderers(obj: unknown) {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) { obj.forEach(collectRenderers); return; }
      const o = obj as Record<string, unknown>;
      if ("videoRenderer" in o) { contents.push(o["videoRenderer"]); return; }
      for (const v of Object.values(o)) collectRenderers(v);
    }
    collectRenderers(data);

    const videos = contents.slice(0, 6).map((v: unknown) => {
      const renderer = v as Record<string, unknown>;
      const videoId = renderer["videoId"] as string;
      const titleRuns = (findKey(renderer["title"], "runs") ?? []) as { text?: string }[];
      const title = getText(titleRuns) || (findKey(renderer["title"], "simpleText") as string) || "";
      const thumbs = (findKey(renderer["thumbnail"], "thumbnails") ?? []) as { url: string }[];
      const thumbnail = thumbs.find(t => t.url.includes("mqdefault"))?.url || thumbs.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
      const duration = (findKey(renderer["lengthText"], "simpleText") as string) || getText((findKey(renderer["lengthText"], "runs") ?? []) as { text?: string }[]) || "";
      const viewText = (findKey(renderer["viewCountText"], "simpleText") as string) || getText((findKey(renderer["viewCountText"], "runs") ?? []) as { text?: string }[]) || "";
      const views = parseInt(viewText.replace(/[^0-9]/g, ""), 10) || 0;
      return { id: videoId, title, thumbnail, duration, views };
    }).filter(v => v.id && v.title);

    return new Response(JSON.stringify(videos), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ unavailable: true, videos: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
