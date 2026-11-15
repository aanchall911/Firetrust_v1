(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = { royal: '#2347C9', sky: '#7FB2FF', pale: '#EAF2FF', ink: '#12234F', sun: '#FFC94D', fire: '#FF5A36', muted: '#4B5F8A', line: '#D3E1FA' };
  const STOPS = [[0, [227, 237, 255]], [0.25, [255, 224, 138]], [0.5, [255, 154, 61]], [0.75, [255, 90, 54]], [1, [179, 38, 30]]];
  function heat(t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) {
      const a = STOPS[i - 1], b = STOPS[i], u = (t - a[0]) / (b[0] - a[0]);
      return 'rgb(' + a[1].map((v, j) => Math.round(v + (b[1][j] - v) * u)).join(',') + ')';
    }
    return 'rgb(179,38,30)';
  }
  const v2t = (v, scale) => Math.sqrt(Math.max(0, v) / scale);
  const fmt = n => Math.round(n).toLocaleString('en-US');

  const state = { res: null, isSample: true, area: 'Sample area', year: null, win: 'autumn', lang: 'en', sample: null, source: '' };

  /* ---------- data in ---------- */
  function loadSample() {
    if (!state.sample) state.sample = FT.generateSample();
    const S = state.sample;
    const res = FT.analyse(S.M, S.V, S.rM, S.rV, { ignoreLow: true, satsV: ['N'] });
    setData(res, { isSample: true, area: 'Sample area (Punjab-like)', source: '' });
  }
  function setData(res, o) {
    state.res = res; state.isSample = o.isSample; state.area = o.area; state.source = o.source || '';
    const ys = res.meta.years; state.year = ys[ys.length - 1];
    renderAll();
  }
  async function readFile(file, bbox, onProg) {
    const p = new FT.CsvParser(bbox);
    if (file.stream && window.TextDecoder) {
      const rd = file.stream().getReader(), dec = new TextDecoder(); let read = 0;
      for (;;) { const r = await rd.read(); if (r.done) break; read += r.value.length; p.push(dec.decode(r.value, { stream: true })); onProg(read / (file.size || 1)); }
      p.push(dec.decode(), true);
    } else { p.push(await file.text(), true); }
    return p.result();
  }
  async function analyseFiles() {
    const msg = $('#loadMsg'), btn = $('#go');
    msg.className = 'msg'; msg.textContent = '';
    const fm = [...$('#fM').files], fv = [...$('#fV').files];
    if (!fm.length && !fv.length) { msg.className = 'msg err'; msg.textContent = 'Choose at least one MODIS or VIIRS CSV file first.'; return; }
    const num = id => { const v = $(id).value.trim(); return v === '' ? null : Number(v); };
    const b = { minLat: num('#bS'), maxLat: num('#bN'), minLon: num('#bW'), maxLon: num('#bE') };
    const bbox = Object.values(b).every(x => x !== null && !isNaN(x)) ? b : null;
    if (!bbox && Object.values(b).some(x => x !== null)) { msg.className = 'msg err'; msg.textContent = 'Fill all four map-box numbers, or clear them all.'; return; }
    btn.disabled = true;
    try {
      const out = { M: { pts: [], ranges: [], rows: 0, sats: new Set() }, V: { pts: [], ranges: [], rows: 0, sats: new Set() } };
      const jobs = fm.map(f => ['M', f]).concat(fv.map(f => ['V', f]));
      for (let i = 0; i < jobs.length; i++) {
        const [k, f] = jobs[i];
        const r = await readFile(f, bbox, p => { msg.textContent = 'Reading ' + f.name + ' (' + (i + 1) + ' of ' + jobs.length + '): ' + Math.round(p * 100) + '%'; });
        if (!r.rows) throw new Error(f.name + ' has no readable fire rows.');
        for (let j = 0; j < r.points.length; j++) out[k].pts.push(r.points[j]);
        out[k].ranges.push(r.range); out[k].rows += r.rows; r.sats.forEach(s => out[k].sats.add(s));
        await new Promise(res => setTimeout(res, 0));
      }
      msg.textContent = 'Analysing...';
      await new Promise(res => setTimeout(res, 20));
      if (!out.M.pts.length && !out.V.pts.length) throw new Error('No detections fall inside that map box. Check the four numbers.');
      const res = FT.analyse(out.M.pts, out.V.pts, out.M.ranges, out.V.ranges, { ignoreLow: $('#lowConf').checked, satsV: [...out.V.sats] });
      const area = $('#area').value.trim() || 'My area';
      setData(res, { isSample: false, area, source: fmt(res.meta.nM) + ' MODIS and ' + fmt(res.meta.nV) + ' VIIRS detections' });
      msg.textContent = 'Done. Scroll up to see your results.';
      $('#insights').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { msg.className = 'msg err'; msg.textContent = e.message || String(e); }
    btn.disabled = false;
  }

  /* ---------- render all ---------- */
  function renderAll() {
    renderBanner(); renderRings(); renderYearSelect(); renderInsights(); renderCalendar(); renderShift(); renderCalib(); renderShare(); renderWarnings();
  }
  function renderBanner() {
    const b = $('#banner'), t = $('#bannerText'), m = state.res.meta;
    $('#modeChip').textContent = state.isSample ? 'Sample data' : state.area;
    if (state.isSample) { b.className = 'banner sample'; t.innerHTML = '<span><strong>You are looking at synthetic sample data</strong> for a Punjab-like area, made up to show how FireTrust behaves. To see a real area, <a href="#data">load NASA FIRMS files</a>.</span>'; }
    else { b.className = 'banner real'; t.innerHTML = '<span><strong>Your data:</strong> ' + esc(state.area) + ', ' + esc(state.source) + ', ' + FT.fmtDateY(m.minDay) + ' to ' + FT.fmtDateY(m.maxDay) + '.</span>'; }
  }
  function renderWarnings() {
    const w = state.res.meta.warnings;
    $('#warnings').innerHTML = w.map(x => '<li>' + esc(x) + '</li>').join('');
  }
  function renderYearSelect() {
    const sel = $('#yearSel'), ys = state.res.meta.years.slice().reverse();
    sel.innerHTML = ys.map(y => '<option value="' + y + '">' + y + '</option>').join('');
    sel.value = state.year;
  }
  function setYear(y) {
    state.year = y; $('#yearSel').value = y;
    renderRings(); renderInsights(); renderCalendar(); renderCalib(); renderShare();
  }

  /* ---------- Fire Rings ---------- */
  function renderRings() {
    const res = state.res, years = res.meta.years, n = years.length;
    const cx = 260, cy = 260, r0 = 62, rEnd = 222, step = (rEnd - r0) / n, th = step * 0.84, TAU = Math.PI * 2, yl = 365.25, nb = res.nBins;
    const pt = (r, a) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];
    const f = x => x.toFixed(1);
    let g = '';
    years.forEach((y, i) => {
      const rin = r0 + i * step, rout = rin + th, bins = res.rings[y];
      for (let b = 0; b < nb; b++) {
        const a0 = (b * 5 / yl) * TAU, a1 = Math.min((b + 1) * 5, yl) / yl * TAU - 0.004, v = bins[b];
        const fill = v !== v ? '#EEF2FA' : heat(v2t(v, res.ringScale));
        const p0 = pt(rout, a0), p1 = pt(rout, a1), p2 = pt(rin, a1), p3 = pt(rin, a0);
        g += '<path data-y="' + y + '" data-b="' + b + '" fill="' + fill + '" d="M' + f(p0[0]) + ' ' + f(p0[1]) + 'A' + rout.toFixed(2) + ' ' + rout.toFixed(2) + ' 0 0 1 ' + f(p1[0]) + ' ' + f(p1[1]) + 'L' + f(p2[0]) + ' ' + f(p2[1]) + 'A' + rin.toFixed(2) + ' ' + rin.toFixed(2) + ' 0 0 0 ' + f(p3[0]) + ' ' + f(p3[1]) + 'Z"/>';
      }
    });
    const si = years.indexOf(state.year);
    if (si >= 0) { const rin = r0 + si * step, rout = rin + th; g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (rin - 0.8).toFixed(2) + '" fill="none" stroke="' + C.ink + '" stroke-width="1.2" pointer-events="none"/><circle cx="' + cx + '" cy="' + cy + '" r="' + (rout + 0.8).toFixed(2) + '" fill="none" stroke="' + C.ink + '" stroke-width="1.2" pointer-events="none"/>'; }
    let cum = 0;
    'JFMAMJJASOND'.split('').forEach((l, m) => {
      const len = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m], a = ((cum + len / 2) / yl) * TAU; cum += len;
      const p = pt(rEnd + 17, a); g += '<text x="' + f(p[0]) + '" y="' + f(p[1]) + '" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" fill="' + C.ink + '" pointer-events="none">' + l + '</text>';
    });
    years.forEach((y, i) => {
      if ((y - years[0]) % 4 === 0 || i === n - 1) { const rin = r0 + i * step; g += '<text x="' + (cx - 5) + '" y="' + (cy - rin - th * 0.35).toFixed(1) + '" text-anchor="end" font-size="9.5" font-weight="700" fill="' + C.ink + '" stroke="#fff" stroke-width="2.4" paint-order="stroke" pointer-events="none">' + y + '</text>'; }
    });
    g += '<text x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle" font-size="15" font-weight="800" fill="' + C.royal + '" pointer-events="none" style="font-family:var(--head)">FIRE</text><text x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle" font-size="15" font-weight="800" fill="' + C.royal + '" pointer-events="none" style="font-family:var(--head)">RINGS</text>';
    $('#rings').innerHTML = g;
  }
  function ringInfo(y, b) {
    const res = state.res, v = res.rings[y][b], d0 = b * 5, base = res.DY[y].base;
    const d1 = Math.min(d0 + 4, res.DY[y].len - 1);
    const txt = v !== v ? 'no satellite data loaded for these days' : 'about ' + fmt(v) + ' MODIS-equivalent detections';
    $('#ringInfo').textContent = y + ', ' + FT.fmtDate(base + d0) + ' to ' + FT.fmtDate(base + d1) + ': ' + txt + '.';
  }

  /* ---------- insights ---------- */
  function renderInsights() {
    const res = state.res, ins = FT.insightsFor(res, state.year), m = res.meta;
    let html = ins.lines.map(l => '<li>' + esc(l) + '</li>').join('');
    html += '<li>Satellites only see fires when they pass over, so these counts are a floor, not the full amount of burning.</li>';
    $('#insightList').innerHTML = html;
    const st = [];
    if (m.calibrated) st.push('<div class="stat"><b>' + m.k.toFixed(2) + '</b><span>VIIRS to MODIS scale' + (m.kMin != null ? ' (yearly range ' + m.kMin.toFixed(2) + ' to ' + m.kMax.toFixed(2) + ')' : '') + '</span></div>');
    if (m.r != null) st.push('<div class="stat"><b>' + m.r.toFixed(2) + '</b><span>weekly correlation between sensors, over ' + m.overlapWeeks + ' weeks</span></div>');
    st.push('<div class="stat"><b>' + fmt(m.nM + m.nV) + '</b><span>detections used' + (m.ignoreLow ? ' (low-confidence ones dropped)' : '') + '</span></div>');
    $('#stats').innerHTML = st.join('');
  }

  /* ---------- trust calendar ---------- */
  function renderCalendar() {
    const res = state.res, y = state.year, o = res.DY[y], step = 17, cell = 14, left = 4, top = 24, cols = 53;
    const W = left + cols * step, Hh = top + 7 * step + 4;
    let s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" width="' + W + '" height="' + Hh + '" role="img" aria-label="Calendar of fire detections for ' + y + '">';
    for (let m = 0; m < 12; m++) { const d = FT.dayOf(y, m + 1, 1) - o.base; s += '<text x="' + (left + Math.floor(d / 7) * step) + '" y="14" font-size="12" font-weight="700" fill="' + C.ink + '">' + FT.MON[m] + '</text>'; }
    for (let d = 0; d < o.len; d++) {
      const col = Math.floor(d / 7), row = d % 7, h = o.h[d];
      const fill = h !== h ? '#F1F4FA' : heat(v2t(h, res.dailyScale));
      s += '<rect data-d="' + d + '" x="' + (left + col * step) + '" y="' + (top + row * step) + '" width="' + cell + '" height="' + cell + '" rx="3" fill="' + fill + '"/>';
    }
    for (let w = 0; w < 52; w++) {
      const rec = res.weeks[y][w];
      if (rec.level === 'low' || rec.level === 'medium') for (let d = w * 7; d < w * 7 + 7; d++) {
        if (o.h[d] !== o.h[d]) continue;
        const cx = left + w * step + cell / 2, cy = top + (d % 7) * step + cell / 2;
        s += rec.level === 'low' ? '<circle cx="' + cx + '" cy="' + cy + '" r="3.4" fill="#fff" stroke="' + C.ink + '" stroke-width="1" pointer-events="none"/>' : '<circle cx="' + cx + '" cy="' + cy + '" r="1.8" fill="' + C.ink + '" opacity=".5" pointer-events="none"/>';
      }
      if (rec.flag === 'high') s += '<rect x="' + (left + w * step - 2.5) + '" y="' + (top - 2.5) + '" width="' + (cell + 5) + '" height="' + (7 * step - 3 + 4) + '" rx="5" fill="none" stroke="' + C.ink + '" stroke-width="1.5" stroke-dasharray="4 3" pointer-events="none"/>';
    }
    $('#cal').innerHTML = s + '</svg>';
    $('#dayInfo').textContent = 'Tap a day to see how the two sensors counted it.';
  }
  function dayInfo(doy) {
    const res = state.res, y = state.year, o = res.DY[y], day = o.base + doy, rec = res.weeks[y][Math.floor(doy / 7)], k = res.meta.k;
    const parts = ['<strong>' + FT.fmtDateY(day) + '</strong>'];
    if (!o.cm[doy] && !o.cv[doy]) { parts.push('No satellite data was loaded for this day.'); }
    else {
      const bits = [];
      if (o.cm[doy]) bits.push('MODIS saw ' + o.m[doy]);
      if (o.cv[doy]) bits.push('VIIRS saw ' + o.v[doy] + (res.meta.calibrated ? ' (' + (o.v[doy] * k).toFixed(1) + ' when scaled to MODIS)' : ''));
      parts.push(bits.join('; ') + '. Harmonized: ' + o.h[doy].toFixed(1) + '.');
      if (rec.stub) parts.push('This is one of the last days of the year and is not scored.');
      else if (rec.level === 'few') parts.push('Week trust: too few fires this week to judge.');
      else if (rec.level) parts.push('Week trust: <strong>' + rec.level + '</strong> (counts agree ' + Math.round(rec.sim * 100) + '%, map cells agree ' + Math.round(rec.agree * 100) + '%).');
      else if (rec.mode === 'M' || rec.mode === 'V') parts.push('Only ' + (rec.mode === 'M' ? 'MODIS' : 'VIIRS') + ' covers this week, so there is no trust score.');
      if (rec.flag === 'high') parts.push('Unusually busy week: about ' + fmt(rec.h) + ' versus a usual ' + fmt(rec.mu) + '.');
      if (rec.flag === 'low') parts.push('Unusually quiet week: about ' + fmt(rec.h) + ' versus a usual ' + fmt(rec.mu) + '.');
    }
    $('#dayInfo').innerHTML = parts.join(' ');
  }

  /* ---------- charts ---------- */
  function renderShift() {
    const res = state.res, ss = FT.seasonShift(res, state.win), el = $('#shiftChart'), tx = $('#shiftText');
    if (ss.n < 3) { el.innerHTML = '<p class="hint">Not enough complete seasons yet. This chart needs at least 3 years where the whole season is in your data.</p>'; tx.textContent = ''; return; }
    const W = 640, Hh = 300, l = 58, r = 14, t = 16, b = 34, ys = ss.pts.map(p => p.y), ds = ss.pts.map(p => p.d50);
    const y0 = ys[0], y1 = ys[ys.length - 1], lo = Math.floor((Math.min.apply(null, ds) - 4) / 7) * 7, hi = Math.ceil((Math.max.apply(null, ds) + 4) / 7) * 7;
    const X = y => l + (y1 === y0 ? 0.5 : (y - y0) / (y1 - y0)) * (W - l - r), Y = d => t + (d - lo) / (hi - lo) * (Hh - t - b);
    let s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Date half the season has burned, by year">';
    for (let d = lo; d <= hi; d += 7) s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + Y(d) + '" y2="' + Y(d) + '" stroke="' + C.line + '"/><text x="' + (l - 8) + '" y="' + (Y(d) + 4) + '" text-anchor="end" font-size="12" fill="' + C.muted + '">' + FT.fmtDate(FT.dayOf(2001, 1, 1) + Math.round(d)) + '</text>';
    const step = Math.max(1, Math.ceil(ss.pts.length / 8));
    ss.pts.forEach((p, i) => { if (i % step === 0 || i === ss.pts.length - 1) s += '<text x="' + X(p.y) + '" y="' + (Hh - 10) + '" text-anchor="middle" font-size="12" fill="' + C.muted + '">' + p.y + '</text>'; });
    s += '<polyline fill="none" stroke="' + C.sky + '" stroke-width="2.5" points="' + ss.pts.map(p => X(p.y) + ',' + Y(p.d50)).join(' ') + '"/>';
    if (ss.slope != null) s += '<line x1="' + X(y0) + '" y1="' + Y(ss.pts.icpt + ss.slope * y0) + '" x2="' + X(y1) + '" y2="' + Y(ss.pts.icpt + ss.slope * y1) + '" stroke="' + C.ink + '" stroke-width="1.6" stroke-dasharray="6 4"/>';
    ss.pts.forEach(p => { const sel = p.y === state.year; s += '<circle cx="' + X(p.y) + '" cy="' + Y(p.d50) + '" r="' + (sel ? 7 : 5) + '" fill="' + (sel ? C.fire : '#2F6BFF') + '" stroke="#fff" stroke-width="1.5"><title>' + p.y + ': ' + FT.fmtDate(FT.dayOf(2001, 1, 1) + Math.round(p.d50)) + '</title></circle>'; });
    el.innerHTML = s + '</svg>';
    let msg = 'Dots show the date by which half of the ' + ss.label.split(' (')[0].toLowerCase() + ' detections had happened. ';
    if (ss.slope != null) {
      const sl = ss.slope, ci = 1.96 * ss.se;
      msg += 'Across ' + ss.n + ' seasons the line moves ' + Math.abs(sl).toFixed(2) + ' days ' + (sl < 0 ? 'earlier' : 'later') + ' per year (give or take ' + ci.toFixed(2) + '). ' + (ss.t != null && Math.abs(ss.t) >= 2 ? 'That is stronger than ordinary year-to-year wobble, but it describes the past and is not a forecast.' : 'That could be ordinary year-to-year wobble, so do not read it as a trend.');
    }
    tx.textContent = msg;
  }
  function renderCalib() {
    const res = state.res, y = state.year, m = res.meta, k = m.k, el = $('#calibChart');
    const wk = res.weeks[y].filter(r => !r.stub && r.end <= m.maxDay);
    const sM = wk.map(r => (r.mode === 'both' || r.mode === 'M') ? r.m : null);
    const sV = wk.map(r => (r.mode === 'both' || r.mode === 'V') ? r.v : null);
    const sK = sV.map(v => v == null ? null : v * k);
    const all = sM.concat(sV, sK).filter(v => v != null);
    if (!all.length) { el.innerHTML = '<p class="hint">No complete weeks to show for ' + y + '.</p>'; $('#calibText').textContent = ''; return; }
    const W = 640, Hh = 290, l = 46, r = 12, t = 14, b = 30, ymax = Math.max(10, Math.max.apply(null, all) * 1.1);
    const X = w => l + (w + 0.5) / 52 * (W - l - r), Y = v => t + (1 - v / ymax) * (Hh - t - b);
    let s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Weekly MODIS, VIIRS and scaled VIIRS counts for ' + y + '">';
    for (let i = 0; i <= 4; i++) { const v = ymax * i / 4; s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="' + C.line + '"/><text x="' + (l - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="12" fill="' + C.muted + '">' + fmt(v) + '</text>'; }
    for (let mo = 0; mo < 12; mo += 1) { const d = FT.dayOf(y, mo + 1, 1) - res.DY[y].base; s += '<text x="' + X(Math.floor(d / 7)) + '" y="' + (Hh - 8) + '" font-size="12" fill="' + C.muted + '">' + FT.MON[mo] + '</text>'; }
    const line = (arr, col, dash, wd) => { let d = '', pen = false; arr.forEach((v, w) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(w).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); return d ? '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + wd + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linejoin="round"/>' : ''; };
    s += line(sV, '#9AA6C4', '', 2) + line(sM, C.royal, '', 2.6) + (m.calibrated ? line(sK, '#FF9A3D', '6 4', 2.4) : '');
    el.innerHTML = s + '</svg>';
    $('#calibText').textContent = m.calibrated ? 'Scale factor ' + k.toFixed(2) + ': in the overlap years, one VIIRS detection stands for about ' + k.toFixed(2) + ' MODIS detections. Showing ' + y + ', weekly totals.' : 'Calibration needs both sensors with enough overlapping days. Showing raw weekly totals for ' + y + '.';
  }

  /* ---------- share card ---------- */
  const L = {
    en: { title: 'Fire activity', week: 'Week of', vs: 'vs usual', usual: 'usual level', trust: 'Trust', sample: 'SAMPLE DATA', none: 'No complete week of data yet',
      st: { above: 'Above normal', near: 'Near normal', below: 'Below normal', quiet: 'Very few fires', unknown: 'Not enough history' }, lv: { high: 'High', medium: 'Medium', low: 'Low', few: 'Too few fires to judge' }, no: 'No trust score',
      foot: 'Source: NASA FIRMS (MODIS + VIIRS). Satellites only see fires at the times they pass over.', loc: 'en-GB' },
    hi: { title: 'आग की गतिविधि', week: 'सप्ताह', vs: 'सामान्य की तुलना में', usual: 'सामान्य स्तर', trust: 'भरोसा', sample: 'नमूना डेटा', none: 'अभी कोई पूरा सप्ताह नहीं',
      st: { above: 'सामान्य से ज़्यादा', near: 'सामान्य के आसपास', below: 'सामान्य से कम', quiet: 'बहुत कम आग', unknown: 'पर्याप्त इतिहास नहीं' }, lv: { high: 'ऊँचा', medium: 'मध्यम', low: 'कम', few: 'आकलन के लिए बहुत कम आग' }, no: 'भरोसे का स्कोर नहीं',
      foot: 'स्रोत: NASA FIRMS (MODIS + VIIRS)। उपग्रह केवल अपने गुज़रने के समय की आग देखते हैं।', loc: 'hi-IN' },
    pa: { title: 'ਅੱਗ ਦੀ ਗਤੀਵਿਧੀ', week: 'ਹਫ਼ਤਾ', vs: 'ਆਮ ਦੇ ਮੁਕਾਬਲੇ', usual: 'ਆਮ ਪੱਧਰ', trust: 'ਭਰੋਸਾ', sample: 'ਨਮੂਨਾ ਡਾਟਾ', none: 'ਅਜੇ ਕੋਈ ਪੂਰਾ ਹਫ਼ਤਾ ਨਹੀਂ',
      st: { above: 'ਆਮ ਨਾਲੋਂ ਵੱਧ', near: 'ਆਮ ਦੇ ਨੇੜੇ', below: 'ਆਮ ਨਾਲੋਂ ਘੱਟ', quiet: 'ਬਹੁਤ ਘੱਟ ਅੱਗ', unknown: 'ਕਾਫ਼ੀ ਇਤਿਹਾਸ ਨਹੀਂ' }, lv: { high: 'ਉੱਚਾ', medium: 'ਦਰਮਿਆਨਾ', low: 'ਘੱਟ', few: 'ਅੰਦਾਜ਼ੇ ਲਈ ਬਹੁਤ ਘੱਟ ਅੱਗ' }, no: 'ਭਰੋਸੇ ਦਾ ਸਕੋਰ ਨਹੀਂ',
      foot: 'ਸਰੋਤ: NASA FIRMS (MODIS + VIIRS)। ਉਪਗ੍ਰਹਿ ਸਿਰਫ਼ ਆਪਣੇ ਲੰਘਣ ਦੇ ਸਮੇਂ ਦੀ ਅੱਗ ਦੇਖਦੇ ਹਨ।', loc: 'pa-IN' }
  };
  const MONTHS = {
    hi: ['जन॰', 'फ़र॰', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुल॰', 'अग॰', 'सित॰', 'अक्तू॰', 'नव॰', 'दिस॰'],
    pa: ['ਜਨਵਰੀ', 'ਫ਼ਰਵਰੀ', 'ਮਾਰਚ', 'ਅਪ੍ਰੈਲ', 'ਮਈ', 'ਜੂਨ', 'ਜੁਲਾਈ', 'ਅਗਸਤ', 'ਸਤੰਬਰ', 'ਅਕਤੂਬਰ', 'ਨਵੰਬਰ', 'ਦਸੰਬਰ']
  };
  function localDate(day, lang) {
    const d = new Date(day * FT.DAY);
    return MONTHS[lang] ? d.getUTCDate() + ' ' + MONTHS[lang][d.getUTCMonth()] : FT.fmtDate(day);
  }
  function wrap(ctx, text, maxW) {
    const words = text.split(' '), lines = []; let cur = '';
    words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  async function renderShare() {
    const cv = $('#card'), ctx = cv.getContext('2d'), t = L[state.lang], FONT = '"Nunito Sans","Noto Sans Devanagari","Noto Sans Gurmukhi",system-ui,sans-serif';
    try { if (document.fonts && document.fonts.load) await Promise.all([document.fonts.load('700 40px "Nunito Sans"'), document.fonts.load('700 40px "Bree Serif"'), state.lang === 'hi' ? document.fonts.load('700 40px "Noto Sans Devanagari"', t.title) : state.lang === 'pa' ? document.fonts.load('700 40px "Noto Sans Gurmukhi"', t.title) : Promise.resolve()]); } catch (e) { /* use fallback fonts */ }
    const ins = FT.insightsFor(state.res, state.year), st = ins.status;
    ctx.clearRect(0, 0, 1080, 1080);
    ctx.fillStyle = C.pale; ctx.fillRect(0, 0, 1080, 1080);
    ctx.save(); ctx.shadowColor = 'rgba(35,71,201,.22)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 12; ctx.fillStyle = '#fff'; rrect(ctx, 60, 50, 960, 980, 48); ctx.fill(); ctx.restore();
    ctx.save(); rrect(ctx, 60, 50, 960, 980, 48); ctx.clip(); ctx.fillStyle = C.royal; ctx.fillRect(60, 50, 960, 160); ctx.restore();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = '400 58px "Bree Serif",Georgia,serif'; ctx.fillText('FireTrust', 110, 132);
    ctx.fillStyle = '#CFE0FF'; ctx.font = '600 30px ' + FONT; ctx.fillText(state.area.slice(0, 34), 110, 180);
    if (state.isSample) { ctx.font = '800 24px ' + FONT; const w = ctx.measureText(t.sample).width + 40; ctx.fillStyle = C.sun; rrect(ctx, 1020 - 40 - w, 88, w, 48, 24); ctx.fill(); ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.fillText(t.sample, 1020 - 40 - w / 2, 121); ctx.textAlign = 'left'; }
    ctx.fillStyle = C.ink; ctx.font = '700 44px ' + FONT; ctx.fillText(t.title, 110, 285);
    if (!st) { ctx.fillStyle = C.muted; ctx.font = '600 40px ' + FONT; wrap(ctx, t.none, 860).forEach((ln, i) => ctx.fillText(ln, 110, 400 + i * 54)); }
    else {
      ctx.fillStyle = C.muted; ctx.font = '600 32px ' + FONT; ctx.fillText(t.week + ' ' + localDate(st.start, state.lang) + ' – ' + localDate(st.end, state.lang), 110, 335);
      const col = { above: '#D43D17', near: C.royal, below: '#14835F', quiet: C.royal, unknown: C.muted }[st.state];
      ctx.fillStyle = col; ctx.font = '800 84px ' + FONT;
      const lines = wrap(ctx, t.st[st.state], 860); lines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, 110, 440 + i * 94));
      const yb = 440 + (Math.min(2, lines.length) - 1) * 94;
      if ((st.state === 'above' || st.state === 'below') && st.pct != null) { ctx.fillStyle = C.ink; ctx.font = '700 40px ' + FONT; ctx.fillText((st.pct > 0 ? '+' : '') + st.pct + '% ' + t.vs, 110, yb + 66); }
      // last 12 weeks mini bars
      const bars = st.last12 || [], baseY = 830, topY = 640;
      if (bars.length) {
        const mx = Math.max.apply(null, bars.map(b => Math.max(b.h, b.mu || 0)).concat([1])), bw = 56, gp = 14, x0 = 110 + (860 - (bars.length * bw + (bars.length - 1) * gp)) / 2;
        bars.forEach((b, i) => { const x = x0 + i * (bw + gp), hh = Math.max(3, (b.h / mx) * (baseY - topY)); ctx.fillStyle = i === bars.length - 1 ? C.fire : '#9CC2FF'; rrect(ctx, x, baseY - hh, bw, hh, 8); ctx.fill(); if (b.mu != null) { const my = baseY - (b.mu / mx) * (baseY - topY); ctx.fillStyle = C.ink; ctx.fillRect(x - 3, my - 2, bw + 6, 4); } });
        ctx.fillStyle = C.ink; ctx.fillRect(110, baseY + 22, 40, 5); ctx.fillStyle = C.muted; ctx.font = '600 26px ' + FONT; ctx.fillText(t.usual, 162, baseY + 33);
      }
      // trust chip
      const lv = st.level, lab = lv ? t.trust + ': ' + t.lv[lv] : t.no, bg = { high: '#14835F', medium: C.sun, low: '#D43D17', few: '#9AA6C4' }[lv] || '#9AA6C4', fg = lv === 'medium' ? C.ink : '#fff';
      ctx.font = '700 32px ' + FONT; const cw = Math.min(860, ctx.measureText(lab).width + 56);
      ctx.fillStyle = bg; rrect(ctx, 110, 890, cw, 62, 31); ctx.fill(); ctx.fillStyle = fg; ctx.fillText(lab, 138, 932);
    }
    ctx.fillStyle = C.muted; ctx.font = '600 23px ' + FONT; wrap(ctx, t.foot, 860).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, 110, 985 + i * 30));
  }
  function cardBlob() { return new Promise(res => $('#card').toBlob(res, 'image/png')); }

  /* ---------- events ---------- */
  function wire() {
    $('#rings').addEventListener('click', e => { const d = e.target.dataset; if (d && d.y) { const y = +d.y; ringInfo(y, +d.b); if (y !== state.year) { setYear(y); ringInfo(y, +d.b); } } });
    $('#cal').addEventListener('click', e => { const d = e.target.dataset; if (d && d.d !== undefined) dayInfo(+d.d); });
    $('#yearSel').addEventListener('change', e => setYear(+e.target.value));
    $('#winSel').addEventListener('change', e => { state.win = e.target.value; renderShift(); });
    $('#go').addEventListener('click', analyseFiles);
    $('#useSample').addEventListener('click', () => { loadSample(); $('#loadMsg').className = 'msg'; $('#loadMsg').textContent = 'Back to the sample data.'; });
    $('#presetPH').addEventListener('click', () => { $('#bS').value = 27.6; $('#bN').value = 32.6; $('#bW').value = 73.8; $('#bE').value = 77.6; });
    const dl = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
    $('#dlM').addEventListener('click', () => { loadSampleIfNeeded(); dl('sample_MODIS_firms_format.csv', FT.toFirmsCsv(state.sample.M, 'M')); });
    $('#dlV').addEventListener('click', () => { loadSampleIfNeeded(); dl('sample_VIIRS_firms_format.csv', FT.toFirmsCsv(state.sample.V, 'V')); });
    document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { state.lang = b.dataset.lang; document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); renderShare(); }));
    $('#dlCard').addEventListener('click', async () => { const blob = await cardBlob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'firetrust-' + state.lang + '.png'; document.body.appendChild(a); a.click(); a.remove(); });
    $('#shCard').addEventListener('click', async () => {
      const m = $('#shareMsg'); m.textContent = '';
      try {
        const blob = await cardBlob(), file = new File([blob], 'firetrust.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'FireTrust' });
        else m.textContent = 'Sharing is not supported in this browser. Use Download picture, then send the image.';
      } catch (e) { if (e && e.name !== 'AbortError') m.textContent = 'Could not open sharing. Use Download picture instead.'; }
    });
  }
  function loadSampleIfNeeded() { if (!state.sample) state.sample = FT.generateSample(); }

  wire();
  loadSample();
})();
