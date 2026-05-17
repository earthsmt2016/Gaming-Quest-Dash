import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface SessionNote {
  date: string;
  action: string;
  minutes: number;
}

interface FocusGame {
  title: string;
  label: string;
  sessions: SessionNote[];
}

router.post("/focus-insights", async (req, res) => {
  const { games } = req.body as { games: FocusGame[] };

  if (!Array.isArray(games) || games.length === 0) {
    res.status(400).json({ error: "games array required" });
    return;
  }

  const results: { title: string; nextStep: string }[] = [];

  for (const game of games) {
    const sessionLines = game.sessions
      .map(s => `  - ${s.date} (${s.minutes}m): ${s.action}`)
      .join("\n");

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_completion_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              "You are a gaming advisor. Given a player's recent session notes for a game, write exactly ONE sentence (max 35 words) telling them specifically what to do in their next session. Reference their actual progress — name the specific area, mechanic, or challenge they should tackle next. No generic advice like 'keep going' or 'continue your run'. No preamble.",
          },
          {
            role: "user",
            content: `Game: ${game.title}\nStatus: ${game.label}\nRecent sessions:\n${sessionLines}`,
          },
        ],
      });

      const nextStep =
        response.choices[0]?.message?.content?.trim() || "Continue from your last session.";
      results.push({ title: game.title, nextStep });
    } catch (err) {
      console.error(`OpenAI error for ${game.title}:`, err);
      results.push({ title: game.title, nextStep: "Continue from your last session." });
    }
  }

  res.json({ insights: results });
});

export default router;
