// The "Business report" page: a visual summary of business subscriptions, a PDF (via the phone's print screen)
// and a spreadsheet for an accountant. Everything is worked out on this device from saved subscriptions and history.
(function () {
  const S = { client: "all", year: null };
  let H = null;

  const pct = p => Math.round(p * 100) + "%";
  const compact = n => { try { return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n); } catch (e) { return String(Math.round(n)); } };
  const round2 = n => Math.round(n * 100) / 100;
  const firstOfMonth = iso => iso.slice(0, 8) + "01";
  // A tidy top value for the chart's up-and-down scale: 1, 2, 2.5, 5 or 10 times a power of ten.
  function niceTop(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  function lineChart(buckets) {
    const max = Math.max.apply(null, buckets.map(b => b.total)), top = niceTop(max);
    const x0 = 46, x1 = 488, y0 = 150, y1 = 20, X = i => x0 + i * (x1 - x0) / 11, Y = v => y0 - v / top * (y0 - y1);
    const pts = buckets.map((b, i) => X(i).toFixed(1) + "," + Y(b.total).toFixed(1)).join(" ");
    const grid = [0, 1, 2, 3].map(k => { const v = top * k / 3, y = Y(v).toFixed(1); return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="var(--line)" stroke-width="1"/><text x="${x0 - 6}" y="${(+y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--mute)">${H.esc(compact(v))}</text>`; }).join("");
    const labels = buckets.map((b, i) => `<text x="${X(i).toFixed(1)}" y="170" text-anchor="middle" font-size="11" fill="var(--mute)">${b.label}</text>`).join("");
    const dots = buckets.map((b, i) => b.total > 0 ? `<circle cx="${X(i).toFixed(1)}" cy="${Y(b.total).toFixed(1)}" r="3" fill="var(--teal)"/>` : "").join("");
    return `<svg viewBox="0 0 500 178" width="100%" role="img" aria-label="Expected business charges for each of the next 12 months"><title>Expected business charges by month</title>${grid}
      <polygon points="${x0},${y0} ${pts} ${x1},${y0}" fill="var(--teal)" fill-opacity=".12"/>
      <polyline points="${pts}" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}${labels}</svg>`;
  }

  const barRow = (label, v, max, text) => `<div class="rp-br"><span class="rp-l">${H.esc(label)}</span><span class="rp-t"><i style="width:${max > 0 ? Math.max(2, Math.round(v / max * 100)) : 0}%"></i></span><span class="rp-v">${H.esc(text)}</span></div>`;

  function donut(p, title) {
    const C = 2 * Math.PI * 40, d = Math.max(0, Math.min(1, p)) * C;
    return `<div class="rp-card rp-center"><h3>${H.esc(title)}</h3><svg viewBox="0 0 100 100" width="104" role="img" aria-label="${H.esc(title)}: ${pct(p)}"><circle cx="50" cy="50" r="40" fill="none" stroke="var(--line)" stroke-width="12"/><circle cx="50" cy="50" r="40" fill="none" stroke="var(--teal)" stroke-width="12" stroke-dasharray="${d.toFixed(1)} ${(C - d).toFixed(1)}" transform="rotate(-90 50 50)"/><text x="50" y="56" text-anchor="middle" font-size="20" fill="var(--ink)">${pct(p)}</text></svg></div>`;
  }

  function compute(h) {
    const I = h.Insights, all = h.Store.load(), target = h.target;
    const biz = all.filter(s => s.status === "active" && I.useOf(s) === "business");
    const names = I.clientNames(biz);
    if (S.client !== "all" && S.client !== I.GENERAL_KEY && !names.some(n => n.toLowerCase() === String(S.client).toLowerCase())) S.client = "all";
    if (S.client === I.GENERAL_KEY && !names.length) S.client = "all";
    const filtered = biz.filter(s => I.matchClient(s, S.client));
    const codes = Array.from(new Set(all.filter(s => s.status === "active" && s.currency).map(s => s.currency)));
    const need = codes.some(c => c !== target) && !h.fxReady();
    const B = I.breakdown(filtered, target, h.convert, "business");
    const allTotal = I.breakdown(all, target, h.convert, "all").total;
    const C = I.byClient(all, target, h.convert);
    const start = firstOfMonth(h.today);
    const charges = I.chargesByMonth(I.upcoming(filtered, start, 365, h.addPeriods, "business"), start, h.convert, target);
    // Money actually paid, from renewals the person confirmed in the app.
    const thisYear = Number(h.today.slice(0, 4));
    const paidEv = h.Store.history().filter(e => e.type === "renewed" && e.use === "business" && e.amount != null && e.currency && e.date && e.date <= h.today);
    const years = Array.from(new Set(paidEv.map(e => Number(e.date.slice(0, 4))).concat([thisYear]))).sort((a, b) => b - a);
    if (!years.includes(S.year)) S.year = thisYear;
    let paid = 0, paidSkipped = 0;
    paidEv.filter(e => Number(e.date.slice(0, 4)) === S.year && I.matchClient({ client: e.client }, S.client)).forEach(e => { const v = h.convert(e.amount, e.currency, target); if (v == null) paidSkipped++; else paid += v; });
    return { I, all, biz, names, filtered, B, allTotal, C, charges, years, paid, paidSkipped, target, need, hasGeneral: biz.some(s => !I.clientOf(s)) };
  }

  const chip = (attr, val, label, on) => `<button type="button" class="rp-chip${on ? " on" : ""}" ${attr}="${H.esc(val)}" aria-pressed="${on}">${H.esc(label)}</button>`;

  function render(h) {
    H = h; const box = h.el; if (!box) return;
    if (!box.dataset.bound) { box.dataset.bound = "1"; box.addEventListener("click", onClick); }
    const d = compute(h), I = d.I, T = d.target, m = n => h.money(n, T);
    if (d.need) h.refreshFx();
    if (!d.biz.length) {
      box.innerHTML = `<div class="card empty"><b>No business subscriptions yet.</b><span class="note">Tap ✎ on a subscription, set “Used for” to Business, and it will appear in this report. You can add a client or project name too.</span><div><a class="btn" href="#dashboard">Go to dashboard</a></div></div>`;
      return;
    }
    const B = d.B, top = B.top[0];
    const chips = d.names.length
      ? `<div class="rp-chips"><span class="rp-cl">Client</span>${chip("data-rp-client", "all", "All", S.client === "all")}${d.names.map(n => chip("data-rp-client", n, n, String(S.client).toLowerCase() === n.toLowerCase())).join("")}${d.hasGeneral ? chip("data-rp-client", I.GENERAL_KEY, "General", S.client === I.GENERAL_KEY) : ""}</div>`
      : "";
    const yearChips = d.years.length > 1 ? `<div class="rp-chips"><span class="rp-cl">Year paid</span>${d.years.map(y => chip("data-rp-year", y, String(y), S.year === y)).join("")}</div>` : "";
    const k = (label, value, sub) => `<div class="rp-k"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
    const share = d.allTotal > 0 ? B.total / d.allTotal : 0;
    const withClient = d.biz.filter(s => I.clientOf(s)).length / d.biz.length;
    const chargesTotal = d.charges.buckets.reduce((a, b) => a + b.total, 0);
    const maxTop = B.top.length ? B.top[0].monthly : 0, maxC = d.C.rows.length ? d.C.rows[0].monthly : 0;

    let html = `<div class="rp-printhead"><b>Business spending report</b><br>${h.esc(h.cfg.name)} · created ${h.esc(h.fmtDate(h.today))} · amounts in ${h.esc(T)}</div>${chips}${yearChips}
      <div class="rp-kpis">
        ${k("Per month", h.esc(m(B.total)))}${k("Per year (estimate)", h.esc(m(B.total * 12)))}
        ${k("Biggest cost", top ? h.esc(top.name) : "None", top ? h.esc(m(top.monthly)) + " per month" : "")}${k("Business tools", String(B.count))}
        ${k("Share of all spending", pct(share))}${k("Paid in " + S.year, h.esc(m(d.paid)), "Renewals you confirmed in the app")}
      </div>`;
    if (B.unpriced) html += `<p class="note">${B.unpriced} subscription${B.unpriced > 1 ? "s are" : " is"} not counted: price, currency or billing period is missing.</p>`;
    if (B.unconverted || d.charges.skipped || d.paidSkipped) html += `<p class="note bad">Some amounts are left out because exchange rates didn’t load. Open the app with internet to include them.</p>`;

    html += `<div class="rp-card"><h3>Expected charges, next 12 months</h3>${chargesTotal > 0 ? lineChart(d.charges.buckets) : `<p class="note" style="margin:0">Nothing to chart yet. Add a renewal date and price to your business subscriptions.</p>`}</div>`;
    if (B.top.length) html += `<div class="rp-card"><h3>Biggest costs per month</h3>${B.top.map(r => barRow(r.name, r.monthly, maxTop, m(r.monthly))).join("")}</div>`;
    html += `<div class="rp-two">${donut(share, "Business share of spending")}${donut(withClient, "Tools with a client")}</div>`;
    html += `<div class="rp-card"><h3>Cost by client or project, per month</h3>${d.C.rows.length ? d.C.rows.map(r => barRow(r.label, r.monthly, maxC, m(r.monthly))).join("") : ""}${d.names.length ? "" : `<p class="note" style="margin:0">Add a client or project name when you edit a Business subscription, and the cost for each will show here.</p>`}</div>`;
    html += `<div class="rp-actions no-print"><button class="btn" id="rp-pdf" type="button">Download PDF</button><button class="btn ghost" id="rp-csv" type="button">Download spreadsheet</button></div>
      <p class="note rp-pdfhint no-print" id="rp-msg"></p>
      <p class="note">These are estimates from the prices saved in Yanju, shown in ${h.esc(T)} at about today’s exchange rates. Yanju doesn’t give tax advice. Ask your accountant what you can claim.</p>`;
    box.innerHTML = html;
  }

  function csv() {
    const d = compute(H), I = d.I, T = d.target, rows = [];
    let mt = 0, yt = 0;
    d.filtered.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(s => {
      const mo = I.monthly(s), v = mo == null ? null : H.convert(mo, s.currency, T);
      if (v != null) { mt += v; yt += v * 12; }
      rows.push([s.name, I.clientOf(s), I.catLabel(I.catOf(s)), s.plan || "", s.freq || "", s.amount == null ? "" : s.amount, s.currency || "", v == null ? "" : round2(v), v == null ? "" : round2(v * 12), s.date || "", s.status || ""]);
    });
    rows.push(["Total", "", "", "", "", "", "", round2(mt), round2(yt), "", ""]);
    rows.push([]);
    rows.push(["Estimates from the prices saved in Yanju, converted at about today’s exchange rates. Not tax advice. Ask your accountant what you can claim."]);
    return I.toCsv(["Name", "Client or project", "Category", "Plan", "Billed", "Amount", "Currency", "Monthly cost (" + T + ")", "Yearly cost (" + T + ")", "Next renewal", "Status"], rows);
  }

  function onClick(e) {
    const c = e.target.closest("[data-rp-client]"), y = e.target.closest("[data-rp-year]");
    if (c) { S.client = c.getAttribute("data-rp-client"); render(H); return; }
    if (y) { S.year = Number(y.getAttribute("data-rp-year")); render(H); return; }
    if (e.target.closest("#rp-pdf")) {
      const msg = H.el.querySelector("#rp-msg");
      if (msg) msg.textContent = "In the print screen, choose “Save as PDF”.";
      if (typeof window.print === "function") window.print();
      return;
    }
    if (e.target.closest("#rp-csv")) {
      H.download(csv(), `${H.cfg.name.toLowerCase()}-business-report-${H.stamp()}.csv`, "text/csv");
      const msg = H.el.querySelector("#rp-msg"); if (msg) msg.textContent = "Downloaded. Open it in Excel, Google Sheets or Numbers.";
    }
  }

  window.Report = { render, _test: { csv: () => csv(), niceTop, compute: h => { H = h; return compute(h); } } };
})();
