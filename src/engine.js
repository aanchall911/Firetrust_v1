/* FireTrust engine: parsing, harmonization, trust score, anomaly flags, season shift.
   Plain JavaScript, no dependencies. Works in the browser and in Node (for testing). */
const FT = (function () {
  'use strict';
  const DAY = 864e5;
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dayOf = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY);
  const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const yearLen = y => (isLeap(y) ? 366 : 365);
  const infoCache = new Map();
  function info(day) {
    let o = infoCache.get(day);
    if (!o) { const y = new Date(day * DAY).getUTCFullYear(); o = { y, doy: day - dayOf(y, 1, 1) }; infoCache.set(day, o); }
    return o;
  }
  const fmtDate = day => { const d = new Date(day * DAY); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
  const fmtDateY = day => fmtDate(day) + ' ' + new Date(day * DAY).getUTCFullYear();
  const isoDate = day => new Date(day * DAY).toISOString().slice(0, 10);

  /* ---------- seeded random numbers (for reproducible sample data) ---------- */
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function pois(r, l) {
    if (l <= 0) return 0;
    if (l < 30) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
    return Math.max(0, Math.round(l + Math.sqrt(l) * gauss(r)));
  }
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  /* ---------- confidence handling ---------- */
  function isLowConf(c) {
    const s = String(c == null ? '' : c).trim().toLowerCase();
    if (!s) return false;
    if (/^\d/.test(s)) return Number(s) < 30;
    return s[0] === 'l';
  }

  /* ---------- CSV parsing (FIRMS format), chunk friendly ---------- */
  class CsvParser {
    constructor(bbox) {
      this.bbox = bbox || null; this.buf = ''; this.h = null;
      this.points = []; this.rows = 0; this.skipped = 0; this.outside = 0;
      this.minDay = Infinity; this.maxDay = -Infinity; this.sats = new Set();
    }
    push(chunk, final) {
      this.buf += chunk;
      const lines = this.buf.split(/\r?\n/);
      this.buf = final ? '' : lines.pop();
      for (let i = 0; i < lines.length; i++) this.line(lines[i]);
    }
    line(ln) {
      if (!ln) return;
      if (!this.h) {
        const cols = ln.replace(/^\uFEFF/, '').split(',').map(s => s.trim().toLowerCase());
        const h = { lat: cols.indexOf('latitude'), lon: cols.indexOf('longitude'), date: cols.indexOf('acq_date'), conf: cols.indexOf('confidence'), sat: cols.indexOf('satellite') };
        const miss = [];
        if (h.lat < 0) miss.push('latitude'); if (h.lon < 0) miss.push('longitude'); if (h.date < 0) miss.push('acq_date');
        if (miss.length) throw new Error('This does not look like a NASA FIRMS CSV. Missing column(s): ' + miss.join(', ') + '.');
        this.h = h; return;
      }
      const f = ln.split(','), h = this.h;
      const ds = f[h.date];
      if (!ds || ds.length < 10) { this.skipped++; return; }
      const day = dayOf(+ds.substr(0, 4), +ds.substr(5, 2), +ds.substr(8, 2));
      const lat = +f[h.lat], lon = +f[h.lon];
      if (day !== day || lat !== lat || lon !== lon) { this.skipped++; return; }
      this.rows++;
      if (day < this.minDay) this.minDay = day;
      if (day > this.maxDay) this.maxDay = day;
      if (h.sat >= 0) this.sats.add((f[h.sat] || '').trim());
      const b = this.bbox;
      if (b && (lat < b.minLat || lat > b.maxLat || lon < b.minLon || lon > b.maxLon)) { this.outside++; return; }
      this.points.push({ d: day, lat, lon, low: isLowConf(h.conf >= 0 ? f[h.conf] : '') });
    }
    result() { return { points: this.points, range: this.rows ? [this.minDay, this.maxDay] : null, rows: this.rows, skipped: this.skipped, outside: this.outside, sats: [...this.sats] }; }
  }
  function parseCsvText(text, bbox) { const p = new CsvParser(bbox); p.push(text, true); return p.result(); }

  /* ---------- sample data (synthetic, clearly labelled in the app) ---------- */
  function generateSample(opts) {
    opts = opts || {};
    const endDay = opts.endDay != null ? opts.endDay : dayOf(2026, 11, 12);
    const startM = dayOf(2008, 1, 1), startV = dayOf(2012, 1, 20);
    const rc = mulberry32(42);
    const clusters = []; let tot = 0;
    for (let i = 0; i < 32; i++) { const w = Math.pow(rc(), 2) + 0.05; tot += w; clusters.push({ lat: 29.8 + rc() * 2.4, lon: 74.0 + rc() * 2.8, w }); }
    let acc = 0; clusters.forEach(c => { acc += c.w / tot; c.cum = acc; });
    const pick = r => { const u = r(); for (const c of clusters) if (u <= c.cum) return c; return clusters[clusters.length - 1]; };
    const M = [], V = [];
    for (let y = 2008; y <= 2026; y++) {
      const ry = mulberry32(1000 + y), rd = mulberry32(5000 + y);
      const f1 = Math.exp(0.25 * gauss(ry)) * (y === 2026 ? 1.35 : 1);
      const f2 = Math.exp(0.3 * gauss(ry));
      const c1 = 306 - 0.5 * (y - 2008) + 2.5 * gauss(ry);
      const c2 = 118 + 3 * gauss(ry);
      const pM = y > 2020 ? 0.36 - 0.006 * (y - 2020) : 0.36, pV = 0.9;
      const n = yearLen(y), y0 = dayOf(y, 1, 1);
      let wM = 1, wV = 1;
      for (let doy = 0; doy < n; doy++) {
        const day = y0 + doy; if (day > endDay) break;
        if (doy % 7 === 0) { wM = Math.exp(0.35 * gauss(rd)); wV = Math.exp(0.2 * gauss(rd)); }
        const gap = (y === 2021 && doy >= 296 && doy <= 310) ? 0.4 : 1; // a short stretch of missing MODIS swaths
        const inM = day >= startM, inV = day >= startV; if (!inM && !inV) continue;
        const lam = 0.5 + 130 * f1 * Math.exp(-Math.pow((doy - c1) / 11, 2) / 2) + 22 * f2 * Math.exp(-Math.pow((doy - c2) / 9, 2) / 2);
        const nt = pois(rd, lam);
        for (let k = 0; k < nt; k++) {
          const cl = pick(rd);
          const lat = Math.round(clamp(cl.lat + 0.12 * gauss(rd), 29.5, 32.5) * 1000) / 1000;
          const lon = Math.round(clamp(cl.lon + 0.12 * gauss(rd), 73.9, 77.0) * 1000) / 1000;
          if (inM && rd() < clamp(pM * wM * gap, 0, 1)) { const low = rd() < 0.12; M.push({ d: day, lat, lon, low, c: low ? 10 + Math.floor(rd() * 20) : 30 + Math.floor(rd() * 70) }); }
          if (inV && rd() < clamp(pV * wV, 0, 1)) { const low = rd() < 0.12; V.push({ d: day, lat, lon, low, c: low ? 'l' : (rd() < 0.3 ? 'h' : 'n') }); }
        }
      }
    }
    return { M, V, rM: [[startM, endDay]], rV: [[startV, endDay]], endDay };
  }

  function toFirmsCsv(points, sensor) {
    const rr = mulberry32(99);
    const head = sensor === 'M'
      ? 'latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight'
      : 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';
    const out = [head];
    for (const p of points) {
      const hh = 5 + Math.floor(rr() * 4), mm = Math.floor(rr() * 60);
      const time = String(hh).padStart(2, '0') + String(mm).padStart(2, '0');
      const frp = (3 + rr() * 40).toFixed(1);
      if (sensor === 'M') out.push([p.lat, p.lon, (310 + rr() * 40).toFixed(1), '1.0', '1.0', isoDate(p.d), time, rr() < 0.5 ? 'Terra' : 'Aqua', 'MODIS', p.c, '6.1NRT', (295 + rr() * 15).toFixed(1), frp, 'D'].join(','));
      else out.push([p.lat, p.lon, (320 + rr() * 40).toFixed(1), '0.4', '0.4', isoDate(p.d), time, 'N', 'VIIRS', p.c, '2.0NRT', (290 + rr() * 15).toFixed(1), frp, 'D'].join(','));
    }
    return out.join('\n') + '\n';
  }

  /* ---------- helpers ---------- */
  function mergeRanges(r) {
    r = (r || []).slice().sort((a, b) => a[0] - b[0]);
    const o = [];
    for (const x of r) { if (o.length && x[0] <= o[o.length - 1][1] + 1) o[o.length - 1][1] = Math.max(o[o.length - 1][1], x[1]); else o.push([x[0], x[1]]); }
    return o;
  }
  const inR = (r, d) => { for (const x of r) if (d >= x[0] && d <= x[1]) return true; return false; };
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  function sd(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); }
  function pearson(x, y) {
    const n = x.length; if (n < 3) return null;
    const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function percentile(a, p) { if (!a.length) return 1; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
  const cellId = (lat, lon, c) => Math.floor((lat + 90) / c) * 100000 + Math.floor((lon + 180) / c);
  const TRUST = { high: 0.7, medium: 0.45 };
  const BIN = 5;

  /* ---------- main analysis ---------- */
  function analyse(M, V, rM, rV, opts) {
    opts = opts || {};
    const cell = opts.cell || 0.25, ignoreLow = opts.ignoreLow !== false;
    rM = mergeRanges(rM); rV = mergeRanges(rV);
    const warnings = [];
    if (!rM.length && !rV.length) throw new Error('No dates found in the files.');
    const m = ignoreLow ? M.filter(p => !p.low) : M, v = ignoreLow ? V.filter(p => !p.low) : V;
    const all = rM.concat(rV);
    const minDay = Math.min.apply(null, all.map(x => x[0])), maxDay = Math.max.apply(null, all.map(x => x[1]));
    const nD = maxDay - minDay + 1;
    const cM = new Int32Array(nD), cV = new Int32Array(nD), covM = new Uint8Array(nD), covV = new Uint8Array(nD);
    for (let i = 0; i < nD; i++) { covM[i] = inR(rM, minDay + i) ? 1 : 0; covV[i] = inR(rV, minDay + i) ? 1 : 0; }
    const sets = new Map();
    function add(p, isM) {
      const i = p.d - minDay; if (i < 0 || i >= nD) return;
      (isM ? cM : cV)[i]++;
      const di = info(p.d), key = di.y * 100 + Math.floor(di.doy / 7);
      let o = sets.get(key); if (!o) { o = { m: new Set(), v: new Set() }; sets.set(key, o); }
      (isM ? o.m : o.v).add(cellId(p.lat, p.lon, cell));
    }
    m.forEach(p => add(p, true)); v.forEach(p => add(p, false));

    // calibration on overlap days
    let sM = 0, sV = 0, overlapDays = 0; const byY = {};
    for (let i = 0; i < nD; i++) if (covM[i] && covV[i]) {
      overlapDays++; sM += cM[i]; sV += cV[i];
      const y = info(minDay + i).y; const o = byY[y] || (byY[y] = { m: 0, v: 0, n: 0 }); o.m += cM[i]; o.v += cV[i]; o.n++;
    }
    let k = 1, calibrated = false;
    if (overlapDays >= 60 && sM >= 20 && sV >= 20) { k = sM / sV; calibrated = true; }
    else if (rM.length && rV.length) warnings.push('The two sensors overlap on too few days to calibrate, so VIIRS is not scaled. Add more years of both sensors.');
    else warnings.push('Only one sensor was loaded, so there is nothing to cross-check. Add the other sensor to get a trust score.');
    const kBy = {}; Object.keys(byY).forEach(y => { const o = byY[y]; if (o.n >= 100 && o.v >= 30) kBy[y] = o.m / o.v; });
    const kVals = Object.values(kBy);

    // daily harmonized series per year
    const y0 = info(minDay).y, y1 = info(maxDay).y, years = [];
    const DY = {};
    for (let y = y0; y <= y1; y++) {
      years.push(y);
      const len = yearLen(y), base = dayOf(y, 1, 1);
      const o = { len, base, m: new Int32Array(len), v: new Int32Array(len), cm: new Uint8Array(len), cv: new Uint8Array(len), h: new Float32Array(len).fill(NaN) };
      for (let d = 0; d < len; d++) {
        const i = base + d - minDay; if (i < 0 || i >= nD) continue;
        o.m[d] = cM[i]; o.v[d] = cV[i]; o.cm[d] = covM[i]; o.cv[d] = covV[i];
        o.h[d] = covM[i] && covV[i] ? (cM[i] + k * cV[i]) / 2 : covM[i] ? cM[i] : covV[i] ? k * cV[i] : NaN;
      }
      DY[y] = o;
    }

    // weekly records (7-day blocks counted from 1 Jan; the 1-2 day leftover is a stub)
    const weeks = {};
    for (const y of years) {
      const o = DY[y], arr = [];
      for (let w = 0; w < 53; w++) {
        const a = w * 7, b = Math.min(a + 6, o.len - 1);
        const rec = { y, w, start: o.base + a, end: o.base + b, stub: w === 52, complete: false, m: 0, v: 0, h: NaN, mode: 'none', level: null, agree: null, sim: null, mu: null, z: null, flag: null };
        let ok = true, allM = true, allV = true;
        for (let d = a; d <= b; d++) { rec.m += o.m[d]; rec.v += o.v[d]; if (o.h[d] !== o.h[d]) ok = false; if (!o.cm[d]) allM = false; if (!o.cv[d]) allV = false; }
        rec.complete = ok && rec.end <= maxDay && !rec.stub;
        rec.mode = allM && allV ? 'both' : allM ? 'M' : allV ? 'V' : 'mixed';
        if (ok) { let s = 0; for (let d = a; d <= b; d++) s += o.h[d]; rec.h = s; }
        if (rec.complete && rec.mode === 'both') {
          const cm = rec.m, cv = k * rec.v, total = cm + cv;
          if (total < 8) rec.level = 'few';
          else {
            const st = sets.get(y * 100 + w) || { m: new Set(), v: new Set() };
            let inter = 0; st.m.forEach(c => { if (st.v.has(c)) inter++; });
            const denom = Math.min(st.m.size, st.v.size);
            rec.sim = Math.min(cm, cv) / Math.max(cm, cv);
            rec.agree = denom ? inter / denom : 0;
            const score = 0.5 * rec.sim + 0.5 * rec.agree; rec.score = score;
            rec.level = score >= TRUST.high ? 'high' : score >= TRUST.medium ? 'medium' : 'low';
          }
        }
        arr.push(rec);
      }
      weeks[y] = arr;
    }
    // anomaly flags against the same week in other years
    for (let w = 0; w < 52; w++) {
      const vals = years.filter(y => weeks[y][w].complete).map(y => ({ y, h: weeks[y][w].h }));
      for (const it of vals) {
        const others = vals.filter(x => x.y !== it.y).map(x => x.h);
        if (others.length < 4) continue;
        const mu = mean(others), sdE = Math.max(sd(others), Math.sqrt(Math.max(mu, 1)));
        const rec = weeks[it.y][w]; rec.mu = mu; rec.z = (it.h - mu) / sdE;
        if (rec.z >= 1.5 && it.h >= 10) rec.flag = 'high'; else if (rec.z <= -1.5 && mu >= 10) rec.flag = 'low';
      }
    }
    // agreement between sensors, week by week
    const px = [], py = [];
    years.forEach(y => weeks[y].forEach(r => { if (r.complete && r.mode === 'both') { px.push(r.m); py.push(r.v); } }));
    const r = pearson(px, py);

    // rings: 5-day bins
    const nb = Math.ceil(366 / BIN), rings = {};
    const posBins = [];
    for (const y of years) {
      const o = DY[y], bins = new Array(nb).fill(NaN);
      for (let d = 0; d < o.len; d++) { if (o.h[d] === o.h[d]) { const b = Math.min(nb - 1, Math.floor(d / BIN)); bins[b] = (bins[b] !== bins[b] ? 0 : bins[b]) + o.h[d]; } }
      bins.forEach(x => { if (x > 0) posBins.push(x); });
      rings[y] = bins;
    }
    const dailyPos = []; years.forEach(y => { const h = DY[y].h; for (let d = 0; d < h.length; d++) if (h[d] > 0) dailyPos.push(h[d]); });

    const sats = opts.satsV || [];
    if (sats.length > 1) warnings.push('Your VIIRS file mixes several satellites (' + sats.join(', ') + '). Counts rise when a satellite is added, which can look like a trend. For a steady record use one satellite, such as S-NPP.');
    return {
      meta: { years, minDay, maxDay, rM, rV, nM: m.length, nV: v.length, lowDropped: { M: M.length - m.length, V: V.length - v.length }, k, calibrated, overlapDays, kBy, kMin: kVals.length ? Math.min.apply(null, kVals) : null, kMax: kVals.length ? Math.max.apply(null, kVals) : null, r, overlapWeeks: px.length, cell, ignoreLow, warnings },
      DY, weeks, rings, ringScale: percentile(posBins, 0.97), dailyScale: percentile(dailyPos, 0.98), nBins: nb, BIN
    };
  }

  /* ---------- season shift ---------- */
  const WINDOWS = { autumn: { label: 'Autumn burning (Sep to Dec)', a: 243, b: 365 }, spring: { label: 'Spring burning (Mar to Jun)', a: 59, b: 180 }, full: { label: 'Whole year', a: 0, b: 365 } };
  function seasonShift(res, key) {
    const W = WINDOWS[key] || WINDOWS.autumn, pts = [];
    for (const y of res.meta.years) {
      const o = res.DY[y], b = Math.min(W.b, o.len - 1);
      let ok = true, tot = 0;
      for (let d = W.a; d <= b; d++) { if (o.h[d] !== o.h[d]) { ok = false; break; } tot += o.h[d]; }
      if (!ok || tot < 50) continue;
      let cum = 0, d50 = null;
      for (let d = W.a; d <= b; d++) { const nx = cum + o.h[d]; if (nx >= tot / 2) { d50 = d + (o.h[d] > 0 ? (tot / 2 - cum) / o.h[d] : 0); break; } cum = nx; }
      pts.push({ y, d50, total: tot });
    }
    let slope = null, se = null, t = null;
    if (pts.length >= 4) {
      const xs = pts.map(p => p.y), ys = pts.map(p => p.d50), mx = mean(xs), my = mean(ys);
      let sxx = 0, sxy = 0; for (let i = 0; i < xs.length; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
      slope = sxy / sxx; const icpt = my - slope * mx;
      let sse = 0; for (let i = 0; i < xs.length; i++) sse += (ys[i] - (icpt + slope * xs[i])) ** 2;
      se = Math.sqrt(sse / (xs.length - 2) / sxx); t = se > 0 ? slope / se : null;
      pts.icpt = icpt;
    }
    return { key, label: W.label, a: W.a, b: W.b, pts, slope, se, t, n: pts.length };
  }

  /* ---------- plain-language insights ---------- */
  function lastCompleteWeek(res, year) {
    const arr = res.weeks[year]; for (let w = 51; w >= 0; w--) if (arr[w].complete) return arr[w]; return null;
  }
  function insightsFor(res, y) {
    const arr = res.weeks[y].filter(r => r.complete);
    const lines = [];
    if (!arr.length) return { lines: ['This year has no complete week of data yet.'], status: null };
    const peak = arr.reduce((a, b) => (b.h > a.h ? b : a));
    lines.push('Busiest week of ' + y + ': ' + fmtDate(peak.start) + ' to ' + fmtDate(peak.end) + ', about ' + Math.round(peak.h).toLocaleString('en-US') + ' MODIS-equivalent detections.');
    const lw = lastCompleteWeek(res, y);
    let status = null;
    if (lw) {
      const isLatest = y === res.meta.years[res.meta.years.length - 1];
      if (lw.mu != null && Math.max(lw.h, lw.mu) < 10) {
        lines.push((isLatest ? 'Latest complete week' : 'Last complete week') + ' (' + fmtDate(lw.start) + ' to ' + fmtDate(lw.end) + '): very few detections, as is normal for this time of year.');
        status = { state: 'quiet', level: lw.level, start: lw.start, end: lw.end, h: lw.h, mu: lw.mu, week: lw };
      } else if (lw.mu != null) {
        const pct = Math.round((lw.h / lw.mu - 1) * 100);
        const state = lw.h / lw.mu >= 1.2 && lw.z >= 1 ? 'above' : lw.h / lw.mu <= 0.8 && lw.z <= -1 ? 'below' : 'near';
        lines.push((isLatest ? 'Latest complete week' : 'Last complete week') + ' (' + fmtDate(lw.start) + ' to ' + fmtDate(lw.end) + '): ' + (state === 'near' ? 'close to the usual level for this time of year.' : Math.abs(pct) + '% ' + (pct > 0 ? 'above' : 'below') + ' the usual level for this time of year.'));
        status = { state, pct, level: lw.level, start: lw.start, end: lw.end, h: lw.h, mu: lw.mu, week: lw };
      } else {
        lines.push('Not enough history yet to say whether the latest week is unusual (needs 4 other years with fire in the same week).');
        status = { state: 'unknown', level: lw.level, start: lw.start, end: lw.end, h: lw.h, mu: lw.mu, week: lw };
      }
    }
    const nHigh = arr.filter(r => r.flag === 'high').length;
    lines.push(nHigh ? nHigh + ' unusually busy week' + (nHigh > 1 ? 's' : '') + ' flagged in ' + y + '.' : 'No unusually busy weeks flagged in ' + y + '.');
    const lv = { high: 0, medium: 0, low: 0 }; arr.forEach(r => { if (lv[r.level] != null) lv[r.level]++; });
    const nT = lv.high + lv.medium + lv.low;
    if (nT) lines.push('Sensor agreement: ' + Math.round(100 * lv.high / nT) + '% of weeks high trust, ' + Math.round(100 * lv.medium / nT) + '% medium, ' + Math.round(100 * lv.low / nT) + '% low.');
    // last 12 weeks for the share card
    const last12 = []; const yarr = res.weeks[y]; let idx = lw ? lw.w : -1;
    for (let w = idx, c = 0; w >= 0 && c < 12; w--) { if (yarr[w].complete) { last12.unshift({ h: yarr[w].h, mu: yarr[w].mu }); c++; } }
    if (status) status.last12 = last12;
    return { lines, status, peak };
  }

  return { DAY, MON, dayOf, info, yearLen, fmtDate, fmtDateY, isoDate, generateSample, toFirmsCsv, CsvParser, parseCsvText, analyse, seasonShift, insightsFor, lastCompleteWeek, WINDOWS, TRUST, isLowConf };
})();
if (typeof module !== 'undefined') module.exports = FT;
