// Saves subscriptions on THIS device only (browser storage).
// Later we will swap this for an online database so users can log in anywhere.
window.Store = {
  key: "subs.v1",
  load() { try { return JSON.parse(localStorage.getItem(this.key) || "[]"); } catch (e) { return []; } },
  save(list) { try { localStorage.setItem(this.key, JSON.stringify(list)); return true; } catch (e) { return false; } }
};
