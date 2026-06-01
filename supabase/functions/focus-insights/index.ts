import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FocusGame {
  title: string;
  label: string;
  sessions: { date: string; action: string; minutes: number }[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { games } = await req.json() as { games: FocusGame[] };

    if (!Array.isArray(games) || games.length === 0) {
      return new Response(JSON.stringify({ error: "games array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiKey = Deno.env.get("AI_INTEGRATIONS_OPENAI_API_KEY");
    const openaiBase = Deno.env.get("AI_INTEGRATIONS_OPENAI_BASE_URL") || "https://api.openai.com/v1";

    const results: { title: string; nextStep: string }[] = [];

    for (const game of games) {
      const sessionLines = game.sessions.map(s => `  - ${s.date} (${s.minutes}m): ${s.action}`).join("\n");
      try {
        const response = await fetch(`${openaiBase}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o",
            max_tokens: 200,
            messages: [
              { role: "system", content: "You are a sharp, knowledgeable gaming advisor. Given a player's recent session notes, write exactly ONE actionable sentence (max 35 words) for their next session. Be concrete and game-specific, not generic. No preamble." },
              { role: "user", content: `Game: ${game.title}\nStatus: ${game.label}\nRecent sessions:\n${sessionLines || "  (no notes recorded)"}` },
            ],
          }),
        });
        const data = await response.json() as { choices?: Array<{ message: { content: string } }> };
        const nextStep = data.choices?.[0]?.message?.content?.trim() || "Continue from your last session.";
        results.push({ title: game.title, nextStep });
      } catch {
        results.push({ title: game.title, nextStep: "Continue from your last session." });
      }
    }

    return new Response(JSON.stringify({ insights: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "AI unavailable", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
