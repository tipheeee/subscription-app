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
  let stats = null, lastBonusRefresh = -1;
  const num = n => Number(n) || 0;
  function card() {
    const box = $("ref-card"); if (!box) return;
    if (!Plans.signedIn()) { box.innerHTML = `<div class="card"><b>Invite friends</b><p class="note" style="margin:0">Sign in to get your invite link. For every friend who joins and saves a subscription you get an extra free slot.</p></div>`; return; }
    if (!stats) { box.innerHTML = `<div class="card"><b>Invite friends</b><p class="note" style="margin:0">Loading your invite link…</p></div>`; return; }
    if (stats.error) { box.innerHTML = `<div class="card"><b>Invite friends</b><p class="note" style="margin:0">${esc(stats.message || "Couldn’t load your invite link. Try again later.")}</p></div>`; return; }
    const msg = `I use Yanju to get a heads-up before a subscription charges me. Join with my link and start with a longer free trial: ${stats.link}`;
    box.innerHTML = `<div class="card">
      <b>Invite friends, get rewards</b>
      <ul style="margin:0;padding-left:18px;display:grid;gap:4px">
        <li>A friend joins and saves a subscription: you get <b>+1 free subscription slot</b> (up to +${num(stats.max_bonus_slots)}).</li>
        <li>A friend pays for a plan: you get <b>1 free month</b> of Premium (up to 3 a month).</li>
        <li>Your friend gets a <b>14-day free trial</b> instead of 7.</li>
      </ul>
      <label>Your invite link<input type="text" id="ref-link" readonly value="${esc(stats.link)}"></label>
      <div><button class="btn" id="ref-copy" type="button">Copy link</button> <a class="btn ghost" id="ref-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">Share on WhatsApp</a></div>
      <p class="note" style="margin:0" id="ref-msg" role="status"></p>
      <p class="note" style="margin:0">Friends joined: <b>${num(stats.joined)}</b> · Saved a subscription: <b>${num(stats.qualified)}</b> · Paid: <b>${num(stats.paid)}</b> · Bonus slots: <b>${num(stats.bonus_slots)} of ${num(stats.max_bonus_slots)}</b> · Free months earned: <b>${num(stats.reward_months)}</b></p>
      <p class="note" style="margin:0">You only see counts, never your friends’ names or emails. Rewards are for real new accounts only.</p>
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
  document.addEventListener("click", async e => {
    if (e.target && e.target.id === "ref-copy") {
      const m = $("ref-msg"), link = stats && stats.link; if (!link) return;
      try { await navigator.clipboard.writeText(link); m.textContent = "Link copied."; }
      catch (err) { const i = $("ref-link"); if (i) { i.select(); m.textContent = "Press and hold the link, then tap Copy."; } }
    }
  });
  window.Referral = { mount, tryClaim };
})();
