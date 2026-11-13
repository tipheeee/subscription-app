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

  // The subscription rows shared by the spreadsheet's second sheet and the CSV fallback.
  function subRows(d) {
    const I = d.I, T = d.target, rows = []; let mt = 0, yt = 0;
    d.filtered.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(s => {
      const mo = I.monthly(s), v = mo == null ? null : H.convert(mo, s.currency, T);
      if (v != null) { mt += v; yt += v * 12; }
      rows.push([s.name, I.clientOf(s), I.catLabel(I.catOf(s)), s.plan || "", s.freq || "", s.amount == null ? "" : s.amount, s.currency || "", v == null ? "" : round2(v), v == null ? "" : round2(v * 12), s.date || "", s.status || ""]);
    });
    return { rows, mt, yt, head: ["Name", "Client or project", "Category", "Plan", "Billed", "Amount", "Currency", "Monthly cost (" + T + ")", "Yearly cost (" + T + ")", "Next renewal", "Status"] };
  }

  // Plain CSV, kept only as a fallback if the Excel file can't be built (for example, no internet the first time).
  function csv() {
    const d = compute(H), T = d.target, r = subRows(d), rows = r.rows.slice();
    rows.push(["Total", "", "", "", "", "", "", round2(r.mt), round2(r.yt), "", ""]);
    rows.push([]);
    rows.push(["Estimates from the prices saved in Yanju, converted at about today’s exchange rates. Not tax advice. Ask your accountant what you can claim."]);
    return d.I.toCsv(r.head, rows);
  }

  // ---- Excel file: the same page as the app, laid out as a spreadsheet ---------------
  const TEAL = "FF0F4C4A", MUTE = "FF5B6E70", LINE = "FFD9E2E0", PAPER = "FFF3F6F5", INK = "FF16282C", WHITE = "FFFFFFFF";
  const solid = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const bar = (v, max) => v > 0 && max > 0 ? "█".repeat(Math.max(1, Math.round(v / max * 24))) : "";

  function buildXlsx(X, d, h) {
    const I = d.I, T = d.target, B = d.B, top = B.top[0];
    const money = '"' + T + ' "#,##0.00';
    const wb = new X.Workbook();
    wb.creator = h.cfg.name; wb.created = new Date();
    const ws = wb.addWorksheet("Business report", { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = [{ width: 34 }, { width: 22 }, { width: 38 }, { width: 12 }];
    let r = 1;

    // Title block
    ws.mergeCells(r, 1, r, 4);
    Object.assign(ws.getCell(r, 1), { value: "Business spending report", font: { name: "Calibri", size: 20, bold: true, color: { argb: WHITE } }, fill: solid(TEAL), alignment: { vertical: "middle", indent: 1 } });
    ws.getRow(r).height = 38; r++;
    const who = S.client === "all" ? "All clients" : S.client === I.GENERAL_KEY ? "General (no client)" : S.client;
    ws.mergeCells(r, 1, r, 4);
    Object.assign(ws.getCell(r, 1), { value: h.cfg.name + " · created " + h.fmtDate(h.today) + " · amounts in " + T + " · " + who, font: { size: 11, color: { argb: MUTE } }, alignment: { indent: 1 } });
    r += 2;

    const section = text => {
      ws.mergeCells(r, 1, r, 4);
      Object.assign(ws.getCell(r, 1), { value: text, font: { size: 13, bold: true, color: { argb: TEAL } } });
      for (let c = 1; c <= 4; c++) ws.getCell(r, c).border = { bottom: { style: "medium", color: { argb: TEAL } } };
      ws.getRow(r).height = 22; r++;
    };
    const note = text => {
      ws.mergeCells(r, 1, r, 4);
      Object.assign(ws.getCell(r, 1), { value: text, font: { size: 10, italic: true, color: { argb: MUTE } }, alignment: { wrapText: true, vertical: "top" } });
      ws.getRow(r).height = Math.max(16, Math.ceil(text.length / 95) * 15); r++;
    };
    const card = (label, value, fmt, sub) => {
      for (let c = 1; c <= 4; c++) { const x = ws.getCell(r, c); x.fill = solid(PAPER); x.border = { bottom: { style: "thin", color: { argb: WHITE } } }; }
      Object.assign(ws.getCell(r, 1), { value: label, font: { size: 11, color: { argb: MUTE } }, alignment: { indent: 1, vertical: "middle" } });
      Object.assign(ws.getCell(r, 2), { value, font: { size: 14, bold: true, color: { argb: INK } }, alignment: { horizontal: "right", vertical: "middle" } });
      if (fmt) ws.getCell(r, 2).numFmt = fmt;
      if (sub) { ws.mergeCells(r, 3, r, 4); Object.assign(ws.getCell(r, 3), { value: sub, font: { size: 10, color: { argb: MUTE } }, alignment: { indent: 1, vertical: "middle" } }); }
      ws.getRow(r).height = 24; r++;
    };
    const barRows = (rows, max, shareCol) => rows.forEach(x => {
      Object.assign(ws.getCell(r, 1), { value: x.label, font: { size: 11, color: { argb: INK } }, alignment: { vertical: "middle", wrapText: true } });
      Object.assign(ws.getCell(r, 2), { value: round2(x.value), numFmt: money, font: { size: 11, bold: true, color: { argb: INK } }, alignment: { horizontal: "right", vertical: "middle" } });
      Object.assign(ws.getCell(r, 3), { value: bar(x.value, max), font: { size: 11, color: { argb: TEAL } }, alignment: { vertical: "middle", indent: 1 } });
      if (shareCol && x.share != null) Object.assign(ws.getCell(r, 4), { value: x.share, numFmt: "0%", font: { size: 10, color: { argb: MUTE } }, alignment: { horizontal: "right", vertical: "middle" } });
      for (let c = 1; c <= 4; c++) ws.getCell(r, c).border = { bottom: { style: "hair", color: { argb: LINE } } };
      ws.getRow(r).height = 20; r++;
    });

    // Summary cards (the same six as the app)
    const share = d.allTotal > 0 ? B.total / d.allTotal : 0;
    const withClient = d.biz.length ? d.biz.filter(s => I.clientOf(s)).length / d.biz.length : 0;
    section("Summary");
    card("Per month", round2(B.total), money);
    card("Per year (estimate)", round2(B.total * 12), money);
    card("Biggest cost", top ? top.name : "None", null, top ? h.money(top.monthly, T) + " per month" : "");
    card("Business tools", B.count, "0");
    card("Share of all spending", share, "0%");
    card("Paid in " + S.year, round2(d.paid), money, "Renewals you confirmed in the app");
    if (B.unpriced) note(B.unpriced + " subscription" + (B.unpriced > 1 ? "s are" : " is") + " not counted: price, currency or billing period is missing.");
    if (B.unconverted || d.charges.skipped || d.paidSkipped) note("Some amounts are left out because exchange rates didn’t load.");
    r++;

    // Biggest costs
    if (B.top.length) {
      section("Biggest costs per month");
      barRows(B.top.map(x => ({ label: x.name, value: x.monthly, share: x.share })), B.top[0].monthly, true);
      r++;
    }

    // Cost by client or project
    section("Cost by client or project, per month");
    if (d.C.rows.length) barRows(d.C.rows.map(x => ({ label: x.label, value: x.monthly, share: x.share })), d.C.rows[0].monthly, true);
    if (!d.names.length) note("Add a client or project name when you edit a Business subscription, and the cost for each will show here.");
    r++;

    // The two donuts, as shares
    section("Business share and client coverage");
    card("Business share of spending", share, "0%");
    card("Tools with a client", withClient, "0%");
    r++;

    // Expected charges
    section("Expected charges, next 12 months");
    const bk = d.charges.buckets, total = bk.reduce((a, b) => a + b.total, 0);
    if (total > 0) {
      const mx = Math.max.apply(null, bk.map(b => b.total));
      barRows(bk.map(b => { const [y, m] = b.key.split("-").map(Number); return { label: new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" }), value: b.total }; }), mx, false);
      Object.assign(ws.getCell(r, 1), { value: "Total", font: { bold: true, color: { argb: INK } } });
      Object.assign(ws.getCell(r, 2), { value: round2(total), numFmt: money, font: { bold: true, color: { argb: INK } }, alignment: { horizontal: "right" } });
      for (let c = 1; c <= 4; c++) ws.getCell(r, c).border = { top: { style: "thin", color: { argb: TEAL } } };
      r++;
    } else note("Nothing to chart yet. Add a renewal date and price to your business subscriptions.");
    r++;
    note("These are estimates from the prices saved in " + h.cfg.name + ", shown in " + T + " at about today’s exchange rates. " + h.cfg.name + " doesn’t give tax advice. Ask your accountant what you can claim.");

    // Sheet 2: every subscription behind the report
    const sr = subRows(d), w2 = wb.addWorksheet("Subscriptions", { views: [{ state: "frozen", ySplit: 1 }] });
    w2.columns = [{ width: 26 }, { width: 22 }, { width: 18 }, { width: 16 }, { width: 11 }, { width: 12 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 11 }];
    const hr = w2.addRow(sr.head);
    hr.eachCell(c => { c.font = { bold: true, color: { argb: WHITE } }; c.fill = solid(TEAL); c.alignment = { vertical: "middle", wrapText: true }; });
    hr.height = 32;
    sr.rows.forEach(x => w2.addRow(x));
    const tr = w2.addRow(["Total", "", "", "", "", "", "", round2(sr.mt), round2(sr.yt), "", ""]);
    tr.font = { bold: true }; tr.eachCell(c => { c.border = { top: { style: "thin", color: { argb: TEAL } } }; });
    [6, 8, 9].forEach(k => { w2.getColumn(k).numFmt = "#,##0.00"; w2.getColumn(k).alignment = { horizontal: "right" }; });
    hr.getCell(6).alignment = hr.getCell(8).alignment = hr.getCell(9).alignment = { horizontal: "right", vertical: "middle", wrapText: true };
    if (sr.rows.length) w2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + sr.rows.length, column: 11 } };
    return wb;
  }

  let xlsxLoad = null;
  function loadExcel() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!xlsxLoad) xlsxLoad = new Promise((ok, no) => {
      const sc = document.createElement("script");
      sc.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
      sc.onload = () => window.ExcelJS ? ok(window.ExcelJS) : no(new Error("ExcelJS missing"));
      sc.onerror = () => { xlsxLoad = null; no(new Error("ExcelJS failed to load")); };
      document.head.appendChild(sc);
    });
    return xlsxLoad;
  }

  async function exportSheet() {
    const msg = H.el.querySelector("#rp-msg"), say = t => { if (msg) msg.textContent = t; };
    const base = `${H.cfg.name.toLowerCase()}-business-report-${H.stamp()}`;
    say("Preparing your spreadsheet…");
    try {
      const X = await loadExcel(), wb = buildXlsx(X, compute(H), H), buf = await wb.xlsx.writeBuffer();
      H.download(buf, base + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      say("Downloaded. Open it in Excel, Google Sheets or Numbers.");
    } catch (err) {
      H.download(csv(), base + ".csv", "text/csv");
      say("The formatted spreadsheet needs internet the first time, so a simple table (CSV) was downloaded instead. Try again when you are online.");
    }
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
    if (e.target.closest("#rp-csv")) { exportSheet(); }
  }

  window.Report = { render, _test: { csv: () => csv(), buildXlsx: (X, d, h) => { H = h; return buildXlsx(X, d, h); }, niceTop, compute: h => { H = h; return compute(h); } } };
})();
