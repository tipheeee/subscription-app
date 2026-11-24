// Logos for apps that have no bundled logo. Your own Cloudflare server (worker-payments.js) looks them up at Logo.dev and keeps a copy.
// A name is only matched on its own when exactly ONE brand has that exact name. Anything unclear stays a letter tile,
// and the person can pick the right one with "Find logo" or type the website. Their choice is remembered on this device.
(function () {
  const KEY = "logo.map.v1", RETRY_MS = 7 * 864e5;
  const base = () => String((window.APP_CONFIG || {}).payApi || "").replace(/\/$/, "");
  const enabled = () => !!base() && (window.APP_CONFIG || {}).onlineLogos !== false;
  const norm = n => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DOM = /^(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,24})(?:[\/?#].*)?$/i;
  const domainOf = s => { const m = DOM.exec(String(s || "").trim()); return m ? m[1].toLowerCase() : ""; };
  const imgUrl = d => base() + "/api/logo/img?domain=" + encodeURIComponent(d);

  let map = {}; try { map = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { map = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) { /* storage blocked */ } };
  const domain = name => { const e = map[norm(name)]; return e && e.d ? e.d : ""; };

  // What a tile with a found logo looks like. If the picture fails to load, it goes back to the letter.
  const imgTile = (d, extra) => `<img alt="" width="40" height="40" src="${esc(imgUrl(d))}" style="width:100%;height:100%;object-fit:contain;display:block;background:#fff" onerror="var p=this.parentNode;p.className='logo letter';p.setAttribute('style',p.dataset.s||'');p.textContent=p.dataset.l||'?'">`;
  function paint() {
    document.querySelectorAll(".logo[data-ln]").forEach(el => {
      const d = domain(el.dataset.ln); if (!d || el.querySelector("img")) return;
      el.className = "logo"; el.setAttribute("style", "overflow:hidden;padding:0"); el.innerHTML = imgTile(d);
    });
  }

  // Automatic matching, one name at a time, never for a name that was already tried this week.
  const queue = [], seen = new Set(); let running = false;
  function want(name) {
    const n = norm(name); if (!enabled() || n.length < 3 || seen.has(n)) return;
    const e = map[n]; if (e && (e.m || e.d || Date.now() - e.t < RETRY_MS)) return;
    seen.add(n); queue.push(String(name).trim()); run();
  }
  async function search(q) {
    const r = await fetch(base() + "/api/logo/search?q=" + encodeURIComponent(q));
    if (!r.ok) throw new Error("search " + r.status);
    return ((await r.json()).results) || [];
  }
  async function run() {
    if (running) return; running = true;
    while (queue.length) {
      const name = queue.shift(), n = norm(name);
      if (!navigator.onLine) break;
      try {
        const res = await search(name), squashed = n.replace(/ /g, "");
        const exact = res.filter(x => norm(x.name) === n || x.domain.split(".")[0] === squashed);
        const cur = map[n]; if (cur && cur.m) continue;                      // the person's own choice always wins
        map[n] = exact.length === 1 ? { d: exact[0].domain, t: Date.now() } : { d: "", t: Date.now() };
        save(); paint();
      } catch (e) { /* offline or server busy: try again another day */ }
      await new Promise(r => setTimeout(r, 400));
    }
    running = false;
  }

  // The person typed or picked a website for this name. It is remembered and never replaced automatically.
  function manual(name, website) {
    const n = norm(name); if (!n) return;
    const d = domainOf(website);
    if (d) map[n] = { d, t: Date.now(), m: 1 }; else if (map[n] && map[n].m) delete map[n];
    save(); paint();
  }

  // "Find logo" in the edit screen.
  document.addEventListener("click", async ev => {
    const t = ev.target.closest && ev.target.closest("#logo-search, [data-pick]"); if (!t) return;
    const out = document.getElementById("logo-results"); if (!out) return;
    if (t.dataset.pick) { const w = document.querySelector('#edit-form [data-e="website"]'); if (w) w.value = t.dataset.pick; out.innerHTML = `<p class="note" style="margin:0">Picked ${esc(t.dataset.pick)}. Tap Save changes to keep it.</p>`; return; }
    const nm = (document.querySelector('#edit-form [data-e="name"]') || {}).value || "";
    if (norm(nm).length < 2) { out.innerHTML = `<p class="note" style="margin:0">Type the name first.</p>`; return; }
    out.innerHTML = `<p class="note" style="margin:0">Searching…</p>`;
    try {
      const res = await search(nm);
      out.innerHTML = res.length
        ? `<p class="note" style="margin:0">Tap the right one:</p>` + res.map(x => `<button type="button" class="btn ghost" data-pick="${esc(x.domain)}" style="display:flex;align-items:center;gap:10px;text-align:left"><img alt="" width="28" height="28" src="${esc(imgUrl(x.domain))}" style="object-fit:contain;background:#fff;border-radius:6px" onerror="this.style.visibility='hidden'"><span>${esc(x.name)} <small>${esc(x.domain)}</small></span></button>`).join("")
        : `<p class="note" style="margin:0">No match found. If you know the website, type it in the box above.</p>`;
    } catch (e) { out.innerHTML = `<p class="note bad" style="margin:0">Couldn’t search right now. Check your internet and try again.</p>`; }
  });

  window.OnlineLogos = { enabled, domain, want, manual, paint, norm, imgTile };
})();
