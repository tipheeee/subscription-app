// The Plans page (#pricing): the three plans, pay buttons, the free trial, report packs, and what happens when
// someone comes back from Paystack. Prices shown here come from the payments server (worker-payments.js),
// which is the only place a price is decided. config.js has a fallback for when the server can't be reached.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cfg = () => window.APP_CONFIG.plans, N = n => "₦" + Number(n).toLocaleString("en-NG");
  const fmtDay = iso => { try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } };

  let prices = null, pack = null, banner = null, busy = false;
  const fallback = () => ({ premium: { 1: cfg().premiumPriceNGN, 3: Math.round(cfg().premiumPriceNGN * 3 * 0.9), 12: Math.round(cfg().premiumPriceNGN * 12 * 0.8) }, business: { 1: cfg().businessPriceNGN, 3: Math.round(cfg().businessPriceNGN * 3 * 0.9), 12: Math.round(cfg().businessPriceNGN * 12 * 0.8) } });
  async function loadPrices() {
    if (prices) return;
    const r = await Plans.api("/api/pay/prices");
    if (r.ok && r.data && r.data.prices) { prices = r.data.prices; pack = r.data.pack; }
    else { prices = fallback(); pack = { amount: cfg().reportPackNGN, credits: cfg().reportPackSize }; }
  }

  const periodLabel = (plan, m) => {
    const one = prices[plan][1], p = prices[plan][m], save = Math.round((1 - p / (one * m)) * 100);
    return `${m === 1 ? "1 month" : m + " months"} · ${N(p)}${save > 0 ? ` (save ${save}%)` : ""}`;
  };
  const periodSelect = plan => `<label>How long?<select data-period="${plan}">${[1, 3, 12].map(m => `<option value="${m}">${esc(periodLabel(plan, m))}</option>`).join("")}</select></label>`;

  function render() {
    const box = $("pricing"); if (!box || !window.Plans || !prices) return;
    const p = cfg(), cur = Plans.tier(), day = Math.round(prices.premium[1] / 30), until = Plans.until();
    const li = a => a.map(x => `<li>${esc(x)}</li>`).join("");
    const here = k => cur === k ? `<span class="badge">Your plan</span>` : "";
    const trialOffer = cur === "free" && !Plans.trialUsed();
    const credits = Plans.credits();
    box.innerHTML = `<h1 style="font-size:34px">Plans</h1>
      <p class="lead" style="font-size:16px">Start free. Pay only when you need more. Plans are prepaid and never renew by themselves, so you will not be charged again unless you choose to.</p>
      ${banner ? `<div class="card lock" role="status"><b>${esc(banner.title)}</b>${banner.text ? `<p style="margin:0">${esc(banner.text)}</p>` : ""}</div>` : ""}
      ${cur !== "free" ? `<p class="note"><b>You are on ${cur === "business" ? "Business" : "Premium"}${until ? ` until ${esc(fmtDay(until))}` : ""}.</b> Buying again adds time to the end.</p>` : ""}
      <div class="plans">
        <div class="card plan">
          <div class="ch-head"><b>Free</b>${here("free")}</div>
          <div class="price">₦0<small> forever</small></div>
          <ul>${li([`${p.freeSubscriptions} active subscriptions`, "Reminders by push and calendar", `History for the last ${p.freeHistoryDays} days`, "Totals, insights and CSV export of your list"])}</ul>
        </div>
        <div class="card plan pop">
          <div class="ch-head"><b>Premium</b>${cur === "premium" ? `<span class="badge">Your plan</span>` : `<span class="badge">Most popular</span>`}</div>
          <div class="price">${N(prices.premium[1])}<small> a month</small></div>
          <p class="note" style="margin:0">About ${N(day)} a day. Cancel one forgotten subscription and it pays for itself.</p>
          <ul>${li(["Unlimited subscriptions", `WhatsApp reminders (up to ${p.whatsappCap.premium} a month, coming soon)`, "Full history, with no time limit", "Alternatives: cheaper and free options"])}</ul>
          ${cur === "business" ? `<p class="note" style="margin:0">Business already includes everything in Premium.</p>` : `${periodSelect("premium")}<button class="btn" data-pay="premium">Pay with Paystack</button>`}
          ${trialOffer ? `<button class="btn ghost" data-trial>Try Premium free for ${p.trialDays} days</button>` : ""}
          <p class="amsg" data-msg="premium" role="status"></p>
        </div>
        <div class="card plan">
          <div class="ch-head"><b>Business</b>${here("business")}</div>
          <div class="price">${N(prices.business[1])}<small> a month</small></div>
          <p class="note" style="margin:0">For freelancers and small businesses.</p>
          <ul>${li(["Everything in Premium", "Business and personal split, with client or project costs", "Unlimited business reports (PDF and spreadsheet)", `WhatsApp reminders (up to ${p.whatsappCap.business} a month, coming soon)`])}</ul>
          ${periodSelect("business")}<button class="btn ghost" data-pay="business">Pay with Paystack</button>
          <p class="amsg" data-msg="business" role="status"></p>
        </div>
      </div>
      <div class="card">
        <b>Need just one report?</b>
        <p class="note" style="margin:0">Buy ${pack.credits} reports for ${N(pack.amount)} (${N(Math.round(pack.amount / pack.credits))} each). Your report is made from your own information and downloaded to your device. You can see an example any time. On Business, reports are unlimited.${credits ? ` <b>You have ${credits} report credit${credits > 1 ? "s" : ""}.</b>` : ""}</p>
        <div><button class="btn ghost" data-pay="pack">Buy ${pack.credits} reports · ${N(pack.amount)}</button> <a class="btn ghost" href="#report">See an example report</a></div>
        <p class="amsg" data-msg="pack" role="status"></p>
      </div>
      <p class="note">Payments are taken by Paystack, so you can pay by card, bank transfer or USSD. We never see your card details. See the <a href="terms.html">Terms</a> for refunds.</p>
      <p><a class="btn ghost" href="#dashboard">Back to dashboard</a></p>`;
  }

  const say = (which, text, kind) => { const m = document.querySelector(`[data-msg="${which}"]`); if (m) { m.textContent = text; m.className = "amsg" + (kind ? " " + kind : ""); } };
  const needSignIn = which => say(which, "Sign in or create an account first (use the buttons at the top). Your plan is saved to your account.", "err");

  async function pay(which, btn) {
    if (busy) return; if (!Plans.signedIn()) { needSignIn(which); return; }
    busy = true; btn.disabled = true; say(which, "Opening Paystack…");
    const body = which === "pack" ? { kind: "pack" } : { kind: "plan", plan: which, months: Number(document.querySelector(`[data-period="${which}"]`).value) };
    const r = await Plans.api("/api/pay/start", { method: "POST", body: JSON.stringify(body) });
    if (r.ok && r.data.url) { location.href = r.data.url; return; }
    busy = false; btn.disabled = false;
    say(which, r.data.message || "Couldn’t start the payment. Try again.", "err");
  }

  async function trial(btn) {
    if (busy) return; if (!Plans.signedIn()) { needSignIn("premium"); return; }
    busy = true; btn.disabled = true; say("premium", "Starting your trial…");
    const r = await Plans.api("/api/trial/start", { method: "POST" });
    busy = false;
    if (!r.ok) { btn.disabled = false; say("premium", r.data.message || "Couldn’t start the trial. Try again.", "err"); return; }
    banner = { title: `Your ${cfg().trialDays}-day Premium trial has started.`, text: "Enjoy unlimited subscriptions. It does not renew and nothing is charged." };
    await Plans.refresh();
  }

  // Back from Paystack: confirm the payment, then show the new plan.
  async function handleReturn() {
    const q = new URLSearchParams(location.search), ref = q.get("reference") || q.get("trxref");
    if (q.get("pay") !== "done" || !ref) return;
    history.replaceState(null, "", location.pathname + "#pricing");
    dispatchEvent(new HashChangeEvent("hashchange"));   // setting the same hash would not fire it, so tell the app to show the Plans page
    banner = { title: "Checking your payment…", text: "This takes a few seconds." }; await loadPrices(); render();
    for (let i = 0; i < 20 && !Plans.signedIn(); i++) await new Promise(r => setTimeout(r, 300));   // wait for sign-in to load
    if (!Plans.signedIn()) { banner = { title: "Sign in to see your plan.", text: "If you were charged, your plan will switch on by itself within a few minutes. Sign in to check." }; render(); return; }
    const r = await Plans.api("/api/pay/verify?reference=" + encodeURIComponent(ref));
    if (!r.ok) banner = { title: "We couldn’t confirm that payment yet.", text: (r.data.message || "") + " If you were charged, your plan will switch on by itself within a few minutes. Refresh this page to check." };
    else if (r.data.state === "done") banner = { title: "Payment received. Thank you!", text: r.data.plan !== "free" ? `You are on ${r.data.plan === "business" ? "Business" : "Premium"}${r.data.plan_until ? " until " + fmtDay(r.data.plan_until) : ""}.` : "" };
    else if (r.data.state === "not_paid") banner = { title: "That payment wasn’t completed.", text: "Nothing was charged. You can try again below." };
    else banner = { title: "We couldn’t match that payment.", text: "If you were charged, email yanjuhq@gmail.com with your Paystack receipt and we will fix it." };
    await Plans.refresh();
  }

  async function show() { if (location.hash !== "#pricing") return; await loadPrices(); render(); }

  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-pay]"); if (b) { pay(b.dataset.pay, b); return; }
    const t = e.target.closest && e.target.closest("[data-trial]"); if (t) trial(t);
  });
  addEventListener("hashchange", () => { if (location.hash !== "#pricing") banner = null; show(); });
  addEventListener("yanju:synced", () => { if (location.hash === "#pricing") render(); });
  const boot = () => { handleReturn().then(show); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
