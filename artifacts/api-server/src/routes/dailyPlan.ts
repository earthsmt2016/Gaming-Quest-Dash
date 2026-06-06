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

const PLATFORM_MODE_PROMPTS: Record<string, string> = {
  mobile: 'PLATFORM FILTER: MOBILE ONLY. The player wants to play on mobile tonight. Only include games that are available on mobile (iOS/Android/Apple Arcade). If you are unsure whether a game is on mobile, err on the side of excluding it. State the platform in the "why" field.',
  xbox:   'PLATFORM FILTER: XBOX ONLY. The player wants to play on Xbox tonight (Xbox console or Xbox Game Pass). Only include games playable on Xbox or via Game Pass. State the platform in the "why" field.',
};

const SESSION_MODE_PROMPTS: Record<string, string> = {
  quick_win:   'Session mode: QUICK WIN. Prioritise games/quests that can be completed or meaningfully advanced in the available time. Prefer quests close to completion, games with short active quests, and tasks that give a clear sense of accomplishment. Avoid time sinks.',
  story_push:  'Session mode: STORY PUSH. Prioritise games with active narrative quests or significant story milestones upcoming. Pick the game the player is deepest into and push the story forward — name the exact upcoming story beat in the "why".',
  grind:       'Session mode: GRIND/FARM. Prioritise games where the player is working toward a resource, rank, or completion percentage target. Name the specific grind (e.g., "farm X more Y tokens", "reach rank Z"). Maximise one or two games rather than spreading thin.',
  chill:       'Session mode: CHILL. Prioritise relaxing, low-pressure sessions. Avoid boss-fight stages or high-difficulty quests. Prefer games with exploration, collectibles, or enjoyable grinding. The tone in "why" should feel easy and inviting.',
  competitive: 'Session mode: COMPETITIVE. Prioritise rank-up, rated matches, or competitive modes. Focus on one game for maximum match count. Name the target rank or rating change in the "why".',
};

router.post("/daily-plan", async (req, res) => {
  const { availableMinutes, dayOfWeek, games, activeQuests, sessionMode, platformMode } = req.body as {
    availableMinutes: number;
    dayOfWeek: string;
    games: GameInput[];
    activeQuests?: ActiveQuestInput[];
    sessionMode?: string;
    platformMode?: string;
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

  const modeLine = sessionMode && SESSION_MODE_PROMPTS[sessionMode]
    ? `\n\n${SESSION_MODE_PROMPTS[sessionMode]}`
    : "";

  const platformLine = platformMode && PLATFORM_MODE_PROMPTS[platformMode]
    ? `\n\n${PLATFORM_MODE_PROMPTS[platformMode]}`
    : "";

  const systemPrompt = `You are a sharp daily gaming session planner. Given a player's active games and available time, you create an optimal, specific session plan.${platformLine}${modeLine}

Selection rules:
- Pick at most ${maxGames} game${maxGames > 1 ? "s" : ""} (based on available time: ${availableMinutes} min)
- Minimum 15 minutes per game
- CRITICAL: The sum of all "minutes" values MUST be as close as possible to ${availableMinutes} — fill the time. Leaving more than 20 minutes unplanned is not acceptable.
- Distribute time proportionally: if you pick 3 games for 180 minutes, each gets ~60 minutes; for 600 minutes, each gets ~120–200 minutes. Scale up from the player's avg session length to fill the available time — a player with a 30m avg can play a 120m session if they have 4 hours free.
- Priority order: "Boss fight reached" > "Active story run" > "Just started" > long neglect > "Competitive"
- Prefer variety if time allows, but never sacrifice strategic priority for it${questPriorityNote}

The "why" field (max 40 words, 1–2 sentences) MUST:
1. Name the SPECIFIC reason this game was chosen — reference a concrete detail from the session notes or quest (e.g. "you reached the boss room last session", "your Void Crystal farm is 8/20", "this quest expires soon")
2. State what EXACTLY the player will accomplish in these ${availableMinutes} minutes — a concrete target, not a vague outcome

FORBIDDEN in the "why" field — never write these or anything like them:
- "keep momentum", "stay engaged", "push the story forward", "make progress"
- "continue your journey", "build on recent sessions", "maintain consistency"
- "great opportunity", "good time to", "feels right", "makes sense"

GOOD example: "You reached Harrek's gate last session and have 60 min — enough to clear the two guard rooms and trigger the boss cutscene."
BAD example: "Good time to push this game forward and make some solid progress on your active quest."

Respond ONLY with valid JSON — no markdown, no explanation:
{ "picks": [ { "game": "<exact game name from input>", "minutes": <number>, "why": "<specific session note reference + concrete target>" } ] }`;

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
