// Turns text read from a screenshot into subscription entries.
// Works with different layouts (Google Play, App Store / Apple, bank alerts, receipts, plain lists).
// Rule: if something isn't clearly in the text, leave it empty and say so.
(function (root) {
  const SERVICES = ["Netflix","Spotify","YouTube Premium","YouTube Music","YouTube","Apple Music","Apple TV+","Apple Arcade","iCloud+","iCloud","Apple One","Google One","Google Play Pass","Canva Pro","Canva","Adobe Creative Cloud","Adobe","Microsoft 365","Office 365","Disney+","Disney Plus","Disney Hotstar","Hotstar","Amazon Prime","Prime Video","Amazon Music","Showmax","DStv","GOtv","StarTimes","Dropbox","ChatGPT Plus","ChatGPT","OpenAI","Claude Pro","Claude","Gemini","Notion","Zoom","Slack","Audiomack","Boomplay","LinkedIn Premium","LinkedIn","Duolingo","Figma","GitHub","Deezer","Tidal","SoundCloud","HBO Max","Hulu","Paramount+","Crunchyroll","Grammarly","OneDrive","NordVPN","ExpressVPN","Surfshark","ProtonVPN","Proton","Coursera","Udemy","Skillshare","MasterClass","Headspace","Strava","Telegram Premium","Xbox Game Pass","PlayStation Plus","Twitch","Patreon","Substack","Medium","Tinder","Bumble","Evernote","Todoist","Bitwarden","1Password","Midjourney","Perplexity","Squarespace","Wix","Shopify","Mailchimp","Zapier","Trello","Asana","Cursor","X Premium"];
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const SVC = SERVICES.slice().sort((a, b) => b.length - a.length)
    .map(n => ({ n, re: new RegExp("(^|[^a-z0-9])" + esc(n) + "($|[^a-z0-9])", "i"), solo: /^[A-Za-z]{5,}$/.test(n) ? n.toLowerCase() : null }));

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 9;
    const d = [];
    for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  // Exact match first; then forgive one wrong letter from the text reader (e.g. "Netfiix").
  function findService(line) {
    for (const s of SVC) if (s.re.test(line)) return s.n;
    const words = line.toLowerCase().match(/[a-z]{5,}/g) || [];
    for (const w of words) for (const s of SVC) if (s.solo && lev(w, s.solo) === 1) return s.n;
    return null;
  }

  // ---------- Money ----------
  const CODES = "NGN|USD|EUR|GBP|INR|ZAR|GHS|KES|CAD|AUD|UGX|TZS|EGP|AED|BRL|MXN";
  const NUMSRC = "\\d{1,3}(?:[,.]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?";
  const PRE = "₦|US\\$|\\$|€|£|₹|#|" + CODES + "|N";
  const SYM = { "₦": "NGN", "#": "NGN", "$": "USD", "US$": "USD", "€": "EUR", "£": "GBP", "₹": "INR" };
  const PER = "mo(?:nth)?|mon|yr|year|wk|week|annum";

  function parseNum(raw) {
    const m = raw.match(/^(.*?)[.,](\d{1,2})$/);
    let int = raw, dec = "";
    if (m) { int = m[1]; dec = m[2]; }
    return parseFloat(int.replace(/[.,]/g, "") + (dec ? "." + dec : ""));
  }

  function findAmounts(text) {
    const out = [];
    const r1 = new RegExp("(?:^|[^A-Za-z])(" + PRE + ")\\s?(" + NUMSRC + ")(?!\\d)", "gi");
    for (const m of text.matchAll(r1)) {
      const p = m[1].toUpperCase(); let cur, note = "";
      if (SYM[p] || SYM[m[1]]) {
        cur = SYM[m[1]] || SYM[p];
        if (p === "$") note = "Currency assumed to be USD from the $ sign — check it.";
        if (p === "#") note = "Read “#” as naira — check it.";
      } else if (p === "N") { cur = "NGN"; note = "Read “N” as naira — check it."; }
      else cur = p;
      out.push({ value: parseNum(m[2]), currency: cur, note, at: m.index });
    }
    const r2 = new RegExp("(?:^|[^\\d.,])(" + NUMSRC + ")\\s?(" + CODES + ")(?![A-Za-z])", "gi");
    for (const m of text.matchAll(r2)) {
      if (out.some(o => Math.abs(o.at - m.index) < 3)) continue;
      out.push({ value: parseNum(m[1]), currency: m[2].toUpperCase(), note: "", at: m.index });
    }
    // "4,400/month" with no currency shown
    const r3 = new RegExp("(?:^|[^\\d.,A-Za-z])(" + NUMSRC + ")\\s?(?:\\/|per\\s)\\s?(?:" + PER + ")\\b", "gi");
    for (const m of text.matchAll(r3)) {
      if (out.some(o => text.indexOf(m[1], o.at) !== -1 && Math.abs(text.indexOf(m[1], o.at) - o.at) < 6)) continue;
      out.push({ value: parseNum(m[1]), currency: "", note: "", at: m.index });
    }
    return out.filter(a => isFinite(a.value) && a.value > 0 && a.value < 1e8).sort((a, b) => a.at - b.at);
  }

  // ---------- Dates ----------
  const MON = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const mnum = s => MONTHS[s.toLowerCase().slice(0, 3)];
  const pad = n => String(n).padStart(2, "0");
  const validIso = iso => { const d = new Date(iso + "T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === iso; };
  const isoOf = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

  function findDate(line) {
    let m;
    const ok = (iso, note) => validIso(iso) ? { iso, note: note || "" } : null;
    if ((m = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return ok(m[0]);
    if ((m = line.match(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-\\/]+(" + MON + ")\\.?,?[\\s\\-\\/]+(\\d{4})\\b", "i"))))
      return ok(`${m[3]}-${pad(mnum(m[2]))}-${pad(+m[1])}`);
    if ((m = line.match(new RegExp("\\b(" + MON + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b", "i"))))
      return ok(`${m[3]}-${pad(mnum(m[1]))}-${pad(+m[2])}`);
    if ((m = line.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4}|\d{2})\b/))) {
      const a = +m[1], b = +m[2], y = m[3].length === 2 ? "20" + m[3] : m[3];
      if (a > 12) return ok(`${y}-${pad(b)}-${pad(a)}`);
      if (b > 12 || a === b) return ok(`${y}-${pad(a)}-${pad(b)}`);
      return ok(`${y}-${pad(b)}-${pad(a)}`, "Read “" + m[0] + "” as day/month/year — check it.");
    }
    // Day and month but no year: use the next time that date comes round.
    let dm = line.match(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(" + MON + ")\\b", "i"));
    let day, mon;
    if (dm) { day = +dm[1]; mon = mnum(dm[2]); }
    else if ((dm = line.match(new RegExp("\\b(" + MON + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b", "i")))) { day = +dm[2]; mon = mnum(dm[1]); }
    if (day) {
      const t = todayStart(); let y = t.getFullYear();
      if (new Date(y, mon - 1, day) < new Date(t.getTime() - 86400000)) y++;
      const iso = `${y}-${pad(mon)}-${pad(day)}`;
      return ok(iso, "No year was shown for “" + dm[0] + "” — assumed " + y + ". Check it.");
    }
    if (/\btomorrow\b/i.test(line)) { const d = todayStart(); d.setDate(d.getDate() + 1); return { iso: isoOf(d), note: "" }; }
    if (/\btoday\b/i.test(line) && /renew|expir|due|charge|bill/i.test(line)) return { iso: isoOf(todayStart()), note: "" };
    if ((m = line.match(/\bin\s+(\d{1,3})\s+days?\b/i))) { const d = todayStart(); d.setDate(d.getDate() + +m[1]); return { iso: isoOf(d), note: "" }; }
    return null;
  }

  // ---------- Billing period, plan, status ----------
  const FREQ = [
    ["quarterly", /\bquarter(?:ly)?\b|every\s+3\s+months|\b3\s*months?\b|\/\s?qtr\b/i],
    ["yearly", /\byear(?:ly)?\b|\bannual(?:ly)?\b|\/\s?yr\b|\bper\s+annum\b|every\s+12\s+months|\b12\s*months?\b/i],
    ["weekly", /\bweek(?:ly)?\b|\/\s?wk\b/i],
    ["monthly", /\bmonth(?:ly)?\b|\/\s?mon?\b|\bper\s+mo\b|\bmo\b/i]
  ];
  const findFreq = text => { for (const [f, re] of FREQ) if (re.test(text)) return f; return ""; };

  const PLAN_WORDS = "premium|pro|plus|standard|basic|family|individual|student|duo|business|team|teams|starter|essential|essentials|ultimate|mobile|max|lite|free|trial|annual|monthly|yearly|weekly|plan|subscription";
  const PLAN_RE = /\b(premium|pro|plus|standard|basic|family|individual|student|duo|business|teams?|starter|essentials?|ultimate|mobile|max|lite|free trial)\b/i;
  const PLAN_SET = new Set(PLAN_WORDS.split("|"));
  const EXPIRY_RE = /expir|\bends?\b|\bending\b|until|valid\s+(?:till|until|through)|cancels?\s+on/i;
  const RENEW_RE = /renew|next|billing|charge|due|pay/i;
  const CANCEL_RE = /\bcancel(?:l)?ed\b|\bnot renewing\b|\bwill not renew\b|auto[- ]?renew\s+(?:is\s+)?off|renewal\s+off/i;
  const PAST_RE = /\b(debit|debited|paid|charged|purchase|receipt|transaction|successful|payment of)\b/i;
  const SECTION_RE = /^(active|expired|inactive|cancelled|canceled)(\s+subscriptions?)?:?$/i;
  const EXPIRED_RE = /\bexpired\b|\bended\b/i;
  const NOISE = /^(subscriptions?|manage|payments?|payment methods?|billing|renews?|renewal|expires?|expired|cancel|cancelled|canceled|active|inactive|settings|google play|app store|apple id|account|total|price|amount|date|next|due|history|order|receipt|transactions?|status|monthly|yearly|weekly|quarterly|auto|edit|done|back|search|today|yesterday|more|view|see all|help|free trial|family sharing|bank|debit|credit|card|visa|mastercard|verve|balance|alert|your|you|the)\b/i;

  const clean = l => l.replace(/[|•·›>]+/g, " ").replace(/\s+/g, " ").trim();

  const onlyPlanWords = l => { const w = l.toLowerCase().match(/[a-z]+/g) || []; return w.length > 0 && w.every(x => PLAN_SET.has(x)); };
  function looksLikeName(line) {
    if (line.length < 3 || line.length > 40) return false;
    if (findDate(line) || NOISE.test(line) || onlyPlanWords(line)) return false;
    const letters = (line.match(/[A-Za-z]/g) || []).length;
    if (letters < 3 || letters / line.replace(/\s/g, "").length < 0.7) return false;
    if (line.split(" ").length > 5) return false;
    return /[A-Za-z]{3,}/.test(line);
  }

  function buildEntry(name, lines, section) {
    const block = lines.join(" \n ");
    const notes = [];
    const e = { include: true, name, plan: "", amount: null, currency: "", freq: "", date: "", expiry: "", status: "active", notes };

    const pm = block.match(PLAN_RE);
    if (pm && !new RegExp("\\b" + esc(pm[1]) + "\\b", "i").test(name)) e.plan = pm[1].replace(/^./, c => c.toUpperCase());

    // Pick the price: prefer one sitting next to a billing period ("/month"), else the first.
    const amts = [];
    lines.forEach(l => findAmounts(l).forEach(a => amts.push(Object.assign(a, { line: l }))));
    if (amts.length) {
      const pick = amts.find(a => findFreq(a.line)) || amts[0];
      e.amount = pick.value; e.currency = pick.currency;
      if (pick.note) notes.push(pick.note);
      if (!e.currency) { e.currency = (root.APP_CONFIG && root.APP_CONFIG.defaultCurrency) || "NGN"; notes.push("No currency was shown — assumed " + e.currency + ". Check it."); }
      if (new Set(amts.map(a => a.value + a.currency)).size > 1) notes.push("More than one price was found near this name — we used " + pick.value + ". Check it.");
    } else notes.push("No price found for " + name + ".");

    e.freq = findFreq(block);
    if (!e.freq) notes.push("Billing period (monthly, yearly…) not found.");

    let dateNoted = false;
    for (const line of lines) {
      const d = findDate(line);
      if (!d) continue;
      const slot = EXPIRY_RE.test(line) && !RENEW_RE.test(line) ? "expiry" : "date";
      if (slot === "date" && PAST_RE.test(block) && !/renew|next|upcoming|due/i.test(line)) {
        notes.push("This looks like a payment that already happened on " + d.iso + ". Enter the next renewal date yourself.");
        dateNoted = true; continue;
      }
      if (!e[slot]) { e[slot] = d.iso; if (d.note) notes.push(d.note); }
      dateNoted = true;
    }
    if (!dateNoted) notes.push("No renewal date found.");

    if (EXPIRED_RE.test(block)) e.status = "expired";
    if (CANCEL_RE.test(block)) e.status = "cancelled";
    if (e.status === "active" && section) e.status = section;
    return e;
  }

  function parse(text) {
    const lines = String(text || "").split(/\r?\n/).map(clean).filter(l => l.length > 1);
    const blocks = [];
    let cur = null, section = "";
    const push = () => { if (cur) { cur.section = cur.section == null ? section : cur.section; blocks.push(cur); } cur = null; };
    for (const line of lines) {
      const sm = line.match(SECTION_RE);
      if (sm) { push(); const k = sm[1].toLowerCase(); section = k === "expired" || k === "inactive" ? "expired" : k === "active" ? "" : "cancelled"; continue; }
      const svc = findService(line);
      const amts = findAmounts(line);
      if (svc) {
        if (cur && cur.name === svc && cur.lines.length < 8) cur.lines.push(line);
        else { push(); cur = { name: svc, known: true, lines: [line] }; }
        if (amts.length) cur.hasAmt = true;
      } else if (amts.length) {
        if (cur && !cur.hasAmt) { cur.lines.push(line); cur.hasAmt = true; }
        else {
          // Unknown app with the price on the same line: "Some App  ₦2,500/month"
          const prefix = clean(line.slice(0, amts[0].at + (/^[^A-Za-z]/.test(line.slice(amts[0].at)) ? 1 : 0)).replace(/[^A-Za-z0-9+&.' -]+$/, ""));
          if (looksLikeName(prefix)) { push(); cur = { name: prefix, known: false, lines: [line], hasAmt: true }; }
          else if (cur && cur.lines.length < 10) cur.lines.push(line);
        }
      } else if (looksLikeName(line)) {
        if (cur && !cur.hasAmt && cur.lines.length < 3) cur.lines.push(line);
        else { push(); cur = { name: line.replace(/[^A-Za-z0-9+&.' -]+/g, "").trim(), known: false, lines: [line] }; }
      } else if (cur && cur.lines.length < 10) cur.lines.push(line);
    }
    push();
    // Names we don't recognise only count if there's a price or a date with them.
    return blocks
      .filter(b => b.known || b.hasAmt || b.lines.some(l => findDate(l)))
      .map(b => buildEntry(b.name, b.lines, b.section));
  }

  // ---------- Duplicates ----------
  const normName = n => {
    const w = String(n || "").toLowerCase().replace(/[^a-z0-9+ ]+/g, " ").split(/\s+/).filter(x => x && !PLAN_SET.has(x));
    return w.join(" ") || String(n || "").toLowerCase().trim();
  };
  const dupKey = e => normName(e.name);
  // Same service, and the price matches (or one side has no price). Plan/date changes don't matter.
  function isDup(a, b) {
    if (!a || !b || normName(a.name) !== normName(b.name)) return false;
    if (a.amount == null || b.amount == null || a.amount === "" || b.amount === "") return true;
    if (a.currency && b.currency && String(a.currency).toUpperCase() !== String(b.currency).toUpperCase()) return false;
    return Math.abs(+a.amount - +b.amount) < 0.01;
  }

  function markDuplicates(draft, existing) {
    const seen = (existing || []).slice();
    draft.forEach(e => {
      const inSaved = (existing || []).some(x => isDup(x, e));
      if (inSaved || seen.some(x => isDup(x, e))) {
        e.include = false; e.dup = true;
        e.notes.push(inSaved ? "Already saved — left unticked. Tick it only if this is a second, separate subscription." : "Repeated in these screenshots — left unticked.");
      } else seen.push(e);
    });
    return draft;
  }

  root.Parser = { parse, markDuplicates, dupKey, isDup, findAmounts, findDate };
})(typeof window !== "undefined" ? window : globalThis);
