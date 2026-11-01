(function () {
  const cfg = window.APP_CONFIG, $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  document.title = cfg.name + " · " + cfg.tagline;
  document.querySelectorAll("[data-app-name]").forEach(e => e.textContent = cfg.name);
  document.querySelectorAll("[data-tagline]").forEach(e => e.textContent = cfg.tagline);

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
      return `<div class="row"><div class="n">${esc(s.name || "Unnamed")}<small>${sub || "Plan not set"}</small></div>
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
  let draft = [];
  const OK_TYPES = ["image/png", "image/jpeg", "image/webp"], MAX_MB = 10;

  function setMsg(t, bad) { const m = $("scan-msg"); m.textContent = t; m.className = "note" + (bad ? " bad" : ""); }

  $("file").addEventListener("change", async ev => {
    const files = Array.from(ev.target.files); ev.target.value = "";
    if (!files.length) return;
    const bad = files.find(f => !OK_TYPES.includes(f.type) || f.size > MAX_MB * 1048576);
    if (bad) { setMsg(`“${bad.name}” can’t be used. Choose PNG, JPG or WebP images under ${MAX_MB} MB.`, true); return; }
    if (!window.Tesseract) { setMsg("The text reader didn’t load. Check your internet connection and try again.", true); return; }
    $("review-wrap").classList.add("hide"); draft = []; let raw = "";
    try {
      for (let i = 0; i < files.length; i++) {
        setMsg(`Reading image ${i + 1} of ${files.length}… 0%`);
        const res = await Tesseract.recognize(files[i], "eng", { logger: m => { if (m.status === "recognizing text") setMsg(`Reading image ${i + 1} of ${files.length}… ${Math.round(m.progress * 100)}%`); } });
        raw += res.data.text + "\n\n";
        draft = draft.concat(Parser.parse(res.data.text));
      }
    } catch (err) { setMsg("Something went wrong while reading the image. Try a clearer screenshot.", true); return; }
    $("raw").textContent = raw.trim() || "(nothing readable found)";
    if (!draft.length) { setMsg("No subscriptions found. Check “What we read” below, or try a clearer screenshot.", true); $("review-wrap").classList.remove("hide"); $("review").innerHTML = ""; $("save-row").classList.add("hide"); return; }
    Parser.markDuplicates(draft, Store.load());
    setMsg(`Found ${draft.length} possible subscription${draft.length > 1 ? "s" : ""}. Check each one before saving.`);
    $("save-row").classList.remove("hide"); $("review-wrap").classList.remove("hide"); renderReview();
  });

  const FREQS = [["", "Not found"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["yearly", "Yearly"]];
  const STATS = ["active", "cancelled", "expired"];
  function renderReview() {
    const inp = (i, k, label, type, extra) => { const v = draft[i][k]; return `<label>${label}<input data-i="${i}" data-f="${k}" type="${type}" ${extra || ""} value="${esc(v ?? "")}" placeholder="Not found" class="${v === "" || v == null ? "miss" : ""}"></label>`; };
    $("review").innerHTML = draft.map((e, i) => `<div class="card ${e.include ? "" : "off"}">
      <label class="inc"><input type="checkbox" data-i="${i}" data-f="include" ${e.include ? "checked" : ""}> Save this one</label>
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
    const existing = Store.load(), keys = new Set(existing.map(Parser.dupKey)), toSave = [];
    chosen.forEach(e => {
      const k = Parser.dupKey(e); if (keys.has(k)) return; keys.add(k);
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
