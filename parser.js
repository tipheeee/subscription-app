// Turns text read from a screenshot into subscription entries.
// Rule: if something isn't clearly in the text, leave it empty and say so.
(function (root) {
  const SERVICES = ["Netflix","Spotify","YouTube Premium","YouTube Music","YouTube","Apple Music","Apple TV+","iCloud+","iCloud","Apple One","Google One","Canva Pro","Canva","Adobe Creative Cloud","Adobe","Microsoft 365","Disney+","Amazon Prime","Prime Video","Showmax","DStv","Dropbox","ChatGPT Plus","ChatGPT","Claude Pro","Notion","Zoom","Slack","Audiomack","Boomplay","LinkedIn Premium","Duolingo","Figma","GitHub","Deezer","Tidal","HBO Max","Hulu","Paramount+","Crunchyroll","Grammarly","OneDrive","NordVPN","ExpressVPN","Surfshark","Coursera","Udemy","Skillshare","MasterClass","Headspace","Strava","Telegram Premium","Xbox Game Pass","PlayStation Plus","Midjourney","Perplexity","Squarespace","Wix","Shopify","Mailchimp","Zapier","Trello","Asana"];
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const SVC = SERVICES.slice().sort((a, b) => b.length - a.length)
    .map(n => ({ n, re: new RegExp("(^|[^a-z0-9])" + esc(n) + "($|[^a-z0-9])", "i") }));
  const findService = line => { for (const s of SVC) if (s.re.test(line)) return s.n; return null; };

  const CODES = "NGN|USD|EUR|GBP|INR|ZAR|GHS|KES|CAD|AUD|UGX|TZS|EGP|AED|BRL|MXN";
  const NUM = "(\\d{1,3}(?:,\\d{3})+|\\d+)(\\.\\d{1,2})?";
  const AMT_SRC = "(₦|\\$|€|£|₹|\\b(?:" + CODES + ")\\b|\\bN(?=\\d))\\s?" + NUM + "|" + NUM + "\\s?(\\b(?:" + CODES + ")\\b)";
  const SYM = { "₦": "NGN", "$": "USD", "€": "EUR", "£": "GBP", "₹": "INR" };

  function findAmounts(text) {
    const out = [];
    for (const m of text.matchAll(new RegExp(AMT_SRC, "gi"))) {
      let cur, note = "", int, dec;
      if (m[1]) {
        int = m[2]; dec = m[3] || "";
        if (SYM[m[1]]) { cur = SYM[m[1]]; if (m[1] === "$") note = "Currency assumed to be USD from the $ sign — check it."; }
        else if (m[1].toUpperCase() === "N") { cur = "NGN"; note = "Read “N” as naira — check it."; }
        else cur = m[1].toUpperCase();
      } else { int = m[4]; dec = m[5] || ""; cur = m[6].toUpperCase(); }
      out.push({ value: parseFloat(int.replace(/,/g, "") + dec), currency: cur, note });
    }
    return out;
  }
  const lineHasAmount = l => new RegExp(AMT_SRC, "i").test(l);

  const MON = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const mnum = s => MONTHS[s.toLowerCase().slice(0, 3)];
  const pad = n => String(n).padStart(2, "0");
  const validIso = iso => { const d = new Date(iso + "T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === iso; };

  function findDate(line) {
    let m, iso;
    const ok = s => validIso(s) ? { iso: s } : null;
    if ((m = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return ok(m[0]);
    if ((m = line.match(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-\\/]+(" + MON + ")\\.?,?[\\s\\-\\/]+(\\d{4})\\b", "i"))))
      return ok(`${m[3]}-${pad(mnum(m[2]))}-${pad(+m[1])}`);
    if ((m = line.match(new RegExp("\\b(" + MON + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b", "i"))))
      return ok(`${m[3]}-${pad(mnum(m[1]))}-${pad(+m[2])}`);
    if ((m = line.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/))) {
      const a = +m[1], b = +m[2];
      if (a > 12) return ok(`${m[3]}-${pad(b)}-${pad(a)}`);
      if (b > 12 || a === b) return ok(`${m[3]}-${pad(a)}-${pad(b)}`);
      return { iso: "", ambiguous: m[0] };
    }
    if ((m = line.match(new RegExp("\\b(\\d{1,2})\\s+(" + MON + ")\\b|\\b(" + MON + ")\\s+(\\d{1,2})\\b", "i"))))
      return { iso: "", partial: m[0] };
    return null;
  }

  const FREQ = [
    ["quarterly", /\bquarter(ly)?\b|every\s+3\s+months|\/\s?qtr\b/i],
    ["yearly", /\byear(ly)?\b|\bannual(ly)?\b|\/\s?yr\b|\bp\.?a\.?\b|every\s+12\s+months/i],
    ["weekly", /\bweek(ly)?\b|\/\s?wk\b/i],
    ["monthly", /\bmonth(ly)?\b|\/\s?mo\b|\bp\.?m\.?\b|every\s+month/i]
  ];
  const findFreq = text => { for (const [f, re] of FREQ) if (re.test(text)) return f; return ""; };

  const PLAN_RE = /\b(premium|pro|plus|standard|basic|family|individual|student|duo|business|team|teams|starter|essential|essentials|ultimate|mobile|max|lite|free trial|trial)\b/i;
  const EXPIRY_RE = /expir|\bends?\b|\bending\b|until|valid\s+(?:till|until|through)|cancels?\s+on/i;
  const CANCEL_RE = /\bcancel(?:l)?ed\b|\bcancellation\b|\bnot renewing\b|\bwill not renew\b/i;
  const EXPIRED_RE = /\bexpired\b|\bended\b/i;

  const clean = l => l.replace(/[|•·]+/g, " ").replace(/\s+/g, " ").trim();

  function buildEntry(name, lines) {
    const block = lines.join(" \n ");
    const notes = [];
    const e = { include: true, name, plan: "", amount: null, currency: "", freq: "", date: "", expiry: "", status: "active", notes };

    const pm = block.match(PLAN_RE);
    if (pm) e.plan = pm[1].replace(/^./, c => c.toUpperCase());

    const amts = lines.flatMap(findAmounts);
    if (amts.length) {
      e.amount = amts[0].value; e.currency = amts[0].currency;
      if (amts[0].note) notes.push(amts[0].note);
      const distinct = new Set(amts.map(a => a.value + a.currency));
      if (distinct.size > 1) notes.push("More than one price was found near this name — we used the first (" + amts[0].value + "). Check it.");
    } else notes.push("No price found for " + name + ".");

    e.freq = findFreq(block);
    if (!e.freq) notes.push("Billing period (monthly, yearly…) not found.");

    for (const line of lines) {
      const d = findDate(line);
      if (!d) continue;
      const isExpiry = EXPIRY_RE.test(line) && !/renew|next|billing|charge/i.test(line);
      const slot = isExpiry ? "expiry" : "date";
      if (d.iso) { if (!e[slot]) e[slot] = d.iso; }
      else if (d.ambiguous) notes.push("The date “" + d.ambiguous + "” could be day/month or month/day — enter it yourself.");
      else if (d.partial) notes.push("The date “" + d.partial + "” has no year — enter the full date yourself.");
    }
    if (!e.date && !e.expiry && !notes.some(n => n.indexOf("date") !== -1)) notes.push("No renewal date found.");

    if (EXPIRED_RE.test(block)) e.status = "expired";
    if (CANCEL_RE.test(block)) e.status = "cancelled";
    return e;
  }

  function parse(text) {
    const lines = String(text || "").split(/\r?\n/).map(clean).filter(Boolean);
    const out = [];
    let cur = null;
    const flush = () => { if (cur) out.push(buildEntry(cur.name, cur.lines)); cur = null; };
    for (const line of lines) {
      const svc = findService(line);
      if (svc && (!cur || svc !== cur.name || cur.lines.length > 6)) { flush(); cur = { name: svc, lines: [line] }; }
      else if (cur && cur.lines.length < 8) cur.lines.push(line);
    }
    flush();
    return out;
  }

  const dupKey = e => [String(e.name || "").trim().toLowerCase(), e.amount == null ? "" : e.amount, String(e.currency || "").toUpperCase(), e.freq || ""].join("|");

  function markDuplicates(draft, existing) {
    const seen = new Set((existing || []).map(dupKey));
    draft.forEach(e => {
      const k = dupKey(e);
      if (seen.has(k)) {
        e.include = false;
        e.notes.push("Already saved (or repeated in this screenshot) — left unticked.");
      } else seen.add(k);
    });
    return draft;
  }

  root.Parser = { parse, markDuplicates, dupKey, findAmounts, findDate };
})(typeof window !== "undefined" ? window : globalThis);
