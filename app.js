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
  let notice = null;
  function noticeHtml() {
    if (!notice) return "";
    const id = esc(notice.id);
    if (notice.kind === "renewed") return `<div class="due"><b>${esc(notice.text)}</b> Update your calendar so its alert matches this date.
      <div class="acts"><button class="btn" data-act="calics" data-id="${id}">Add to calendar</button><button class="btn ghost" data-act="dismiss" data-id="${id}">Not now</button></div></div>`;
    return `<div class="due">${esc(notice.text)} If you added it to your calendar, delete that event there.
      <div class="acts"><button class="btn ghost" data-act="dismiss" data-id="${id}">OK</button></div></div>`;
  }
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
    if ((act === "renewed" || act === "cancelled") && prefs().calAsk !== false)
      notice = { id: s.id, kind: act, text: act === "renewed" ? `Next charge for ${s.name}: ${fmtDate(s.date)}.` : `${s.name} is marked cancelled.` };
    else if (act === "calics") { downloadIcs(buildIcs(s.id), "subscription.ics"); notice = null; }
    else if (act === "dismiss") notice = null;
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

  // ---------- Editing a saved subscription ----------
  let editId = null;
  function openEditor(id) {
    const s = Store.load().find(x => x.id === id); if (!s) return;
    editId = id;
    const f = (k, label, type, extra) => `<label>${label}<input data-e="${k}" type="${type}" ${extra || ""} value="${esc(s[k] ?? "")}"></label>`;
    $("edit-form").innerHTML = `<h2 style="margin:0;font-size:20px">Edit ${esc(s.name)}</h2>
      ${f("name", "Name", "text")}${f("plan", "Plan", "text")}
      <div class="two">${f("amount", "Amount", "number", 'step="any" min="0" inputmode="decimal"')}${f("currency", "Currency", "text", 'maxlength="3"')}</div>
      <label>Billed<select data-e="freq">${FREQS.map(([v, l]) => `<option value="${v}" ${s.freq === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      ${f("date", "Next renewal", "date")}${f("expiry", "Ends / expires (leave empty if it keeps renewing)", "date")}
      <label>Status<select data-e="status">${STATS.map(x => `<option ${s.status === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <p class="warn hide" id="edit-err"></p>
      <div style="display:flex;gap:10px"><button class="btn" id="edit-save">Save changes</button><button class="btn ghost" id="edit-cancel">Cancel</button></div>`;
    $("editor").classList.remove("hide");
  }
  const closeEditor = () => { editId = null; $("editor").classList.add("hide"); };
  function saveEditor() {
    const list = Store.load(), s = list.find(x => x.id === editId); if (!s) { closeEditor(); return; }
    const v = {}; document.querySelectorAll("#edit-form [data-e]").forEach(el => { v[el.dataset.e] = el.value; });
    const err = m => { const p = $("edit-err"); p.textContent = m; p.classList.remove("hide"); };
    if (!v.name.trim()) return err("Add a name.");
    const amount = v.amount === "" ? null : parseFloat(v.amount);
    if (amount != null && !(amount >= 0)) return err("The amount must be a number.");
    let currency = v.currency.trim().toUpperCase();
    if (amount != null && !currency) currency = cfg.defaultCurrency;
    const oldDate = s.date, oldStatus = s.status;
    Object.assign(s, { name: v.name.trim(), plan: v.plan.trim(), amount, currency, freq: v.freq, date: v.date, expiry: v.expiry, status: v.status });
    if (s.date !== oldDate || s.status !== oldStatus) delete s.snooze;
    if (!Store.save(list)) return err("Couldn’t save on this device. Check that browser storage is allowed.");
    closeEditor(); renderAll();
  }
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-edit]");
    if (b) { openEditor(b.dataset.edit); return; }
    if (e.target.id === "edit-save") saveEditor();
    else if (e.target.id === "edit-cancel" || e.target.id === "editor") closeEditor();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && editId) closeEditor(); });

  // ---------- Reminder settings and notifications ----------
  // Browsers can only show a notification while the app has been opened recently. Notifications while the app is fully closed need an online server (a later step).
  const PREF_KEY = "notif.v1", SENT_KEY = "notif.sent.v1";
  const DEFAULTS = { days: [3, 0], am: "09:00", pm: "18:00", pmOn: true, calAsk: true, email: "" };
  const prefs = () => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || "null"); if (p && Array.isArray(p.days)) return Object.assign({}, DEFAULTS, p); } catch (e) {} return Object.assign({}, DEFAULTS); };
  const savePrefs = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) {} };
  const upd = patch => { savePrefs(Object.assign(prefs(), patch)); if (!("serverOn" in patch)) scheduleSync(); };
  // Push is on if the person switched it on; for people who allowed notifications before this setting existed, it counts as on.
  const pushOn = p => p.push !== undefined ? p.push : (canNotify() && Notification.permission === "granted");
  const loadSent = () => { try { return JSON.parse(localStorage.getItem(SENT_KEY) || "[]"); } catch (e) { return []; } };
  const canNotify = () => "Notification" in window;

  async function showNotif(title, body, tag) {
    const opts = { body, tag };
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) { await reg.showNotification(title, opts); return; }
    } catch (e) {}
    try { new Notification(title, opts); } catch (e) {}
  }
  // The words of a reminder. The test button uses the same function, so the test shows exactly what a real reminder looks like.
  function reminderMsg(s, n) {
    const price = s.amount != null && s.currency ? money(s.amount, s.currency) : "";
    const detail = [price, s.freq].filter(Boolean).join(" · ");
    if (n < 0) return { title: `${s.name}: did it renew?`, body: `It was due ${fmtDate(s.date)}. Open the app and tap renewed or cancelled.` };
    const when = n === 0 ? "today" : `in ${n} day${n === 1 ? "" : "s"}`;
    return { title: `${s.name} charges ${when}`, body: (detail ? detail + ". " : "") + "Tap to open and review." };
  }
  // One message per subscription per window. If the app is opened late, only the closest window fires (not all of them at once).
  // Push reminders come on the days you chose, in the morning and (if you want) the evening. If the app is opened late,
  // only the latest slot that has passed is sent, so you never get two at once.
  function checkReminders(now = new Date()) {
    const p = prefs();
    if (!pushOn(p) || !canNotify() || Notification.permission !== "granted") return;
    if (p.serverOn) return;   // the reminder server is sending these (also when the app is closed)
    const mins = now.getHours() * 60 + now.getMinutes(), today = ymd(now);
    const tm = t => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
    const slots = [["am", p.am || "09:00"]]; if (p.pmOn !== false) slots.push(["pm", p.pm || "18:00"]);
    const reached = slots.filter(([, t]) => tm(t) <= mins).map(([k]) => k);
    if (!reached.length) return;
    const latest = reached[reached.length - 1], sent = loadSent(), fresh = [];
    Store.load().filter(s => s.status === "active" && s.date).forEach(s => {
      const n = Math.round((new Date(s.date + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
      if (n >= 0 ? !p.days.includes(n) : n < -3) return;   // overdue: remind for up to 3 days
      const key = `${s.id}|${s.date}|${today}|${latest}`;
      if (sent.includes(key)) return;
      fresh.push(...reached.map(k => `${s.id}|${s.date}|${today}|${k}`));
      const m = reminderMsg(s, n); showNotif(m.title, m.body, key);
    });
    if (fresh.length) { try { localStorage.setItem(SENT_KEY, JSON.stringify(sent.concat(fresh).slice(-400))); } catch (e) {} }
  }
  // ---------- Reminder server (optional): reminders even when the app is closed ----------
  // Switched on by setting pushApi in config.js. Sends subscription names, prices and dates (never screenshots) so the server can send the reminders.
  const API = () => String(cfg.pushApi || "").replace(/\/$/, "");
  const deviceId = () => { try { let d = localStorage.getItem("device.id"); if (!d) { d = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)); localStorage.setItem("device.id", d); } return d; } catch (e) { return ""; } };
  const b64uBytes = b => { const t = b.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - b.length % 4) % 4), bin = atob(t), o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; };
  const swReady = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error("service worker not ready")), 6000))]);
  const postJson = (path, body) => fetch(API() + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let lastSync = "", syncTimer = null;
  function scheduleSync() { if (!API()) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncServer(), 1500); }
  async function syncServer(force) {
    const p = prefs();
    if (!API() || !("PushManager" in window) || !("serviceWorker" in navigator) || !canNotify()) return;
    if (!pushOn(p) || Notification.permission !== "granted") return;
    try {
      const reg = await swReady();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const k = await (await fetch(API() + "/api/push/key")).json();
        if (!k || !k.key) throw new Error("no key");
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(k.key) });
      }
      const body = { device: deviceId(), sub: sub.toJSON(), tz: new Date().getTimezoneOffset(), prefs: { days: p.days, am: p.am, pm: p.pm, pmOn: p.pmOn !== false },
        subs: Store.load().filter(x => x.status === "active" && x.date).map(x => ({ id: x.id, name: x.name, amount: x.amount, currency: x.currency, freq: x.freq, date: x.date })) };
      const text = JSON.stringify(body);
      if (force || text !== lastSync) {
        const r = await postJson("/api/push/sync", body);
        if (!r.ok) throw new Error("server said " + r.status);
        lastSync = text;
      }
      if (!p.serverOn) { upd({ serverOn: true }); if ($("settings") && !$("settings").classList.contains("hide")) renderSettings(); }
    } catch (e) { if (prefs().serverOn) { upd({ serverOn: false }); } }
  }
  async function unsubServer() {
    if (!API()) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration(), sub = reg && await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await postJson("/api/push/unsub", { device: deviceId() });
    } catch (e) {}
    lastSync = "";
  }

  function renderSettings() {
    const p = prefs(), granted = canNotify() && Notification.permission === "granted";
    document.querySelectorAll("[data-d]").forEach(c => { c.checked = p.days.includes(+c.dataset.d); });
    $("push-on").checked = pushOn(p) && granted;
    $("t-am").value = p.am; $("t-pm").value = p.pm; $("pm-on").checked = p.pmOn !== false;
    $("cal-ask").checked = p.calAsk !== false; $("email-addr").value = p.email || "";
    $("notif-status").textContent = !canNotify() ? "This browser doesn’t support notifications. Use the calendar option instead."
      : Notification.permission === "denied" ? "Notifications are blocked. Allow them for this site in your browser’s site settings, then come back."
      : $("push-on").checked ? (p.serverOn ? "Push notifications are on, including when the app is closed." : "Push notifications are on.") : "Push notifications are off.";
    const iph = " On iPhone, first add this site to your Home Screen.";
    $("push-note").textContent = API()
      ? (p.serverOn ? "Reminders arrive even when the app is closed. To do this, your subscription names, prices and dates (never your screenshots) are sent to the reminder server." : "Turn push on to get reminders even when the app is closed. This sends your subscription names, prices and dates (never your screenshots) to the reminder server.") + iph
      : "Reminders arrive when you have opened the app recently. They can’t arrive while it is fully closed yet." + iph;
    $("notif-test").classList.toggle("hide", !$("push-on").checked);
  }
  document.querySelectorAll("[data-d]").forEach(c => c.addEventListener("change", () => {
    upd({ days: Array.from(document.querySelectorAll("[data-d]")).filter(x => x.checked).map(x => +x.dataset.d).sort((a, b) => b - a) });
    renderAll();
  }));
  $("push-on").addEventListener("change", async ev => {
    if (ev.target.checked) {
      let r = "denied"; try { r = canNotify() ? await Notification.requestPermission() : "denied"; } catch (e) {}
      upd({ push: r === "granted" });
    } else { upd({ push: false, serverOn: false }); unsubServer(); }
    renderSettings(); checkReminders(); syncServer(true);
  });
  $("t-am").addEventListener("change", ev => upd({ am: ev.target.value || "09:00" }));
  $("t-pm").addEventListener("change", ev => upd({ pm: ev.target.value || "18:00" }));
  $("pm-on").addEventListener("change", ev => upd({ pmOn: ev.target.checked }));
  $("cal-ask").addEventListener("change", ev => upd({ calAsk: ev.target.checked }));
  $("email-addr").addEventListener("change", ev => upd({ email: ev.target.value.trim() }));
  $("notif-test").addEventListener("click", async () => {
    if (prefs().serverOn) {   // test the real route: the message comes from the server
      try { const r = await postJson("/api/push/test", { device: deviceId() }); $("notif-status").textContent = r.ok ? "Test sent from the server. It should arrive in a few seconds, even if you close the app." : "The server couldn’t send the test. Try again in a minute."; }
      catch (e) { $("notif-status").textContent = "Couldn’t reach the reminder server."; }
      return;
    }
    // Uses your soonest real subscription, so you see a real reminder (marked as a test).
    const next = Store.load().filter(x => x.status === "active" && x.date && daysTo(x.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
    const m = next ? reminderMsg(next, daysTo(next.date)) : { title: "Netflix charges in 3 days", body: "NGN 4,400.00 · monthly. Tap to open and review." };
    showNotif("Test: " + m.title, m.body, "test");
  });

  // ---------- Calendar file (.ics) ----------
  // Works with the app closed: the phone's own calendar sends the alerts. Same UID each time, so downloading again updates the events.
  const icsText = t => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = line => { const out = []; while (line.length > 60) { out.push(line.slice(0, 60)); line = " " + line.slice(60); } out.push(line); return out.join("\r\n"); };
  function buildIcs(onlyId) {
    const days = prefs().days, stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const RULE = { weekly: "FREQ=WEEKLY", monthly: "FREQ=MONTHLY", quarterly: "FREQ=MONTHLY;INTERVAL=3", yearly: "FREQ=YEARLY" };
    const ev = [];
    Store.load().filter(x => x.status === "active" && x.date && (!onlyId || x.id === onlyId)).forEach(x => {
      const rec = !!RULE[x.freq];
      if (x.date < isoIn(0) && !rec) return;
      const start = x.date < isoIn(0) ? nextCharge(x) : x.date;
      const end = ymd(new Date(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10) + 1));
      const price = x.amount != null && x.currency ? " (" + money(x.amount, x.currency) + ")" : "";
      const L = ["BEGIN:VEVENT", `UID:${x.id}@yanju`, `DTSTAMP:${stamp}`, `SEQUENCE:${Math.floor(Date.now() / 1000)}`,
        `DTSTART;VALUE=DATE:${start.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${end.replace(/-/g, "")}`];
      if (rec) L.push("RRULE:" + RULE[x.freq] + (x.expiry && x.expiry >= start ? ";UNTIL=" + x.expiry.replace(/-/g, "") : ""));
      L.push("SUMMARY:" + icsText(`${x.name} charges${price}`), "DESCRIPTION:" + icsText(`Subscription renewal. Open ${cfg.name} to mark it renewed or cancelled.`));
      days.forEach(d => L.push("BEGIN:VALARM", "TRIGGER:" + (d === 0 ? "PT9H" : "-PT" + (d * 24 - 9) + "H"), "ACTION:DISPLAY",
        "DESCRIPTION:" + icsText(`${x.name} charges ${d === 0 ? "today" : "in " + d + " day" + (d === 1 ? "" : "s")}`), "END:VALARM"));
      L.push("END:VEVENT"); ev.push(L.map(fold).join("\r\n"));
    });
    if (!ev.length) return null;
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//" + cfg.name + "//Subscriptions//EN", "CALSCALE:GREGORIAN"].concat(ev, ["END:VCALENDAR"]).join("\r\n") + "\r\n";
  }
  function downloadIcs(ics, name) {
    if (!ics) return false;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return true;
  }
  $("cal-btn").addEventListener("click", () => {
    $("cal-msg").textContent = downloadIcs(buildIcs(), "subscriptions.ics")
      ? "Downloaded. Open the file and choose “Add to calendar”."
      : "Nothing to add yet. Save a subscription that has a renewal date first.";
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

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
        <span class="amt">${price}</span>${chip}${real ? `<button class="x" data-edit="${esc(s.id)}" aria-label="Edit ${esc(s.name)}">✎</button><button class="x" data-del="${esc(s.id)}" aria-label="Delete ${esc(s.name)}">✕</button>` : ""}</div>`;
    }).join("");
  }

  function renderAll() {
    const real = Store.load(), usingSample = !real.length, list = usingSample ? sample() : real;
    $("sample-badge").classList.toggle("hide", !usingSample);
    $("demo-list").innerHTML = rowsHtml(sample(), false);
    $("dash-list").innerHTML = rowsHtml(list, !usingSample);
    const due = usingSample ? [] : dueItems(real);
    $("due-box").innerHTML = (usingSample ? "" : noticeHtml()) + (due.length ? `<h2>Needs your answer</h2>` + dueHtml(due) : "");
    const mx = Math.max(-1, ...prefs().days);
    const soon = usingSample ? [] : real.filter(s => s.status === "active" && s.date && daysTo(s.date) >= 0 && daysTo(s.date) <= mx).sort((a, b) => a.date.localeCompare(b.date));
    $("remind-box").innerHTML = soon.length ? `<h2>Charging soon</h2><div class="renewals">` + soon.map(s => { const n = daysTo(s.date); return `<div class="row">${logoHtml(s.name)}<div class="n">${esc(s.name)}<small>${n === 0 ? "charges today" : "charges in " + n + " day" + (n === 1 ? "" : "s")}</small></div><span class="amt">${s.amount != null && s.currency ? esc(money(s.amount, s.currency)) : ""}</span></div>`; }).join("") + `</div>` : "";
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
    scheduleSync();
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
  const PAGES = ["home", "dashboard", "scan", "settings"];
  function route() {
    const h = (location.hash || "#home").slice(1), page = PAGES.includes(h) ? h : "home";
    PAGES.forEach(p => $(p).classList.toggle("hide", p !== page));
    if (page === "settings") renderSettings();
    const b = $("navbtn"); b.textContent = page === "home" ? "Open dashboard" : "Home"; b.href = page === "home" ? "#dashboard" : "#home";
    if (page !== "scan") { /* images are never stored: nothing to clean up */ }
    renderAll(); window.scrollTo(0, 0);
  }
  addEventListener("hashchange", route); route(); refreshFx(); checkReminders();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderAll(); checkReminders(); } });
  setInterval(() => checkReminders(), 30 * 60 * 1000);
})();
