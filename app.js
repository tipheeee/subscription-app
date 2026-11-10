(function () {
  const cfg = window.APP_CONFIG, $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  document.title = cfg.name + " · " + cfg.tagline;
  document.querySelectorAll("[data-app-name]").forEach(e => e.textContent = cfg.name);
  document.querySelectorAll("[data-tagline]").forEach(e => e.textContent = cfg.tagline);


  // Logo tile: real logo if we have one, otherwise a coloured letter.
  // Services with no bundled logo: fetch their website icon instead (falls back to a letter).
  const SITES = { "boomplay": "boomplay.com", "google one": "one.google.com", "dstv": "dstv.com", "gotv": "gotvafrica.com", "showmax": "showmax.com", "deezer": "deezer.com", "hulu": "hulu.com", "disney": "disneyplus.com", "disney hotstar": "hotstar.com", "hotstar": "hotstar.com", "microsoft 365": "microsoft.com", "office 365": "microsoft.com", "onedrive": "onedrive.live.com", "masterclass": "masterclass.com", "xbox": "xbox.com", "midjourney": "midjourney.com", "startimes": "startimestv.com", "kiosk": "kiosk.ng", "capcut": "capcut.com", "picsart": "picsart.com", "remini": "remini.ai", "truecaller": "truecaller.com", "capcut": "capcut.com", "inshot": "inshot.com", "picsart": "picsart.com", "tiktok": "tiktok.com", "snapchat": "snapchat.com", "truecaller": "truecaller.com", "vsco": "vsco.co", "lightroom": "adobe.com", "bolt": "bolt.eu", "uber": "uber.com" };
  function logoHtml(name) {
    const n = " " + String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b0ne\b/g, "one").trim() + " ";
    const aliases = window.LOGO_ALIASES || {}, logos = window.LOGOS || {};
    let best = null;
    for (const k in aliases) if (n.includes(" " + k + " ") && (!best || k.length > best.length)) best = k;
    const L = best && logos[aliases[best]];
    if (L) return `<span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24"><path fill="#${L[0]}" d="${L[1]}"/></svg></span>`;
    let h = 0; for (const c of String(name || "?")) h = (h * 31 + c.charCodeAt(0)) % 360;
    const letter = ((String(name || "").match(/[A-Za-z0-9]/) || ["?"])[0]).toUpperCase();
    const tile = `background:hsl(${h} 45% 88%);color:hsl(${h} 45% 25%)`;
    let site = null;
    for (const k in SITES) if (n.includes(" " + k + " ") && (!site || k.length > site.length)) site = k;
    if (site) return `<span class="logo" aria-hidden="true" data-l="${esc(letter)}" data-s="${esc(tile)}"><img alt="" width="28" height="28" src="https://www.google.com/s2/favicons?domain=${SITES[site]}&sz=64" onerror="var p=this.parentNode;p.className='logo letter';p.style.cssText=p.dataset.s;p.textContent=p.dataset.l"></span>`;
    return `<span class="logo letter" aria-hidden="true" style="${tile}">${esc(letter)}</span>`;
  }

  const money = (n, c) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: c || cfg.defaultCurrency, maximumFractionDigits: 2 }).format(n); } catch (e) { return (c || "") + " " + n; } };
  const PER = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const daysTo = iso => Math.round((new Date(iso + "T00:00:00") - startOfToday()) / 86400000);
  const isoIn = n => { const d = startOfToday(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const sample = () => [
    { name: "Netflix", plan: "Standard", amount: 4400, currency: "NGN", freq: "monthly", date: isoIn(2), status: "active" },
    { name: "Spotify", plan: "Premium", amount: 1300, currency: "NGN", freq: "monthly", date: isoIn(5), status: "active" },
    { name: "Canva", plan: "Pro", amount: 36000, currency: "NGN", freq: "yearly", date: isoIn(19), status: "active" }
  ];

  // ---------- Dates: moving a renewal forward ----------
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const fmtDate = iso => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  // Add n billing periods to a date. Keeps the day of the month (31 Jan + 1 month = 28/29 Feb, then back to the 31st later).
  function addPeriods(iso, freq, n) {
    const [y, m, d] = iso.split("-").map(Number);
    if (freq === "weekly") return ymd(new Date(y, m - 1, d + 7 * n));
    const months = (freq === "yearly" ? 12 : freq === "quarterly" ? 3 : 1) * n;
    const first = new Date(y, m - 1 + months, 1);
    first.setDate(Math.min(d, new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()));
    return ymd(first);
  }
  // The first charge date that is still in the future.
  function nextCharge(s) {
    let n = 1, next = addPeriods(s.date, s.freq, n);
    while (next <= isoIn(0) && n < 600) { n++; next = addPeriods(s.date, s.freq, n); }
    return next;
  }

  // ---------- "Did it renew?" prompts ----------
  // Shows from the day a date arrives, and stays until answered (or snoozed to tomorrow).
  function dueItems(list) {
    const t = isoIn(0);
    return list.filter(s => s.status === "active" && (!s.snooze || s.snooze <= t) && ((s.expiry && s.expiry <= t) || (s.date && s.date <= t)));
  }
  function dueHtml(items) {
    const t = isoIn(0);
    return items.map(s => {
      const ended = s.expiry && s.expiry <= t, when = ended ? s.expiry : s.date, n = daysTo(when);
      const ago = n === 0 ? "today" : n === -1 ? "yesterday" : `${-n} days ago`, id = esc(s.id);
      const later = `<button class="btn ghost" data-act="snooze" data-id="${id}">Ask me tomorrow</button>`;
      if (ended) return `<div class="due"><b>${esc(s.name)}</b> was set to end ${ago} (${esc(fmtDate(when))}). Has it ended?
        <div class="acts"><button class="btn" data-act="ended" data-id="${id}">Yes, it ended</button><button class="btn ghost" data-act="keep" data-id="${id}">No, it continues</button>${later}</div></div>`;
      const needDate = !PER[s.freq] ? `<label class="note">Billing period unknown. Pick the next charge date:<br><input type="date" data-nd="${id}"></label>` : "";
      return `<div class="due"><b>${esc(s.name)}</b> was due ${ago} (${esc(fmtDate(when))}). Did it renew, or did you cancel it?${needDate}
        <div class="acts"><button class="btn" data-act="renewed" data-id="${id}">It renewed</button><button class="btn ghost" data-act="cancelled" data-id="${id}">I cancelled it</button>${later}</div></div>`;
    }).join("");
  }
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-act]"); if (!b) return;
    const id = b.dataset.id, list = Store.load(), s = list.find(x => x.id === id); if (!s) return;
    const act = b.dataset.act;
    if (act === "renewed") {
      if (PER[s.freq] && s.date) s.date = nextCharge(s);
      else {
        const inp = document.querySelector(`[data-nd="${CSS.escape(id)}"]`);
        if (!inp || !inp.value) { alert("Pick the next charge date first."); return; }
        s.date = inp.value;
      }
      delete s.snooze;
    } else if (act === "cancelled") { s.status = "cancelled"; delete s.snooze; }
    else if (act === "ended") { s.status = "expired"; delete s.snooze; }
    else if (act === "keep") { s.expiry = ""; delete s.snooze; }
    else if (act === "snooze") s.snooze = isoIn(1);
    Store.save(list); renderAll();
  });

  // ---------- Currency conversion ----------
  // Rates come from a free public service (open.er-api.com), are saved on the device, and refresh about twice a day.
  const FX_KEY = "fx.v1", CUR_KEY = "totalCur", COMMON = ["NGN", "USD", "EUR", "GBP", "GHS", "KES", "ZAR", "INR", "CAD", "AUD", "AED", "EGP"];
  let fx = null, fxTried = false;
  try { fx = JSON.parse(localStorage.getItem(FX_KEY) || "null"); } catch (e) {}
  const totalCur = () => { try { return localStorage.getItem(CUR_KEY) || cfg.defaultCurrency; } catch (e) { return cfg.defaultCurrency; } };
  async function refreshFx() {
    if (fxTried || (fx && fx.at && Date.now() - fx.at < 12 * 3600e3)) return;
    fxTried = true;
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/USD");
      const d = await r.json();
      if (d && d.result === "success" && d.rates) {
        fx = { rates: d.rates, at: Date.now() };
        try { localStorage.setItem(FX_KEY, JSON.stringify(fx)); } catch (e) {}
        renderAll();
      }
    } catch (e) { /* offline: keep the last saved rates, or show each currency separately */ }
  }
  function convert(v, from, to) {
    if (from === to) return v;
    const r = fx && fx.rates;
    return r && r[from] && r[to] ? v / r[from] * r[to] : null;
  }
  function fillCurSelect(target, codes) {
    const sel = $("total-cur"); if (!sel) return;
    const all = Array.from(new Set(COMMON.concat(codes, [target])));
    const key = all.join(",") + "|" + target;
    if (sel.dataset.key === key) return;
    sel.dataset.key = key;
    sel.innerHTML = all.map(c => `<option value="${esc(c)}" ${c === target ? "selected" : ""}>${esc(c)}</option>`).join("");
  }
  $("total-cur").addEventListener("change", ev => { try { localStorage.setItem(CUR_KEY, ev.target.value); } catch (e) {} renderAll(); });

  function rowsHtml(list, real) {
    const sorted = list.slice().sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
    return sorted.map(s => {
      let chip;
      if (s.status !== "active") chip = `<span class="chip far">${esc(s.status)}</span>`;
      else if (!s.date) chip = `<span class="chip far">No date</span>`;
      else { const n = daysTo(s.date); chip = n < 0 ? `<span class="chip late">Date passed</span>` : `<span class="chip ${n <= 3 ? "late" : n > 14 ? "far" : ""}">in ${n} day${n === 1 ? "" : "s"}</span>`; }
      const price = s.amount != null && s.currency ? money(s.amount, s.currency) : "No price";
      const sub = [s.plan, s.freq, s.expiry ? "ends " + fmtDate(s.expiry) : ""].filter(Boolean).map(esc).join(" · ");
      return `<div class="row">${logoHtml(s.name)}<div class="n">${esc(s.name || "Unnamed")}<small>${sub || "Plan not set"}</small></div>
        <span class="amt">${price}</span>${chip}${real ? `<button class="x" data-del="${esc(s.id)}" aria-label="Delete ${esc(s.name)}">✕</button>` : ""}</div>`;
    }).join("");
  }

  function renderAll() {
    const real = Store.load(), usingSample = !real.length, list = usingSample ? sample() : real;
    $("sample-badge").classList.toggle("hide", !usingSample);
    $("demo-list").innerHTML = rowsHtml(sample(), false);
    $("dash-list").innerHTML = rowsHtml(list, !usingSample);
    const due = usingSample ? [] : dueItems(real);
    $("due-box").innerHTML = due.length ? `<h2>Needs your answer</h2>` + dueHtml(due) : "";
    const tot = {}; let unpriced = 0;
    list.filter(s => s.status === "active").forEach(s => {
      if (s.amount == null || !s.currency || !PER[s.freq]) { unpriced++; return; }
      tot[s.currency] = (tot[s.currency] || 0) + s.amount * PER[s.freq];
    });
    const codes = Object.keys(tot), target = totalCur();
    fillCurSelect(target, codes);
    const skipped = []; let sum = null;
    if (codes.length && (codes.length > 1 || codes[0] !== target) && !(fx && fx.rates)) refreshFx();
    if (codes.length) {
      sum = 0;
      for (const c of codes) { const v = convert(tot[c], c, target); if (v == null) skipped.push(c); else sum += v; }
      if (skipped.length === codes.length) sum = null;
    }
    if (sum != null) {
      $("s-month").textContent = money(sum, target);
      $("s-year").textContent = money(sum * 12, target);
    } else {
      const parts = Object.entries(tot);
      $("s-month").innerHTML = parts.length ? parts.map(([c, v]) => esc(money(v, c))).join("<br>") : "–";
      $("s-year").innerHTML = parts.length ? parts.map(([c, v]) => esc(money(v * 12, c))).join("<br>") : "–";
    }
    const mixed = codes.length > 1 || (codes.length === 1 && codes[0] !== target);
    let fxNote = "";
    if (mixed && sum != null) fxNote = `Everything is converted to ${target} at about today’s rates${fx && fx.at ? " (updated " + new Date(fx.at).toLocaleDateString() + ")" : ""}. Real charges will differ a little.` + (skipped.length ? ` Not counted, no rate for: ${skipped.join(", ")}.` : "");
    else if (mixed) fxNote = "Exchange rates couldn’t load, so each currency is shown separately. Open the app with internet to convert.";
    $("fx-note").textContent = fxNote;
    $("unpriced").textContent = unpriced ? `${unpriced} subscription${unpriced > 1 ? "s are" : " is"} not counted yet: price, currency or billing period is missing.` : "";
  }

  document.addEventListener("click", e => {
    const id = e.target.dataset && e.target.dataset.del;
    if (!id || !confirm("Delete this subscription?")) return;
    Store.save(Store.load().filter(s => s.id !== id)); renderAll();
  });

  // ---------- Scanner ----------
  const STATS = ["active", "cancelled", "expired"];
  let draft = [];
  const OK_TYPES = ["image/png", "image/jpeg", "image/webp"], MAX_MB = 10;

  function setMsg(t, bad) { const m = $("scan-msg"); m.textContent = t; m.className = "note" + (bad ? " bad" : ""); }

  const errText = err => (err && err.message) ? err.message : (typeof err === "string" ? err : JSON.stringify(err) || "unknown error");

  // ---------- Local reading pipeline (nothing here leaves the phone) ----------
  // Order of attempts: black-and-white + page mode 4, then 6, then an area-by-area black-and-white, then plain grey + sparse text.
  const PLAN = [["otsu", "4"], ["otsu", "6"], ["adaptive", "6"], ["gray", "11"]];
  // Smaller, more accurate English language file. If it can't be fetched we fall back to Tesseract's default one.
  const LANG_BEST = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int";

  function loadScript(src) {
    if (window.Preprocess) return Promise.resolve();
    return new Promise((ok, fail) => {
      const s = document.createElement("script"); s.src = src; s.onload = ok;
      s.onerror = () => fail(new Error("could not load " + src)); document.head.appendChild(s);
    });
  }
  async function makeWorker(logger) {
    try { return await Tesseract.createWorker("eng", 1, { logger, langPath: LANG_BEST }); }
    catch (e) { console.warn("best language file failed, using the default", e); return await Tesseract.createWorker("eng", 1, { logger }); }
  }
  // Enlarge small screenshots (text needs to be tall enough to read), cap huge ones, return raw pixels.
  async function loadPixels(blob) {
    const bmp = await createImageBitmap(blob);
    let k = bmp.width < 1400 ? Math.min(3, 1400 / bmp.width) : 1;
    k = Math.min(k, Math.sqrt(8e6 / (bmp.width * bmp.height)));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(bmp, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }
  function pixelsToBlob(r) {
    const c = document.createElement("canvas"); c.width = r.width; c.height = r.height;
    c.getContext("2d").putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
    return new Promise(res => c.toBlob(b => res(b), "image/png"));
  }
  // Tell the person when we repaired a misread ₦ sign, so they check it.
  function noteRepairs(entries, repairs) {
    for (const r of repairs) {
      const v = parseFloat(r.core.replace(/,/g, ""));
      for (const e of entries) {
        const note = `Read “${r.from}” as ₦${r.core}: the ₦ sign is often misread. Check it.`;
        if (e.amount === v && Array.isArray(e.notes) && !e.notes.includes(note)) e.notes.push(note);
      }
    }
  }

  $("file").addEventListener("change", async ev => {
    const picked = Array.from(ev.target.files);
    if (!picked.length) return;
    const bad = picked.find(f => !OK_TYPES.includes(f.type) || f.size > MAX_MB * 1048576);
    if (bad) { ev.target.value = ""; setMsg(`“${bad.name}” can’t be used. Choose PNG, JPG or WebP images under ${MAX_MB} MB.`, true); return; }
    $("review-wrap").classList.add("hide"); draft = [];
    setMsg("Opening your screenshot…");
    // Copy each file into memory first. Some phones lose access to a picked file if we wait.
    const imgs = [];
    try {
      for (const f of picked) imgs.push({ name: f.name, blob: new Blob([await f.arrayBuffer()], { type: f.type }) });
    } catch (err) {
      console.error(err); ev.target.value = "";
      setMsg("Your phone didn’t let the browser open this file. Save the screenshot to your phone’s gallery (not a cloud folder), or take a fresh screenshot, then pick it again.", true);
      return;
    }
    ev.target.value = "";
    let raw = "";
    if (!window.Tesseract) { setMsg("The text reader didn’t load. Check your internet connection and try again.", true); return; }
    try { await loadScript("preprocess.js"); }
    catch (err) { setMsg("A reading helper file didn’t load (preprocess.js). Check that it is in your repo, then reload the page.", true); return; }
    const texts = [], repairs = [];
    let label = "";
    let worker;
    try {
      worker = await makeWorker(m => { if (m.status === "recognizing text") setMsg(`${label} ${Math.round(m.progress * 100)}%`); });
    } catch (err) {
      console.error(err);
      setMsg(`The text reader failed to start: ${errText(err)}. Check your internet connection and try again.`, true);
      return;
    }
    try {
      for (let i = 0; i < imgs.length; i++) {
        label = `Reading image ${i + 1} of ${imgs.length}… (the first time can take a minute)`;
        setMsg(label);
        const px = await loadPixels(imgs[i].blob);
        let best = null;
        // Try the clean-up modes in turn. Stop as soon as every subscription found has a price.
        for (const [variant, psm] of PLAN) {
          const cleaned = await pixelsToBlob(Preprocess.run(px, variant));
          await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: "1" });
          const res = await worker.recognize(cleaned);
          const c = Preprocess.clean((res.data && res.data.text) || "");
          let ents = []; try { ents = Parser.parse(c.text); } catch (e) { /* reported below */ }
          const score = ents.filter(x => x.amount != null).length * 2 + ents.length;
          if (!best || score > best.score) best = { text: c.text, repairs: c.repairs, score };
          if (ents.length && ents.every(x => x.amount != null)) break;
        }
        texts.push(best.text); repairs.push(...best.repairs);
      }
    } catch (err) {
      console.error(err);
      setMsg(`The text reader failed: ${errText(err)}. Check your internet connection and try again.`, true);
      return;
    } finally { try { await worker.terminate(); } catch (e) {} }
    raw = texts.join("\n\n").trim();
    try {
      texts.forEach(t => { draft = draft.concat(Parser.parse(t)); });
      noteRepairs(draft, repairs);
      Parser.markDuplicates(draft, Store.load());
    } catch (err) {
      console.error(err); draft = [];
      setMsg(`The text was read but couldn’t be sorted into subscriptions: ${errText(err)}. Open “What we read” below and send it to me.`, true);
      $("review").innerHTML = ""; $("save-row").classList.add("hide"); $("review-wrap").classList.remove("hide");
      return;
    }
    $("raw").textContent = "[Read by: on-device reader]\n" + (raw || "(nothing readable found)");
    if (!draft.length) {
      setMsg("The text was read, but no subscriptions were found in it. Open “What we read” below to see what the reader saw.", true);
      $("review").innerHTML = ""; $("save-row").classList.add("hide"); $("review-wrap").classList.remove("hide");
      return;
    }
    setMsg(`Found ${draft.length} possible subscription${draft.length > 1 ? "s" : ""}. Check each one before saving.`);
    $("save-row").classList.remove("hide"); $("review-wrap").classList.remove("hide"); renderReview();
  });

  const FREQS = [["", "Not found"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["yearly", "Yearly"]];
  function renderReview() {
    const inp = (i, k, label, type, extra) => { const v = draft[i][k]; return `<label>${label}<input data-i="${i}" data-f="${k}" type="${type}" ${extra || ""} value="${esc(v ?? "")}" placeholder="Not found" class="${v === "" || v == null ? "miss" : ""}"></label>`; };
    $("review").innerHTML = draft.map((e, i) => `<div class="card ${e.include ? "" : "off"}">
      <div style="display:flex;align-items:center;gap:10px">${logoHtml(e.name)}<label class="inc"><input type="checkbox" data-i="${i}" data-f="include" ${e.include ? "checked" : ""}> Save this one</label></div>
      ${inp(i, "name", "Name", "text")}${inp(i, "plan", "Plan", "text")}
      <div class="two">${inp(i, "amount", "Amount", "number", 'step="any" min="0" inputmode="decimal"')}${inp(i, "currency", "Currency", "text", 'maxlength="3"')}</div>
      <label>Billed<select data-i="${i}" data-f="freq" class="${e.freq ? "" : "miss"}">${FREQS.map(([v, l]) => `<option value="${v}" ${e.freq === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      ${inp(i, "date", "Next renewal", "date")}${inp(i, "expiry", "Ends / expires (leave empty if it keeps renewing)", "date")}
      <label>Status<select data-i="${i}" data-f="status">${STATS.map(s => `<option ${e.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      ${e.notes.map(n => `<p class="warn">${esc(n)}</p>`).join("")}</div>`).join("");
  }
  $("review").addEventListener("input", ev => {
    const t = ev.target, i = t.dataset.i, f = t.dataset.f; if (i == null) return;
    let v = t.type === "checkbox" ? t.checked : t.value;
    if (f === "amount") v = v === "" ? null : parseFloat(v);
    if (f === "currency") { v = v.toUpperCase(); t.value = v; }
    draft[i][f] = v;
    if (f !== "include") t.classList.toggle("miss", v === "" || v == null);
    else t.closest(".card").classList.toggle("off", !v);
  });

  $("save").addEventListener("click", () => {
    const chosen = draft.filter(e => e.include);
    if (!chosen.length) { setMsg("Nothing is ticked to save.", true); return; }
    const noName = chosen.find(e => !String(e.name).trim());
    if (noName) { setMsg("Add a name to every ticked subscription, or untick it.", true); return; }
    const existing = Store.load(), toSave = [];
    chosen.forEach(e => {
      // Skip a repeat of something already saved, unless it was flagged and the user ticked it on purpose.
      if (!e.dup && existing.concat(toSave).some(x => Parser.isDup(x, e))) return;
      toSave.push({ id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())), name: e.name.trim(), plan: e.plan, amount: e.amount, currency: e.currency, freq: e.freq, date: e.date, expiry: e.expiry, status: e.status, addedAt: new Date().toISOString() });
    });
    if (!Store.save(existing.concat(toSave))) { setMsg("Couldn’t save on this device. Check that browser storage is allowed.", true); return; }
    draft = []; $("review-wrap").classList.add("hide"); setMsg("");
    location.hash = "#dashboard";
  });

  // ---------- Pages ----------
  function route() {
    const h = (location.hash || "#home").slice(1), page = ["home", "dashboard", "scan"].includes(h) ? h : "home";
    ["home", "dashboard", "scan"].forEach(p => $(p).classList.toggle("hide", p !== page));
    const b = $("navbtn"); b.textContent = page === "home" ? "Open dashboard" : "Home"; b.href = page === "home" ? "#dashboard" : "#home";
    if (page !== "scan") { /* images are never stored: nothing to clean up */ }
    renderAll(); window.scrollTo(0, 0);
  }
  addEventListener("hashchange", route); route(); refreshFx();
})();
