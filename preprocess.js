// Local image clean-up for screenshots, plus text clean-up for what the reader returns.
// Everything here runs on the device. Pure functions: they take pixel data and return pixel data.
(function (root) {
  // ---- helpers -------------------------------------------------------------
  function toGray(rgba, n) {
    const g = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) g[i] = (rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114 + 0.5) | 0;
    return g;
  }
  function histogram(g) { const h = new Uint32Array(256); for (let i = 0; i < g.length; i++) h[g[i]]++; return h; }

  // 1. Dark mode check: if most of the picture is dark, flip it so text is dark on a light page.
  function isDark(h, n) {
    let acc = 0; for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= n / 2) return v < 110; }
    return false;
  }
  // 2. Contrast: stretch so the darkest 1% becomes black and the lightest 1% becomes white.
  function stretch(g, h) {
    const n = g.length; let lo = 0, hi = 255, acc = 0;
    while (lo < 254 && (acc += h[lo]) < n * 0.01) lo++;
    acc = 0; while (hi > 1 && (acc += h[hi]) < n * 0.01) hi--;
    const span = Math.max(1, hi - lo), lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, ((v - lo) * 255) / span));
    for (let i = 0; i < n; i++) g[i] = lut[g[i]];
  }
  // Otsu: picks the single black/white cut-off that best separates two groups of grey levels.
  function otsu(h, n) {
    let sum = 0; for (let v = 0; v < 256; v++) sum += v * h[v];
    let wB = 0, sumB = 0, best = 0, th = 128;
    for (let v = 0; v < 256; v++) {
      wB += h[v]; if (!wB) continue; const wF = n - wB; if (!wF) break;
      sumB += v * h[v]; const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; th = v; }
    }
    return th;
  }
  // Local average of every pixel's neighbourhood, using an "integral image" so it stays fast.
  function localMean(g, w, h, r) {
    const W = w + 1, I = new Uint32Array(W * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const s = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
        m[y * w + x] = (s / ((x1 - x0) * (y1 - y0)) + 0.5) | 0;
      }
    }
    return m;
  }

  // ---- the pipeline -----------------------------------------------------------
  // variant: "gray"      grayscale + dark-mode flip + contrast
  //          "otsu"      the above + one global black/white cut-off
  //          "adaptive"  the above + a cut-off that adapts to each area (good for uneven backgrounds)
  function run(img, variant) {
    const w = img.width, h = img.height, n = w * h, d = img.data;
    const g = toGray(d, n); let hist = histogram(g);
    const dark = isDark(hist, n);
    if (dark) for (let i = 0; i < n; i++) g[i] = 255 - g[i];
    hist = histogram(g); stretch(g, hist); hist = histogram(g);
    let out = g;
    if (variant === "otsu") {
      const th = otsu(hist, n); out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = g[i] > th ? 255 : 0;
    } else if (variant === "adaptive") {
      const m = localMean(g, w, h, Math.max(10, Math.round(w / 25))); out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = g[i] < m[i] - 14 ? 0 : 255;
    }
    const res = new Uint8ClampedArray(n * 4);
    for (let i = 0, p = 0; i < n; i++, p += 4) { res[p] = res[p + 1] = res[p + 2] = out[i]; res[p + 3] = 255; }
    return { data: res, width: w, height: h, dark };
  }

  // ---- text clean-up -------------------------------------------------------------
  const NUMTOK = /^[₦$€£₹#]?[\dOoQDIl|]+(?:[.,][\dOoQDIl|]+)*$/;
  function fixNumber(tok) {
    if ((tok.match(/\d/g) || []).length < 2 || !NUMTOK.test(tok)) return tok;
    return tok.replace(/[OoQD]/g, "0").replace(/[Il|]/g, "1");
  }
  // Tesseract has no ₦ glyph, so it reads it as § ¥ W # N, or even a digit (₦4,400.00 -> 84,400.00).
  // We only repair a price when the same screenshot has a price with a clear naira sign (# N ₦),
  // and every repair is reported so the app can tell the person to check it.
  const NAIRA_PRICE = /(^|\s)(?:[#₦N]|NGN\s?)\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?=\s|$)/;
  function clean(raw) {
    const lines = String(raw || "")
      .normalize("NFKC")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF\uFFFD]/g, "")
      .replace(/[‘’‚‛`´]/g, "'").replace(/[“”„]/g, '"').replace(/[–—−]/g, "-")
      .split(/\r?\n/);
    const out = [];
    for (let line of lines) {
      line = line.replace(/\t/g, " ")
        .split(/\s+/).filter(Boolean)
        .filter(t => !/^[|¦_~=^{}\[\]\\<>«»•·]+$/.test(t))   // lone border/box characters
        .map(fixNumber).join(" ")
        .replace(/(\d),\s(\d{3})/g, "$1,$2")                   // "4, 400" -> "4,400"
        .replace(/\bS(\d{1,3}(?:,\d{3})*\.\d{2})\b/g, "$$$1") // "S9.99" -> "$9.99"
        .trim();
      const alnum = (line.match(/[A-Za-z0-9]/g) || []).length;
      if (alnum < 2) continue;                                  // nothing readable
      if (line.length > 3 && (line.length - alnum - (line.match(/ /g) || []).length) / line.length > 0.6) continue; // mostly symbols
      out.push(line);
    }
    const repairs = [];
    const hasNaira = out.some(l => NAIRA_PRICE.test(l));
    const commaStyle = out.some(l => /\d,\d{3}\.\d{2}\b/.test(l));
    if (hasNaira) {
      for (let i = 0; i < out.length; i++) {
        out[i] = out[i].split(" ").map(tok => {
          let m;
          if ((m = tok.match(/^[§¥W]((?:\d{1,3}(?:,\d{3})*)\.\d{2})$/)) ||            // wrong symbol glued to a price
              (m = tok.match(/^[84](\d{1,3}(?:,\d{3})+\.\d{2})$/)) ||                   // a digit read instead of ₦ (84,400.00)
              (commaStyle && (m = tok.match(/^[84](\d{3}\.\d{2})$/)))) {                // same, with no comma (8449.00)
            repairs.push({ from: tok, core: m[1] }); return "#" + m[1];
          }
          return tok;
        }).join(" ");
      }
    }
    return { text: out.join("\n"), repairs };
  }
  const cleanText = raw => clean(raw).text;

  const api = { run, clean, cleanText, fixNumber };
  root.Preprocess = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
