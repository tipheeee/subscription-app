// Yanju payments server (Cloudflare Worker). Paste this whole file into a new Worker, then follow SETUP-PAYMENTS.md.
//
// What it does
//   GET  /api/pay/prices    the price list (the app shows these)
//   POST /api/pay/start     starts a Paystack payment for the signed-in person and returns the Paystack page to open
//   POST /api/pay/webhook   Paystack tells us a payment worked (signature checked). THIS is what switches the plan on.
//   GET  /api/pay/verify    when the person comes back from Paystack, double-checks the payment and switches the plan on
//   POST /api/trial/start   gives the free trial once per account
//   POST /api/report/use    spends one report credit (Business has unlimited)
//
// Safety rules this file follows
//   - Prices live ONLY here. The app can ask for a plan, never for an amount.
//   - A plan is switched on only after Paystack itself confirms the payment, the amount, and the currency.
//   - Each payment can switch a plan on only once (the table "payments" remembers every reference).
//   - The plan is stored in the person's Supabase app_metadata, which a person cannot edit from their own browser.
//
// Settings needed (Cloudflare > your Worker > Settings > Variables and Secrets):
//   PAYSTACK_SECRET_KEY   (Secret)  from Paystack: Settings > API Keys. Starts with sk_test_ or sk_live_
//   SUPABASE_SERVICE_KEY  (Secret)  from Supabase: Project Settings > API > service_role. NEVER put this in the app.
//   SUPABASE_URL          (Text)    your project address, e.g. https://xxxx.supabase.co
//   SUPABASE_ANON_KEY     (Text)    the public anon key (same one as in config.js)
//   SITE_URL              (Text)    your app address with no slash at the end, e.g. https://yanju.example.workers.dev

const VERSION = "2026-11-24-points";   // shown on /api/pay/status so you can tell which copy of this file is running

// ---- Prices (naira). Change them here. The app reads them from /api/pay/prices. ----
const PRICES = {
  premium: { 1: 1000, 3: 2700, 12: 9600 },
  business: { 1: 3000, 3: 8100, 12: 28800 }
};
const PACK = { amount: 1500, credits: 3 };
const TRIAL_DAYS = 7;
const DAY = 86400000;

// ---- Invite and points rules. Change the numbers here. ----
const REF = {
  MAX_BONUS_SLOTS: 3,            // a person can have at most this many extra free subscription slots
  TRIAL_DAYS_REFERRED: 14,       // a referred friend gets a longer free trial
  CLAIM_WINDOW_DAYS: 14          // an invite only counts for an account made in the last 14 days
};
const PTS = {
  SAVED: 10,                     // a friend joined, confirmed their email and saved a subscription
  PAID: 100,                     // a friend paid for a plan (points arrive after HOLD_DAYS, in case of a refund)
  HOLD_DAYS: 7,
  EXPIRE_DAYS: 365,              // points expire this long after they arrive
  EARN_CAP_PER_MONTH: 400,       // most points one person can earn from invites in a calendar month
  COST: { report: 100, slot: 150, month: 250 }   // what each reward costs: 1 report download, +1 free slot, 1 month of Premium
};

// People often paste a setting with a space, a quote, or a slash at the end. Tidy them so that does not break anything.
function clean(env) {
  const t = v => String(v == null ? "" : v).trim().replace(/^["']+|["']+$/g, "").trim();
  const e = Object.assign({}, env);
  for (const k of ["PAYSTACK_SECRET_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_ANON_KEY", "LOGO_DEV_SECRET_KEY", "LOGO_DEV_PUBLISHABLE_KEY"]) e[k] = t(env[k]);
  e.SUPABASE_URL = t(env.SUPABASE_URL).replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, "");
  e.SITE_URL = t(env.SITE_URL).replace(/\/+$/, "");
  return e;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (obj, status, headers) => new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ "content-type": "application/json" }, headers || {}) });
const fail = (code, status, text) => Object.assign(new Error(text || code), { code, status: status || 400 });

function cors(req, env) {
  const site = String(env.SITE_URL || "").replace(/\/$/, "");
  const origin = req.headers.get("origin") || "";
  const ok = origin && (origin === site || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return ok ? { "access-control-allow-origin": origin, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS", vary: "Origin" } : { vary: "Origin" };
}

// ---- Who is asking? Checks the sign-in token with Supabase. ----
async function whoAmI(req, env) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  if (!m) throw fail("not_signed_in", 401, "Sign in first.");
  let r;
  try { r = await fetch(env.SUPABASE_URL + "/auth/v1/user", { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: "Bearer " + m[1] } }); }
  catch (e) { throw fail("bad_server_settings", 503, "The payments server can't reach Supabase. Check its SUPABASE_URL setting."); }
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    if (/api\s*key|apikey/i.test(t)) throw fail("bad_server_settings", 503, "The payments server's SUPABASE_ANON_KEY setting is wrong. Check it in Cloudflare.");
    console.log("sign_in_check_failed", r.status, t.slice(0, 120));
    throw fail("not_signed_in", 401, "Sign in again.");
  }
  const u = await r.json();
  if (!u || !UUID.test(u.id || "")) throw fail("not_signed_in", 401, "Sign in again.");
  return u;
}

// ---- What plan does this person have right now? ----
function planNow(meta, now) {
  meta = meta || {};
  const until = meta.plan_until ? Date.parse(meta.plan_until) : NaN;
  const active = (meta.plan === "premium" || meta.plan === "business") && (!meta.plan_until || until > now);
  return { plan: active ? meta.plan : "free", until: active && meta.plan_until ? meta.plan_until : null, credits: Math.max(0, Number(meta.report_credits) || 0) };
}

const expectedNaira = (kind, plan, months) => kind === "pack" ? PACK.amount : (PRICES[plan] && PRICES[plan][months]) || 0;

// ---- Supabase (service role) helpers ----
const sbHeaders = env => ({ apikey: env.SUPABASE_SERVICE_KEY, authorization: "Bearer " + env.SUPABASE_SERVICE_KEY, "content-type": "application/json" });
async function adminGetUser(env, id) {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${id}`, { headers: sbHeaders(env) });
  if (!r.ok) throw fail("user_lookup_failed", 502);
  return r.json();
}
async function adminSetMeta(env, id, appMeta) {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "PUT", headers: sbHeaders(env), body: JSON.stringify({ app_metadata: appMeta }) });
  if (!r.ok) throw fail("user_update_failed", 502);
}
const rest = (env, path, init) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, Object.assign({}, init, { headers: Object.assign(sbHeaders(env), (init && init.headers) || {}) }));

// ---- Paystack ----
async function paystack(env, path, init) {
  const r = await fetch("https://api.paystack.co" + path, Object.assign({}, init, { headers: Object.assign({ authorization: "Bearer " + env.PAYSTACK_SECRET_KEY, "content-type": "application/json" }, (init && init.headers) || {}) }));
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || d.status !== true) throw fail("paystack_error", 502, (d && d.message) || "Paystack error");
  return d.data;
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---- Start a payment ----
async function start(req, env) {
  const user = await whoAmI(req, env);
  if (!user.email) throw fail("no_email", 400, "Your account needs an email address.");
  const b = await req.json().catch(() => ({}));
  const kind = b.kind === "pack" ? "pack" : "plan";
  const plan = kind === "plan" ? String(b.plan) : "";
  const months = kind === "plan" ? Number(b.months) : 0;
  const naira = expectedNaira(kind, plan, months);
  if (!naira) throw fail("bad_choice", 400, "That plan isn't available.");
  const now = planNow(user.app_metadata, Date.now());
  if (kind === "plan" && plan === "premium" && now.plan === "business") throw fail("already_business", 409, "You are on Business, which already includes everything in Premium.");
  const reference = "yj_" + crypto.randomUUID().replace(/-/g, "");
  const site = String(env.SITE_URL || "").replace(/\/$/, "");
  const tx = await paystack(env, "/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({ email: user.email, amount: naira * 100, currency: "NGN", reference, callback_url: site + "/?pay=done", metadata: { user_id: user.id, kind, plan, months } })
  });
  return { url: tx.authorization_url, reference };
}

// ---- Switch the plan on (safe to run more than once for the same payment) ----
async function fulfil(env, reference) {
  if (!/^yj_[a-z0-9]{10,64}$/i.test(reference || "")) throw fail("bad_reference", 400);
  const tx = await paystack(env, "/transaction/verify/" + encodeURIComponent(reference));
  if (tx.status !== "success") return { state: "not_paid" };
  const md = tx.metadata || {};
  const kind = md.kind === "pack" ? "pack" : "plan", plan = String(md.plan || ""), months = Number(md.months) || 0;
  const naira = expectedNaira(kind, plan, months);
  if (!naira || tx.currency !== "NGN" || tx.amount !== naira * 100 || !UUID.test(md.user_id || "")) { console.log("payment_mismatch", reference); return { state: "rejected" }; }

  // Remember this payment. If it is already there, someone else (webhook or return page) is handling it or already did.
  const ins = await rest(env, "payments", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ reference, user_id: md.user_id, kind, plan: plan || null, months: months || null, amount_kobo: tx.amount, status: "new" }) });
  if (!ins.ok && ins.status !== 409) throw fail("db_error", 502);

  // Claim it. Only one caller gets the claim (a stuck claim older than 2 minutes can be taken again).
  const stale = new Date(Date.now() - 120000).toISOString(), nowIso = new Date().toISOString();
  const claim = await rest(env, `payments?reference=eq.${encodeURIComponent(reference)}&or=(status.eq.new,and(status.eq.applying,claimed_at.lt.${stale}))`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ status: "applying", claimed_at: nowIso }) });
  if (!claim.ok) throw fail("db_error", 502);
  const claimed = await claim.json();
  const info = { userId: md.user_id, kind, plan, months, naira };
  if (!claimed.length) return Object.assign({ state: "done" }, info);   // already applied, or being applied right now

  const u = await adminGetUser(env, md.user_id);
  const meta = Object.assign({}, u.app_metadata || {}), now = Date.now(), cur = planNow(meta, now);
  if (kind === "pack") meta.report_credits = cur.credits + PACK.credits;
  else {
    // Same plan: add time on top of what is left. A different plan starts today.
    const base = cur.plan === plan && cur.until ? Math.max(now, Date.parse(cur.until)) : now;
    const end = new Date(base); end.setUTCMonth(end.getUTCMonth() + months);
    meta.plan = plan; meta.plan_until = end.toISOString();
  }
  await adminSetMeta(env, md.user_id, meta);
  if (kind === "plan") { try { await rewardReferrer(env, md.user_id); } catch (e) { console.log("referral_reward_error", (e && (e.code || e.message)) || "unknown"); } }   // never let this break a payment
  const fin = await rest(env, `payments?reference=eq.${encodeURIComponent(reference)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "done" }) });
  if (!fin.ok) console.log("could_not_mark_done", reference);
  return Object.assign({ state: "done" }, info);
}

async function webhook(req, env) {
  const raw = await req.text();
  const given = req.headers.get("x-paystack-signature") || "";
  const want = await hmacHex(env.PAYSTACK_SECRET_KEY, raw);
  if (!given || !sameText(given.toLowerCase(), want)) return new Response("bad signature", { status: 401 });
  let ev; try { ev = JSON.parse(raw); } catch (e) { return new Response("ok", { status: 200 }); }
  if (ev && ev.event === "charge.success" && ev.data && ev.data.reference) {
    try { await fulfil(env, ev.data.reference); }
    catch (e) { console.log("webhook_error", e.code || e.message); return new Response("retry", { status: 500 }); }   // Paystack tries again later
  }
  return new Response("ok", { status: 200 });
}

// ---- The person comes back from Paystack ----
async function verify(req, env) {
  const user = await whoAmI(req, env);
  const ref = new URL(req.url).searchParams.get("reference") || "";
  const r = await fulfil(env, ref);
  if (r.userId && r.userId !== user.id) throw fail("not_yours", 403, "That payment belongs to another account.");
  const fresh = await adminGetUser(env, user.id), p = planNow(fresh.app_metadata, Date.now());
  return { state: r.state, kind: r.kind, months: r.months, amount: r.naira, plan: p.plan, plan_until: p.until, report_credits: p.credits };
}

// ---- The person's latest plan payment (so the app can add "Yanju Premium" to their list, even for older payments) ----
async function lastPayment(req, env) {
  const user = await whoAmI(req, env), now = planNow(user.app_metadata, Date.now());
  const rows = await sbGet(env, `payments?user_id=eq.${user.id}&kind=eq.plan&status=eq.done&order=created_at.desc&limit=1&select=plan,months,amount_kobo`);
  const r = rows[0];
  const onTrial = !r && now.plan !== "free" && !!(user.app_metadata || {}).trial_used;   // a plan with no payment behind it, from the free trial
  return { plan: now.plan, plan_until: now.until, trial: onTrial, last: r ? { plan: r.plan, months: r.months, amount: Math.round(Number(r.amount_kobo) / 100) } : null };
}

// ---- Free trial, once per account ----
async function trial(req, env) {
  const user = await whoAmI(req, env);
  if (!user.email_confirmed_at && !user.confirmed_at) throw fail("confirm_email", 403, "Confirm your email first, then start the trial.");
  const u = await adminGetUser(env, user.id), meta = Object.assign({}, u.app_metadata || {});
  if (meta.trial_used) throw fail("trial_used", 409, "You have already used your free trial.");
  if (planNow(meta, Date.now()).plan !== "free") throw fail("already_paid", 409, "You already have a plan.");
  const days = (await isReferred(env, user.id)) ? REF.TRIAL_DAYS_REFERRED : TRIAL_DAYS;
  meta.trial_used = true; meta.plan = "premium"; meta.plan_until = new Date(Date.now() + days * DAY).toISOString();
  await adminSetMeta(env, user.id, meta);
  return { plan: "premium", plan_until: meta.plan_until };
}

// ---- Spend one report credit ----
async function useReport(req, env) {
  const user = await whoAmI(req, env);
  const u = await adminGetUser(env, user.id), meta = Object.assign({}, u.app_metadata || {}), p = planNow(meta, Date.now());
  if (p.plan === "business") return { unlimited: true };
  if (p.credits < 1) throw fail("no_credits", 402, "You have no report credits left.");
  meta.report_credits = p.credits - 1;
  await adminSetMeta(env, user.id, meta);
  return { report_credits: meta.report_credits };
}

// A health check anyone can open in a browser. It never shows a secret, only whether each setting works.
async function status(env) {
  const out = { version: VERSION, settings: {}, supabase: "unknown", service_key: "unknown", payments_table: "unknown", paystack: "unknown", paystack_mode: "unknown", site_url: env.SITE_URL || "" };
  for (const k of ["PAYSTACK_SECRET_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SITE_URL"]) out.settings[k] = env[k] ? "set" : "MISSING";
  out.paystack_mode = /^sk_test_/.test(env.PAYSTACK_SECRET_KEY) ? "test" : /^sk_live_/.test(env.PAYSTACK_SECRET_KEY) ? "live" : env.PAYSTACK_SECRET_KEY ? "key does not start with sk_test_ or sk_live_" : "unknown";
  const tryFetch = async (url, init) => { try { return await fetch(url, init); } catch (e) { return null; } };
  if (env.SUPABASE_URL) {
    const a = await tryFetch(env.SUPABASE_URL + "/auth/v1/settings", { headers: { apikey: env.SUPABASE_ANON_KEY || "x" } });
    out.supabase = !a ? "SUPABASE_URL is wrong (can't be reached)" : a.ok ? "ok" : "SUPABASE_ANON_KEY is wrong";
    if (env.SUPABASE_SERVICE_KEY && a) {
      const sh = { apikey: env.SUPABASE_SERVICE_KEY, authorization: "Bearer " + env.SUPABASE_SERVICE_KEY };
      const u = await tryFetch(env.SUPABASE_URL + "/auth/v1/admin/users?per_page=1", { headers: sh });
      out.service_key = u && u.ok ? "ok" : "SUPABASE_SERVICE_KEY is wrong (use the service_role key)";
      const t = await tryFetch(env.SUPABASE_URL + "/rest/v1/payments?limit=1", { headers: sh });
      out.payments_table = t && t.ok ? "ok" : "missing: run supabase-payments.sql in Supabase";
      const rt = await tryFetch(env.SUPABASE_URL + "/rest/v1/referrals?limit=1", { headers: sh });
      out.referrals_table = rt && rt.ok ? "ok" : "missing: run supabase-referrals.sql in Supabase";
      const pt = await tryFetch(env.SUPABASE_URL + "/rest/v1/points_ledger?limit=1", { headers: sh });
      out.points_table = pt && pt.ok ? "ok" : "missing: run supabase-points.sql in Supabase";
    }
  }
  if (env.PAYSTACK_SECRET_KEY) {
    const p = await tryFetch("https://api.paystack.co/balance", { headers: { authorization: "Bearer " + env.PAYSTACK_SECRET_KEY } });
    out.paystack = p && p.ok ? "ok" : "PAYSTACK_SECRET_KEY is wrong";
  }
  out.logos = env.LOGO_DEV_SECRET_KEY && env.LOGO_DEV_PUBLISHABLE_KEY ? "set" : "MISSING (logo lookup is off; the rest still works)";
  out.ready = out.supabase === "ok" && out.service_key === "ok" && out.payments_table === "ok" && out.paystack === "ok" && !!env.SITE_URL;
  out.referrals_ready = out.referrals_table === "ok" && out.points_table === "ok";
  return out;
}

// ================= Referrals =================
// Every person gets a private invite code. A friend who joins with it is recorded in the table "referrals".
//   joined     the friend made an account and confirmed their email
//   qualified  the friend also saved a subscription  -> the inviter gets +1 free slot (up to a limit)
//   paid       the friend paid for a plan             -> the inviter gets a free month (up to a monthly limit)
// Everything is checked here on the server, from the real data. The app only shows the result.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), x => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
const validCode = c => typeof c === "string" && c.length === 8 && [...c].every(ch => CODE_ALPHABET.includes(ch));
const confirmed = u => !!(u && (u.email_confirmed_at || u.confirmed_at));
// jo.hn+1@gmail.com and john@gmail.com are the same inbox, so treat them as the same person.
function normEmail(e) {
  const [l, d0] = String(e || "").toLowerCase().split("@"); if (!d0) return "";
  const d = d0 === "googlemail.com" ? "gmail.com" : d0;
  let local = l.split("+")[0]; if (d === "gmail.com") local = local.replace(/\./g, "");
  return local + "@" + d;
}
async function sbGet(env, path) { const r = await rest(env, path, { method: "GET" }); if (!r.ok) throw fail("db_error", 502); return r.json(); }

async function ensureCode(env, userId) {
  const find = async () => (await sbGet(env, `referral_codes?user_id=eq.${userId}&select=code`))[0];
  const have = await find(); if (have) return have.code;
  for (let i = 0; i < 5; i++) {
    const r = await rest(env, "referral_codes", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ code: genCode(), user_id: userId }) });
    if (r.ok) return (await find()).code;
    if (r.status !== 409) throw fail("db_error", 502);
    const again = await find(); if (again) return again.code;   // two requests at once: use the one that won
  }
  throw fail("db_error", 502);
}
async function isReferred(env, userId) { try { return (await sbGet(env, `referrals?referee_id=eq.${userId}&select=referee_id`)).length > 0; } catch (e) { return false; } }

// A friend "qualifies" when their email is confirmed and they really saved at least one subscription of their own.
async function refereeQualifies(env, id) {
  const u = await adminGetUser(env, id); if (!confirmed(u)) return false;
  const d = await sbGet(env, `user_data?user_id=eq.${id}&select=data`);
  const subs = d[0] && d[0].data && d[0].data.subs;
  return Array.isArray(subs) && subs.some(x => x && x.id !== "yanju-self" && String(x.name || "").trim());
}

// ---- Points. Every change is a row in "points_ledger": earning is +, spending is -. Nothing is stored in the browser. ----
const ledger = (env, userId) => sbGet(env, `points_ledger?user_id=eq.${userId}&select=id,delta,created_at,available_at,expires_at&limit=2000`);
function tally(rows, now) {
  let live = 0, expired = 0, spent = 0, pending = 0, earnedThisMonth = 0;
  const ms = new Date(now); ms.setUTCDate(1); ms.setUTCHours(0, 0, 0, 0);
  for (const r of rows) {
    const d = Number(r.delta) || 0;
    if (d < 0) { spent += -d; continue; }
    if (Date.parse(r.created_at) >= ms.getTime()) earnedThisMonth += d;
    if (Date.parse(r.available_at) > now) { pending += d; continue; }
    if (r.expires_at && Date.parse(r.expires_at) <= now) expired += d; else live += d;
  }
  // Spending uses the oldest points first, so spending can "use up" points that have since expired.
  const raw = live - Math.max(0, spent - expired);
  return { raw, balance: Math.max(0, raw), pending, earnedThisMonth };
}
async function pointsInfo(env, userId) {
  const t = tally(await ledger(env, userId), Date.now());
  return { balance: t.balance, pending: t.pending, earned_this_month: t.earnedThisMonth, month_cap: PTS.EARN_CAP_PER_MONTH, costs: PTS.COST, hold_days: PTS.HOLD_DAYS, expire_days: PTS.EXPIRE_DAYS };
}
// Give points once per (person, reason, friend). A repeat is ignored by the database. Stops at the monthly cap.
async function award(env, userId, reason, refId, points, holdDays) {
  const t = tally(await ledger(env, userId), Date.now());
  const pts = Math.min(points, Math.max(0, PTS.EARN_CAP_PER_MONTH - t.earnedThisMonth)); if (pts <= 0) return 0;
  const avail = new Date(Date.now() + holdDays * DAY), exp = new Date(avail.getTime() + PTS.EXPIRE_DAYS * DAY);
  const r = await rest(env, "points_ledger?on_conflict=user_id,reason,ref_id", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ user_id: userId, delta: pts, reason, ref_id: String(refId), available_at: avail.toISOString(), expires_at: exp.toISOString() }) });
  if (!r.ok) throw fail("db_error", 502);
  return (await r.json()).length ? pts : 0;
}

async function refMe(req, env) {
  const user = await whoAmI(req, env), code = await ensureCode(env, user.id);
  const rows = await sbGet(env, `referrals?referrer_id=eq.${user.id}&select=referee_id,status,reward_granted&limit=500`);
  for (const r of rows.filter(x => x.status === "joined").slice(0, 50)) {
    try {
      if (!(await refereeQualifies(env, r.referee_id))) continue;
      const up = await rest(env, `referrals?referee_id=eq.${r.referee_id}&status=eq.joined`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ status: "qualified", qualified_at: new Date().toISOString() }) });
      if (up.ok && (await up.json()).length) { r.status = "qualified"; await award(env, user.id, "friend_saved", r.referee_id, PTS.SAVED, 0); }   // only the call that flips the status pays
    } catch (e) { console.log("qualify_error", (e && (e.code || e.message)) || "unknown"); }
  }
  let points = null; try { points = await pointsInfo(env, user.id); } catch (e) { console.log("points_error", (e && (e.code || e.message)) || "unknown"); }
  const qualified = rows.filter(x => x.status !== "joined").length;
  return { code, link: env.SITE_URL + "/?ref=" + code, joined: rows.length, qualified, paid: rows.filter(x => x.status === "paid").length, bonus_slots: Math.min(REF.MAX_BONUS_SLOTS, Math.max(0, Number((user.app_metadata || {}).bonus_slots) || 0)), max_bonus_slots: REF.MAX_BONUS_SLOTS, earn: { saved: PTS.SAVED, paid: PTS.PAID }, points };
}

// Spend points on a reward. The server checks the balance, writes the spend, then gives the reward. If anything fails, the spend is undone.
async function redeem(req, env) {
  const user = await whoAmI(req, env);
  const b = await req.json().catch(() => ({})), item = String(b.item || ""), cost = PTS.COST[item];
  if (!cost) throw fail("bad_item", 400, "Choose a reward.");
  const meta0 = (await adminGetUser(env, user.id)).app_metadata || {}, cur = planNow(meta0, Date.now());
  if (item === "slot" && cur.plan !== "free") throw fail("not_needed", 409, "Paid plans have no subscription limit, so you don't need an extra slot.");
  if (item === "slot" && (Number(meta0.bonus_slots) || 0) >= REF.MAX_BONUS_SLOTS) throw fail("max_slots", 409, `You already have the most extra slots (${REF.MAX_BONUS_SLOTS}).`);
  if (item === "report" && cur.plan === "business") throw fail("not_needed", 409, "Business already has unlimited reports.");
  if (item === "month" && cur.plan !== "free" && !cur.until) throw fail("not_needed", 409, "Your plan has no end date, so there is nothing to extend.");
  const have = tally(await ledger(env, user.id), Date.now());
  if (have.balance < cost) throw fail("not_enough_points", 402, `You need ${cost} points and you have ${have.balance}.`);
  const ins = await rest(env, "points_ledger", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ user_id: user.id, delta: -cost, reason: "redeem_" + item, ref_id: crypto.randomUUID() }) });
  if (!ins.ok) throw fail("db_error", 502);
  const row = (await ins.json())[0];
  const undo = () => rest(env, `points_ledger?id=eq.${row.id}`, { method: "DELETE", headers: { prefer: "return=minimal" } }).catch(() => {});
  try {
    // Two taps at once could both pass the check above. Count again now that our spend is written.
    // The earlier spend wins; a later one that no longer fits is undone.
    if (tally((await ledger(env, user.id)).filter(r => Number(r.delta) > 0 || Number(r.id) <= Number(row.id)), Date.now()).raw < 0) { await undo(); throw fail("not_enough_points", 402, "You don't have enough points."); }
    const meta = Object.assign({}, (await adminGetUser(env, user.id)).app_metadata || {}), now = Date.now(), c = planNow(meta, now);
    if (item === "report") meta.report_credits = c.credits + 1;
    else if (item === "slot") meta.bonus_slots = (Number(meta.bonus_slots) || 0) + 1;
    else { const base = c.plan !== "free" ? Math.max(now, Date.parse(c.until)) : now, end = new Date(base); end.setUTCMonth(end.getUTCMonth() + 1); meta.plan = c.plan === "free" ? "premium" : c.plan; meta.plan_until = end.toISOString(); }
    await adminSetMeta(env, user.id, meta);
    const p = planNow(meta, now);
    return { ok: true, item, report_credits: p.credits, bonus_slots: Number(meta.bonus_slots) || 0, plan: p.plan, plan_until: p.until, points: await pointsInfo(env, user.id) };
  } catch (e) { if (e.code !== "not_enough_points") await undo(); throw e; }
}

async function refClaim(req, env) {
  const user = await whoAmI(req, env);
  if (!confirmed(user)) throw fail("confirm_email", 403, "Confirm your email first.");
  const b = await req.json().catch(() => ({}));
  const code = String(b.code || (user.user_metadata && user.user_metadata.ref) || "").toUpperCase();
  if (!validCode(code)) throw fail("bad_code", 400, "That invite link isn't valid.");
  if (Date.now() - Date.parse(user.created_at || 0) > REF.CLAIM_WINDOW_DAYS * DAY) throw fail("too_late", 409, "Invite links only work for new accounts.");
  const owner = (await sbGet(env, `referral_codes?code=eq.${code}&select=user_id`))[0];
  if (!owner) throw fail("bad_code", 404, "That invite link isn't valid.");
  if (owner.user_id === user.id) throw fail("own_code", 409, "You can't use your own invite link.");
  const inviter = await adminGetUser(env, owner.user_id);
  if (normEmail(inviter.email) === normEmail(user.email)) throw fail("own_code", 409, "You can't use your own invite link.");
  const ins = await rest(env, "referrals", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ referee_id: user.id, referrer_id: owner.user_id }) });
  if (ins.status === 409) return { ok: true, already: true };
  if (!ins.ok) throw fail("db_error", 502);
  return { ok: true };
}

// The friend paid for a plan: the inviter earns points (once per friend). They arrive after a short hold, in case of a refund.
async function rewardReferrer(env, refereeId) {
  const row = (await sbGet(env, `referrals?referee_id=eq.${refereeId}&paid_at=is.null&select=referrer_id`))[0];
  if (!row) return;
  const claim = await rest(env, `referrals?referee_id=eq.${refereeId}&paid_at=is.null`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString() }) });
  if (!claim.ok) throw fail("db_error", 502);
  if (!(await claim.json()).length) return;   // someone else already handled it
  const got = await award(env, row.referrer_id, "friend_paid", refereeId, PTS.PAID, PTS.HOLD_DAYS);
  if (got) await rest(env, `referrals?referee_id=eq.${refereeId}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ reward_granted: true }) });
}

// ---- Logos (Logo.dev). Both keys stay here; the app only ever talks to this server. Results are cached for days. ----
const DOMAIN = /^(?=.{4,100}$)([a-z0-9-]+\.)+[a-z]{2,24}$/i;
const CACHE_HOST = "https://logo-cache.invalid";
async function logoSearch(req, env, h, url) {
  if (!h["access-control-allow-origin"]) throw fail("forbidden", 403, "Not allowed.");                 // only your own site may search
  const q = (url.searchParams.get("q") || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (q.length < 2) return json({ results: [] }, 200, h);
  if (!env.LOGO_DEV_SECRET_KEY) throw fail("not_configured", 503, "Logo lookup isn't switched on yet.");
  const cache = caches.default, key = new Request(CACHE_HOST + "/s?q=" + encodeURIComponent(q.toLowerCase()));
  const hit = await cache.match(key);
  let data;
  if (hit) data = await hit.json();
  else {
    let r;
    try { r = await fetch("https://api.logo.dev/v2/search?limit=6&q=" + encodeURIComponent(q), { headers: { authorization: "Bearer " + env.LOGO_DEV_SECRET_KEY } }); }
    catch (e) { throw fail("logo_error", 502, "Logo search is unavailable right now."); }
    if (r.status === 429) throw fail("busy", 429, "Too many searches. Try again in a minute.");
    if (!r.ok) { console.log("logo_search_failed", r.status); throw fail("logo_error", 502, "Logo search is unavailable right now."); }
    const body = await r.json().catch(() => null);
    const list = Array.isArray(body) ? body : (body && Array.isArray(body.data) ? body.data : []);
    data = list.map(x => ({ name: String((x && x.name) || "").slice(0, 60), domain: String((x && x.domain) || "").toLowerCase() })).filter(x => x.name && DOMAIN.test(x.domain)).slice(0, 6);
    await cache.put(key, new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "cache-control": "public, max-age=604800" } }));
  }
  return json({ results: data }, 200, h);
}
async function logoImage(env, url) {
  const d = (url.searchParams.get("domain") || "").toLowerCase();
  if (!DOMAIN.test(d)) throw fail("bad_domain", 400, "Not a website address.");
  if (!env.LOGO_DEV_PUBLISHABLE_KEY) throw fail("not_configured", 503, "Logo lookup isn't switched on yet.");
  const cache = caches.default, key = new Request(CACHE_HOST + "/i?d=" + encodeURIComponent(d));
  const hit = await cache.match(key); if (hit) return hit;
  let r;
  try { r = await fetch("https://img.logo.dev/" + encodeURIComponent(d) + "?token=" + encodeURIComponent(env.LOGO_DEV_PUBLISHABLE_KEY) + "&size=128&format=png&fallback=404"); }
  catch (e) { return new Response(null, { status: 502 }); }
  if (!r.ok) return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=86400" } });
  const res = new Response(await r.arrayBuffer(), { status: 200, headers: { "content-type": r.headers.get("content-type") || "image/png", "cache-control": "public, max-age=2592000", "access-control-allow-origin": "*" } });
  await cache.put(key, res.clone());
  return res;
}

async function handle(req, env) {
  env = clean(env);
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, "") || "/", h = cors(req, env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  try {
    if (path === "/api/logo/search" && req.method === "GET") return await logoSearch(req, env, h, url);
    if (path === "/api/logo/img" && req.method === "GET") return await logoImage(env, url);
    if (path === "/api/pay/status" && req.method === "GET") return json(await status(env), 200, h);
    if (!env.PAYSTACK_SECRET_KEY || !env.SUPABASE_SERVICE_KEY || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SITE_URL) throw fail("not_configured", 503, "Payments aren't switched on yet.");
    if (path === "/api/pay/webhook" && req.method === "POST") return webhook(req, env);
    if (path === "/api/pay/prices" && req.method === "GET") return json({ prices: PRICES, pack: PACK, trialDays: TRIAL_DAYS }, 200, h);
    if (path === "/api/pay/start" && req.method === "POST") return json(await start(req, env), 200, h);
    if (path === "/api/pay/verify" && req.method === "GET") return json(await verify(req, env), 200, h);
    if (path === "/api/pay/last" && req.method === "GET") return json(await lastPayment(req, env), 200, h);
    if (path === "/api/trial/start" && req.method === "POST") return json(await trial(req, env), 200, h);
    if (path === "/api/ref/me" && req.method === "GET") return json(await refMe(req, env), 200, h);
    if (path === "/api/ref/claim" && req.method === "POST") return json(await refClaim(req, env), 200, h);
    if (path === "/api/points/redeem" && req.method === "POST") return json(await redeem(req, env), 200, h);
    if (path === "/api/report/use" && req.method === "POST") return json(await useReport(req, env), 200, h);
    return json({ error: "not_found" }, 404, h);
  } catch (e) {
    if (!e.status) console.log("unexpected_error", e && e.message);
    return json({ error: e.code || "error", message: e.status ? e.message : "Something went wrong. Please try again." }, e.status || 500, h);
  }
}

export default { fetch: (req, env) => handle(req, env) };
