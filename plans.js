// Free and Premium limits live here, in one place. Change the numbers in config.js (plans).
// Nothing a person entered is ever deleted or hidden for good: a lock only stops NEW use of a feature or hides OLD records until they upgrade.
//
// How a person becomes Premium: their Supabase account carries app_metadata.plan = "premium" (and optionally
// app_metadata.plan_until = "2027-01-31"). app_metadata can only be written by the server (a payment webhook later),
// never by the person's own browser. Until payments exist, everyone is Free.
//
// NOTE: these checks run in the browser, so a technical person could bypass them. That is fine for a first version.
// Before payments go live, the same limits must be enforced in Supabase (row-level security / a function that counts rows).
(function () {
  const cfg = () => (window.APP_CONFIG && window.APP_CONFIG.plans) || {};
  const FREE_SUBS = () => Number.isFinite(cfg().freeSubscriptions) ? cfg().freeSubscriptions : 3;
  const HIST_DAYS = () => Number.isFinite(cfg().freeHistoryDays) ? cfg().freeHistoryDays : 60;
  const PRICE = () => cfg().premiumPriceNGN || 1000;
  const naira = n => "₦" + Number(n).toLocaleString("en-NG");

  // What each locked feature is called, which plan unlocks it, and why someone would want it.
  const FEATURES = {
    alternatives: { title: "Alternatives", plan: "Premium", why: "Find cheaper or free options for what you already pay for. This is how people cancel a subscription and save money." },
    report: { title: "Business report", plan: "Business", why: "A clear report of your business subscriptions, ready for your accountant." }
  };

  function tier() {
    // Testing on your own computer only: localStorage.setItem("plan.test","premium") then reload.
    try {
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        const t = localStorage.getItem("plan.test");
        if (t === "premium" || t === "business" || t === "free") return t;
      }
    } catch (e) { /* storage blocked */ }
    const u = window.Auth && window.Auth.user && window.Auth.user();
    const m = (u && u.app_metadata) || {};
    if ((m.plan === "premium" || m.plan === "business") && (!m.plan_until || new Date(m.plan_until + (String(m.plan_until).length === 10 ? "T23:59:59" : "")) > new Date())) return m.plan;
    return "free";
  }
  const isPremium = () => tier() !== "free";   // Premium and Business both get everything Premium has
  const isBusiness = () => tier() === "business";

  // Only active subscriptions use a free slot. Cancelled and ended ones are free to keep.
  // The "Yanju Premium/Business" entry the app adds after a payment never uses up a free slot.
  const SELF_ID = "yanju-self";
  const activeCount = list => (list || []).filter(s => s && s.status === "active" && s.id !== SELF_ID).length;
  const limit = () => isPremium() ? Infinity : FREE_SUBS();
  const room = list => Math.max(0, limit() - activeCount(list));
  // Someone who already has more than the limit (for example from before plans existed) keeps all of them; they just can't add more.
  const canAdd = (list, n) => room(list) >= (n == null ? 1 : n);

  const can = feature => feature === "report" ? isBusiness() : (isPremium() || !(feature in FEATURES));

  // The first date a free person can still see in History. null = no limit.
  function historyCutoff(today) {
    if (isPremium()) return null;
    const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() - HIST_DAYS());
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  const priceText = () => naira(PRICE()) + " a month";
  const money = n => naira(n);
  function usageText(list) {
    if (isPremium()) return "";
    const used = activeCount(list), max = FREE_SUBS();
    return used >= max ? `You are using all ${max} free subscriptions.` : `You are using ${used} of ${max} free subscriptions.`;
  }
  function limitMessage(list, wanted) {
    const r = room(list);
    return `Free plans can track ${FREE_SUBS()} active subscriptions. You have ${r} free ${r === 1 ? "slot" : "slots"} left and are trying to add ${wanted}. Untick some, or cancel or remove one you no longer need. Premium (${priceText()}) removes the limit.`;
  }

  // A card shown in place of a locked page.
  function lockCard(feature, esc) {
    const f = FEATURES[feature] || { title: "This feature", why: "" };
    const e = esc || (s => s);
    return `<div class="card lock"><b>🔒 ${e(f.title)} is part of Premium</b><p style="margin:0">${e(f.why)}</p>
      <p class="note" style="margin:0">${e(f.plan)} plan. Payments are opening soon, so there is nothing to pay yet.</p>
      <div><a class="btn" href="#pricing">See plans</a> <a class="btn ghost" href="#dashboard">Back to dashboard</a></div></div>`;
  }


  // ---- Talking to the payments server (worker-payments.js) ----
  const meta = () => { const u = window.Auth && window.Auth.user && window.Auth.user(); return (u && u.app_metadata) || {}; };
  const signedIn = () => !!(window.Auth && window.Auth.user && window.Auth.user());
  const credits = () => Math.max(0, Number(meta().report_credits) || 0);
  const trialUsed = () => !!meta().trial_used;
  const until = () => (isPremium() && meta().plan_until) || "";
  async function api(path, init) {
    const base = String((window.APP_CONFIG || {}).payApi || "").replace(/\/$/, "");
    if (!base) return { ok: false, status: 0, data: { error: "not_configured", message: "Payments aren’t switched on yet." } };
    const headers = { "content-type": "application/json" };
    try { const c = window.Auth && window.Auth.client && window.Auth.client(); const r = c && await c.auth.getSession(); const t = r && r.data && r.data.session; if (t) headers.authorization = "Bearer " + t.access_token; } catch (e) { /* not signed in */ }
    try {
      const r = await fetch(base + path, Object.assign({}, init, { headers }));
      return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
    } catch (e) { return { ok: false, status: 0, data: { error: "network", message: "Couldn’t reach the payments server. Check your internet and try again." } }; }
  }
  // After a payment, trial or report credit: fetch the fresh account so the new plan shows straight away.
  async function refresh() {
    try { const c = window.Auth && window.Auth.client && window.Auth.client(); if (c) await c.auth.refreshSession(); } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent("yanju:synced")); } catch (e) { /* ignore */ }
  }

  window.Plans = { SELF_ID, signedIn, credits, trialUsed, until, api, refresh, tier, isPremium, isBusiness, money, can, room, canAdd, activeCount, limit, historyCutoff, usageText, limitMessage, lockCard, priceText, FEATURES };
})();
