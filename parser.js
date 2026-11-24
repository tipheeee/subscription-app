// Turns text read from a screenshot into subscription entries.
// Works with different layouts (Google Play, App Store / Apple, bank alerts, receipts, plain lists).
// Rule: if something isn't clearly in the text, leave it empty and say so.
(function (root) {
  const SERVICES = ["Netflix","Spotify","CapCut","Picsart","Remini","Truecaller","YouTube Premium","YouTube Music","YouTube","Apple Music","Apple TV+","Apple Arcade","iCloud+","iCloud","Apple One","Google One","Google Play Pass","Canva Pro","Canva","Adobe Creative Cloud","Adobe","Microsoft 365","Office 365","Disney+","Disney Plus","Disney Hotstar","Hotstar","Amazon Prime","Prime Video","Amazon Music","Showmax","DStv","GOtv","StarTimes","Dropbox","ChatGPT Plus","ChatGPT","OpenAI","Claude Pro","Claude","Gemini","Notion","Zoom","Slack","Audiomack","Boomplay","LinkedIn Premium","LinkedIn","Duolingo","Figma","GitHub","Deezer","Tidal","SoundCloud","HBO Max","Hulu","Paramount+","Crunchyroll","Grammarly","OneDrive","NordVPN","ExpressVPN","Surfshark","ProtonVPN","Proton","Coursera","Udemy","Skillshare","MasterClass","Headspace","Strava","Telegram Premium","Xbox Game Pass","PlayStation Plus","Twitch","Patreon","Substack","Medium","Tinder","Bumble","Evernote","Todoist","Bitwarden","1Password","Midjourney","Perplexity","Squarespace","Wix","Shopify","Mailchimp","Zapier","Trello","Asana","Cursor","X Premium","Adobe Express","Photoshop","Lightroom","Audible","Kindle Unlimited","Scribd","Everand","Blinkist","Babbel","Rosetta Stone","Quizlet","Chegg","Calm","Peloton","Noom","Fitbit Premium","Apple Fitness+","Apple Podcasts","Apple Books","YouTube TV","Max","Discovery+","Peacock","Vimeo","Zoho","Copilot","Microsoft Copilot","Uber One","Bolt","Jumia","Roblox","Minecraft","Nintendo Switch Online","EA Play","Ubisoft+","Netflix Extra Member","Picsart Gold","Remini Pro","VSCO","Lensa","Facetune","PicsArt","Prime Video","Tubi","Viu","iROKOtv","IrokoTV","Apple iCloud","Google Workspace","Google Drive","Zoom Workplace","Loom","Miro","Linear","Airtable","ClickUp","Monday.com","Calendly","Typeform","Hootsuite","Buffer","Later","Semrush","Ahrefs","GoDaddy","Namecheap","Cloudflare","DigitalOcean","Vercel","Netlify","Heroku","Supabase","Framer","Webflow","Envato","Freepik","Storyblocks","Shutterstock","Epidemic Sound","Artlist","Splice","BandLab","Moises","Smule","VivaVideo","InShot","Kinemaster","KineMaster","Alight Motion","Videoleap","Splice","PowerDirector","FilmoraGo","Filmora","Wondershare"];
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const SVC = SERVICES.slice().sort((a, b) => b.length - a.length)
    .map(n => ({ n, re: new RegExp("(^|[^a-z0-9])" + esc(n) + "($|[^a-z0-9])", "i"), solo: /^[A-Za-z]{7,}$/.test(n) ? n.toLowerCase() : null }));

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
    const words = line.toLowerCase().match(/[a-z]{7,}/g) || [];
    for (const w of words) for (const s of SVC) if (s.solo && w[0] === s.solo[0] && lev(w, s.solo) === 1) return s.n;
    return null;
  }

  // ---------- Money ----------
  const CODES = "NGN|USD|EUR|GBP|INR|ZAR|GHS|KES|CAD|AUD|NZD|UGX|TZS|EGP|AED|SAR|BRL|MXN|JPY|CNY|KRW|TRY|CHF|SEK|NOK|DKK|PLN|SGD|HKD|XOF|XAF|RWF|ZMW|MAD|PHP|IDR|THB|MYR|PKR|BDT";
  const ZERO_DEC = /^(JPY|KRW|UGX|TZS|XOF|XAF|RWF|IDR)$/;
  const NUMSRC = "\\d{1,3}(?:[,.]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?";
  const PRE = "₦|US\\$|CA\\$|C\\$|AU\\$|A\\$|NZ\\$|HK\\$|S\\$|GH₵|₵|KSh|Rs\\.?|\\$|€|£|₹|¥|₩|₺|#|" + CODES + "|N|R";
  const SYM = { "₦": "NGN", "#": "NGN", "$": "USD", "US$": "USD", "€": "EUR", "£": "GBP", "₹": "INR", "CA$": "CAD", "C$": "CAD", "AU$": "AUD", "A$": "AUD", "NZ$": "NZD", "HK$": "HKD", "S$": "SGD", "GH₵": "GHS", "₵": "GHS", "KSH": "KES", "RS": "INR", "RS.": "INR", "¥": "JPY", "₩": "KRW", "₺": "TRY", "R": "ZAR" };
  const SYM_NOTE = { "¥": "Read “¥” as yen (JPY). It could be Chinese yuan (CNY) — check it.", "R": "Read “R” as South African rand — check it.", "KSH": "", "RS": "Read “Rs” as Indian rupees — check it.", "RS.": "Read “Rs” as Indian rupees — check it." };
  const PER = "mo(?:nth)?|mon|yr|year|wk|week|annum";

  function parseNum(raw) {
    const m = raw.match(/^(.*?)[.,](\d{1,2})$/);
    let int = raw, dec = "";
    if (m) { int = m[1]; dec = m[2]; }
    return parseFloat(int.replace(/[.,]/g, "") + (dec ? "." + dec : ""));
  }

  // The reader often drops or misreads the decimal point in small text: "€10.90" can come back as "€10090" or "€1090".
  // Foreign prices rarely have no separator and four or five digits, so we repair that and say so.
  function fixPoint(raw, cur, noteList) {
    const v = parseNum(raw);
    if (!cur || cur === "NGN" || ZERO_DEC.test(cur) || !/^\d{4,5}$/.test(raw)) return v;
    let fixed = null;
    if (raw.length === 5 && /^\d{2}0\d{2}$/.test(raw)) fixed = raw.slice(0, 2) + "." + raw.slice(3);      // 10090 -> 10.90
    else if (raw.length === 4 && !/00$/.test(raw)) fixed = raw.slice(0, 2) + "." + raw.slice(2);          // 1099 -> 10.99
    else if (raw.length === 4 && /^\d0\d{2}$/.test(raw)) fixed = raw.slice(0, 1) + "." + raw.slice(2);    // 1090 -> 1.90 is rarer, left alone below
    if (fixed && raw.length === 4 && /^\d0\d{2}$/.test(raw)) fixed = null;
    if (!fixed) return v;
    noteList.push("Read “" + raw + "” as " + fixed + ": the decimal point was probably misread. Check it.");
    return parseFloat(fixed);
  }

  function findAmounts(text) {
    const out = [];
    const notePush = (o, n) => { if (n) o.note = o.note ? o.note + " " + n : n; };
    const r1 = new RegExp("(?:^|[^A-Za-z])(" + PRE + ")\\s?(" + NUMSRC + ")(?!\\d)", "gi");
    for (const m of text.matchAll(r1)) {
      const p = m[1].toUpperCase(); let cur, note = "";
      if (SYM[p] || SYM[m[1]]) {
        cur = SYM[m[1]] || SYM[p];
        if (p === "$") note = "Currency assumed to be USD from the $ sign — check it.";
        else if (p === "#") note = "Read “#” as naira — check it.";
        else if (SYM_NOTE[p]) note = SYM_NOTE[p];
      } else if (p === "N") { cur = "NGN"; note = "Read “N” as naira — check it."; }
      else cur = p;
      let raw = m[2];
      // "€10 90" (the reader put a space where the decimal point was)
      if (cur !== "NGN" && !ZERO_DEC.test(cur) && /^\d{1,3}$/.test(raw)) {
        const tail = text.slice(m.index + m[0].length).match(new RegExp("^[ ](\\d{2})(?!\\d|\\s*(?:" + MON + ")\\b)", "i"));
        if (tail) { raw = raw + "." + tail[1]; note = (note ? note + " " : "") + "Read “" + m[2] + " " + tail[1] + "” as " + raw + " — check it."; }
      }
      const o = { value: 0, currency: cur, note: "", at: m.index };
      const pts = []; o.value = fixPoint(raw, cur, pts); notePush(o, note); pts.forEach(n => notePush(o, n));
      out.push(o);
    }
    // Price first, symbol or code after: "10,90 €", "59 GHS"
    const r2 = new RegExp("(?:^|[^\\d.,])(" + NUMSRC + ")\\s?(" + CODES + "|€|£|\\$|₦|₹)(?![A-Za-z])", "gi");
    for (const m of text.matchAll(r2)) {
      if (out.some(o => Math.abs(o.at - m.index) < 3)) continue;
      const u = m[2].toUpperCase();
      out.push({ value: parseNum(m[1]), currency: SYM[u] || SYM[m[2]] || u, note: "", at: m.index });
    }
    // The reader sometimes turns "€" into "C" or "E": "C10.90"
    const r4 = /(?:^|[^A-Za-z0-9])([CE])(\d{1,3}[.,]\d{2})(?!\d)/gi;
    for (const m of text.matchAll(r4)) {
      if (out.some(o => Math.abs(o.at - m.index) < 3)) continue;
      out.push({ value: parseNum(m[2]), currency: "EUR", note: "Read “" + m[1] + "” as the euro sign — check it.", at: m.index });
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
    if ((m = line.match(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-\\/]+(" + MON + ")\\.?,?[\\s\\-\\/]*(\\d{4})\\b", "i"))))
      return ok(`${m[3]}-${pad(mnum(m[2]))}-${pad(+m[1])}`);
    if ((m = line.match(new RegExp("\\b(" + MON + ")\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})\\b", "i"))))
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
  const FREQ_OK = /^(weekly|monthly|quarterly|yearly)$/;
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
  const RECEIPT_RE = /order\s*(?:number|no\.?|id|date)|\breceipt\b|\binvoice\b|thank you for your (?:purchase|order|subscription|payment)|payment (?:successful|received)|\bsub\s?total\b/i;
  const SKIP_RE = /^(sub\s?total|tax|vat|gst|discount|shipping|service fee|processing fee|tip|balance)\b/i;
  const GRAND_RE = /^(?:grand\s)?total\b|^amount\s+(?:paid|due|charged)\b/i;
  const PAST_RE = /\b(debit|debited|paid|charged|purchase|receipt|transaction|successful|payment of)\b/i;
  const SECTION_RE = /^(active|expired|inactive|cancelled|canceled)(\s+subscriptions?)?:?$/i;
  const EXPIRED_RE = /\bexpired\b|\bended\b/i;
  const NOISE = /^(subscriptions?|manage|payments?|payment methods?|billing|renews?|renewal|expires?|expired|cancel|cancelled|canceled|active|inactive|settings|google play|app store|apple id|account|total|price|amount|date|next|due|history|order|receipt|transactions?|status|monthly|yearly|weekly|quarterly|auto|edit|done|back|search|today|yesterday|more|view|see all|help|free trial|alerts?|resubscribe|primary|backup|not available|your subscription|family sharing|bank|debit|credit|card|visa|mastercard|verve|balance|alert|your|you|the|resubscribe|alerts?|primary|backup|not available|manage|payment method|verve|thank you|thanks|order|sub\s?total|grand total|tax|vat|gst|item|items|qty|quantity|discount|shipping|invoice|summary|details|hello|hi|hey|dear|reference|ref|transaction|card ending|google commerce|google payments?|itunes|apple distribution|you can|if you|for any|questions|contact|support|terms|privacy|unsubscribe|sent|receipt number|document|billed to|report a problem|learn more|view in|visa|amount paid|amount due|date|number|method)\b/i;

  const shortName = n => { const t = n.split(/\s*[:\u2013\u2014|]\s+|\s+-\s+/)[0].trim(); return t.length >= 2 ? t : n; };
  const clean = l => l.replace(/[|•·›>]+/g, " ").replace(/\s+/g, " ").trim().replace(/^[^A-Za-z0-9₦$€£₹¥₩₺₵#+]+/, "").replace(/^[€£$#₦₹¥₩₺₵]\s+(?=[A-Za-z])/, "").trim();

  const onlyPlanWords = l => { const w = l.toLowerCase().match(/[a-z]+/g) || []; return w.length > 0 && w.every(x => PLAN_SET.has(x)); };
  function looksLikeName(line) {
    if (line.length < 3 || line.length > 40) return false;
    if (findDate(line) || NOISE.test(line) || onlyPlanWords(line)) return false;
    const letters = (line.match(/[A-Za-z]/g) || []).length;
    if (letters < 3 || letters / line.replace(/\s/g, "").length < 0.7) return false;
    if (line.split(" ").length > 5) return false;
    return /[A-Za-z]{3,}/.test(line);
  }

  // From a payment date, add one billing period at a time until the date is today or later.
  function nextFrom(iso, freq) {
    const t = todayStart(); const d = new Date(iso + "T00:00:00Z"); const day = d.getUTCDate();
    for (let i = 0; i < 600 && new Date(isoOfUtc(d) + "T00:00:00") < t; i++) {
      if (freq === "weekly") d.setUTCDate(d.getUTCDate() + 7);
      else { const m = freq === "yearly" ? 12 : freq === "quarterly" ? 3 : 1; d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + m); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); }
    }
    return isoOfUtc(d);
  }
  const isoOfUtc = d => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());

  function buildEntry(name, lines, section, topDate) {
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

    let dateNoted = false, pastIso = "";
    for (const line of lines) {
      const d = findDate(line);
      if (!d) continue;
      const slot = EXPIRY_RE.test(line) && !RENEW_RE.test(line) ? "expiry" : "date";
      if (slot === "date" && PAST_RE.test(block) && !/renew|next|upcoming|due/i.test(line)) {
        if (!pastIso) pastIso = d.iso;
        dateNoted = true; continue;
      }
      if (!e[slot]) { e[slot] = d.iso; if (d.note) notes.push(d.note); }
      dateNoted = true;
    }
    if (!pastIso && !e.date && topDate) { pastIso = topDate; dateNoted = true; }
    if (pastIso && !e.date) {
      if (FREQ_OK.test(e.freq)) { e.date = nextFrom(pastIso, e.freq); notes.push("This looks like a payment made on " + pastIso + ". We estimated the next charge as " + e.date + " (one billing period later). Check it."); }
      else notes.push("This looks like a payment that already happened on " + pastIso + ". Enter the next renewal date yourself.");
    }
    if (!dateNoted) notes.push("No renewal date found.");

    if (EXPIRED_RE.test(block)) e.status = "expired";
    if (CANCEL_RE.test(block)) e.status = "cancelled";
    if (e.status === "active" && section) e.status = section;
    return e;
  }

  function pickName(b) {
    const L = b.lines, ok = i => i >= 0 && i < L.length && looksLikeName(L[i]);
    const fmt = l => shortName(l.replace(/[^A-Za-z0-9+&.' :|-]+/g, "").trim());
    for (let i = 0; i < L.length - 1; i++) if (ok(i) && onlyPlanWords(L[i + 1])) return fmt(L[i]);
    for (let i = 0; i < L.length; i++) if (ok(i)) return fmt(L[i]);
    return b.name;
  }

  function parse(text) {
    const lines = String(text || "").split(/\r?\n/).map(clean).filter(l => l.length > 1);
    const blocks = [];
    let cur = null, section = "", skipAmt = false;
    const push = () => { if (cur) { cur.section = cur.section == null ? section : cur.section; blocks.push(cur); } cur = null; };
    for (const line of lines) {
      const sm = line.match(SECTION_RE);
      // A lone "Cancelled" under an app that has no price/date yet is that app's status, not a section heading.
      if (sm && cur && !cur.hasAmt && !cur.lines.some(l => findDate(l))) { cur.lines.push(line); continue; }
      if (sm) { push(); const k = sm[1].toLowerCase(); section = k === "expired" || k === "inactive" ? "expired" : k === "active" ? "" : "cancelled"; continue; }
      // Subtotal, Tax, VAT...: never a subscription. If the label sits alone, the amount on the next line belongs to it too.
      if (skipAmt && !findService(line) && findAmounts(line).length && !/[A-Za-z]{4,}/.test(line.replace(/\/?\s*(?:month|year|week)\w*/i, ""))) { skipAmt = false; continue; }
      skipAmt = false;
      if (SKIP_RE.test(line) && !GRAND_RE.test(line)) { skipAmt = !findAmounts(line).length; continue; }
      if (GRAND_RE.test(line)) { if (cur && !cur.hasAmt && findAmounts(line).length) { cur.lines.push(line); cur.hasAmt = true; } else if (!findAmounts(line).length) skipAmt = true; continue; }
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
          if (looksLikeName(prefix)) { push(); cur = { name: shortName(prefix), known: false, fixed: true, lines: [line], hasAmt: true }; }
          else if (cur && cur.lines.length < 10) cur.lines.push(line);
        }
      } else if (looksLikeName(line)) {
        if (cur && !cur.hasAmt && !cur.lines.some(l => findDate(l)) && cur.lines.length < 10) cur.lines.push(line);
        else { push(); cur = { name: shortName(line.replace(/[^A-Za-z0-9+&.' :|-]+/g, "").trim()), known: false, lines: [line] }; }
      } else if (cur && cur.lines.length < 10) cur.lines.push(line);
    }
    push();
    // Names we don't recognise only count if there's a price or a date with them.
    const receipt = RECEIPT_RE.test(String(text || ""));
    // A receipt usually shows its date once, near the top ("Order date: Nov 3, 2026").
    let topDate = "";
    if (receipt) for (const l of lines) { if (/order\s*date|^date\b|\bpaid on|purchased|\bbilled\b/i.test(l)) { const d = findDate(l); if (d) { topDate = d.iso; break; } } }
    return blocks
      .filter(b => b.hasAmt || b.lines.some(l => findDate(l)))
      // In a receipt or email, an app we don't know is only kept if it has a price AND a billing period next to it.
      .filter(b => !receipt || b.known || (b.hasAmt && findFreq(b.lines.join(" "))))
      .map(b => buildEntry(b.known || b.fixed ? b.name : pickName(b), b.lines, b.section, topDate));
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
