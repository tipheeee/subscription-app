// The "Alternatives" page: asks the alternatives server for options, then shows a short, simple list.
// Only the service NAME is sent (never your price, email or account). Everything else is worked out here.
(function () {
  const PAGE_SHORT = { free: 3, cheaper: 2, similar: 3 };
  let H = null, S = null, run = 0, timer = null;

  const PER = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
  const safeUrl = u => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch (e) { return ""; } };
  const monthly = p => p && p.period ? (p.period === "year" ? p.amount / 12 : p.amount) : null;

  // Cheapest plan that is really paid, with a known billing period.
  function lowestPaid(it) {
    const plans = (it.price && it.price.status === "verified" ? it.price.plans : []).filter(p => p.amount > 0 && monthly(p) != null);
    return plans.sort((a, b) => monthly(a) - monthly(b))[0] || null;
  }
  // "Cheaper" only when both prices are known, in the same, clearly stated currency.
  function isCheaper(it, sub) {
    const p = lowestPaid(it), mine = sub && sub.amount != null && sub.currency && PER[sub.freq] ? sub.amount * PER[sub.freq] : null;
    return !!(p && mine != null && !p.ambiguous && p.currency === sub.currency && monthly(p) < mine);
  }

  function labelsFor(it, cheaper) {
    const out = [];
    if (it.openSource) out.push(["Open source", "good"]);
    if (it.cost === "free") out.push(["Completely free", "good"]);
    else if (it.cost === "freemium") out.push(["Free plan", "good"]);
    if (cheaper) out.push(["Cheaper", "good"]);
    if (it.needsSetup) out.push(["Needs technical setup", "warn"]);
    return out;
  }

  function whyLine(it) {
    const bits = [];
    if (it.category) bits.push(it.category);
    if (it.platforms && it.platforms.length) bits.push("works on " + it.platforms.slice(0, 3).join(", ").toLowerCase().replace(/\bweb\b/, "the web").replace(/\biphone\b/, "iPhone").replace(/\bandroid\b/, "Android").replace(/\bwindows\b/, "Windows").replace(/\bmac\b/, "Mac").replace(/\blinux\b/, "Linux"));
    return bits.join(" · ");
  }

  function priceHtml(it, cheaper) {
    const pr = it.price || { status: "unavailable" }, link = safeUrl(pr.pricingUrl || it.website);
    if (pr.status === "pending") return `<p class="alt-price muted">Checking price…</p>`;
    const p = lowestPaid(it);
    if (p) {
      const per = p.period === "year" ? "year" : "month";
      const where = pr.region === "NG" ? "Nigerian price" : "International price";
      return `<p class="alt-price"><b>From ${H.esc(H.money(p.amount, p.currency))} / ${per}</b>${p.name ? " · " + H.esc(p.name) : ""}<small>${where}, checked ${H.esc(H.fmtDate(pr.checkedAt))}.${cheaper ? " Plans differ, so check what each one includes." : ""}</small></p>`;
    }
    return `<p class="alt-price">${link ? `<a href="${H.esc(link)}" target="_blank" rel="noopener noreferrer">Check current pricing</a>` : "Check current pricing"}</p>`;
  }

  function cardHtml(it, cheaper) {
    const site = safeUrl(it.website), pricing = safeUrl(it.price && it.price.pricingUrl);
    const tags = labelsFor(it, cheaper).map(([t, k]) => `<span class="tag ${k}">${H.esc(t)}</span>`).join("");
    const why = whyLine(it);
    const links = [site ? `<a class="btn ghost" href="${H.esc(site)}" target="_blank" rel="noopener noreferrer">Visit website</a>` : "",
      pricing && pricing !== site ? `<a class="btn ghost" href="${H.esc(pricing)}" target="_blank" rel="noopener noreferrer">Pricing page</a>` : ""].filter(Boolean).join("");
    return `<article class="alt-card">
      <div class="alt-head">${H.logoHtml(it.name)}<div class="n"><b>${H.esc(it.name)}</b><div class="alt-tags">${tags}</div></div></div>
      ${it.blurb ? `<p class="alt-desc">${H.esc(it.blurb)}</p>` : ""}
      ${why ? `<p class="alt-why">${H.esc(why)}</p>` : ""}
      ${it.needsSetup ? `<p class="note" style="margin:0">You run this yourself, so you may need to pay for hosting.</p>` : ""}
      ${priceHtml(it, cheaper)}
      ${links ? `<div class="alt-links">${links}</div>` : ""}</article>`;
  }

  // Each product appears once, under the first group it fits: free, then cheaper, then similar.
  function group(items, sub) {
    const g = { free: [], cheaper: [], similar: [] };
    for (const it of items) {
      const ch = isCheaper(it, sub);
      const free = it.openSource || it.cost === "free" || it.cost === "freemium";
      (free ? g.free : ch ? g.cheaper : g.similar).push({ it, ch });
    }
    return g;
  }

  const TITLES = { free: "Free alternatives", cheaper: "Cheaper alternatives", similar: "Similar alternatives" };

  function render() {
    const box = H.el; if (!S) return;
    const head = `<h1 style="font-size:34px">Alternatives to ${H.esc(S.sub.name)}</h1>`;
    if (S.state === "loading") { box.innerHTML = head + `<p class="lead" style="font-size:16px" role="status">Looking for alternatives… this can take up to a minute the first time.</p>`; return; }
    if (S.state === "error") {
      const msg = S.reason === "not_configured" ? "Alternatives aren’t switched on yet." : S.reason === "busy" ? "Alternatives are busy right now. Try again in a few minutes." : "We couldn’t load alternatives right now. Check your connection and try again.";
      box.innerHTML = head + `<p class="lead" style="font-size:16px">${H.esc(msg)}</p><p><button class="btn" id="alt-retry">Try again</button> <a class="btn ghost" href="#dashboard">Back to dashboard</a></p>`; return;
    }
    const g = group(S.items, S.sub);
    let shown = 0, hiddenCount = 0, html = "";
    for (const k of ["free", "cheaper", "similar"]) {
      const list = g[k], n = S.expanded ? list.length : Math.min(list.length, PAGE_SHORT[k]);
      hiddenCount += list.length - n;
      if (!n) continue;
      shown += n;
      html += `<h2>${TITLES[k]}</h2>` + list.slice(0, n).map(x => cardHtml(x.it, x.ch)).join("");
    }
    if (!shown) {
      box.innerHTML = head + `<p class="lead" style="font-size:16px">We couldn’t find good alternatives to ${H.esc(S.sub.name)} yet.</p><p><a class="btn ghost" href="#dashboard">Back to dashboard</a></p>`; return;
    }
    const more = hiddenCount > 0 || S.hasMore;
    box.innerHTML = head + `<p class="lead" style="font-size:16px">Yanju found other tools you might like instead of ${H.esc(S.sub.name)}.</p>` + html +
      (more ? `<p><button class="btn" id="alt-more"${S.loadingMore ? " disabled" : ""}>${S.loadingMore ? "Loading…" : "See more alternatives"}</button></p>` : "") +
      (S.stale ? `<p class="note">Showing saved results. We couldn’t refresh them just now.</p>` : "") +
      `<p class="note">Prices are read from each product’s own website and can be different in your country. Always check the pricing page before you switch. Suggestions use public data from AlternativeTo.</p>` +
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
      Object.assign(S, { state: "ready", items: b.items, page: 1, hasMore: !!b.hasMore, stale: !!b.stale, expanded: false });
      render(); if (b.pricingPending) poll(my, 0);
    } catch (e) { if (my !== run) return; S.state = "error"; S.reason = e.reason; render(); }
  }

  // Prices are checked in the background. Ask again a few times so they appear without the person doing anything.
  function poll(my, n) {
    if (n >= 4) { S.items = S.items.map(i => i.price && i.price.status === "pending" ? Object.assign({}, i, { price: { status: "unavailable", plans: [], pricingUrl: null } }) : i); render(); return; }
    timer = setTimeout(async () => {
      if (my !== run) return;
      try {
        const bs = [];
        for (let p = 1; p <= S.page; p++) bs.push(await fetchPage(p));
        if (my !== run) return;
        S.items = bs.reduce((a, b) => merge(a, b.items), []);
        render();
        if (bs.some(b => b.pricingPending)) poll(my, n + 1);
      } catch (e) { poll(my, n + 1); }
    }, n === 0 ? 7000 : 9000);
  }

  async function more() {
    const g = group(S.items, S.sub);
    const hidden = ["free", "cheaper", "similar"].some(k => g[k].length > PAGE_SHORT[k]);
    if (!S.expanded && hidden) { S.expanded = true; render(); return; }
    S.expanded = true;
    if (!S.hasMore) { render(); return; }
    S.loadingMore = true; render();
    const my = run;
    try {
      const b = await fetchPage(S.page + 1); if (my !== run) return;
      S.items = merge(S.items, b.items); S.page += 1; S.hasMore = !!b.hasMore; S.loadingMore = false; render();
      if (b.pricingPending) poll(my, 0);
    } catch (e) { S.loadingMore = false; S.hasMore = false; render(); }
  }

  window.Alternatives = {
    // sub: { name, amount, currency, freq, cat }.  h: helpers from the app.
    show(sub, h) {
      H = h; S = { sub, state: "loading", items: [] };
      if (!h.cfg.altApi) { S.state = "error"; S.reason = "not_configured"; render(); return; }
      if (!H.el.dataset.bound) {
        H.el.dataset.bound = "1";
        H.el.addEventListener("click", e => {
          if (e.target.closest("#alt-more")) more();
          else if (e.target.closest("#alt-retry")) load();
        });
      }
      load();
    },
    stop() { run++; clearTimeout(timer); },
    _test: { group, isCheaper, lowestPaid, labelsFor }
  };
})();
