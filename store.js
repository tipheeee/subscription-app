// Saves subscriptions and their history on THIS device only (browser storage).
// Later we will swap this for an online database so users can log in anywhere.
window.Store = {
  key: "subs.v1",
  hkey: "hist.v1",
  load() { try { return JSON.parse(localStorage.getItem(this.key) || "[]"); } catch (e) { return []; } },
  save(list) { try { localStorage.setItem(this.key, JSON.stringify(list)); return true; } catch (e) { return false; } },
  // History is a separate log, so deleting a subscription never erases the record of what was paid.
  // Event: { id, subId, name, type: added|renewed|cancelled|ended, date, amount, currency, freq, use, cat, at }
  history() { try { return JSON.parse(localStorage.getItem(this.hkey) || "[]"); } catch (e) { return []; } },
  logEvents(events) {
    if (!events || !events.length) return true;
    const at = new Date().toISOString();
    const rows = events.map(e => Object.assign({ id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())), at }, e));
    try { localStorage.setItem(this.hkey, JSON.stringify(this.history().concat(rows))); return true; } catch (e) { return false; }
  },
  clearHistory() { try { localStorage.removeItem(this.hkey); return true; } catch (e) { return false; } }
};
