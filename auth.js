// Sign-in for Yanju (Google or email) using Supabase.
// The app still works without signing in. Nothing here changes how subscriptions are saved yet.
(function () {
  const cfg = window.APP_CONFIG || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let sb = null, session = null, mode = "in", view = "form", recovery = false, busy = false;

  const G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

  // Where Google and email links send the person back to.
  const back = () => location.origin + location.pathname + "#account";

  function client() {
    if (sb) return sb;
    if (!(window.supabase && cfg.supabaseUrl && cfg.supabaseKey)) return null;
    try {
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } });
    } catch (e) { sb = null; }
    return sb;
  }

  // Turns Supabase's technical errors into plain sentences.
  function nice(err) {
    const m = String((err && (err.message || err.error_description)) || err || "").toLowerCase();
    if (m.includes("invalid login")) return "That email and password don’t match. Check them and try again.";
    if (m.includes("not confirmed")) return "Please confirm your email first. Open the message we sent you and tap the link.";
    if (m.includes("already registered") || m.includes("already been registered")) return "That email already has an account. Try signing in instead.";
    if (m.includes("rate limit") || m.includes("too many") || (m.includes("after") && m.includes("seconds"))) return "Too many attempts. Please wait a few minutes, or continue with Google.";
    if (m.includes("password") && (m.includes("least") || m.includes("short") || m.includes("weak"))) return "Choose a stronger password (at least 8 characters).";
    if (m.includes("valid email") || m.includes("invalid email")) return "That email address doesn’t look right.";
    if (m.includes("provider") && m.includes("not enabled")) return "Google sign-in isn’t switched on yet. Use email for now.";
    if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed")) return "Couldn’t reach sign-in. Check your internet and try again.";
    return "Something went wrong. Please try again.";
  }

  function msg(text, kind) { const el = $("a-msg"); if (!el) return; el.textContent = text || ""; el.className = "amsg" + (kind ? " " + kind : ""); }
  function setBusy(b) { busy = b; document.querySelectorAll("#account button").forEach(x => { x.disabled = b; }); }

  function user() { return session && session.user ? session.user : null; }
  function nameOf(u) { const md = (u && u.user_metadata) || {}; const both = [md.first_name || md.given_name, md.last_name || md.family_name].filter(Boolean).join(" "); return md.full_name || md.name || both || ""; }
  function firstName(u) { const md = (u && u.user_metadata) || {}; return String(md.first_name || md.given_name || nameOf(u).split(" ")[0] || "").trim(); }
  function initial(u) { const s = firstName(u) || (u && u.email) || "?"; return s.trim().charAt(0).toUpperCase(); }
  // The greeting at the top of the dashboard.
  function greet() {
    const el = $("welcome"); if (!el) return; const u = user();
    el.textContent = u ? (firstName(u) ? "Welcome, " + firstName(u) : "Welcome") : ""; el.classList.toggle("hide", !u);
  }
  // A password box with a Show / Hide button.
  const pwBox = (id, auto, ph) => `<span class="pw"><input type="password" id="${id}" autocomplete="${auto}"${ph ? ` placeholder="${ph}"` : ""}><button type="button" class="eye" aria-label="Show password" aria-pressed="false">Show</button></span>`;

  function renderNav() {
    const b = $("acctbtn"); if (!b) return; const u = user();
    b.textContent = u ? initial(u) : "Sign in"; b.className = "acct-chip" + (u ? " in" : ""); b.setAttribute("aria-label", u ? "Your account" : "Sign in");
    const su = $("signupbtn"); if (su) su.classList.toggle("hide", !!u);
    greet();
  }

  // Makes sure the Account page is the one on screen when the address says #account (and hidden otherwise).
  function place() {
    const box = $("account"); if (!box) return;
    if ((location.hash || "").split("/")[0] === "#account") {
      document.querySelectorAll("main").forEach(m => m.classList.toggle("hide", m !== box));
      const b = $("navbtn"); if (b) { b.textContent = "Home"; b.href = "#home"; }
    } else box.classList.add("hide");
  }

  function render() {
    const box = $("account"); if (!box) return;
    const u = user();
    if (box.classList.contains("hide")) return;
    if (!client()) {
      box.innerHTML = '<h1 style="font-size:34px">Account</h1><div class="card"><b>Sign-in isn’t available right now.</b><p class="note" style="margin:0">It needs an internet connection. Your subscriptions still work on this device.</p><button class="btn" id="a-retry">Try again</button></div><p><a class="btn ghost" href="#dashboard">Back to dashboard</a></p>';
      $("a-retry").onclick = () => { render(); };
      return;
    }
    if (recovery) {
      box.innerHTML = `<h1 style="font-size:34px">New password</h1><div class="card"><label>Choose a new password${pwBox("a-pw", "new-password")}</label><button class="btn" id="a-setpw">Save password</button><p class="amsg" id="a-msg" role="status"></p></div>`;
      $("a-setpw").onclick = setPassword; return;
    }
    if (u) {
      const prov = (u.app_metadata && u.app_metadata.provider) === "google" ? "Google" : "email";
      box.innerHTML = `<h1 style="font-size:34px">Account</h1><div class="card"><div class="avatar" aria-hidden="true">${esc(initial(u))}</div><b>Welcome${firstName(u) ? ", " + esc(firstName(u)) : ""}</b>${nameOf(u) ? `<span>${esc(nameOf(u))}</span>` : ""}<span>${esc(u.email || "")}</span><span class="note" style="margin:0">Signed in with ${prov}</span></div>
        <div class="card"><b>Your subscriptions</b><p class="note" style="margin:0" id="sync-status" role="status">${esc(window.Sync ? window.Sync.statusText() : "")}</p><p class="note" style="margin:0">They are saved to your account, so they follow you to any phone where you sign in.</p>
        <p style="margin:0"><button class="btn ghost" id="a-dl">Download my data</button> ${window.Sync && window.Sync.paused() ? '<button class="btn" id="a-resume">Turn saving back on</button>' : '<button class="btn ghost" id="a-del">Delete my saved data</button>'}</p></div>
        <p><button class="btn ghost" id="a-out">Sign out</button> <a class="btn ghost" href="#dashboard">Back to dashboard</a></p><p class="amsg" id="a-msg" role="status"></p>`;
      $("a-out").onclick = signOut;
      const dl = $("a-dl"); if (dl) dl.onclick = downloadData;
      const del = $("a-del"); if (del) del.onclick = deleteSaved;
      const res = $("a-resume"); if (res) res.onclick = () => { window.Sync.resume(); render(); };
      return;
    }
    if (view === "sent") {
      box.innerHTML = '<h1 style="font-size:34px">Check your email</h1><div class="card"><b>We sent you a link.</b><p class="note" style="margin:0">Open the email and tap the link. Then come back here and sign in. If you don’t see it, look in spam.</p><button class="btn" id="a-back">Go to sign in</button></div>';
      $("a-back").onclick = () => { view = "form"; mode = "in"; render(); }; return;
    }
    const up = mode === "up";
    box.innerHTML = `<h1 style="font-size:34px">${up ? "Create your account" : "Sign in"}</h1>
      <p class="lead" style="font-size:16px">${up ? "Save your subscriptions to your own account." : "Welcome back."}</p>
      <div class="card">
        <div class="tabs" role="tablist"><button type="button" id="t-in" class="${up ? "" : "on"}" role="tab">Sign in</button><button type="button" id="t-up" class="${up ? "on" : ""}" role="tab">Create account</button></div>
        <button type="button" class="gbtn" id="a-google">${G}<span>Continue with Google</span></button>
        <div class="or">or use email</div>
        ${up ? '<div class="name-row"><label>First name<input type="text" id="a-first" autocomplete="given-name" required></label><label>Last name<input type="text" id="a-last" autocomplete="family-name" required></label></div>' : ""}
        <label>Email<input type="email" id="a-email" autocomplete="email" inputmode="email" placeholder="you@example.com"></label>
        <label>Password${pwBox("a-pw", up ? "new-password" : "current-password", up ? "At least 8 characters" : "")}</label>
        <button type="button" class="btn" id="a-go">${up ? "Create account" : "Sign in"}</button>
        ${up ? '<p class="note" style="margin:0">By creating an account you agree to our <a href="terms.html">Terms of Service</a> and <a href="privacy.html">Privacy Policy</a>.</p>' : ""}
        ${up ? "" : '<button type="button" class="linkbtn" id="a-forgot">Forgot your password?</button>'}
        <p class="amsg" id="a-msg" role="status"></p>
      </div>
      <p class="note">Signing in is optional. Without it, the app keeps working on this device.</p>
      <p><a class="btn ghost" href="#dashboard">Back to dashboard</a></p>`;
    $("t-in").onclick = () => { mode = "in"; render(); }; $("t-up").onclick = () => { mode = "up"; render(); };
    $("a-google").onclick = google; $("a-go").onclick = up ? signUp : signIn;
    const f = $("a-forgot"); if (f) f.onclick = forgot;
    ["a-email", "a-pw", "a-first", "a-last"].forEach(id => { const el = $(id); if (el) el.addEventListener("keydown", e => { if (e.key === "Enter") (up ? signUp : signIn)(); }); });
  }

  const val = id => { const el = $(id); return el ? el.value.trim() : ""; };

  async function google() {
    const c = client(); if (!c || busy) return; setBusy(true); msg("Opening Google…");
    try { const { error } = await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back() } }); if (error) throw error; setTimeout(() => { setBusy(false); msg(""); }, 3000); }   // the page leaves for Google; this only matters if the person comes back
    catch (e) { setBusy(false); msg(nice(e), "err"); }
  }
  async function signIn() {
    const c = client(); if (!c || busy) return; const email = val("a-email"), pw = $("a-pw") ? $("a-pw").value : "";
    if (!email || !pw) return msg("Enter your email and password.", "err");
    setBusy(true); msg("Signing in…");
    try { const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; setBusy(false); msg(""); }
    catch (e) {
      let text = nice(e);
      if (/invalid login/i.test(String((e && e.message) || ""))) text = await whyFailed(c, email, text);
      setBusy(false); msg(text, "err");
    }
  }
  // Supabase only says "invalid login" for both a wrong password and a missing account. This asks the database which one it is.
  async function whyFailed(c, email, fallback) {
    try {
      const { data, error } = await c.rpc("account_status", { check_email: email });
      if (error) return fallback;
      const p = String(data || "");
      if (!p) return "Account not found. Tap “Create account” above to sign up.";
      if (p.includes("email")) return "That password isn’t right. Try again, or tap “Forgot your password?”.";
      return "This email is linked to Google. Tap “Continue with Google”.";
    } catch (e) { return fallback; }
  }
  async function signUp() {
    const c = client(); if (!c || busy) return; const email = val("a-email"), pw = $("a-pw") ? $("a-pw").value : "", first = val("a-first"), last = val("a-last");
    if (!first) return msg("Please enter your first name.", "err");
    if (!last) return msg("Please enter your last name.", "err");
    if (!email || !pw) return msg("Enter your email and a password.", "err");
    if (pw.length < 8) return msg("Your password needs at least 8 characters.", "err");
    setBusy(true); msg("Creating your account…");
    try {
      const { data, error } = await c.auth.signUp({ email, password: pw, options: { emailRedirectTo: back(), data: { first_name: first, last_name: last, full_name: first + " " + last } } });
      if (error) throw error;
      setBusy(false);
      if (data && data.user && data.user.identities && data.user.identities.length === 0) return msg("That email already has an account. Try signing in instead.", "err");
      if (data && data.session) { msg(""); return; }      // email confirmation is switched off: already signed in
      view = "sent"; render();
    } catch (e) { setBusy(false); msg(nice(e), "err"); }
  }
  async function forgot() {
    const c = client(); if (!c || busy) return; const email = val("a-email");
    if (!email) return msg("Type your email above first, then tap “Forgot your password?”.", "err");
    setBusy(true); msg("Sending…");
    try { const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: back() }); if (error) throw error; setBusy(false); msg("If that email has an account, we sent a link to reset the password.", "ok"); }
    catch (e) { setBusy(false); msg(nice(e), "err"); }
  }
  async function setPassword() {
    const c = client(); if (!c || busy) return; const pw = $("a-pw") ? $("a-pw").value : "";
    if (pw.length < 8) return msg("Your password needs at least 8 characters.", "err");
    setBusy(true); msg("Saving…");
    try { const { error } = await c.auth.updateUser({ password: pw }); if (error) throw error; recovery = false; setBusy(false); render(); msg("Password saved. You’re signed in.", "ok"); }
    catch (e) { setBusy(false); msg(nice(e), "err"); }
  }
  // Download everything in a file, or remove the copy kept in the account.
  function downloadData() {
    if (!window.Sync) return;
    const url = URL.createObjectURL(new Blob([window.Sync.exportData()], { type: "application/json" }));
    const l = document.createElement("a"); l.href = url; l.download = "yanju-my-data.json"; document.body.appendChild(l); l.click(); l.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    msg("Downloaded. The file has your subscriptions and history.", "ok");
  }
  async function deleteSaved() {
    if (!window.Sync || !confirm("Delete the copy of your subscriptions saved in your account? The subscriptions on this phone stay, but they will no longer be saved to your account until you turn saving back on.")) return;
    setBusy(true); const r = await window.Sync.deleteCloud(); setBusy(false);
    if (r.ok) { render(); msg("Your saved copy was deleted from your account.", "ok"); } else msg("We couldn’t delete it just now. Check your internet and try again.", "err");
  }
  addEventListener("yanju:syncstate", () => { const el = $("sync-status"); if (el && window.Sync) el.textContent = window.Sync.statusText(); });

  async function signOut() {
    const c = client(); if (!c || busy) return;
    setBusy(true);
    if (window.Sync && window.Sync.beforeSignOut && !(await window.Sync.beforeSignOut())) { setBusy(false); return; }   // unsaved changes: the person chose to stay
    try { await c.auth.signOut(); } catch (e) { /* the local session is cleared either way */ }
    if (window.Sync && window.Sync.afterSignOut) window.Sync.afterSignOut();   // nothing of this person stays on the phone
    session = null; setBusy(false); view = "form"; mode = "in"; renderNav(); render();
  }

  function init() {
    renderNav();
    const box = $("account");
    if (box) box.addEventListener("click", e => {
      const b = e.target.closest && e.target.closest(".eye"); if (!b) return;
      const inp = b.parentNode.querySelector("input"); if (!inp) return;
      const show = inp.type === "password"; inp.type = show ? "text" : "password";
      b.textContent = show ? "Hide" : "Show"; b.setAttribute("aria-label", show ? "Hide password" : "Show password"); b.setAttribute("aria-pressed", String(show));
    });
    if (location.hash === "#account/signup") { mode = "up"; view = "form"; }
    const at = $("acctbtn"), su = $("signupbtn");
    if (at) at.addEventListener("click", () => { if (!user()) { mode = "in"; view = "form"; recovery = false; } render(); });
    if (su) su.addEventListener("click", () => { mode = "up"; view = "form"; recovery = false; render(); });
    place();
    addEventListener("hashchange", () => { if (location.hash === "#account/signup") { mode = "up"; view = "form"; } place(); render(); });
    addEventListener("pageshow", e => { if (e.persisted) { setBusy(false); msg(""); } });   // coming back from Google with the Back button
    const c = client(); if (!c) { place(); render(); return; }
    c.auth.onAuthStateChange((event, s) => {
      session = s || null;
      if (window.Sync && window.Sync.session) window.Sync.session(session);
      if (event === "PASSWORD_RECOVERY") { recovery = true; if (location.hash !== "#account") location.hash = "#account"; }
      renderNav(); setTimeout(() => { place(); render(); }, 0);
    });
    c.auth.getSession().then(r => { session = (r && r.data && r.data.session) || null; if (window.Sync && window.Sync.session) window.Sync.session(session); renderNav(); place(); render(); }).catch(() => { render(); });
  }

  window.Auth = { user, signOut, client };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
