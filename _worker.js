// _worker.js: runs your whole Cloudflare Pages site. It answers /api/scan with the AI screenshot
// reader and serves every other page normally. Put this single file next to index.html.
// Settings (Cloudflare > your project > Settings > Variables and Secrets):
//   GEMINI_API_KEY (secret) from https://aistudio.google.com/apikey
//   MODEL (text, optional) only if the default model name has been retired

const PROMPT = (today) => `You read screenshots of subscription pages (Google Play, Apple App Store, bank or card alerts, receipts, Apple Pay, emails, any other layout).
Today's date is ${today}.
List every subscription or recurring charge that is VISIBLE in the image. Do not include apps that are not shown. Do not invent anything.
Return ONLY JSON: {"subscriptions":[{"name":string,"plan":string|null,"amount":number|null,"currency":string|null,"freq":"weekly"|"monthly"|"quarterly"|"yearly"|null,"date":string|null,"expiry":string|null,"status":"active"|"cancelled"|"expired","notes":string[]}]}
Rules:
- name: the SHORT brand name only (e.g. "Netflix", "Boomplay", "Google One", "CapCut" — not "CapCut: Photo & Video Editor"), never the plan, a button or a heading.
- Ignore the phone status bar, buttons (Resubscribe, Cancel), and payment-method lines (e.g. "Verve-5491" is a card, not a price).
- NEVER guess a price. If no currency amount is visible anywhere, amount must be null.
- amount: the recurring price as a plain number (4400, not "₦4,400.00"). null if no price is shown.
- currency: 3-letter code from the symbol or text (₦ or N = NGN, $ = USD, € = EUR, £ = GBP). null if unclear.
- freq: billing period if shown (per month, /yr, "1 Month", "Annual"...). null if not shown.
- date: the NEXT renewal or next billing date as YYYY-MM-DD. If the year is not shown, use the next occurrence on or after today. null if only a past payment date is shown.
- expiry: an end or expiry date as YYYY-MM-DD, otherwise null.
- status: "cancelled" if it says cancelled / will not renew / ends on; "expired" if already expired; otherwise "active".
- notes: short remarks only where you were unsure (e.g. "Year not shown, assumed 2026").
If you see no subscriptions, return {"subscriptions":[]}.`;

const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...h } });

function parseModelJson(text) {
  const t = String(text || "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  return JSON.parse(t.slice(a, b + 1));
}

async function askGemini(env, image, mime, today) {
  const model = env.MODEL || "gemini-2.5-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mime, data: image } }, { text: PROMPT(today) }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 }
    })
  });
  if (!r.ok) throw new Error("Gemini " + r.status + " " + (await r.text()).slice(0, 200));
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
}

async function askClaude(env, image, mime, today) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: env.MODEL || "claude-haiku-5-5", max_tokens: 2000, temperature: 0,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mime, data: image } },
        { type: "text", text: PROMPT(today) }] }]
    })
  });
  if (!r.ok) throw new Error("Claude " + r.status + " " + (await r.text()).slice(0, 200));
  const d = await r.json();
  return (d.content || []).map(c => c.text || "").join("");
}

async function handleScan(req, env) {
  const h = {};
  if (req.method !== "POST") return json({ error: "POST only" }, 405, h);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "origin not allowed" }, 403, h);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "bad request" }, 400, h); }
  const { image, mime, today } = body || {};
  if (typeof image !== "string" || image.length < 100 || image.length > 7_000_000) return json({ error: "image missing or too large" }, 400, h);
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) return json({ error: "unsupported image type" }, 400, h);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(today || "") ? today : new Date().toISOString().slice(0, 10);
  try {
    const text = env.GEMINI_API_KEY ? await askGemini(env, image, mime, day)
      : env.ANTHROPIC_API_KEY ? await askClaude(env, image, mime, day)
      : (() => { throw new Error("no API key set in Cloudflare"); })();
    const out = parseModelJson(text);
    if (!Array.isArray(out.subscriptions)) throw new Error("model reply had no list");
    return json({ subscriptions: out.subscriptions.slice(0, 30) }, 200, h);
  } catch (e) {
    return json({ error: String(e.message || e).slice(0, 300) }, 502, h);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/scan") return handleScan(request, env);
    return env.ASSETS.fetch(request);
  }
};
