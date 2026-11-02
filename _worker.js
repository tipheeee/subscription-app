// _worker.js: runs your whole Cloudflare site. It answers /api/scan by sending the screenshot
// to OCR.space (a text-reading service) and returning the text it finds. Every other page is
// served normally.
// Setting (Cloudflare > your project > Settings > Variables and Secrets):
//   OCR_SPACE_API_KEY (secret): your free key from https://ocr.space/ocrapi

const json = (obj, status) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});

async function readWithOcrSpace(env, image, mime) {
  if (!env.OCR_SPACE_API_KEY) throw new Error("no OCR key set in Cloudflare");
  const form = new FormData();
  form.append("base64Image", `data:${mime};base64,${image}`);
  form.append("language", "eng");
  form.append("OCREngine", "2");
  form.append("scale", "true");
  form.append("detectOrientation", "true");
  form.append("isOverlayRequired", "false");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  let r;
  try {
    r = await fetch("https://api.ocr.space/parse/image", {
      method: "POST", headers: { apikey: env.OCR_SPACE_API_KEY }, body: form, signal: ctrl.signal
    });
  } catch (e) {
    throw new Error(e && e.name === "AbortError" ? "OCR.space took too long" : "could not reach OCR.space");
  } finally { clearTimeout(timer); }
  if (!r.ok) throw new Error("OCR.space answered " + r.status);
  const d = await r.json();
  if (d.IsErroredOnProcessing || Number(d.OCRExitCode) > 2) {
    const m = Array.isArray(d.ErrorMessage) ? d.ErrorMessage.join(" ") : String(d.ErrorMessage || "unknown error");
    throw new Error("OCR.space: " + m);
  }
  return (d.ParsedResults || []).map(p => p.ParsedText || "").join("\n").trim();
}

async function handleScan(req, env) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "origin not allowed" }, 403);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "bad request" }, 400); }
  const { image, mime } = body || {};
  // OCR.space's free plan accepts files up to 1 MB; base64 text is about a third bigger than the file.
  if (typeof image !== "string" || image.length < 100 || image.length > 1_400_000) return json({ error: "image missing or too large" }, 400);
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) return json({ error: "unsupported image type" }, 400);
  try {
    return json({ text: await readWithOcrSpace(env, image, mime) }, 200);
  } catch (e) {
    return json({ error: String(e.message || e).slice(0, 300) }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/scan") return handleScan(request, env);
    return env.ASSETS.fetch(request);
  }
};
