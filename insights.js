// Spending insights, categories and CSV helpers. Everything here runs on the device. Pure functions, no page access.
(function (root) {
  const CATS = [
    ["video", "Video streaming"], ["music", "Music"], ["tv", "TV & satellite"], ["design", "Design & creative"],
    ["ai", "AI tools"], ["work", "Productivity & work"], ["web", "Hosting & web"], ["storage", "Cloud storage"],
    ["learn", "Learning"], ["security", "Security & VPN"], ["gaming", "Gaming"], ["social", "Social & dating"], ["other", "Other"]
  ];
  const CAT_NAME = {}; CATS.forEach(([k, l]) => { CAT_NAME[k] = l; });

  // Service name -> category. Used to suggest a category; the person can always change it.
  const BY_SERVICE = {
    video: ["netflix", "prime video", "amazon prime", "disney", "disney plus", "hotstar", "disney hotstar", "hbo max", "hulu", "paramount", "crunchyroll", "showmax", "apple tv", "youtube", "youtube premium", "twitch"],
    music: ["spotify", "apple music", "amazon music", "audiomack", "boomplay", "deezer", "tidal", "soundcloud", "youtube music"],
    tv: ["dstv", "gotv", "startimes"],
    design: ["canva", "canva pro", "adobe", "adobe creative cloud", "creative cloud", "figma", "capcut", "picsart", "remini", "midjourney", "lightroom", "vsco", "inshot"],
    ai: ["chatgpt", "chatgpt plus", "openai", "claude", "claude pro", "gemini", "perplexity", "cursor", "copilot"],
    work: ["microsoft 365", "office 365", "notion", "zoom", "slack", "evernote", "todoist", "trello", "asana", "grammarly", "linkedin", "linkedin premium", "mailchimp", "zapier", "github", "quickbooks", "zoho"],
    web: ["squarespace", "wix", "shopify", "cloudflare", "namecheap", "godaddy", "hostinger", "vercel", "netlify", "domain", "hosting"],
    storage: ["google one", "icloud", "dropbox", "onedrive"],
    learn: ["coursera", "udemy", "skillshare", "masterclass", "duolingo"],
    security: ["nordvpn", "expressvpn", "surfshark", "protonvpn", "proton", "bitwarden", "1password"],
    gaming: ["xbox", "xbox game pass", "playstation plus", "apple arcade"],
    social: ["tinder", "bumble", "telegram premium", "snapchat", "tiktok", "x premium"]
  };
  const norm = s => " " + String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
  const LOOKUP = []; // longest names first, so "youtube music" wins over "youtube"
  for (const k in BY_SERVICE) BY_SERVICE[k].forEach(n => LOOKUP.push([norm(n), k]));
  LOOKUP.sort((a, b) => b[0].length - a[0].length);
  function suggestCategory(name) {
    const n = norm(name);
    for (const [key, cat] of LOOKUP) if (n.includes(key)) return cat;
    return "other";
  }
  const catOf = s => (s && CAT_NAME[s.cat] ? s.cat : suggestCategory(s && s.name));
  const catLabel = k => CAT_NAME[k] || "Other";
  const useOf = s => (s && (s.use === "business" || s.use === "personal")) ? s.use : "unset";

  const PER = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
  const monthly = s => (s.amount != null && s.amount !== "" && s.currency && PER[s.freq]) ? s.amount * PER[s.freq] : null;

  // ---- Spending breakdown (monthly equivalents) --------------------------------
  // convert(value, fromCur, toCur) returns a number, or null when no exchange rate is known.
  function breakdown(subs, target, convert, filter) {
    const act = subs.filter(s => s.status === "active" && (!filter || filter === "all" || useOf(s) === filter));
    const out = { total: 0, byUse: { business: 0, personal: 0, unset: 0 }, byCat: [], top: [], unpriced: 0, unconverted: 0, count: act.length };
    const cats = {}, rows = [];
    act.forEach(s => {
      const m = monthly(s);
      if (m == null) { out.unpriced++; return; }
      const v = convert(m, s.currency, target);
      if (v == null) { out.unconverted++; return; }
      out.total += v; out.byUse[useOf(s)] += v;
      const c = catOf(s); (cats[c] = cats[c] || { key: c, label: catLabel(c), monthly: 0, count: 0 });
      cats[c].monthly += v; cats[c].count++;
      rows.push({ name: s.name, monthly: v, use: useOf(s), cat: c });
    });
    out.byCat = Object.values(cats).sort((a, b) => b.monthly - a.monthly).map(c => Object.assign(c, { share: out.total ? c.monthly / out.total : 0 }));
    out.top = rows.sort((a, b) => b.monthly - a.monthly).slice(0, 5).map(r => Object.assign(r, { share: out.total ? r.monthly / out.total : 0 }));
    return out;
  }

  // ---- Charges coming up in the next N days -----------------------------------
  // addPeriods(iso, freq, n) is passed in so the date rules live in one place (app.js).
  function upcoming(subs, todayIso, days, addPeriods, filter) {
    const [ty, tm, td] = todayIso.split("-").map(Number), e = new Date(ty, tm - 1, td + days);
    const end = e.getFullYear() + "-" + String(e.getMonth() + 1).padStart(2, "0") + "-" + String(e.getDate()).padStart(2, "0");
    const list = [];
    subs.filter(s => s.status === "active" && s.date && (!filter || filter === "all" || useOf(s) === filter)).forEach(s => {
      if (!PER[s.freq]) { if (s.date >= todayIso && s.date <= end && !(s.expiry && s.date > s.expiry)) list.push({ sub: s, date: s.date }); return; }
      let n = 0, d = s.date;
      while (d < todayIso && n < 600) { n++; d = addPeriods(s.date, s.freq, n); }
      while (d <= end && n < 600) {
        if (s.expiry && d > s.expiry) break;
        list.push({ sub: s, date: d }); n++; d = addPeriods(s.date, s.freq, n);
      }
    });
    return list.sort((a, b) => a.date.localeCompare(b.date) || String(a.sub.name).localeCompare(String(b.sub.name)));
  }

  // ---- Overlaps: several active subscriptions of the same kind ------------------
  const OVERLAP_CATS = ["video", "music", "tv", "storage", "security", "ai", "design"];
  function overlaps(subs, filter) {
    const g = {};
    subs.filter(s => s.status === "active" && (!filter || filter === "all" || useOf(s) === filter)).forEach(s => {
      const c = catOf(s); if (OVERLAP_CATS.includes(c)) (g[c] = g[c] || []).push(s.name);
    });
    return Object.keys(g).filter(c => g[c].length > 1).map(c => ({ cat: c, label: catLabel(c), names: g[c] }));
  }

  // ---- CSV -------------------------------------------------------------------------
  // Cells starting with = + - @ are prefixed with ' so spreadsheets never run them as formulas.
  function cell(v) {
    let t = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = "'" + t;
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  const toCsv = (headers, rows) => "﻿" + [headers].concat(rows).map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";

  root.Insights = { CATS, suggestCategory, catOf, catLabel, useOf, PER, monthly, breakdown, upcoming, overlaps, cell, toCsv };
  if (typeof module !== "undefined") module.exports = root.Insights;
})(typeof window !== "undefined" ? window : globalThis);
