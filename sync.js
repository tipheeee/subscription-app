// Keeps each signed-in person's subscriptions and history in their own account (Supabase), and merges changes
// made on different phones. The phone always keeps a working copy, so the app still works offline and signed out.
// Each person has ONE row in the table user_data. Security rules in Supabase let a person read and change only their own row.
(function () {
  const META = "sync.meta.v1", TABLE = "user_data", DAYS = 86400000;
  let timer = null, current = null, again = false, phase = "off", lastOk = 0, loopTimer = null;
  const store = () => window.Store;
  const auth = () => window.Auth;
  const user = () => (auth() && auth().user && auth().user()) || null;
  const client = () => (auth() && auth().client && auth().client()) || null;

  const defaults = () => ({ owner: "", deleted: {}, histClearedAt: "", dirty: false, paused: false });
  const meta = () => { try { return Object.assign(defaults(), JSON.parse(localStorage.getItem(META) || "{}")); } catch (e) { return defaults(); } };
  const setMeta = m => { try { localStorage.setItem(META, JSON.stringify(m)); } catch (e) { /* storage full or blocked */ } };

  const empty = () => ({ subs: [], history: [], deleted: {}, histClearedAt: "" });
  const snapshot = () => { const m = meta(); return { subs: store().load(), history: store().history(), deleted: m.deleted, histClearedAt: m.histClearedAt }; };
  const norm = d => { d = d || {}; return { subs: Array.isArray(d.subs) ? d.subs : [], history: Array.isArray(d.history) ? d.history : [], deleted: d.deleted && typeof d.deleted === "object" ? d.deleted : {}, histClearedAt: String(d.histClearedAt || "") }; };
  const canon = d => JSON.stringify({ s: d.subs.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))), h: d.history.map(e => e.id).sort(), d: d.deleted, c: d.histClearedAt });

  // Combines two copies. The newest edit of each subscription wins. Something deleted on either phone stays deleted
  // unless it was edited again afterwards. History is a log, so events are simply added together.
  function merge(a, b) {
    a = norm(a); b = norm(b);
    const del = {};
    [a.deleted, b.deleted].forEach(d => Object.keys(d).forEach(id => { if (!(del[id] >= d[id])) del[id] = d[id]; }));
    const cleared = [a.histClearedAt, b.histClearedAt].sort().pop() || "";
    const byId = new Map();
    b.subs.concat(a.subs).forEach(s => { if (!s || !s.id) return; const cur = byId.get(s.id); if (!cur || (s.u || 0) >= (cur.u || 0)) byId.set(s.id, s); });
    const subs = Array.from(byId.values()).filter(s => !(del[s.id] && del[s.id] >= (s.u || 0)));
    const hm = new Map();
    b.history.concat(a.history).forEach(e => { if (e && e.id && !hm.has(e.id)) hm.set(e.id, e); });
    const history = Array.from(hm.values()).filter(e => !cleared || String(e.at || "") > cleared);
    const cutoff = Date.now() - 120 * DAYS;
    Object.keys(del).forEach(id => { if (del[id] < cutoff) delete del[id]; });
    return { subs, history, deleted: del, histClearedAt: cleared };
  }

  const setPhase = p => { phase = p; try { window.dispatchEvent(new CustomEvent("yanju:syncstate")); } catch (e) { /* ignore */ } };
  const isOffline = e => { const m = String((e && (e.message || e)) || "").toLowerCase(); return (typeof navigator !== "undefined" && navigator.onLine === false) || m.includes("failed to fetch") || m.includes("network") || m.includes("load failed"); };

  // Puts the merged result on this phone. Only tells the app to redraw when something really changed.
  function applyLocal(merged, uid) {
    const m = meta(), before = canon(snapshot());
    m.owner = uid; m.deleted = merged.deleted; m.histClearedAt = merged.histClearedAt; setMeta(m);
    if (canon(merged) !== before) { store()._setRaw(merged.subs, merged.history); try { window.dispatchEvent(new CustomEvent("yanju:synced")); } catch (e) { /* ignore */ } }
  }

  function syncNow() {
    if (current) { again = true; return current; }
    current = run().then(() => { current = null; if (again) { again = false; schedule(1000); } }, () => { current = null; });
    return current;
  }
  async function run() {
    const c = client(), u = user();
    if (!c || !u) return;
    if (meta().paused) { setPhase("paused"); return; }
    setPhase("saving");
    try {
      for (let i = 0; i < 4; i++) {
        const got = await c.from(TABLE).select("data,updated_at").eq("user_id", u.id).maybeSingle();
        if (got.error) throw got.error;
        const row = got.data, m = meta();
        // Data that belongs to a different account is never mixed into this one.
        const local = m.owner && m.owner !== u.id ? empty() : snapshot();
        const remote = norm(row && row.data);
        const merged = merge(local, remote);
        applyLocal(merged, u.id);
        if (row && canon(merged) === canon(remote)) return done();
        const payload = { v: 1, subs: merged.subs, history: merged.history, deleted: merged.deleted, histClearedAt: merged.histClearedAt };
        let res;
        if (row) res = await c.from(TABLE).update({ data: payload }).eq("user_id", u.id).eq("updated_at", row.updated_at).select("updated_at");
        else res = await c.from(TABLE).insert({ user_id: u.id, data: payload }).select("updated_at");
        if (res.error) { if (res.error.code === "23505") continue; throw res.error; }   // another phone created it first: merge again
        if (row && !(res.data && res.data.length)) continue;                               // another phone saved first: merge again
        return done();
      }
      throw new Error("busy");
    } catch (e) { setPhase(isOffline(e) ? "offline" : "error"); }
  }
  function done() { const m = meta(); m.dirty = false; setMeta(m); lastOk = Date.now(); setPhase("ok"); }

  function schedule(ms) { clearTimeout(timer); timer = setTimeout(syncNow, ms); }

  // Called by store.js after every change on this phone.
  function changed(info) {
    info = info || {};
    const m = meta(), now = Date.now();
    (info.deleted || []).forEach(id => { m.deleted[id] = now; });
    if (info.historyCleared) m.histClearedAt = new Date(now).toISOString();
    if (user()) { m.dirty = true; if (!m.owner) m.owner = user().id; }
    setMeta(m);
    if (user() && !m.paused) schedule(2500);
  }

  function startLoop() {
    if (loopTimer) return; loopTimer = setInterval(() => { if (user() && !(typeof document !== "undefined" && document.hidden)) syncNow(); }, 5 * 60 * 1000);
  }

  // Called when sign-in state changes.
  function session(s) {
    if (s && s.user) { startLoop(); setTimeout(syncNow, 0); } else setPhase("off");
  }

  function statusText() {
    if (phase === "saving") return "Saving…";
    if (phase === "paused") return "Saving to your account is turned off.";
    if (phase === "offline") return "Waiting for internet. Your changes are safe on this phone and will be saved when you’re back online.";
    if (phase === "error") return "We couldn’t save to your account just now. We’ll try again.";
    if (phase === "ok") { const s = Math.round((Date.now() - lastOk) / 1000); return "Saved to your account" + (s < 60 ? " just now." : " " + Math.round(s / 60) + " min ago."); }
    return meta().dirty ? "Waiting to save to your account." : "Your subscriptions are saved to your account.";
  }

  // Before signing out: make sure everything is saved, or ask first.
  async function beforeSignOut() {
    if (!user()) return true;
    await Promise.race([syncNow(), new Promise(r => setTimeout(r, 8000))]);
    if (!meta().dirty) return true;
    return typeof confirm === "function" ? confirm("Some changes haven’t been saved to your account yet. If you sign out now, they will be lost from this phone. Sign out anyway?") : false;
  }
  // After signing out: nothing of this person's stays on the phone.
  function afterSignOut() {
    clearTimeout(timer); store().wipe(); try { localStorage.removeItem(META); } catch (e) { /* ignore */ }
    setPhase("off"); try { window.dispatchEvent(new CustomEvent("yanju:synced")); } catch (e) { /* ignore */ }
  }

  function exportData() {
    const m = meta(), u = user();
    return JSON.stringify({ app: "Yanju", exportedAt: new Date().toISOString(), account: u ? u.email : "", subscriptions: store().load(), history: store().history(), deletedIds: m.deleted }, null, 2);
  }
  async function deleteCloud() {
    const c = client(), u = user(); if (!c || !u) return { ok: false };
    const r = await c.from(TABLE).delete().eq("user_id", u.id);
    if (r.error) return { ok: false, error: r.error };
    const m = meta(); m.paused = true; m.dirty = false; setMeta(m); setPhase("paused"); return { ok: true };
  }
  function resume() { const m = meta(); m.paused = false; setMeta(m); syncNow(); }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => { if (!document.hidden && user()) schedule(500); });
    window.addEventListener("online", () => { if (user()) schedule(500); });
  }

  window.Sync = { changed, session, syncNow, statusText, beforeSignOut, afterSignOut, exportData, deleteCloud, resume, paused: () => meta().paused, _test: { merge, meta, canon, phase: () => phase } };
})();
