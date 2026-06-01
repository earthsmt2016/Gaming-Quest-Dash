import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GameInput {
  title: string;
  daysSinceLastPlayed: number;
  minutesThisWeek: number;
  avgSessionMinutes: number;
  totalMinutesLogged: number;
  priorityLabel: string;
  recentSessions: { date: string; action: string; minutes: number }[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { availableMinutes, dayOfWeek, games } = await req.json() as {
      availableMinutes: number;
      dayOfWeek: string;
      games: GameInput[];
    };

    if (!availableMinutes || !Array.isArray(games) || games.length === 0) {
      return new Response(JSON.stringify({ error: "availableMinutes and games array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gameBlocks = games.map(g => {
      const sessionLines = g.recentSessions.map(s => `  - ${s.date} (${s.minutes}m): ${s.action}`).join("\n");
      return [`## ${g.title}`, `Status: ${g.priorityLabel} | Last played: ${g.daysSinceLastPlayed === 0 ? "today" : `${g.daysSinceLastPlayed}d ago`} | This week: ${g.minutesThisWeek}m | Avg session: ${g.avgSessionMinutes}m | Total logged: ${g.totalMinutesLogged}m`, `Recent sessions:\n${sessionLines || "  (no notes)"}`].join("\n");
    }).join("\n\n");

    const maxGames = availableMinutes < 30 ? 1 : availableMinutes < 60 ? 2 : availableMinutes < 180 ? 3 : availableMinutes < 360 ? 4 : 5;

    const systemPrompt = `You are a smart daily gaming session planner. Given a player's active games and available time, you create an optimal session plan.\n\nSelection rules:\n- Pick at most ${maxGames} game${maxGames > 1 ? "s" : ""} (based on available time: ${availableMinutes} min)\n- Minimum 15 minutes per game\n- CRITICAL: The sum of all "minutes" values MUST be as close as possible to ${availableMinutes} — fill the time.\n- Priority order: "Boss fight reached" > "Active story run" > "Just started" > long neglect > "Competitive"\n\nThe "why" field MUST cover two things in 1–2 sentences (max 45 words total):\n1. WHY this game was selected today\n2. What the player will GAIN or ACHIEVE by playing it now\n\nRespond ONLY with valid JSON — no markdown, no explanation:\n{ "picks": [ { "game": "<exact game name from input>", "minutes": <number>, "why": "<reason + benefit>" } ] }`;

    const openaiKey = Deno.env.get("AI_INTEGRATIONS_OPENAI_API_KEY");
    const openaiBase = Deno.env.get("AI_INTEGRATIONS_OPENAI_BASE_URL") || "https://api.openai.com/v1";

    const response = await fetch(`${openaiBase}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 700,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Available time: ${availableMinutes} minutes\nDay: ${dayOfWeek}\n\n${gameBlocks}` },
        ],
      }),
    });

    const data = await response.json() as { choices?: Array<{ message: { content: string } }> };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    let picks: { game: string; minutes: number; why: string }[] = [];
    try {
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(jsonStr);
      picks = Array.isArray(parsed.picks) ? parsed.picks : [];
    } catch { /* return empty */ }

    return new Response(JSON.stringify({ picks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "AI unavailable", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
