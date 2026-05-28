import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface GameInput {
  title: string;
  daysSinceLastPlayed: number;
  minutesThisWeek: number;
  avgSessionMinutes: number;
  totalMinutesLogged: number;
  priorityLabel: string;
  recentSessions: { date: string; action: string; minutes: number }[];
}

router.post("/daily-plan", async (req, res) => {
  const { availableMinutes, dayOfWeek, games } = req.body as {
    availableMinutes: number;
    dayOfWeek: string;
    games: GameInput[];
  };

  if (!availableMinutes || !Array.isArray(games) || games.length === 0) {
    res.status(400).json({ error: "availableMinutes and games array required" });
    return;
  }

  const gameBlocks = games.map(g => {
    const sessionLines = g.recentSessions
      .map(s => `  - ${s.date} (${s.minutes}m): ${s.action}`)
      .join("\n");
    return [
      `## ${g.title}`,
      `Status: ${g.priorityLabel} | Last played: ${g.daysSinceLastPlayed === 0 ? "today" : `${g.daysSinceLastPlayed}d ago`} | This week: ${g.minutesThisWeek}m | Avg session: ${g.avgSessionMinutes}m | Total logged: ${g.totalMinutesLogged}m`,
      `Recent sessions:\n${sessionLines || "  (no notes)"}`,
    ].join("\n");
  }).join("\n\n");

  const maxGames =
    availableMinutes < 30  ? 1 :
    availableMinutes < 60  ? 2 :
    availableMinutes < 180 ? 3 :
    availableMinutes < 360 ? 4 : 5;

  const systemPrompt = `You are a smart daily gaming session planner. Given a player's active games and available time, you create an optimal session plan.

Selection rules:
- Pick at most ${maxGames} game${maxGames > 1 ? "s" : ""} (based on available time: ${availableMinutes} min)
- Minimum 15 minutes per game
- CRITICAL: The sum of all "minutes" values MUST be as close as possible to ${availableMinutes} — fill the time. Leaving more than 20 minutes unplanned is not acceptable.
- Distribute time proportionally: if you pick 3 games for 180 minutes, each gets ~60 minutes; for 600 minutes, each gets ~120–200 minutes. Scale up from the player's avg session length to fill the available time — a player with a 30m avg can play a 120m session if they have 4 hours free.
- Priority order: "Boss fight reached" > "Active story run" > "Just started" > long neglect > "Competitive"
- Prefer variety if time allows, but never sacrifice strategic priority for it

The "why" field MUST cover two things in 1–2 sentences (max 45 words total):
1. WHY this game was selected today — the specific reason it ranked above others
2. What the player will GAIN or ACHIEVE by playing it now — concrete benefit
Reference the player's actual session notes. Be specific and game-aware.

Respond ONLY with valid JSON — no markdown, no explanation:
{ "picks": [ { "game": "<exact game name from input>", "minutes": <number>, "why": "<reason + benefit>" } ] }`;

  const userPrompt = `Available time: ${availableMinutes} minutes\nDay: ${dayOfWeek}\n\n${gameBlocks}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 700,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    let picks: { game: string; minutes: number; why: string }[] = [];

    try {
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(jsonStr);
      picks = Array.isArray(parsed.picks) ? parsed.picks : [];
    } catch {
      console.error("daily-plan: failed to parse AI JSON:", raw);
    }

    res.json({ picks });
  } catch (err) {
    console.error("daily-plan: OpenAI error:", err);
    res.status(500).json({ error: "AI unavailable" });
  }
});

export default router;
