// Supabase Edge Function: moderate-media
// Vets an image (or a video's thumbnail frame) before it's published, using
// Claude's vision API. Returns { approved: boolean, reason: string }.
//
// Deploy:  supabase functions deploy moderate-media
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// The client calls this via supabase.functions.invoke('moderate-media', { body: { image_base64 } }).
// JWT verification is on by default, so only signed-in users can call it.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (obj: unknown) =>
  new Response(JSON.stringify(obj), { headers: { ...corsHeaders, "content-type": "application/json" } });

const SYSTEM = `You are a content-moderation classifier for Joiny, a public social app where people post photos and short videos of events and meetups.
Decide whether an image is acceptable to publish publicly.
Reject (safe=false) if it contains: nudity or sexual content, graphic violence or gore, hate symbols, harassment, depictions of illegal activity (e.g. hard drugs, weapons used threateningly), or clearly disturbing/shocking imagery.
Allow (safe=true) ordinary content: people, selfies, groups, food, drinks, sports, nature, venues, pets, screenshots of normal text, etc.
When genuinely unsure, lean toward allowing (safe=true) — this is a friendly social app, not a strict filter.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { image_base64, media_type } = await req.json().catch(() => ({}));
    if (!image_base64) return json({ approved: true, reason: "no image to check" });
    if (!ANTHROPIC_API_KEY) return json({ approved: true, reason: "moderation not configured" });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8", // swap to "claude-haiku-4-5" for cheaper/faster moderation at scale
        max_tokens: 256,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: media_type || "image/jpeg", data: image_base64 } },
              { type: "text", text: "Is this image safe to publish on a public social app?" },
            ],
          },
        ],
        output_config: {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                safe: { type: "boolean" },
                reason: { type: "string" },
              },
              required: ["safe", "reason"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!resp.ok) {
      console.error("anthropic error", resp.status, await resp.text());
      return json({ approved: true, reason: "moderation unavailable" }); // fail-open
    }

    const data = await resp.json();
    const text = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");

    let verdict: { safe?: boolean; reason?: string } = {};
    try { verdict = JSON.parse(text); } catch { /* leave empty → treated as safe */ }

    const approved = verdict.safe !== false; // default to allow if the model output is unparseable
    return json({ approved, reason: verdict.reason || "" });
  } catch (e) {
    console.error("moderate-media error", e);
    return json({ approved: true, reason: "moderation error" }); // fail-open
  }
});
