// Invite-a-friend. Everything that matters (codes, rewards, limits) is decided by the payments server (worker-payments.js).
// This file only: remembers an invite link someone opened, tells the server once they have an account, and shows the invite card.
(function () {
  const KEY = "yanju.ref", CODE = /^[A-HJKMNP-Z2-9]{8}$/;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const get = k => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };

  // 1. Someone opened a link like https://yanju.app/?ref=ABCD2345. Remember the code, then tidy the address bar.
  try {
    const q = new URLSearchParams(location.search), c = (q.get("ref") || "").toUpperCase();
    if (CODE.test(c) && !get(KEY)) put(KEY, c);
    if (q.has("ref")) { q.delete("ref"); const s = q.toString(); history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash); }
  } catch (e) { /* ignore */ }

  // 2. Once they are signed in with a confirmed email, tell the server once.
  let claiming = false;
  async function tryClaim() {
    if (claiming || !window.Plans || !Plans.signedIn()) return;
    const u = window.Auth.user(), done = "yanju.ref.done." + u.id;
    if (get(done)) return;
    const meta = (u.user_metadata && u.user_metadata.ref) || "";
    const code = get(KEY) || (CODE.test(String(meta).toUpperCase()) ? String(meta).toUpperCase() : "");
    if (!code || !(u.email_confirmed_at || u.confirmed_at)) return;
    claiming = true;
    const r = await Plans.api("/api/ref/claim", { method: "POST", body: JSON.stringify({ code }) });
    claiming = false;
    const retry = r.status === 0 || r.status === 403 || r.status >= 500;   // no internet, email not confirmed yet, or server trouble: try again later
    if (!retry) { put(done, "1"); try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  }
  let tries = 0; const poll = setInterval(() => { tryClaim(); if (++tries > 30) clearInterval(poll); }, 1000);
  addEventListener("yanju:synced", tryClaim);

  // 3. The invite card on the Plans page.
  let stats = null, lastBonusRefresh = -1, note = "", noteBad = false;
  const num = n => Number(n) || 0;
  function card() {
    const box = $("ref-card"); if (!box) return;
    if (!Plans.signedIn()) { box.innerHTML = `<div class="card"><b>Invite friends</b><p class="note" style="margin:0">Sign in to get your invite link. Earn points when friends join and pay, then spend them on a plan, a free slot or a report.</p></div>`; return; }
    if (!stats) { box.innerHTML = `<div class="card"><b>Invite friends</b><p class="note" style="margin:0">Loading your invite link…</p></div>`; return; }
    if (stats.error) { box.innerHTML = `<div class="card"><b>Invite friends</b><p class="note" style="margin:0">${esc(stats.message || "Couldn’t load your invite link. Try again later.")}</p></div>`; return; }
    const msg = `I use Yanju to get a heads-up before a subscription charges me. Join with my link and start with a longer free trial: ${stats.link}`;
    const P = stats.points, earn = stats.earn || {};
    const cost = P && P.costs ? P.costs : {};
    const can = n => P && P.balance >= n;
    const planNow = window.Plans && Plans.isPremium && Plans.isPremium();
    const slotsLeft = num(stats.max_bonus_slots) - num(stats.bonus_slots);
    const btn = (item, label, n, extraOff, why) => `<button class="btn ghost" type="button" data-redeem="${item}" data-cost="${n}" data-label="${esc(label)}" ${can(n) && !extraOff ? "" : "disabled"}>${esc(label)} · ${n} points</button>${extraOff && why ? `<span class="note" style="margin:0">${esc(why)}</span>` : ""}`;
    const pointsBlock = P ? `
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><span style="font-size:34px;font-weight:800;line-height:1">${num(P.balance)}</span><span>points</span>${num(P.pending) ? `<span class="note" style="margin:0">+${num(P.pending)} arriving in up to ${num(P.hold_days)} days</span>` : ""}</div>
      <p class="note" style="margin:0"><b>Spend your points</b></p>
      <div style="display:grid;gap:8px">
        ${btn("report", "1 report download", num(cost.report))}
        ${btn("month", "1 month of Premium", num(cost.month))}
        ${btn("slot", "+1 free subscription slot", num(cost.slot), planNow || slotsLeft <= 0, planNow ? "Paid plans already have no limit." : "You have all " + num(stats.max_bonus_slots) + " extra slots.")}
      </div>
      <p class="note${noteBad ? " bad" : ""}" style="margin:0" id="ref-redeem-msg" role="status">${esc(note)}</p>` : `<p class="note" style="margin:0">Your points will show here once they are switched on.</p>`;
    box.innerHTML = `<div class="card">
      <b>Invite friends, earn points</b>
      ${pointsBlock}
      <ul style="margin:0;padding-left:18px;display:grid;gap:4px">
        <li>A friend joins and saves a subscription: <b>+${num(earn.saved)} points</b>.</li>
        <li>A friend pays for a plan: <b>+${num(earn.paid)} points</b>, added after ${num(P && P.hold_days)} days.</li>
        <li>Your friend gets a <b>14-day free trial</b> instead of 7.</li>
      </ul>
      <label>Your invite link<input type="text" id="ref-link" readonly value="${esc(stats.link)}"></label>
      <div><button class="btn" id="ref-copy" type="button">Copy link</button> <a class="btn ghost" id="ref-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">Share on WhatsApp</a></div>
      <p class="note" style="margin:0" id="ref-msg" role="status"></p>
      <p class="note" style="margin:0">Friends joined: <b>${num(stats.joined)}</b> · Saved a subscription: <b>${num(stats.qualified)}</b> · Paid: <b>${num(stats.paid)}</b>${P ? ` · Earned this month: <b>${num(P.earned_this_month)} of ${num(P.month_cap)}</b>` : ""}</p>
      <p class="note" style="margin:0">Points last ${P ? Math.round(num(P.expire_days) / 30) : 12} months. You only see counts, never your friends’ names or emails. Points are for real new accounts only.</p>
    </div>`;
  }
  async function mount() {
    card();
    if (!window.Plans || !Plans.signedIn()) return;
    const r = await Plans.api("/api/ref/me");
    stats = r.ok ? r.data : { error: true, message: r.data && r.data.message };
    card();
    // The server writes bonus slots into the account. Fetch the fresh account once so the new limit applies straight away.
    if (r.ok && r.data.bonus_slots !== lastBonusRefresh && r.data.bonus_slots !== Plans.bonusSlots()) { lastBonusRefresh = r.data.bonus_slots; Plans.refresh(); }
  }
  let redeeming = false;
  document.addEventListener("click", async e => {
    const rb = e.target && e.target.closest && e.target.closest("[data-redeem]");
    if (rb && !rb.disabled) {
      if (redeeming) return;
      if (!confirm(`Spend ${rb.dataset.cost} points on: ${rb.dataset.label}?`)) return;
      redeeming = true; const m = $("ref-redeem-msg"); if (m) m.textContent = "Working…";
      const r = await Plans.api("/api/points/redeem", { method: "POST", body: JSON.stringify({ item: rb.dataset.redeem }) });
      redeeming = false;
      if (!r.ok) { note = r.data.message || "Couldn’t redeem. Try again."; noteBad = true; card(); return; }
      note = "Done. " + rb.dataset.label + " added."; noteBad = false;
      await Plans.refresh();                       // new plan, slot or report credit shows straight away
      await mount();
      return;
    }
    if (e.target && e.target.id === "ref-copy") {
      const m = $("ref-msg"), link = stats && stats.link; if (!link) return;
      try { await navigator.clipboard.writeText(link); m.textContent = "Link copied."; }
      catch (err) { const i = $("ref-link"); if (i) { i.select(); m.textContent = "Press and hold the link, then tap Copy."; } }
    }
  });
  window.Referral = { mount, tryClaim };
})();
