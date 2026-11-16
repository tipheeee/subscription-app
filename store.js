// Saves subscriptions and their history on THIS device (browser storage).
// When the person is signed in, sync.js also keeps a copy in their account (see sync.js).
window.Store = {
  key: "subs.v1",
  hkey: "hist.v1",
  load() { try { return JSON.parse(localStorage.getItem(this.key) || "[]"); } catch (e) { return []; } },
  // Every change stamps the subscription with the time (u) and notes anything removed, so two phones can be merged safely.
  save(list) {
    try {
      const strip = o => { const c = Object.assign({}, o); delete c.u; return JSON.stringify(c); };
      const prev = {}; this.load().forEach(s => { if (s && s.id) prev[s.id] = s; });
      const now = Date.now(), kept = new Set();
      list.forEach(s => {
        if (!s || !s.id) return; kept.add(s.id);
        const p = prev[s.id];
        if (!p || strip(p) !== strip(s)) s.u = now; else if (p.u && !s.u) s.u = p.u;
      });
      const gone = Object.keys(prev).filter(id => !kept.has(id));
      localStorage.setItem(this.key, JSON.stringify(list));
      if (window.Sync && window.Sync.changed) window.Sync.changed({ deleted: gone });
      return true;
    } catch (e) { return false; }
  },
  // History is a separate log, so deleting a subscription never erases the record of what was paid.
  // Event: { id, subId, name, type: added|renewed|cancelled|ended, date, amount, currency, freq, use, client, cat, at }
  history() { try { return JSON.parse(localStorage.getItem(this.hkey) || "[]"); } catch (e) { return []; } },
  logEvents(events) {
    if (!events || !events.length) return true;
    const at = new Date().toISOString();
    const rows = events.map(e => Object.assign({ id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())), at }, e));
    try {
      localStorage.setItem(this.hkey, JSON.stringify(this.history().concat(rows)));
      if (window.Sync && window.Sync.changed) window.Sync.changed({});
      return true;
    } catch (e) { return false; }
  },
  clearHistory() {
    try {
      localStorage.removeItem(this.hkey);
      if (window.Sync && window.Sync.changed) window.Sync.changed({ historyCleared: true });
      return true;
    } catch (e) { return false; }
  },
  // Used by sync.js: write without stamping, and clear everything when someone signs out.
  _setRaw(subs, hist) { try { localStorage.setItem(this.key, JSON.stringify(subs)); localStorage.setItem(this.hkey, JSON.stringify(hist)); return true; } catch (e) { return false; } },
  wipe() { try { localStorage.removeItem(this.key); localStorage.removeItem(this.hkey); return true; } catch (e) { return false; } }
};
