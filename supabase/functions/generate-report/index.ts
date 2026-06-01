import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function monStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function sunEnd(date: Date): Date {
  const d = monStart(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const isPreview = url.searchParams.get("preview") === "true";

    if (isPreview) {
      const { data: logs } = await supabase
        .from("log_entries")
        .select("timestamp")
        .order("timestamp", { ascending: true });

      if (!logs?.length) {
        return new Response(null, { status: 422, headers: corsHeaders });
      }

      const now = new Date();
      const weekStart = monStart(now);
      const weekEnd = sunEnd(now);
      const hasCurrentWeek = logs.some(l => {
        const d = new Date(l.timestamp);
        return d >= weekStart && d <= weekEnd;
      });

      if (hasCurrentWeek) {
        return new Response(JSON.stringify({ periodFrom: weekStart.toISOString().slice(0, 10), periodTo: weekEnd.toISOString().slice(0, 10), isCurrentWeek: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const latest = new Date(logs[logs.length - 1].timestamp);
      const fallbackStart = monStart(latest);
      const fallbackEnd = sunEnd(latest);
      return new Response(JSON.stringify({ periodFrom: fallbackStart.toISOString().slice(0, 10), periodTo: fallbackEnd.toISOString().slice(0, 10), isCurrentWeek: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST — generate report
    const body = await req.json().catch(() => ({})) as { options?: Record<string, unknown> };
    const reportOptions = body.options ?? {};

    const { data: allLogs } = await supabase
      .from("log_entries")
      .select("timestamp, game, action, minutes, type")
      .order("timestamp", { ascending: true });

    if (!allLogs?.length) {
      return new Response(JSON.stringify({ error: "No log entries found to generate a report from." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let weekStart = monStart(now);
    let weekEnd = sunEnd(now);

    let weekLogs = allLogs.filter(l => {
      const d = new Date(l.timestamp);
      return d >= weekStart && d <= weekEnd;
    });

    if (!weekLogs.length) {
      const latest = new Date(allLogs[allLogs.length - 1].timestamp);
      weekStart = monStart(latest);
      weekEnd = sunEnd(latest);
      weekLogs = allLogs.filter(l => {
        const d = new Date(l.timestamp);
        return d >= weekStart && d <= weekEnd;
      });
    }

    if (!weekLogs.length) {
      return new Response(JSON.stringify({ error: "No log entries found." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: compRows }, { data: pauseRows }] = await Promise.all([
      supabase.from("game_completions").select("game"),
      supabase.from("game_pauses").select("game"),
    ]);

    const completedGames = new Set((compRows ?? []).map(r => r.game));
    const pausedGames = new Set((pauseRows ?? []).map(r => r.game));
    const CREDITS_RE = /saw the credits|finished the game|completed the main.?run|rolled credits/i;

    const weekGameSet = new Set(weekLogs.map(l => l.game));
    const allGameMap: Record<string, typeof allLogs> = {};
    allLogs.forEach(l => {
      if (!allGameMap[l.game]) allGameMap[l.game] = [];
      allGameMap[l.game].push(l);
    });

    const focusGames = Object.entries(allGameMap)
      .filter(([game, logs]) => {
        if (!weekGameSet.has(game)) return false;
        if (completedGames.has(game) || pausedGames.has(game)) return false;
        if (logs.some(l => CREDITS_RE.test(l.action))) return false;
        return true;
      })
      .slice(0, 5)
      .map(([game, logs]) => {
        const allSessions = [...logs]
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .map(l => ({ date: l.timestamp.slice(0, 10), action: l.action, minutes: l.minutes }));
        const wm = weekLogs.filter(l => l.game === game).reduce((s, l) => s + l.minutes, 0);
        return { title: game, label: wm < 30 ? "Light progress" : "On track", sessions: allSessions };
      });

    const openaiKey = Deno.env.get("AI_INTEGRATIONS_OPENAI_API_KEY");
    const openaiBase = Deno.env.get("AI_INTEGRATIONS_OPENAI_BASE_URL") || "https://api.openai.com/v1";
    const aiInsights: Record<string, string> = {};

    for (const game of focusGames) {
      const lines = game.sessions.map(s => `  - ${s.date} (${s.minutes}m): ${s.action}`).join("\n");
      try {
        const resp = await fetch(`${openaiBase}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o",
            max_tokens: 200,
            messages: [
              { role: "system", content: "You are a sharp, knowledgeable gaming advisor. Write exactly ONE actionable sentence (max 35 words) for the player's next session. Be concrete and game-specific. No preamble." },
              { role: "user", content: `Game: ${game.title}\nStatus: ${game.label}\nRecent sessions:\n${lines || "  (no notes recorded)"}` },
            ],
          }),
        });
        const d = await resp.json() as { choices?: Array<{ message: { content: string } }> };
        aiInsights[game.title] = d.choices?.[0]?.message?.content?.trim() || "Continue from your last session.";
      } catch {
        aiInsights[game.title] = "Continue from your last session.";
      }
    }

    const title = `Week of ${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`;
    await supabase.from("saved_reports").insert({
      title,
      period_from: weekStart.toISOString().slice(0, 10),
      period_to: weekEnd.toISOString().slice(0, 10),
      logs_json: weekLogs,
      ai_insights_json: aiInsights,
      options_json: reportOptions,
      trigger_type: "manual",
    });

    return new Response(JSON.stringify({
      periodFrom: weekStart.toISOString().slice(0, 10),
      periodTo: weekEnd.toISOString().slice(0, 10),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Generation failed", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
