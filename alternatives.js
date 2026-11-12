// The "Alternatives" page: asks the alternatives server for options, then shows a short, simple list.
// Only the service NAME is sent (never your price, email or account). Everything else is worked out here.
(function () {
  const PAGE_SHORT = { free: 3, similar: 3 };
  let H = null, S = null, run = 0, timer = null;

  // Products the person says are not available where they live. Kept on this device only.
  const HID = "alt.hidden.v1";
  const hidden = () => { try { return JSON.parse(localStorage.getItem(HID) || "[]"); } catch (e) { return []; } };
  const hide = slug => { try { const h = hidden(); if (!h.includes(slug)) { h.push(slug); localStorage.setItem(HID, JSON.stringify(h.slice(-200))); } } catch (e) { /* ignore */ } };

  const safeUrl = u => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch (e) { return ""; } };

  function labelsFor(it) {
    const out = [];
    if (it.openSource) out.push(["Open source", "good"]);
    if (it.cost === "free") out.push(["Completely free", "good"]);
    else if (it.cost === "freemium") out.push(["Free plan", "good"]);
    else if (it.cost === "paid") out.push(["Paid", ""]);
    if (it.needsSetup) out.push(["Needs technical setup", "warn"]);
    return out;
  }

  function whyLine(it) {
    const bits = [];
    if (it.category) bits.push(it.category);
    if (it.platforms && it.platforms.length) bits.push("works on " + it.platforms.slice(0, 3).join(", "));
    return bits.join(" · ");
  }

  function cardHtml(it) {
    const site = safeUrl(it.website);
    const tags = labelsFor(it).map(([t, k]) => `<span class="tag ${k}">${H.esc(t)}</span>`).join("");
    const why = whyLine(it);
    return `<article class="alt-card">
      <div class="alt-head">${H.logoHtml(it.name)}<div class="n"><b>${H.esc(it.name)}</b><div class="alt-tags">${tags}</div></div></div>
      ${it.blurb ? `<p class="alt-desc">${H.esc(it.blurb)}</p>` : ""}
      ${why ? `<p class="alt-why">${H.esc(why)}</p>` : ""}
      ${it.needsSetup ? `<p class="note" style="margin:0">You run this yourself, so you may need to pay for hosting.</p>` : ""}
      ${site ? `<div class="alt-links"><a class="btn ghost" href="${H.esc(site)}" target="_blank" rel="noopener noreferrer">Visit website</a></div>` : ""}
      <button class="altlink alt-hide" data-hide="${H.esc(it.slug)}" style="background:none;border:0;padding:0;text-align:left;cursor:pointer">Not available in my country</button></article>`;
  }

  // Each product appears once: free options first, then everything else that does a similar job.
  function group(items) {
    const g = { free: [], similar: [] };
    for (const it of items) (it.openSource || it.cost === "free" || it.cost === "freemium" ? g.free : g.similar).push(it);
    return g;
  }

  const TITLES = { free: "Free alternatives", similar: "Similar alternatives" };
  const visible = () => S.items.filter(i => !hidden().includes(i.slug));

  function render() {
    const box = H.el; if (!S) return;
    const head = `<h1 style="font-size:34px">Alternatives to ${H.esc(S.sub.name)}</h1>`;
    if (S.state === "loading") { box.innerHTML = head + `<p class="lead" style="font-size:16px" role="status">Looking for alternatives… this can take up to a minute the first time.</p>`; return; }
    if (S.state === "error") {
      const msg = S.reason === "not_configured" ? "Alternatives aren’t switched on yet." : S.reason === "busy" ? "Alternatives are busy right now. Try again in a few minutes." : "We couldn’t load alternatives right now. Check your connection and try again.";
      box.innerHTML = head + `<p class="lead" style="font-size:16px">${H.esc(msg)}</p><p><button class="btn" id="alt-retry">Try again</button> <a class="btn ghost" href="#dashboard">Back to dashboard</a></p>`; return;
    }
    const g = group(visible());
    let shown = 0, hiddenCount = 0, html = "";
    for (const k of ["free", "similar"]) {
      const list = g[k], n = S.expanded ? list.length : Math.min(list.length, PAGE_SHORT[k]);
      hiddenCount += list.length - n;
      if (!n) continue;
      shown += n;
      html += `<h2>${TITLES[k]}</h2>` + list.slice(0, n).map(cardHtml).join("");
    }
    if (!shown) {
      box.innerHTML = head + `<p class="lead" style="font-size:16px">We couldn’t find good alternatives to ${H.esc(S.sub.name)} yet.</p><p><a class="btn ghost" href="#dashboard">Back to dashboard</a></p>`; return;
    }
    const more = hiddenCount > 0 || S.hasMore;
    box.innerHTML = head + `<p class="lead" style="font-size:16px">Yanju found other tools you might like instead of ${H.esc(S.sub.name)}.</p>` +
      (S.fallback ? `<p class="note">We couldn’t find an exact match for ${H.esc(S.sub.name)}, so these are popular tools that do a similar job.</p>` : "") + html +
      (more ? `<p><button class="btn" id="alt-more"${S.loadingMore ? " disabled" : ""}>${S.loadingMore ? "Loading…" : "See more alternatives"}</button></p>` : "") +
      (S.stale ? `<p class="note">Showing saved results. We couldn’t refresh them just now.</p>` : "") +
      `<p class="note">Some products are not available in every country, and plans and prices differ, so check the website before you sign up. If one isn’t available where you live, tap “Not available in my country” to hide it. Suggestions use public data from AlternativeTo.</p>` +
      `<p><a class="btn ghost" href="#dashboard">Back to dashboard</a></p>`;
  }

  function merge(old, fresh) {
    const seen = new Map(old.map(x => [x.slug, x]));
    fresh.forEach(x => seen.set(x.slug, x));
    return Array.from(seen.values());
  }

  async function fetchPage(page) {
    const base = (H.cfg.altApi || "").replace(/\/?$/, "/");
    const u = base + "alternatives?service=" + encodeURIComponent(S.sub.name) + "&cat=" + encodeURIComponent(S.sub.cat || "") + "&page=" + page;
    const r = await fetch(u, { headers: { accept: "application/json" } });
    let b = null; try { b = await r.json(); } catch (e) { /* ignore */ }
    if (!r.ok || !b || !b.ok) { const e = new Error("fail"); e.reason = b && b.reason; throw e; }
    return b;
  }

  async function load() {
    const my = ++run; clearTimeout(timer);
    S.state = "loading"; render();
    try {
      const b = await fetchPage(1); if (my !== run) return;
      Object.assign(S, { state: "ready", items: b.items, page: 1, hasMore: !!b.hasMore, stale: !!b.stale, fallback: !!b.fallback, expanded: false });
      render(); if (b.pending) poll(my, 0);
    } catch (e) { if (my !== run) return; S.state = "error"; S.reason = e.reason; render(); }
  }

  // Website links are looked up in the background. Ask again a few times so they appear without the person doing anything.
  function poll(my, n) {
    if (n >= 4) return;
    timer = setTimeout(async () => {
      if (my !== run) return;
      try {
        const bs = [];
        for (let p = 1; p <= S.page; p++) bs.push(await fetchPage(p));
        if (my !== run) return;
        S.items = bs.reduce((a, b) => merge(a, b.items), []);
        render();
        if (bs.some(b => b.pending)) poll(my, n + 1);
      } catch (e) { poll(my, n + 1); }
    }, n === 0 ? 6000 : 8000);
  }

  async function more() {
    const g = group(visible());
    const anyHidden = ["free", "similar"].some(k => g[k].length > PAGE_SHORT[k]);
    if (!S.expanded && anyHidden) { S.expanded = true; render(); return; }
    S.expanded = true;
    if (!S.hasMore) { render(); return; }
    S.loadingMore = true; render();
    const my = run;
    try {
      const b = await fetchPage(S.page + 1); if (my !== run) return;
      S.items = merge(S.items, b.items); S.page += 1; S.hasMore = !!b.hasMore; S.loadingMore = false; render();
      if (b.pending) poll(my, 0);
    } catch (e) { S.loadingMore = false; S.hasMore = false; render(); }
  }

  window.Alternatives = {
    // sub: { name, cat }.  h: helpers from the app.
    show(sub, h) {
      H = h; S = { sub, state: "loading", items: [] };
      if (!h.cfg.altApi) { S.state = "error"; S.reason = "not_configured"; render(); return; }
      if (!H.el.dataset.bound) {
        H.el.dataset.bound = "1";
        H.el.addEventListener("click", e => {
          const hb = e.target.closest("[data-hide]");
          if (hb) { hide(hb.getAttribute("data-hide")); render(); }
          else if (e.target.closest("#alt-more")) more();
          else if (e.target.closest("#alt-retry")) load();
        });
      }
      load();
    },
    stop() { run++; clearTimeout(timer); },
    _test: { group, labelsFor }
  };
})();
