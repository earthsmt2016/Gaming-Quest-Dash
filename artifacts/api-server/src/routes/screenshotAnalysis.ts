import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getConfig } from "./aiCost";

const router = Router();

/**
 * POST /api/screenshot-analyze
 * Body: { imageBase64: string, mimeType: string, existingGames?: string[] }
 * Returns: { game, action, type, minutes, confidence }
 */
router.post("/screenshot-analyze", async (req, res) => {
  const { enabled } = await getConfig('screenshot');
  if (!enabled) {
    res.status(503).json({ error: "Feature disabled — enable it in AI Cost Settings to use this feature." });
    return;
  }

  const { imageBase64, mimeType, existingGames } = req.body as {
    imageBase64?: string;
    mimeType?: string;
    existingGames?: string[];
  };

  if (!imageBase64 || !mimeType) {
    res.status(400).json({ error: "imageBase64 and mimeType are required" });
    return;
  }

  const gamesHint = existingGames?.length
    ? `\n\nKnown games in this library (match exactly if visible): ${existingGames.slice(0, 30).join(", ")}.`
    : "";

  const { model, max_tokens } = await getConfig('screenshot');

  try {
    const response = await openai.chat.completions.create({
      model,
      max_completion_tokens: max_tokens,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "low",
              },
            },
            {
              type: "text",
              text: `You are a gaming log assistant. Analyze this screenshot and extract a detailed log entry.${gamesHint}

Return ONLY valid JSON (no markdown, no explanation):
{
  "game": "<game title — exact name if you can read it, else best guess>",
  "action": "<specific description of what happened — name the achievement, boss, level, or event if visible. Max 80 chars>",
  "type": "<one of: progress | boss | complete | rank-up | purchase | achievement | milestone | competitive>",
  "minutes": <estimated session length as integer, 0 if unclear>,
  "confidence": <0.0 to 1.0>,
  "detected_event": "<specific event name if visible: achievement name, boss name, level name, rank reached — or null>",
  "score": "<visible score/rating/percentage as string, or null>",
  "rank": "<visible rank/tier/league as string, or null>"
}

Type rules:
- "boss": boss fight screen or boss health bar visible
- "complete": credits, mission complete, chapter complete, or game over (victory) screen
- "rank-up": rank/rating/tier change screen, promotion screen, or new rank badge visible
- "purchase": game store screen, first launch, or DLC installed
- "achievement": achievement unlock popup or trophy/achievement screen
- "milestone": level up, skill unlock, progression milestone (NOT a full completion)
- "competitive": match result screen, leaderboard, multiplayer end screen, ELO/MMR change
- "progress": everything else (in-game exploration, inventory, map, gameplay)

Extract "detected_event" as the specific named thing (e.g. "Platinum Trophy", "Defeated Margit", "Reached Diamond III", "Completed Chapter 4"). Use null if no specific named event is visible.`,
            },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      const cleaned = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      res.status(422).json({ error: "Could not parse AI response", raw: text });
      return;
    }

    res.json({
      game: String(parsed.game ?? ""),
      action: String(parsed.action ?? ""),
      type: String(parsed.type ?? "progress"),
      minutes: Number(parsed.minutes ?? 0),
      confidence: Number(parsed.confidence ?? 0.5),
      detected_event: parsed.detected_event ? String(parsed.detected_event) : null,
      score: parsed.score ? String(parsed.score) : null,
      rank: parsed.rank ? String(parsed.rank) : null,
    });
  } catch (err) {
    res.status(500).json({ error: "AI analysis failed", detail: String(err) });
  }
});

export default router;
