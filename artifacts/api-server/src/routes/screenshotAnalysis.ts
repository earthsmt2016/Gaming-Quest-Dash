import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

/**
 * POST /api/screenshot-analyze
 * Body: { imageBase64: string, mimeType: string, existingGames?: string[] }
 * Returns: { game, action, type, minutes, confidence }
 */
router.post("/screenshot-analyze", async (req, res) => {
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

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 400,
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
              text: `You are a gaming log assistant. Analyze this screenshot and extract a log entry.${gamesHint}

Return ONLY valid JSON (no markdown, no explanation):
{
  "game": "<game title — exact name if you can read it, else best guess>",
  "action": "<brief description of what happened: boss fight, completed level, ranked up, etc. Max 60 chars>",
  "type": "<one of: progress | boss | complete | rank-up | purchase>",
  "minutes": <estimated session length as integer, 0 if unclear>,
  "confidence": <0.0 to 1.0>
}

Type rules: use "boss" if a boss fight/boss health bar is visible; "complete" if credits/mission complete screen; "rank-up" if rank/rating change visible; "purchase" if first launch/store screen; otherwise "progress".`,
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
    });
  } catch (err) {
    res.status(500).json({ error: "AI analysis failed", detail: String(err) });
  }
});

export default router;
