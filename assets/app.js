(function () {
  'use strict';

  var DATA = window.DASHBOARD_DATA;
  if (!DATA || !DATA.kpi || !DATA.years || !DATA.years.length) {
    var main = document.querySelector('.page');
    if (main) main.innerHTML = '<p class="card">Gagal memuat data dashboard. Jalankan <code>python tools/build_data.py</code>.</p>';
    return;
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  var C = { timbulan: '#1f6feb', terkelola: '#1a7f37', penduduk: '#d55e00', muted: '#8a99a8', grid: '#edf0f4', axis: '#dde4ea' };
  var state = { year: DATA.years[DATA.years.length - 1], komposisiYear: 2025 };

  // ---------- helpers ----------
  function idNum(n, digits) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    var d = digits === undefined ? 0 : digits;
    return n.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function pctPoints(now, prev) { return (now - prev); }
  function deltaPct(now, prev) { return prev === 0 ? null : ((now - prev) / prev) * 100; }
  function kpiAt(y) { return DATA.kpi[String(y)]; }
  function prevYear(y) { var i = DATA.years.indexOf(y); return i > 0 ? DATA.years[i - 1] : null; }
  function el(tag, attrs, parent, text) {
    var node = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'dataTip') node.setAttribute('data-tip', v);
      else node.setAttribute(k, v);
    });
    if (text !== undefined) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  function clearSvg(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }
  function byId(id) { return document.getElementById(id); }
  function statusFor(pct) { return pct >= 90 ? 'green' : pct >= 60 ? 'yellow' : 'red'; }
  function statusLabel(s) { return s === 'green' ? '≥90% (usulan)' : s === 'yellow' ? '60–90% (usulan)' : '<60% (usulan)'; }

  function niceScale(min, max, count, forceZero) {
    var lo0 = forceZero ? 0 : min;
    var hi0 = max;
    if (lo0 === hi0) { lo0 -= 1; hi0 += 1; }
    var span = hi0 - lo0;
    var step0 = span / (count || 4);
    var mag = Math.pow(10, Math.floor(Math.log10(step0)));
    var norm = step0 / mag;
    var step = (norm >= 5 ? 10 : norm >= 2.2 ? 5 : norm >= 1.2 ? 2 : 1) * mag;
    if (forceZero) { lo0 = 0; }
    var lo = forceZero ? 0 : Math.floor(min / step) * step;
    var hi = Math.ceil(max / step) * step;
    var ticks = [];
    for (var v = lo; v <= hi + step * 1e-6; v += step) ticks.push(+v.toFixed(6));
    return { lo: lo, hi: hi, ticks: ticks, step: step };
  }

  // ---------- tooltip berbasis data-tip ----------
  var tooltipEl = null;
  function ensureTooltip() {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'tooltip';
      tooltipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }
  function tipHtml(raw) {
    var tip = ensureTooltip();
    var parts = String(raw).split('\n');
    var title = parts.shift();
    var rows = parts.map(function (p) {
      var idx = p.indexOf(':');
      var k = idx >= 0 ? p.slice(0, idx) : p;
      var v = idx >= 0 ? p.slice(idx + 1).trim() : '';
      return '<div class="tt-row"><span>' + k + '</span><span>' + v + '</span></div>';
    }).join('');
    tip.innerHTML = '<div class="tt-title">' + title + '</div>' + rows;
    return tip;
  }
  function bindTooltips(root) {
    var tip = ensureTooltip();
    var move = function (e) {
      var x = Math.min(window.innerWidth - 16, Math.max(16, e.clientX + 14));
      var y = Math.min(window.innerHeight - 16, Math.max(16, e.clientY + 14));
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    };
    root.addEventListener('mousemove', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!t) { tip.classList.remove('visible'); return; }
      tipHtml(t.getAttribute('data-tip'));
      move(e);
      tip.classList.add('visible');
    });
    root.addEventListener('mouseleave', function () { tip.classList.remove('visible'); });
    root.addEventListener('focusin', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (t) { tipHtml(t.getAttribute('data-tip')); tip.style.left = '16px'; tip.style.top = '80px'; tip.classList.add('visible'); }
    });
    root.addEventListener('focusout', function () { tip.classList.remove('visible'); });
  }

  // generic line chart: series = [{name, color, values:[...]}], years as x
  function renderLineChart(svg, cfg) {
    clearSvg(svg);
    var W = 720, H = 260, P = { t: 12, r: 14, b: 26, l: 46 };
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var iw = W - P.l - P.r, ih = H - P.t - P.b;
    var xs = DATA.years.map(function (_, i) { return P.l + (DATA.years.length === 1 ? iw / 2 : (i / (DATA.years.length - 1)) * iw); });
    var all = [];
    cfg.series.forEach(function (s) { s.values.forEach(function (v) { if (v !== null) all.push(v); }); });
    var sc = niceScale(Math.min.apply(null, all), Math.max.apply(null, all), 4, cfg.forceZero);
    var y = function (v) { return P.t + ih - ((v - sc.lo) / (sc.hi - sc.lo)) * ih; };

    sc.ticks.forEach(function (t) {
      el('line', { x1: P.l, x2: W - P.r, y1: y(t), y2: y(t), 'class': 'grid-line' }, svg);
      el('text', { x: P.l - 6, y: y(t) + 3.5, 'text-anchor': 'end', 'class': 'tick' }, svg, cfg.tickFormat ? cfg.tickFormat(t) : String(t));
    });
    el('line', { x1: P.l, x2: W - P.r, y1: P.t + ih, y2: P.t + ih, 'class': 'axis' }, svg);
    DATA.years.forEach(function (yr, i) {
      el('text', { x: xs[i], y: H - 8, 'text-anchor': 'middle', 'class': 'tick' }, svg, String(yr));
    });

    cfg.series.forEach(function (s) {
      var d = '';
      s.values.forEach(function (v, i) {
        if (v === null) return;
        var cmd = d === '' ? 'M' : 'L';
        d += cmd + xs[i].toFixed(2) + ' ' + y(v).toFixed(2) + ' ';
      });
      el('path', { d: d.trim(), fill: 'none', stroke: s.color, 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      s.values.forEach(function (v, i) {
        if (v === null) return;
        var tipValue = cfg.tipFormat ? cfg.tipFormat(v) : String(v);
        el('circle', {
          cx: xs[i], cy: y(v), r: 4.5, fill: '#fff', stroke: s.color, 'stroke-width': 2,
          'tabindex': '0',
          dataTip: s.name + '\nTahun: ' + DATA.years[i] + '\nNilai: ' + tipValue
        }, svg);
      });
    });
  }

  // vertical bar chart (persen terkelola) with ambang usulan lines
  function renderKelolaChart(svg) {
    clearSvg(svg);
    var W = 720, H = 230, P = { t: 14, r: 74, b: 26, l: 40 };
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var iw = W - P.l - P.r, ih = H - P.t - P.b;
    var n = DATA.years.length;
    var bw = Math.min(56, (iw / n) * 0.62);
    var y = function (v) { return P.t + ih - (v / 100) * ih; };

    [0, 20, 40, 60, 80, 100].forEach(function (t) {
      el('line', { x1: P.l, x2: W - P.r, y1: y(t), y2: y(t), 'class': 'grid-line' }, svg);
      el('text', { x: P.l - 6, y: y(t) + 3.5, 'text-anchor': 'end', 'class': 'tick' }, svg, String(t));
    });
    // ambang usulan 90 & 60
    [90, 60].forEach(function (t) {
      el('line', { x1: P.l, x2: W - P.r, y1: y(t), y2: y(t), 'class': 'threshold-line' }, svg);
      el('text', { x: W - P.r + 6, y: y(t) + 3, 'text-anchor': 'start', 'class': 'threshold-label' }, svg, 'usulan ' + t + '%');
    });
    el('line', { x1: P.l, x2: W - P.r, y1: P.t + ih, y2: P.t + ih, 'class': 'axis' }, svg);

    DATA.years.forEach(function (yr, i) {
      var cx = P.l + (iw / n) * (i + 0.5);
      var v = kpiAt(yr).persen_kelola;
      var st = statusFor(v);
      var cls = st === 'green' ? 'bar-green' : st === 'yellow' ? 'bar-yellow' : 'bar-red';
      el('rect', {
        x: cx - bw / 2, y: y(v), width: bw, height: Math.max(0, P.t + ih - y(v)), rx: 3, 'class': cls,
        'tabindex': '0',
        dataTip: 'Terkelola ' + yr + '\nPersen: ' + idNum(v, 2) + '%\nStatus: ' + statusLabel(st)
      }, svg);
      el('text', { x: cx, y: y(v) - 5, 'text-anchor': 'middle', 'class': 'value-label' }, svg, idNum(v, 2) + '%');
      el('text', { x: cx, y: H - 8, 'text-anchor': 'middle', 'class': 'tick' }, svg, String(yr));
    });
  }

  // horizontal bar chart (komposisi); NA → hatched placeholder
  function renderKomposisiChart(svg, tahun) {
    clearSvg(svg);
    var W = 720, H = 260, P = { t: 8, r: 56, b: 22, l: 118 };
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var ih = H - P.t - P.b, iw = W - P.l - P.r;
    var rows = DATA.komposisi.filter(function (r) { return r.tahun === tahun; });
    var known = rows.filter(function (r) { return r.persen !== null; });
    var missing = rows.filter(function (r) { return r.persen === null; });
    known.sort(function (a, b) { return b.persen - a.persen; });
    var ordered = known.concat(missing);
    var maxV = Math.max.apply(null, known.map(function (r) { return r.persen; }).concat([10]));
    var xMax = Math.ceil((maxV * 1.12) / 10) * 10;
    var rowH = ih / ordered.length;
    var barH = Math.min(15, rowH * 0.62);
    var x = function (v) { return P.l + (v / xMax) * iw; };

    [0, xMax / 2, xMax].forEach(function (t) {
      el('line', { x1: x(t), x2: x(t), y1: P.t, y2: P.t + ih, 'class': 'grid-line' }, svg);
      el('text', { x: x(t), y: H - 4, 'text-anchor': 'middle', 'class': 'tick' }, svg, idNum(t, 0) + '%');
    });

    ordered.forEach(function (r, i) {
      var cy = P.t + rowH * i + rowH / 2;
      el('text', { x: P.l - 6, y: cy + 3.5, 'text-anchor': 'end', 'class': 'tick' }, svg, r.kategori);
      var isFocus = (r.kategori === 'Sisa Makanan' || r.kategori === 'Plastik');
      if (r.persen === null) {
        el('rect', {
          x: P.l, y: cy - barH / 2, width: iw * 0.32, height: barH, rx: 3, 'class': 'bar-na',
          'tabindex': '0',
          dataTip: r.kategori + ' ' + tahun + '\nStatus: NA — tidak tersedia di sumber'
        }, svg);
        el('text', { x: P.l + iw * 0.32 + 8, y: cy + 3.5, 'class': 'na-note' }, svg, 'NA — tidak tersedia di sumber');
      } else {
        el('rect', {
          x: P.l, y: cy - barH / 2, width: Math.max(2, x(r.persen) - P.l), height: barH, rx: 3,
          'class': isFocus ? 'bar-focus' : 'bar-default',
          'tabindex': '0',
          dataTip: r.kategori + ' ' + tahun + '\nKomposisi: ' + idNum(r.persen, 2) + '%' + (isFocus ? '\nFokus CBQ2' : '')
        }, svg);
        el('text', { x: x(r.persen) + 6, y: cy + 3.5, 'class': 'value-label' }, svg, idNum(r.persen, 1) + '%');
      }
    });
  }

  function renderLegend(id, items) {
    var box = byId(id);
    box.innerHTML = '';
    items.forEach(function (it) {
      var span = document.createElement('span');
      span.className = 'legend-item';
      span.innerHTML = '<span class="swatch' + (it.bar ? ' bar' : '') + '" style="background:' + it.color + '"></span>' + it.name;
      box.appendChild(span);
    });
  }

  // ---------- zones ----------
  function renderScorecards() {
    var y = state.year, cur = kpiAt(y), py = prevYear(y), prev = py ? kpiAt(py) : null;
    var st = statusFor(cur.persen_kelola);
    function delta(now, old, unit, digits, invert) {
      if (!prev || old === null || old === undefined) return { text: 'tahun dasar', cls: 'delta-flat' };
      var d = now - old;
      var sign = d > 0 ? '+' : d < 0 ? '−' : '';
      var good = invert ? d < 0 : d > 0;
      var cls = d === 0 ? 'delta-flat' : good ? 'delta-up' : 'delta-down';
      return { text: (py ? 'vs ' + py + ': ' : '') + sign + idNum(Math.abs(d), digits) + (unit || ''), cls: cls };
    }
    function deltaPp(now, old, invert) {
      if (!prev || old === null) return { text: 'tahun dasar', cls: 'delta-flat' };
      var d = pctPoints(now, old);
      var sign = d > 0 ? '+' : d < 0 ? '−' : '';
      var good = invert ? d < 0 : d > 0;
      var cls = d === 0 ? 'delta-flat' : good ? 'delta-up' : 'delta-down';
      return { text: (py ? 'vs ' + py + ': ' : '') + sign + idNum(Math.abs(d), 2) + ' pp', cls: cls };
    }
    var cards = [
      { label: 'Timbulan Tahunan', value: idNum(cur.timbulan_tahunan_ton, 0), unit: 'ton/tahun', delta: delta(cur.timbulan_tahunan_ton, prev && prev.timbulan_tahunan_ton, ' ton', 0, false), status: null },
      { label: 'Terkelola (%)', value: idNum(cur.persen_kelola, 2) + '%', unit: 'sesuai laporan sumber', delta: deltaPp(cur.persen_kelola, prev && prev.persen_kelola, false), status: st, chip: statusLabel(st) },
      { label: 'Terkelola (ton)', value: idNum(cur.terkelola_tahunan_ton, 0), unit: 'ton/tahun', delta: delta(cur.terkelola_tahunan_ton, prev && prev.terkelola_tahunan_ton, ' ton', 0, false), status: null },
      { label: 'Belum Terkelola', value: idNum(cur.belum_terkelola_tahunan_ton, 0), unit: 'ton/tahun', delta: delta(cur.belum_terkelola_tahunan_ton, prev && prev.belum_terkelola_tahunan_ton, ' ton', 0, true), status: null },
      { label: 'Timbulan per Kapita', value: idNum(cur.timbulan_kg_per_orang_hari, 3), unit: 'kg/orang/hari', delta: delta(cur.timbulan_kg_per_orang_hari, prev && prev.timbulan_kg_per_orang_hari, '', 3, true), status: null },
      { label: 'Recycling Rate', value: idNum(cur.persen_recycling_rate, 2) + '%', unit: 'dari daur ulang', delta: deltaPp(cur.persen_recycling_rate, prev && prev.persen_recycling_rate, false), status: null }
    ];
    var html = cards.map(function (c) {
      var stCls = c.status ? ' status-' + c.status : '';
      var chip = c.chip ? '<span class="kpi-chip">' + c.chip + '</span>' : '';
      return '<div class="scorecard' + stCls + '">' +
        '<div class="kpi-label">' + c.label + chip + '</div>' +
        '<div class="kpi-value">' + c.value + '</div>' +
        '<div class="kpi-unit">' + c.unit + '</div>' +
        '<div class="kpi-delta ' + c.delta.cls + '">' + c.delta.text + '</div>' +
      '</div>';
    }).join('');
    byId('scorecards').innerHTML = html;
  }

  function renderTimbulanChart() {
    renderLineChart(byId('chartTimbulan'), {
      series: [
        { name: 'Timbulan (ton)', color: C.timbulan, values: DATA.years.map(function (y) { return kpiAt(y).timbulan_tahunan_ton; }) },
        { name: 'Terkelola (ton)', color: C.terkelola, values: DATA.years.map(function (y) { return kpiAt(y).terkelola_tahunan_ton; }) }
      ],
      forceZero: true,
      tickFormat: function (t) { return idNum(t / 1000, 0) + ' rb'; },
      tipFormat: function (v) { return idNum(v, 2) + ' ton'; }
    });
    renderLegend('legendTimbulan', [
      { name: 'Timbulan (ribu ton)', color: C.timbulan },
      { name: 'Terkelola (ribu ton)', color: C.terkelola }
    ]);
    byId('chartCaptionTimbulan').textContent = '· sumbu Y: ribu ton (0 sebagai baseline)';
    var peak = DATA.years.reduce(function (a, y) { return kpiAt(y).belum_terkelola_tahunan_ton > kpiAt(a).belum_terkelola_tahunan_ton ? y : a; }, DATA.years[0]);
    var py = prevYear(peak);
    var gapNow = kpiAt(peak).belum_terkelola_tahunan_ton;
    var gapTxt = 'Kesenjangan terbesar: <strong>' + peak + '</strong> — ' + idNum(gapNow, 0) + ' ton belum terkelola';
    if (py) gapTxt += ' (vs ' + py + ': ' + idNum(kpiAt(py).belum_terkelola_tahunan_ton, 0) + ' ton)';
    gapTxt += '. Sumbu 0–500 rb membuat selisih visual menyusut; angka kanan lebih jujur daripada skala grafik.';
    byId('gapNote').innerHTML = gapTxt;
  }

  function renderIndeksChart() {
    var base = kpiAt(2021);
    renderLineChart(byId('chartIndeks'), {
      series: [
        { name: 'Indeks timbulan', color: C.timbulan, values: DATA.years.map(function (y) { return (kpiAt(y).timbulan_tahunan_ton / base.timbulan_tahunan_ton) * 100; }) },
        { name: 'Indeks penduduk', color: C.penduduk, values: DATA.years.map(function (y) { return (kpiAt(y).jumlah_penduduk_jiwa / base.jumlah_penduduk_jiwa) * 100; }) }
      ],
      forceZero: false,
      tickFormat: function (t) { return idNum(t, 0); },
      tipFormat: function (v) { return idNum(v, 2) + ' (2021 = 100)'; }
    });
    renderLegend('legendIndeks', [
      { name: 'Timbulan (2021 = 100)', color: C.timbulan },
      { name: 'Penduduk (2021 = 100)', color: C.penduduk }
    ]);
  }

  function renderKelolaLegend() {
    renderLegend('legendKelola', [
      { name: '≥90% (usulan)', color: '#1a7f37', bar: true },
      { name: '60–90% (usulan)', color: '#d4a017', bar: true },
      { name: '<60% (usulan)', color: '#cf222e', bar: true }
    ]);
  }

  function renderKomposisiTable(tahun) {
    var tbody = document.querySelector('#komposisiTable tbody');
    if (!tbody) return;
    var rows = DATA.komposisi.filter(function (r) { return r.tahun === tahun; });
    var focus = { 'Sisa Makanan': true, 'Plastik': true };
    var ordered = rows.slice().sort(function (a, b) {
      if (a.persen === null && b.persen === null) return 0;
      if (a.persen === null) return 1;
      if (b.persen === null) return -1;
      return b.persen - a.persen;
    });
    tbody.innerHTML = ordered.map(function (r) {
      var isFocus = !!focus[r.kategori];
      if (r.persen === null) {
        return '<tr class="row-na"><td>' + r.kategori + '<span class="chip-na">NA</span></td><td class="num">—</td><td>Tidak tersedia di sumber (2021–2024)</td></tr>';
      }
      var note = isFocus ? 'Fokus CBQ2 (sisa makanan + plastik)' : '—';
      return '<tr class="' + (isFocus ? 'row-focus' : '') + '"><td>' + r.kategori + (isFocus ? '<span class="chip-focus">Fokus CBQ2</span>' : '') + '</td><td class="num">' + idNum(r.persen, 2) + '%</td><td>' + note + '</td></tr>';
    }).join('');
  }

  function renderKomposisiSection() {
    renderKomposisiChart(byId('chartKomposisi'), state.komposisiYear);
    renderKomposisiTable(state.komposisiYear);
    byId('komposisiYearBadge').textContent = state.komposisiYear;
  }

  function renderDonut(cur, rasioBelum) {
    var svg = byId('chartDonut');
    clearSvg(svg);
    var cx = 80, cy = 80, r = 62, inner = 38;
    var total = cur.terkelola_tahunan_ton + cur.belum_terkelola_tahunan_ton;
    var pKelola = total > 0 ? (cur.terkelola_tahunan_ton / total) : 0;
    var segs = [
      { name: 'Terkelola', value: cur.terkelola_tahunan_ton, color: '#1a7f37', pct: pKelola * 100 },
      { name: 'Belum terkelola', value: cur.belum_terkelola_tahunan_ton, color: '#cf222e', pct: (1 - pKelola) * 100 }
    ];
    function arcPath(startAngle, endAngle, radius, innerR) {
      var large = (endAngle - startAngle) > Math.PI ? 1 : 0;
      var x1 = cx + radius * Math.cos(startAngle), y1 = cy + radius * Math.sin(startAngle);
      var x2 = cx + radius * Math.cos(endAngle), y2 = cy + radius * Math.sin(endAngle);
      var x3 = cx + innerR * Math.cos(endAngle), y3 = cy + innerR * Math.sin(endAngle);
      var x4 = cx + innerR * Math.cos(startAngle), y4 = cy + innerR * Math.sin(startAngle);
      return ['M', x1, y1, 'A', radius, radius, 0, large, 1, x2, y2, 'L', x3, y3, 'A', innerR, innerR, 0, large, 0, x4, y4, 'Z'].join(' ');
    }
    var angle = -Math.PI / 2;
    segs.forEach(function (s) {
      var sweep = (s.value / total) * Math.PI * 2;
      el('path', { d: arcPath(angle, angle + sweep, r, inner), fill: s.color, 'class': 'donut-seg',
        'tabindex': '0', dataTip: s.name + '\nNilai: ' + idNum(s.value, 2) + ' ton\nProporsi: ' + idNum(s.pct, 2) + '%' }, svg);
      angle += sweep;
    });
    el('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', 'class': 'donut-center-value' }, svg, idNum(cur.persen_kelola, 1) + '%');
    el('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', 'class': 'donut-center-label' }, svg, 'terkelola');

    byId('donutLegend').innerHTML = segs.map(function (s) {
      return '<div class="row"><span class="swatch" style="background:' + s.color + '"></span><span>' + s.name + ' — ' + idNum(s.value, 0) + ' ton (' + idNum(s.pct, 2) + '%)</span></div>';
    }).join('');
  }

  function renderKesenjangan() {
    var y = state.year, cur = kpiAt(y);
    var rasioBelum = (cur.belum_terkelola_tahunan_ton / cur.timbulan_tahunan_ton) * 100;
    byId('kesenjanganYearBadge').textContent = y;
    renderDonut(cur, rasioBelum);
    var rows = [
      ['Timbulan tahunan', idNum(cur.timbulan_tahunan_ton, 2) + ' ton'],
      ['Terkelola', idNum(cur.terkelola_tahunan_ton, 2) + ' ton (' + idNum(cur.persen_kelola, 2) + '%)'],
      ['Belum terkelola', idNum(cur.belum_terkelola_tahunan_ton, 2) + ' ton'],
      ['Rasio belum terkelola', idNum(rasioBelum, 2) + '%'],
      ['Recycling rate', idNum(cur.persen_recycling_rate, 2) + '%'],
      ['Jumlah penduduk', idNum(cur.jumlah_penduduk_jiwa, 0) + ' jiwa'],
      ['Selisih rumus (validasi)', idNum(cur.selisih_rumus, 6) + ' ton']
    ];
    byId('kesenjanganPanel').innerHTML =
      '<div class="big">' + idNum(cur.belum_terkelola_tahunan_ton, 0) + ' ton <span class="muted">belum terkelola (' + idNum(rasioBelum, 2) + '%)</span></div>' +
      rows.map(function (r) { return '<div class="row"><span>' + r[0] + '</span><span>' + r[1] + '</span></div>'; }).join('');
  }

  function renderCBQ() {
    var maxBelum = DATA.years.reduce(function (a, y) {
      return kpiAt(y).belum_terkelola_tahunan_ton > kpiAt(a).belum_terkelola_tahunan_ton ? y : a;
    }, DATA.years[0]);
    var mb = kpiAt(maxBelum);
    var mbPct = (mb.belum_terkelola_tahunan_ton / mb.timbulan_tahunan_ton) * 100;

    var comp2025 = DATA.komposisi.filter(function (r) {
      return r.tahun === 2025 && (r.kategori === 'Sisa Makanan' || r.kategori === 'Plastik');
    }).reduce(function (s, r) { return s + (r.persen || 0); }, 0);

    var first = kpiAt(DATA.years[0]), last = kpiAt(DATA.years[DATA.years.length - 1]);
    var kapitaDelta = ((last.timbulan_kg_per_orang_hari - first.timbulan_kg_per_orang_hari) / first.timbulan_kg_per_orang_hari) * 100;

    var worstDelta = DATA.years.filter(function (y) { return kpiAt(y).delta_penanganan !== null; })
      .reduce(function (a, y) { return kpiAt(y).delta_penanganan < kpiAt(a).delta_penanganan ? y : a; });
    var wd = kpiAt(worstDelta).delta_penanganan;

    var items = [
      'CBQ1 — Kesenjangan terbesar pada ' + maxBelum + ': ' + idNum(mb.belum_terkelola_tahunan_ton, 2) + ' ton (' + idNum(mbPct, 2) + '%) dari timbulan.',
      'CBQ2 — Sisa makanan + plastik pada 2025 = ' + idNum(comp2025, 1) + '%; kandidat fokus kajian pemilahan (proporsi, bukan janji pengurangan).',
      'CBQ3 — Per kapita ' + idNum(first.timbulan_kg_per_orang_hari, 3) + ' → ' + idNum(last.timbulan_kg_per_orang_hari, 3) + ' kg/orang/hari (' + (kapitaDelta >= 0 ? '+' : '−') + idNum(Math.abs(kapitaDelta), 2) + '% vs 2021).',
      'CBQ4 — Penurunan penanganan terbesar pada ' + worstDelta + ' (' + idNum(wd, 2) + ' ton); sinyal audit definisi pelaporan, bukan evaluasi kausal.',
      'CBQ5 — Tumbuh kumulatif sejak 2021: timbulan ' + idNum(last.tumbuh_sampah, 2) + '% vs penduduk ' + idNum(last.tumbuh_penduduk, 2) + '%.'
    ];
    byId('cbqList').innerHTML = items.map(function (t) { return '<li>' + t + '</li>'; }).join('');
  }

  function renderDetails() {
    byId('sumberList').innerHTML = [
      'SIPSN/KLHK — timbulan, capaian pengelolaan, komposisi (agregat Kota Semarang, 2021–2025)',
      'BPS (sesuai dokumentasi workbook) — jumlah penduduk; rekonsiliasi 16 kecamatan vs total kota LULUS',
      'Dataset bersih: DOI 10.5281/zenodo.24240544 · <a href="https://zenodo.org/records/24240544" target="_blank" rel="noopener">zenodo.org/records/24240544</a> · berkas Restricted (metadata/DOI publik)',
      'Catatan: keterangan lisensi kustom di rekaman Zenodo bukan pengganti hak redistribusi penyedia data asli'
    ].map(function (t) { return '<li>' + t + '</li>'; }).join('');

    var badge = function (s) {
      var st = (s || '').toUpperCase();
      if (st === 'LULUS') return '<span class="badge badge-lulus">LULUS</span>';
      if (st === 'CATATAN') return '<span class="badge badge-catatan">CATATAN</span>';
      return '<span class="badge badge-tinjau">PERLU TINJAU</span>';
    };
    byId('validasiBody').innerHTML = DATA.validasi.map(function (v) {
      return '<tr><td>' + v.pemeriksaan + '</td><td>' + badge(v.status) + '</td><td>' + v.hasil + '</td></tr>';
    }).join('');
  }

  function renderAll() {
    renderScorecards();
    renderTimbulanChart();
    renderKelolaChart(byId('chartKelola'));
    renderKelolaLegend();
    renderIndeksChart();
    renderKomposisiSection();
    renderKesenjangan();
    renderCBQ();
    byId('detailsToggle').setAttribute('aria-expanded', String(!byId('detailsPanel').hidden));
  }

  function init() {
    var yearSelect = byId('yearSelect');
    DATA.years.forEach(function (y) {
      var o = document.createElement('option');
      o.value = String(y); o.textContent = String(y);
      yearSelect.appendChild(o);
    });
    yearSelect.value = String(state.year);
    yearSelect.addEventListener('change', function () {
      state.year = parseInt(this.value, 10);
      renderScorecards(); renderKesenjangan();
    });

    var compSelect = byId('komposisiYear');
    DATA.years.forEach(function (y) {
      var o = document.createElement('option');
      o.value = String(y); o.textContent = String(y);
      compSelect.appendChild(o);
    });
    compSelect.value = String(state.komposisiYear);
    compSelect.addEventListener('change', function () {
      state.komposisiYear = parseInt(this.value, 10);
      renderKomposisiSection();
    });

    var panel = byId('detailsPanel');
    var openPanel = function () {
      panel.hidden = false;
      byId('detailsToggle').setAttribute('aria-expanded', 'true');
      byId('detailsClose').focus();
    };
    byId('detailsToggle').addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      this.setAttribute('aria-expanded', String(!panel.hidden));
    });
    var bannerBtn = byId('bannerDetails');
    if (bannerBtn) bannerBtn.addEventListener('click', openPanel);
    ['chartTimbulan', 'chartKelola', 'chartIndeks', 'chartKomposisi', 'chartDonut'].forEach(function (id) {
      bindTooltips(byId(id));
    });
    byId('detailsClose').addEventListener('click', function () {
      panel.hidden = true;
      byId('detailsToggle').setAttribute('aria-expanded', 'false');
      byId('detailsToggle').focus();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { panel.hidden = true; byId('detailsToggle').setAttribute('aria-expanded', 'false'); }
    });

    renderDetails();
    renderAll();
  }

  init();
})();
