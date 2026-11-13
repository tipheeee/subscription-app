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
    let paid = 0, paidSkipped = 0; const paidRows = [];
    paidEv.filter(e => Number(e.date.slice(0, 4)) === S.year && I.matchClient({ client: e.client }, S.client)).sort((a, b) => a.date.localeCompare(b.date)).forEach(e => { const v = h.convert(e.amount, e.currency, target); paidRows.push({ e, v }); if (v == null) paidSkipped++; else paid += v; });
    return { I, all, biz, names, filtered, B, allTotal, C, charges, years, paid, paidSkipped, paidRows, target, need, hasGeneral: biz.some(s => !I.clientOf(s)) };
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

  // ---- Excel file: a client-ready report with the same charts as the app ------------
  const TEAL = "FF0F4C4A", MUTE = "FF5B6E70", LINE = "FFD9E2E0", PAPER = "FFF3F6F5", INK = "FF16282C", WHITE = "FFFFFFFF", SUN = "FFF2B33D", SOFT = "FFBFD8D5";
  const solid = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const FB = "Calibri", FH = "Georgia";
  const PX = 736;                       // width of the report in pixels (8 columns)
  const K = { teal: "#0F4C4A", ink: "#16282C", mute: "#5B6E70", line: "#D9E2E0", sun: "#F2B33D", paper: "#F3F6F5" };
  const CH = "'Bricolage Grotesque', 'Trebuchet MS', Arial, sans-serif", CB = "'DM Sans', Calibri, Arial, sans-serif";

  // Charts are drawn on a canvas with the app's own colors and fonts, then placed in the sheet as pictures.
  function newCanvas(w, h) {
    const k = 2, mk = window.__mkCanvas || ((a, b) => { const x = document.createElement("canvas"); x.width = a; x.height = b; return x; });
    const c = mk(w * k, h * k), g = c.getContext("2d");
    g.scale(k, k); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    return { c, g, w, h };
  }
  const toPng = cv => cv.c.toDataURL("image/png");
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function frame(cv, title, sub) {
    const g = cv.g; rr(g, 1, 1, cv.w - 2, cv.h - 2, 14); g.strokeStyle = K.line; g.lineWidth = 1.5; g.stroke();
    g.textAlign = "left"; g.textBaseline = "alphabetic"; g.fillStyle = K.teal; g.font = "800 16px " + CH; g.fillText(title, 20, 31);
    if (sub) { g.fillStyle = K.mute; g.font = "400 12px " + CB; g.fillText(sub, 20, 50); }
  }
  const fit = (g, text, max) => { let t = String(text); if (g.measureText(t).width <= max) return t; while (t.length > 1 && g.measureText(t + "…").width > max) t = t.slice(0, -1); return t + "…"; };

  function chartLine(buckets, h, T) {
    const cv = newCanvas(PX, 290), g = cv.g, total = buckets.reduce((a, b) => a + b.total, 0), max = Math.max.apply(null, buckets.map(b => b.total)), tp = niceTop(max);
    frame(cv, "Expected charges, next 12 months", "Total " + h.money(total, T) + " · amounts in " + T);
    const x0 = 74, x1 = PX - 34, y0 = 238, y1 = 84, X = i => x0 + i * (x1 - x0) / 11, Y = v => y0 - v / tp * (y0 - y1);
    g.font = "400 11px " + CB; g.textAlign = "right"; g.textBaseline = "middle";
    [0, 1, 2, 3].forEach(k => { const v = tp * k / 3, y = Y(v); g.strokeStyle = K.line; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.fillStyle = K.mute; g.fillText(compact(v), x0 - 10, y); });
    const grad = g.createLinearGradient(0, y1, 0, y0); grad.addColorStop(0, "rgba(15,76,74,0.28)"); grad.addColorStop(1, "rgba(15,76,74,0.02)");
    g.beginPath(); g.moveTo(X(0), y0); buckets.forEach((b, i) => g.lineTo(X(i), Y(b.total))); g.lineTo(X(11), y0); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); buckets.forEach((b, i) => i ? g.lineTo(X(i), Y(b.total)) : g.moveTo(X(i), Y(b.total))); g.strokeStyle = K.teal; g.lineWidth = 2.5; g.lineJoin = "round"; g.stroke();
    buckets.forEach((b, i) => {
      const x = X(i), y = Y(b.total);
      if (b.total > 0) { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill(); g.lineWidth = 2.5; g.strokeStyle = K.teal; g.stroke(); g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillStyle = K.ink; g.font = "700 11px " + CB; g.fillText(compact(b.total), x, y - 11); }
      g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillStyle = K.mute; g.font = "400 12px " + CB; g.fillText(b.label, x, y0 + 22);
      if (i === 0 || b.label === "Jan") { g.font = "400 10px " + CB; g.fillText(b.key.slice(0, 4), x, y0 + 36); }
    });
    return toPng(cv);
  }

  function chartDonut(p, title, lines) {
    const cv = newCanvas(PX / 2 - 6, 200), g = cv.g; frame(cv, title);
    const cx = 92, cy = 122, r = 50, C = Math.PI * 2, v = Math.max(0, Math.min(1, p));
    g.lineWidth = 16; g.strokeStyle = K.line; g.beginPath(); g.arc(cx, cy, r, 0, C); g.stroke();
    if (v > 0) { g.strokeStyle = K.teal; g.lineCap = "round"; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + v * C); g.stroke(); g.lineCap = "butt"; }
    g.fillStyle = K.ink; g.font = "800 24px " + CH; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(pct(v), cx, cy + 1);
    g.textAlign = "left"; g.textBaseline = "alphabetic"; g.fillStyle = K.mute; g.font = "400 13px " + CB;
    lines.forEach((t, i) => g.fillText(t, 172, 112 + i * 19));
    return toPng(cv);
  }

  function chartBars(title, sub, rows, h, T) {
    const n = Math.max(1, rows.length), H = 66 + n * 36 + 8, cv = newCanvas(PX, H), g = cv.g; frame(cv, title, sub);
    const max = rows.length ? Math.max.apply(null, rows.map(x => x.v)) : 0, lx = 20, tx = 230, tw = PX - 230 - 150;
    rows.forEach((x, i) => {
      const y = 70 + i * 36;
      g.textAlign = "left"; g.textBaseline = "middle"; g.fillStyle = K.ink; g.font = "500 13px " + CB; g.fillText(fit(g, x.label, 196), lx, y + 9);
      rr(g, tx, y + 2, tw, 14, 7); g.fillStyle = "#E6EEEC"; g.fill();
      const w = max > 0 ? Math.max(14, x.v / max * tw) : 0; if (w) { rr(g, tx, y + 2, w, 14, 7); g.fillStyle = K.teal; g.fill(); }
      g.textAlign = "right"; g.fillStyle = K.ink; g.font = "700 13px " + CB; g.fillText(h.money(x.v, T), PX - 20, y + 9);
    });
    return toPng(cv);
  }

  function buildXlsx(X, d, h) {
    const I = d.I, T = d.target, B = d.B, top = B.top[0], m = n => h.money(n, T);
    const money = '"' + T + ' "#,##0.00', num = "#,##0.00";
    const wb = new X.Workbook(); wb.creator = h.cfg.name; wb.created = new Date();
    const ws = wb.addWorksheet("Business report", { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.7, header: 0.3, footer: 0.3 } } });
    ws.headerFooter.oddFooter = "&L&8" + h.cfg.name + " · Business spending report&R&8Page &P of &N";
    ws.columns = Array.from({ length: 8 }, () => ({ width: 13 }));
    let r = 1;
    const who = S.client === "all" ? "All clients and projects" : S.client === I.GENERAL_KEY ? "General (no client)" : S.client;

    // put(): write one cell, optionally merged across columns c1..c2. Style goes on the first cell after merging.
    const put = (row, c1, c2, value, o) => {
      o = o || {}; if (c2 > c1) ws.mergeCells(row, c1, row, c2);
      const x = ws.getCell(row, c1); x.value = value;
      x.font = o.font || { name: FB, size: 11, color: { argb: INK } };
      x.alignment = o.al || { vertical: "middle" };
      if (o.fill) x.fill = solid(o.fill); if (o.border) x.border = o.border; if (o.fmt) x.numFmt = o.fmt;
      return x;
    };
    const rowH = (row, pt) => { ws.getRow(row).height = pt; };

    // ----- Title band
    rowH(r, 6); for (let c = 1; c <= 8; c++) ws.getCell(r, c).fill = solid(SUN); r++;
    put(r, 1, 8, "Business spending report", { font: { name: FH, size: 26, bold: true, color: { argb: WHITE } }, fill: TEAL, al: { vertical: "middle", indent: 1 } }); rowH(r, 50); r++;
    put(r, 1, 8, "Prepared for: " + who, { font: { name: FB, size: 13, color: { argb: SOFT } }, fill: TEAL, al: { vertical: "middle", indent: 1 } }); rowH(r, 22); r++;
    put(r, 1, 8, "Created " + h.fmtDate(h.today) + "  ·  All amounts in " + T + "  ·  Prepared with " + h.cfg.name, { font: { name: FB, size: 10, color: { argb: SOFT } }, fill: TEAL, al: { vertical: "middle", indent: 1 } }); rowH(r, 22); r++;
    rowH(r, 4); for (let c = 1; c <= 8; c++) ws.getCell(r, c).fill = solid(SUN); r += 2;

    const section = text => { put(r, 1, 8, text, { font: { name: FH, size: 15, bold: true, color: { argb: TEAL } }, border: { bottom: { style: "medium", color: { argb: SUN } } }, al: { vertical: "middle" } }); rowH(r, 28); r++; rowH(r, 6); r++; };
    const note = (text, size, italic) => { put(r, 1, 8, text, { font: { name: FB, size: size || 10, italic: italic !== false, color: { argb: MUTE } }, al: { wrapText: true, vertical: "top" } }); rowH(r, Math.max(16, Math.ceil(text.length / 118) * 14)); r++; };
    const picture = (dataUrl, col, row0, w, hh) => {
      const id = wb.addImage({ base64: dataUrl, extension: "png" });
      ws.addImage(id, { tl: { col, row: row0 - 1 }, ext: { width: w, height: hh }, editAs: "oneCell" });
    };
    const reserve = hh => { const n = Math.ceil(hh / 20); for (let i = 0; i < n; i++) rowH(r + i, 15); const at = r; r += n + 1; return at; };

    // ----- Summary cards
    const share = d.allTotal > 0 ? B.total / d.allTotal : 0;
    const withClient = d.biz.length ? d.biz.filter(s => I.clientOf(s)).length / d.biz.length : 0;
    const up = I.upcoming(d.filtered, firstOfMonth(h.today), 365, h.addPeriods, "business").filter(u => u.date >= h.today).sort((a, b) => a.date.localeCompare(b.date));
    const next = up[0];
    const card = (r0, c1, label, value, fmt, sub) => {
      const bd = { left: { style: "thick", color: { argb: WHITE } }, right: { style: "thick", color: { argb: WHITE } } };
      put(r0, c1, c1 + 1, label.toUpperCase(), { font: { name: FB, size: 9, bold: true, color: { argb: MUTE } }, fill: PAPER, border: Object.assign({ top: { style: "medium", color: { argb: TEAL } } }, bd), al: { vertical: "bottom", indent: 1 } });
      put(r0 + 1, c1, c1 + 1, value, { font: { name: FH, size: 17, bold: true, color: { argb: INK } }, fill: PAPER, border: bd, fmt, al: { vertical: "middle", horizontal: "left", indent: 1, shrinkToFit: true } });
      put(r0 + 2, c1, c1 + 1, sub || "", { font: { name: FB, size: 9, italic: true, color: { argb: MUTE } }, fill: PAPER, border: bd, al: { vertical: "top", indent: 1, shrinkToFit: true } });
    };
    section("Summary");
    card(r, 1, "Per month", round2(B.total), money, "Business subscriptions");
    card(r, 3, "Per year (estimate)", round2(B.total * 12), money, "Monthly cost × 12");
    card(r, 5, "Biggest cost", top ? top.name : "None", null, top ? m(top.monthly) + " per month" : "");
    card(r, 7, "Business tools", B.count, "0", "Active subscriptions");
    rowH(r, 20); rowH(r + 1, 32); rowH(r + 2, 18); r += 3; rowH(r, 6); r++;
    card(r, 1, "Share of all spending", share, "0%", "Business vs. everything saved");
    card(r, 3, "Paid in " + S.year, round2(d.paid), money, "Renewals confirmed in the app");
    card(r, 5, "Clients and projects", d.names.length, "0", d.names.length ? "Each with its own cost" : "None named yet");
    card(r, 7, "Next renewal", next ? next.sub.name : "None", null, next ? h.fmtDate(next.date) : "");
    rowH(r, 20); rowH(r + 1, 32); rowH(r + 2, 18); r += 3; rowH(r, 10); r++;
    if (B.unpriced) note(B.unpriced + " subscription" + (B.unpriced > 1 ? "s are" : " is") + " not counted: price, currency or billing period is missing.");
    if (B.unconverted || d.charges.skipped || d.paidSkipped) note("Some amounts are left out because exchange rates didn’t load.");

    // ----- Key points in plain English
    const bk = d.charges.buckets, total12 = bk.reduce((a, b) => a + b.total, 0), peak = bk.reduce((a, b) => b.total > a.total ? b : a, bk[0]);
    const pts = [`${who === "All clients and projects" ? "Your" : who + "’s"} business subscriptions cost about ${m(B.total)} per month, which is roughly ${m(B.total * 12)} per year.`];
    if (top) pts.push(`The biggest cost is ${top.name} at ${m(top.monthly)} per month, ${pct(top.share)} of the total.`);
    if (d.names.length && d.C.rows.length) pts.push(`${d.C.rows[0].label} carries the highest cost of any client or project at ${m(d.C.rows[0].monthly)} per month (${pct(d.C.rows[0].share)}).`);
    if (total12 > 0) pts.push(`About ${m(total12)} in charges is expected over the next 12 months. The heaviest month is ${new Date(Number(peak.key.slice(0, 4)), Number(peak.key.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}, at about ${m(peak.total)}.`);
    if (next) pts.push(`The next renewal is ${next.sub.name} on ${h.fmtDate(next.date)}.`);
    r++; section("At a glance");
    pts.forEach(t => { put(r, 1, 8, "●  " + t, { font: { name: FB, size: 11, color: { argb: INK } }, al: { wrapText: true, vertical: "middle", indent: 1 } }); rowH(r, Math.max(20, Math.ceil(t.length / 100) * 17)); r++; });
    r++;

    // ----- Charts
    section("Charts");
    let hh = 290, at = reserve(hh);
    if (total12 > 0) picture(chartLine(bk, h, T), 0, at, PX, hh);
    else { r -= Math.ceil(hh / 20) + 1; note("Nothing to chart yet. Add a renewal date and price to your business subscriptions."); r++; }
    ws.getRow(r - 1).addPageBreak();
    hh = 200; at = reserve(hh);
    picture(chartDonut(share, "Business share of spending", ["of all your subscription", "spending is for business"]), 0, at, PX / 2 - 6, hh);
    picture(chartDonut(withClient, "Tools with a client", ["of your business tools", "are linked to a client"]), 4, at, PX / 2 - 6, hh);
    hh = 66 + Math.max(1, B.top.length) * 36 + 8; at = reserve(hh);
    picture(chartBars("Biggest costs per month", "Your five most expensive business tools", B.top.map(x => ({ label: x.name, v: x.monthly })), h, T), 0, at, PX, hh);
    hh = 66 + Math.max(1, d.C.rows.length) * 36 + 8; at = reserve(hh);
    picture(chartBars("Cost by client or project, per month", d.names.length ? "Monthly cost of the tools used for each client" : "Add a client name to a Business subscription to see this", d.C.rows.map(x => ({ label: x.label, v: x.monthly })), h, T), 0, at, PX, hh);

    // ----- Tables
    const thead = (cols) => { cols.forEach(c => put(r, c[0], c[1], c[2], { font: { name: FB, size: 10, bold: true, color: { argb: WHITE } }, fill: TEAL, al: { vertical: "middle", horizontal: c[3] || "left", indent: 1, wrapText: true } })); rowH(r, 26); r++; };
    const tcell = (c1, c2, v, i, o) => put(r, c1, c2, v, Object.assign({ font: { name: FB, size: 10, color: { argb: INK } }, fill: i % 2 ? PAPER : WHITE, border: { bottom: { style: "hair", color: { argb: LINE } } }, al: { vertical: "middle", indent: 1, wrapText: true, horizontal: "left" } }, o || {}));
    const tend = (label, cols) => { put(r, 1, 3, label, { font: { name: FB, size: 10, bold: true, color: { argb: INK } }, border: { top: { style: "thin", color: { argb: TEAL } } }, al: { vertical: "middle", indent: 1 } }); cols.forEach(c => put(r, c[0], c[1], c[2], { font: { name: FB, size: 10, bold: true, color: { argb: INK } }, border: { top: { style: "thin", color: { argb: TEAL } } }, fmt: c[3], al: { vertical: "middle", horizontal: "right", indent: 1 } })); rowH(r, 22); r++; };
    const capital = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : "";

    r++; section("Spending by category");
    thead([[1, 2, "Category"], [3, 3, "Tools", "right"], [4, 5, "Per month (" + T + ")", "right"], [6, 6, "Share", "right"], [7, 8, "Proportion"]]);
    B.byCat.forEach((c, i) => {
      tcell(1, 2, c.label, i); tcell(3, 3, c.count, i, { fmt: "0", al: { vertical: "middle", horizontal: "right", indent: 1 } });
      tcell(4, 5, round2(c.monthly), i, { fmt: num, al: { vertical: "middle", horizontal: "right", indent: 1 } });
      tcell(6, 6, c.share, i, { fmt: "0%", al: { vertical: "middle", horizontal: "right", indent: 1 } });
      tcell(7, 8, "█".repeat(Math.max(1, Math.round(c.share * 16))), i, { font: { name: FB, size: 10, color: { argb: TEAL } } });
      rowH(r, 20); r++;
    });
    tend("Total", [[4, 5, round2(B.total), num]]);

    r++; ws.getRow(r - 1).addPageBreak(); section("Subscription details");
    const sr = subRows(d), det = d.filtered.map(s => { const mo = I.monthly(s), v = mo == null ? null : h.convert(mo, s.currency, T); return { s, v }; }).sort((a, b) => (b.v || 0) - (a.v || 0));
    thead([[1, 2, "Subscription"], [3, 3, "Client"], [4, 4, "Category"], [5, 5, "Billed"], [6, 6, "Price", "right"], [7, 7, "Monthly (" + T + ")", "right"], [8, 8, "Next renewal"]]);
    det.forEach((x, i) => {
      const s = x.s, rt = { al: { vertical: "middle", horizontal: "right", indent: 1 } };
      tcell(1, 2, s.name + (s.plan ? " · " + s.plan : ""), i); tcell(3, 3, I.clientOf(s) || "General", i); tcell(4, 4, I.catLabel(I.catOf(s)), i); tcell(5, 5, capital(s.freq), i);
      tcell(6, 6, s.amount == null || s.amount === "" ? "—" : (s.currency || "") + " " + Number(s.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), i, rt);
      tcell(7, 7, x.v == null ? "—" : round2(x.v), i, Object.assign({ fmt: num }, rt)); tcell(8, 8, s.date ? h.fmtDate(s.date) : "—", i);
      rowH(r, 28); r++;
    });
    tend("Total per month", [[7, 7, round2(sr.mt), num]]);

    r++; section("Payments confirmed in " + S.year);
    if (d.paidRows.length) {
      thead([[1, 1, "Date"], [2, 3, "Service"], [4, 5, "Client"], [6, 6, "Paid", "right"], [7, 8, "In " + T, "right"]]);
      d.paidRows.forEach((x, i) => {
        const e = x.e, rt = { al: { vertical: "middle", horizontal: "right", indent: 1 } };
        tcell(1, 1, h.fmtDate(e.date), i); tcell(2, 3, e.name || e.service || "", i); tcell(4, 5, e.client || "General", i);
        tcell(6, 6, e.currency + " " + Number(e.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), i, rt);
        tcell(7, 8, x.v == null ? "—" : round2(x.v), i, Object.assign({ fmt: num }, rt)); rowH(r, 22); r++;
      });
      tend("Total paid", [[7, 8, round2(d.paid), num]]);
    } else note("No renewals have been confirmed in the app for " + S.year + " yet.");

    r++; note("These are estimates from the prices saved in " + h.cfg.name + ", shown in " + T + " at about today’s exchange rates. " + h.cfg.name + " doesn’t give tax advice. Ask your accountant what you can claim.", 9);

    // ----- Sheet 2: the same subscriptions as plain, filterable rows
    const w2 = wb.addWorksheet("Data", { views: [{ state: "frozen", ySplit: 1 }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    w2.columns = [{ width: 26 }, { width: 22 }, { width: 18 }, { width: 16 }, { width: 11 }, { width: 12 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 11 }];
    const hr = w2.addRow(sr.head);
    hr.eachCell(c => { c.font = { name: FB, bold: true, color: { argb: WHITE } }; c.fill = solid(TEAL); c.alignment = { vertical: "middle", wrapText: true }; });
    hr.height = 32; sr.rows.forEach(x => w2.addRow(x));
    const tr = w2.addRow(["Total", "", "", "", "", "", "", round2(sr.mt), round2(sr.yt), "", ""]);
    tr.font = { name: FB, bold: true }; tr.eachCell(c => { c.border = { top: { style: "thin", color: { argb: TEAL } } }; });
    [6, 8, 9].forEach(k => { w2.getColumn(k).numFmt = num; w2.getColumn(k).alignment = { horizontal: "right" }; });
    [6, 8, 9].forEach(k => { hr.getCell(k).alignment = { horizontal: "right", vertical: "middle", wrapText: true }; });
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
      const X = await loadExcel();
      try { if (document.fonts && document.fonts.load) await Promise.race([Promise.all(["800 16px 'Bricolage Grotesque'", "400 12px 'DM Sans'", "500 13px 'DM Sans'", "700 13px 'DM Sans'"].map(f => document.fonts.load(f))), new Promise(ok => setTimeout(ok, 2500))]); } catch (e) {}
      const wb = buildXlsx(X, compute(H), H), buf = await wb.xlsx.writeBuffer();
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
