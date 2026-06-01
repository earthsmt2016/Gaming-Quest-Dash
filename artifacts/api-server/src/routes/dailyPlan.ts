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

interface ActiveQuestInput {
  game: string;
  title: string;
  estimated_minutes: number;
  difficulty: string;
}

router.post("/daily-plan", async (req, res) => {
  const { availableMinutes, dayOfWeek, games, activeQuests } = req.body as {
    availableMinutes: number;
    dayOfWeek: string;
    games: GameInput[];
    activeQuests?: ActiveQuestInput[];
  };

  if (!availableMinutes || !Array.isArray(games) || games.length === 0) {
    res.status(400).json({ error: "availableMinutes and games array required" });
    return;
  }

  // Build a map of quests by game for fast lookup
  const questsByGame = new Map<string, ActiveQuestInput[]>();
  for (const q of (activeQuests ?? [])) {
    const list = questsByGame.get(q.game) ?? [];
    list.push(q);
    questsByGame.set(q.game, list);
  }

  // Include games that have active quests but no play history so the AI can consider them
  const knownTitles = new Set(games.map(g => g.title));
  const questOnlyGames: GameInput[] = [];
  for (const [game, quests] of questsByGame) {
    if (!knownTitles.has(game)) {
      questOnlyGames.push({
        title: game,
        daysSinceLastPlayed: 999,
        minutesThisWeek: 0,
        avgSessionMinutes: quests[0].estimated_minutes,
        totalMinutesLogged: 0,
        priorityLabel: "Active quest (no recent play)",
        recentSessions: [],
      });
    }
  }

  const allGames = [...games, ...questOnlyGames];

  const gameBlocks = allGames.map(g => {
    const sessionLines = g.recentSessions
      .map(s => `  - ${s.date} (${s.minutes}m): ${s.action}`)
      .join("\n");
    const gameQuests = questsByGame.get(g.title) ?? [];
    const questLines = gameQuests
      .map(q => `  🎯 "${q.title}" (~${q.estimated_minutes}m, ${q.difficulty})`)
      .join("\n");
    return [
      `## ${g.title}`,
      `Status: ${g.priorityLabel} | Last played: ${g.daysSinceLastPlayed === 0 ? "today" : g.daysSinceLastPlayed > 100 ? "never" : `${g.daysSinceLastPlayed}d ago`} | This week: ${g.minutesThisWeek}m | Avg session: ${g.avgSessionMinutes}m | Total logged: ${g.totalMinutesLogged}m`,
      `Recent sessions:\n${sessionLines || "  (no notes)"}`,
      ...(questLines ? [`Active quests:\n${questLines}`] : []),
    ].join("\n");
  }).join("\n\n");

  const maxGames =
    availableMinutes < 30  ? 1 :
    availableMinutes < 60  ? 2 :
    availableMinutes < 180 ? 3 :
    availableMinutes < 360 ? 4 : 5;

  const questPriorityNote = (activeQuests?.length ?? 0) > 0
    ? `\n- Games with active quests (marked 🎯) represent specific goals the player is working toward — give them strong priority so the player can make quest progress this session.`
    : "";

  const systemPrompt = `You are a smart daily gaming session planner. Given a player's active games and available time, you create an optimal session plan.

Selection rules:
- Pick at most ${maxGames} game${maxGames > 1 ? "s" : ""} (based on available time: ${availableMinutes} min)
- Minimum 15 minutes per game
- CRITICAL: The sum of all "minutes" values MUST be as close as possible to ${availableMinutes} — fill the time. Leaving more than 20 minutes unplanned is not acceptable.
- Distribute time proportionally: if you pick 3 games for 180 minutes, each gets ~60 minutes; for 600 minutes, each gets ~120–200 minutes. Scale up from the player's avg session length to fill the available time — a player with a 30m avg can play a 120m session if they have 4 hours free.
- Priority order: "Boss fight reached" > "Active story run" > "Just started" > long neglect > "Competitive"
- Prefer variety if time allows, but never sacrifice strategic priority for it${questPriorityNote}

The "why" field MUST cover two things in 1–2 sentences (max 45 words total):
1. WHY this game was selected today — the specific reason it ranked above others
2. What the player will GAIN or ACHIEVE by playing it now — concrete benefit
Reference the player's actual session notes and quests. Be specific and game-aware.

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
