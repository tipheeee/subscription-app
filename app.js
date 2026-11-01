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

  function rowsHtml(list, real) {
    const sorted = list.slice().sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
    return sorted.map(s => {
      let chip;
      if (s.status !== "active") chip = `<span class="chip far">${esc(s.status)}</span>`;
      else if (!s.date) chip = `<span class="chip far">No date</span>`;
      else { const n = daysTo(s.date); chip = n < 0 ? `<span class="chip late">Date passed</span>` : `<span class="chip ${n <= 3 ? "late" : n > 14 ? "far" : ""}">in ${n} day${n === 1 ? "" : "s"}</span>`; }
      const price = s.amount != null && s.currency ? money(s.amount, s.currency) : "No price";
      const sub = [s.plan, s.freq].filter(Boolean).map(esc).join(" · ");
      return `<div class="row">${logoHtml(s.name)}<div class="n">${esc(s.name || "Unnamed")}<small>${sub || "Plan not set"}</small></div>
        <span class="amt">${price}</span>${chip}${real ? `<button class="x" data-del="${esc(s.id)}" aria-label="Delete ${esc(s.name)}">✕</button>` : ""}</div>`;
    }).join("");
  }

  function renderAll() {
    const real = Store.load(), usingSample = !real.length, list = usingSample ? sample() : real;
    $("sample-badge").classList.toggle("hide", !usingSample);
    $("demo-list").innerHTML = rowsHtml(sample(), false);
    $("dash-list").innerHTML = rowsHtml(list, !usingSample);
    const tot = {}; let unpriced = 0;
    list.filter(s => s.status === "active").forEach(s => {
      if (s.amount == null || !s.currency || !PER[s.freq]) { unpriced++; return; }
      tot[s.currency] = (tot[s.currency] || 0) + s.amount * PER[s.freq];
    });
    const parts = Object.entries(tot);
    $("s-month").innerHTML = parts.length ? parts.map(([c, v]) => esc(money(v, c))).join("<br>") : "–";
    $("s-year").innerHTML = parts.length ? parts.map(([c, v]) => esc(money(v * 12, c))).join("<br>") : "–";
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

  // Make the screenshot easier to read: enlarge small ones, flip dark mode to dark-on-light, boost contrast.
  async function prepare(blob) {
    try {
      const bmp = await createImageBitmap(blob);
      let k = bmp.width < 1400 ? Math.min(3, 1400 / bmp.width) : 1;
      k = Math.min(k, Math.sqrt(12e6 / (bmp.width * bmp.height)));
      const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingQuality = "high"; ctx.drawImage(bmp, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h), d = img.data, hist = new Array(256).fill(0);
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = g; hist[g]++; sum += g; }
      const dark = sum / (d.length / 4) < 120;
      const n = d.length / 4; let lo = 0, hi = 255, acc = 0;
      while (lo < 255 && (acc += hist[lo]) < n * 0.02) lo++;
      acc = 0; while (hi > 0 && (acc += hist[hi]) < n * 0.02) hi--;
      const span = Math.max(1, hi - lo);
      for (let i = 0; i < d.length; i += 4) {
        let g = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span));
        if (dark) g = 255 - g;
        d[i] = d[i + 1] = d[i + 2] = g;
      }
      ctx.putImageData(img, 0, 0);
      return await new Promise(res => c.toBlob(b => res(b || blob), "image/png"));
    } catch (e) { console.warn("prepare failed, using original", e); return blob; }
  }

  // ---------- AI reader (optional: set scanApi in config.js) ----------
  async function shrink(blob) {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  }
  const isoOk = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + "T00:00:00Z"));
  function toEntry(s) {
    const notes = Array.isArray(s.notes) ? s.notes.filter(n => typeof n === "string" && n).slice(0, 3) : [];
    const amount = typeof s.amount === "number" && s.amount > 0 ? s.amount : null;
    let currency = typeof s.currency === "string" ? s.currency.trim().toUpperCase().slice(0, 3) : "";
    if (amount != null && !currency) { currency = cfg.defaultCurrency; notes.push("No currency was shown — assumed " + currency + ". Check it."); }
    const freq = ["weekly", "monthly", "quarterly", "yearly"].includes(s.freq) ? s.freq : "";
    if (amount == null) notes.push("No price visible in the screenshot.");
    if (!freq) notes.push("Billing period not visible.");
    return { include: true, name: String(s.name || "").trim(), plan: String(s.plan || "").trim(), amount, currency, freq,
      date: isoOk(s.date) ? s.date : "", expiry: isoOk(s.expiry) ? s.expiry : "",
      status: STATS.includes(s.status) ? s.status : "active", notes };
  }
  async function readWithAI(blob) {
    const res = await fetch(cfg.scanApi, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: await shrink(blob), mime: "image/jpeg", today: isoIn(0) }) });
    if (!res.ok) { let m = ""; try { m = (await res.json()).error || ""; } catch (e) {} throw new Error("server said " + res.status + (m ? ": " + m : "")); }
    const data = await res.json();
    if (!data || !Array.isArray(data.subscriptions)) throw new Error("unexpected reply");
    return data.subscriptions.filter(s => s && s.name).map(toEntry);
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
    let raw = "", aiOk = false, aiErr = "";
    if (cfg.scanApi) {
      try {
        const parts = [];
        for (let i = 0; i < imgs.length; i++) {
          setMsg(`Reading image ${i + 1} of ${imgs.length}…`);
          const items = await readWithAI(imgs[i].blob);
          draft = draft.concat(items); parts.push(JSON.stringify(items, null, 1));
        }
        raw = parts.join("\n\n"); aiOk = true;
        Parser.markDuplicates(draft, Store.load());
      } catch (err) {
        console.error(err); draft = []; aiErr = errText(err);
        setMsg(`The AI reader didn’t respond (${aiErr}). Using the basic reader instead…`, true);
      }
    }
    if (!aiOk) {
    if (!window.Tesseract) { setMsg("The text reader didn’t load. Check your internet connection and try again.", true); return; }
    const texts = [];
    let label = "";
    let worker;
    try {
      worker = await Tesseract.createWorker("eng", 1, { logger: m => { if (m.status === "recognizing text") setMsg(`${label} ${Math.round(m.progress * 100)}%`); } });
    } catch (err) {
      console.error(err);
      setMsg(`The text reader failed to start: ${errText(err)}. Check your internet connection and try again.`, true);
      return;
    }
    try {
      for (let i = 0; i < imgs.length; i++) {
        label = `Reading image ${i + 1} of ${imgs.length}… (the first time can take a minute)`;
        setMsg(label);
        const prepared = await prepare(imgs[i].blob);
        let best = null;
        // Try a few reading modes. Stop as soon as every subscription has a price.
        for (const mode of ["6", "4", "11"]) {
          const res = await worker.setParameters({ tessedit_pageseg_mode: mode, preserve_interword_spaces: "1" }).then(() => worker.recognize(prepared));
          const text = (res.data && res.data.text) || "";
          let ents = []; try { ents = Parser.parse(text); } catch (e) { /* reported below */ }
          const score = ents.filter(e => e.amount != null).length * 2 + ents.length;
          if (!best || score > best.score) best = { text, score };
          if (ents.length && ents.every(e => e.amount != null)) break;
        }
        texts.push(best.text);
      }
    } catch (err) {
      console.error(err);
      setMsg(`The text reader failed: ${errText(err)}. Check your internet connection and try again.`, true);
      return;
    } finally { try { await worker.terminate(); } catch (e) {} }
    raw = texts.join("\n\n").trim();
    try {
      texts.forEach(t => { draft = draft.concat(Parser.parse(t)); });
      Parser.markDuplicates(draft, Store.load());
    } catch (err) {
      console.error(err); draft = [];
      setMsg(`The text was read but couldn’t be sorted into subscriptions: ${errText(err)}. Open “What we read” below and send it to me.`, true);
      $("review").innerHTML = ""; $("save-row").classList.add("hide"); $("review-wrap").classList.remove("hide");
      return;
    }
    }
    $("raw").textContent = (aiOk ? "[Read by: AI reader]\n" : cfg.scanApi ? "[Read by: basic reader — AI reader error: " + aiErr + "]\n" : "[Read by: basic reader]\n") + (raw || "(nothing readable found)");
    if (!draft.length) {
      setMsg("The text was read, but no subscriptions were found in it. Open “What we read” below to see what the reader saw.", true);
      $("review").innerHTML = ""; $("save-row").classList.add("hide"); $("review-wrap").classList.remove("hide");
      return;
    }
    setMsg(`Found ${draft.length} possible subscription${draft.length > 1 ? "s" : ""} (${aiOk ? "AI reader" : "basic reader" + (aiErr ? "; AI reader failed: " + aiErr : "")}). Check each one before saving.`, !aiOk && !!aiErr);
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
      ${inp(i, "date", "Next renewal", "date")}${inp(i, "expiry", "Ends / expires", "date")}
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
  addEventListener("hashchange", route); route();
})();
