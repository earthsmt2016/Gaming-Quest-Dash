import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType, existingGames } = await req.json() as {
      imageBase64?: string;
      mimeType?: string;
      existingGames?: string[];
    };

    if (!imageBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "imageBase64 and mimeType are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gamesHint = existingGames?.length
      ? `\n\nKnown games in this library (match exactly if visible): ${existingGames.slice(0, 30).join(", ")}.`
      : "";

    const openaiKey = Deno.env.get("AI_INTEGRATIONS_OPENAI_API_KEY");
    const openaiBase = Deno.env.get("AI_INTEGRATIONS_OPENAI_BASE_URL") || "https://api.openai.com/v1";

    const response = await fetch(`${openaiBase}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "low" } },
            { type: "text", text: `You are a gaming log assistant. Analyze this screenshot and extract a log entry.${gamesHint}\n\nReturn ONLY valid JSON (no markdown, no explanation):\n{\n  "game": "<game title>",\n  "action": "<brief description, max 60 chars>",\n  "type": "<one of: progress | boss | complete | rank-up | purchase>",\n  "minutes": <integer>,\n  "confidence": <0.0 to 1.0>\n}` },
          ],
        }],
      }),
    });

    const data = await response.json() as { choices?: Array<{ message: { content: string } }> };
    const text = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      const cleaned = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({ error: "Could not parse AI response", raw: text }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      game: String(parsed.game ?? ""),
      action: String(parsed.action ?? ""),
      type: String(parsed.type ?? "progress"),
      minutes: Number(parsed.minutes ?? 0),
      confidence: Number(parsed.confidence ?? 0.5),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "AI analysis failed", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
