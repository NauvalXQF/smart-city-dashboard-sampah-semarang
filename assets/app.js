(function () {
  'use strict';

  var DATA = window.DASHBOARD_DATA;
  var main = document.getElementById('mainContent');
  if (!DATA || !DATA.kpi || !Array.isArray(DATA.years) || !DATA.years.length) {
    if (main) {
      main.innerHTML = '<div class="card">Gagal memuat data dashboard. Jalankan <code>python tools/build_data.py</code> lalu muat ulang halaman.</div>';
    }
    return;
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  var META = DATA.meta || {};
  var BREAK_YEARS = (META.break_years || []).map(Number);
  var LATEST_YEAR = DATA.years[DATA.years.length - 1];
  var BASE_YEAR = DATA.years[0];
  var COMPOSITION_FOCUS = { 'Sisa Makanan': true, 'Plastik': true };

  var state = {
    year: LATEST_YEAR,
    tableTab: 'komposisi',
    search: '',
    filter: 'all',
    sortKey: 'persen',
    sortDir: 'desc',
    page: 1,
    pageSize: 5,
    isPrinting: false
  };

  var resizeRaf = null;
  var lastFocus = null;

  // Material Design 3 / Google Analytics 4 harmonized palette
  var C = {
    timbulan: '#1A73E8',
    terkelola: '#0D9488',
    pengurangan: '#1A73E8',
    penanganan: '#0D9488',
    penduduk: '#EA8600',
    gap: 'rgba(234, 134, 0, 0.14)',
    focus: '#1A73E8',
    plastik: '#EA8600',
    other: '#94A3B8',
    unmanaged: '#CBD5E1',
    donutBelum: '#E2E8F0'
  };

  // ---------- helpers ----------
  function byId(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function idNum(n, digits) {
    if (n === null || n === undefined || typeof n !== 'number' || !isFinite(n)) return '—';
    var d = digits === undefined ? 0 : digits;
    return n.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function signedNum(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + idNum(n, digits);
  }

  function kpiAt(year) { return DATA.kpi[String(year)]; }

  function prevYear(year) {
    var i = DATA.years.indexOf(year);
    return i > 0 ? DATA.years[i - 1] : null;
  }

  function isReviewYear(year) { return BREAK_YEARS.indexOf(Number(year)) !== -1; }

  function niceScale(min, max, count, forceZero) {
    var lo0 = forceZero ? 0 : min;
    var hi0 = max;
    if (lo0 === hi0) { lo0 -= 1; hi0 += 1; }
    var span = hi0 - lo0;
    var step0 = span / (count || 4);
    var mag = Math.pow(10, Math.floor(Math.log10(step0)));
    var norm = step0 / mag;
    var step = (norm >= 5 ? 10 : norm >= 2.2 ? 5 : norm >= 1.2 ? 2 : 1) * mag;
    var lo = forceZero ? 0 : Math.floor(min / step) * step;
    var hi = Math.ceil(max / step) * step;
    var ticks = [];
    for (var v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Number(v.toFixed(6)));
    return { lo: lo, hi: hi, ticks: ticks, step: step };
  }

  function el(tag, attrs, parent, text) {
    var node = document.createElementNS(SVGNS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined) return;
        if (key === 'dataTip') node.setAttribute('data-tip', String(value));
        else if (key === 'dataTipColor') node.setAttribute('data-tip-color', String(value));
        else if (key === 'dataYear') node.setAttribute('data-year', String(value));
        else node.setAttribute(key, String(value));
      });
    }
    if (text !== undefined) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  function roundedTopRectPath(x, y, w, h, r) {
    if (h <= 0 || w <= 0) return '';
    var rad = Math.min(r, w / 2, h);
    return [
      'M', x, y + h,
      'L', x, y + rad,
      'Q', x, y, x + rad, y,
      'L', x + w - rad, y,
      'Q', x + w, y, x + w, y + rad,
      'L', x + w, y + h,
      'Z'
    ].join(' ');
  }

  function roundedRightRectPath(x, y, w, h, r) {
    if (h <= 0 || w <= 0) return '';
    var rad = Math.min(r, h / 2, w);
    return [
      'M', x, y,
      'L', x + w - rad, y,
      'Q', x + w, y, x + w, y + rad,
      'L', x + w, y + h - rad,
      'Q', x + w, y + h, x + w - rad, y + h,
      'L', x, y + h,
      'Z'
    ].join(' ');
  }

  function clearSvg(svg) {
    while (svg && svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function chartSize(svg, fallbackHeight) {
    if (!svg) return null;
    var rect = svg.getBoundingClientRect();
    var width = rect.width || 0;
    if (width < 80) return null;
    return {
      width: Math.round(width),
      height: Math.max(140, Math.round(rect.height || fallbackHeight || 240))
    };
  }

  // ---------- URL state ----------
  function readYearFromUrl() {
    try {
      var value = new URLSearchParams(window.location.search).get('tahun');
      if (!value) return null;
      var year = parseInt(value, 10);
      return DATA.years.indexOf(year) !== -1 ? year : null;
    } catch (error) {
      return null;
    }
  }

  function writeYearToUrl(year, replace) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('tahun', String(year));
      window.history[replace ? 'replaceState' : 'pushState']({ tahun: year }, '', url.toString());
    } catch (error) {
      // file:// atau lingkungan tanpa History API: filter tetap bekerja tanpa URL state.
    }
  }

  // ---------- tooltip ----------
  var tooltipEl = null;

  function ensureTooltip() {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'tooltip';
      tooltipEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }

  function fillTooltip(raw, accentColor) {
    var tip = ensureTooltip();
    var parts = String(raw).split('\n');
    tip.textContent = '';
    var title = document.createElement('div');
    title.className = 'tt-title';
    if (accentColor) {
      var dot = document.createElement('span');
      dot.className = 'tt-dot';
      dot.style.background = accentColor;
      title.appendChild(dot);
    }
    var titleText = document.createElement('span');
    titleText.textContent = parts.shift() || '';
    title.appendChild(titleText);
    tip.appendChild(title);
    parts.forEach(function (part) {
      var index = part.indexOf(':');
      var row = document.createElement('div');
      row.className = 'tt-row';
      var key = document.createElement('span');
      key.textContent = index >= 0 ? part.slice(0, index) : part;
      var value = document.createElement('span');
      value.textContent = index >= 0 ? part.slice(index + 1).trim() : '';
      row.appendChild(key);
      row.appendChild(value);
      tip.appendChild(row);
    });
  }

  function showTooltip(clientX, clientY, above) {
    var tip = ensureTooltip();
    var pad = 12;
    var width = tip.offsetWidth || 220;
    var height = tip.offsetHeight || 68;
    var x = above ? clientX - width / 2 : clientX + 14;
    var y = above ? clientY - height - 10 : clientY + 14;
    tip.style.left = Math.min(window.innerWidth - width - pad, Math.max(pad, x)) + 'px';
    tip.style.top = Math.min(window.innerHeight - height - pad, Math.max(pad, y)) + 'px';
    tip.classList.add('visible');
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove('visible');
  }

  function bindTooltips(svg) {
    if (!svg) return;
    svg.addEventListener('mousemove', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('[data-tip]') : null;
      if (!target) { hideTooltip(); return; }
      fillTooltip(target.getAttribute('data-tip'), target.getAttribute('data-tip-color'));
      showTooltip(event.clientX, event.clientY, false);
    });
    svg.addEventListener('mouseleave', hideTooltip);
    svg.addEventListener('focusin', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('[data-tip]') : null;
      if (!target) return;
      fillTooltip(target.getAttribute('data-tip'), target.getAttribute('data-tip-color'));
      var rect = target.getBoundingClientRect();
      showTooltip(rect.left + rect.width / 2, rect.top, true);
    });
    svg.addEventListener('focusout', function (event) {
      if (!svg.contains(event.relatedTarget)) hideTooltip();
    });
    svg.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('[data-tip]') : null;
      if (!target) return;
      var yr = target.getAttribute('data-year');
      if (yr) {
        var parsed = parseInt(yr, 10);
        if (DATA.years.indexOf(parsed) !== -1 && parsed !== state.year) {
          setYear(parsed, { updateUrl: true });
          return;
        }
      }
      fillTooltip(target.getAttribute('data-tip'), target.getAttribute('data-tip-color'));
      var rect = target.getBoundingClientRect();
      showTooltip(rect.left + rect.width / 2, rect.top, true);
    });
    svg.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var target = event.target && event.target.closest ? event.target.closest('[data-year]') : null;
      if (!target) return;
      var parsed = parseInt(target.getAttribute('data-year'), 10);
      if (DATA.years.indexOf(parsed) !== -1 && parsed !== state.year) {
        event.preventDefault();
        setYear(parsed, { updateUrl: true });
      }
    });
  }

  // ---------- legends ----------
  function renderLegend(id, items) {
    var box = byId(id);
    if (!box) return;
    box.textContent = '';
    items.forEach(function (item) {
      var span = document.createElement('span');
      span.className = 'legend-item';
      var swatch = document.createElement('span');
      swatch.className = 'swatch' +
        (item.dot ? ' dot' : '') +
        (item.bar ? ' bar' : '') +
        (item.area ? ' area' : '') +
        (item.na ? ' na' : '');
      if (item.color) swatch.style.background = item.color;
      span.appendChild(swatch);
      span.appendChild(document.createTextNode(item.name));
      box.appendChild(span);
    });
  }

  // ---------- global year pills & notice banner ----------
  function renderYearPills() {
    var container = byId('yearPills');
    if (!container) return;
    container.innerHTML = DATA.years.map(function (year) {
      var active = year === state.year;
      var review = isReviewYear(year);
      return '<button type="button" class="year-pill' + (active ? ' active' : '') + '"' +
        ' data-select-year="' + year + '"' +
        ' aria-pressed="' + (active ? 'true' : 'false') + '"' +
        (review ? ' title="Tahun ' + year + ' berstatus perlu tinjau"' : '') + '>' +
        year +
        (review ? '<span class="year-pill-dot" aria-hidden="true"></span>' : '') +
      '</button>';
    }).join('');
  }

  function renderContextBanner() {
    var banner = byId('contextBanner');
    if (!banner) return;
    var year = state.year;
    var py = prevYear(year);
    var review = isReviewYear(year);
    banner.className = 'context-banner' + (review ? ' is-review' : '');

    var iconSvg = review
      ? '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 3.2L17.5 16H2.5L10 3.2z" stroke-linejoin="round"/><path d="M10 8v3.5M10 13.8h.01" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v4.5M10 6.3h.01" stroke-linecap="round"/></svg>';

    var message;
    if (review) {
      message = '<strong>Tahun ' + year + ' perlu tinjau:</strong> Pencatatan 2024–2025 berbeda dari 2021–2023 (pembanding terakhir: ' +
        escapeHtml(META.comparable_last_year || '2023') + '); delta tidak dinilai sebagai kinerja.';
    } else if (!py) {
      message = '<strong>Tahun dasar ' + year + ':</strong> Menjadi titik acuan awal (indeks = 100) untuk perbandingan tahun-tahun berikutnya.';
    } else {
      message = '<strong>Tahun ' + year + ' sebanding dengan ' + py + ':</strong> Definisi pelaporan konsisten sehingga angka capaian dapat dibandingkan langsung.';
    }

    banner.innerHTML =
      '<div class="context-banner-main">' +
        '<span class="context-icon" aria-hidden="true">' + iconSvg + '</span>' +
        '<span>' + message + '</span>' +
      '</div>' +
      '<button type="button" class="banner-link" data-open-details>Penjelasan metodologi →</button>';
  }

  // ---------- TIER 1: KPI SCORECARDS ----------
  function kpiSparklineSvg(values, color, options) {
    var opts = options || {};
    var W = 180;
    var H = 24;
    var px = 5;
    var py = 4;
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = (max - min) || 1;
    var pts = values.map(function (v, i) {
      var x = px + (values.length === 1 ? (W - px * 2) / 2 : (i / (values.length - 1)) * (W - px * 2));
      var y = H - py - ((v - min) / span) * (H - py * 2);
      return { x: x, y: y, year: DATA.years[i] };
    });

    var areaPath = 'M ' + pts[0].x.toFixed(1) + ' ' + (H - 1);
    pts.forEach(function (p) { areaPath += ' L ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1); });
    areaPath += ' L ' + pts[pts.length - 1].x.toFixed(1) + ' ' + (H - 1) + ' Z';

    var segs = [];
    for (var i = 1; i < pts.length; i += 1) {
      var isDash = opts.dashReview && (isReviewYear(pts[i].year) || isReviewYear(pts[i - 1].year));
      segs.push(
        '<line x1="' + pts[i - 1].x.toFixed(1) + '" y1="' + pts[i - 1].y.toFixed(1) +
        '" x2="' + pts[i].x.toFixed(1) + '" y2="' + pts[i].y.toFixed(1) +
        '" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round"' +
        (isDash ? ' stroke-dasharray="3 2.5" opacity="0.7"' : '') + ' />'
      );
    }

    var selIdx = DATA.years.indexOf(state.year);
    var selPt = selIdx >= 0 ? pts[selIdx] : pts[pts.length - 1];

    return '<svg class="kpi-sparkline" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="' + areaPath + '" fill="' + color + '" opacity="0.09" />' +
      segs.join('') +
      '<circle cx="' + selPt.x.toFixed(1) + '" cy="' + selPt.y.toFixed(1) + '" r="3.4" fill="#FFFFFF" stroke="' + color + '" stroke-width="2" />' +
    '</svg>';
  }

  function renderKpiGrid() {
    var grid = byId('kpiGrid');
    if (!grid) return;
    var year = state.year;
    var cur = kpiAt(year);
    var base = kpiAt(BASE_YEAR);
    var py = prevYear(year);
    var prev = py ? kpiAt(py) : null;
    var review = isReviewYear(year);

    var total = cur.timbulan_tahunan_ton;
    var terkelola = cur.terkelola_tahunan_ton;
    var belum = cur.belum_terkelola_tahunan_ton;
    var pct = Math.max(0, Math.min(100, cur.persen_kelola));
    var belumPct = total ? (belum / total) * 100 : 0;
    var daily = total / 365;
    var perCapita = cur.timbulan_kg_per_orang_hari;
    var perCapitaMonthly = perCapita * 30.44;
    var pendudukJt = cur.jumlah_penduduk_jiwa / 1000000;

    var timbulanSeries = DATA.years.map(function (y) { return kpiAt(y).timbulan_tahunan_ton; });
    var belumSeries = DATA.years.map(function (y) { return kpiAt(y).belum_terkelola_tahunan_ton; });
    var perCapitaSeries = DATA.years.map(function (y) { return kpiAt(y).timbulan_kg_per_orang_hari; });

    // KPI 1 pill: strictly follows comparability rule
    var kelolaPill;
    if (review) {
      kelolaPill = '<span class="pill pill-warning">Perlu tinjau · tidak dibandingkan</span>';
    } else if (!prev) {
      kelolaPill = '<span class="pill pill-neutral">Tahun dasar (' + year + ')</span>';
    } else {
      var diffPp = cur.persen_kelola - prev.persen_kelola;
      var cls = diffPp > 0 ? 'pill-success' : diffPp < 0 ? 'pill-warning' : 'pill-neutral';
      kelolaPill = '<span class="pill ' + cls + '">' + signedNum(diffPp, 1) + ' pp vs ' + py + '</span>';
    }

    // KPI 2 pill: timbulan is verified comparable across all years
    var timbulanPill = year === BASE_YEAR
      ? '<span class="pill pill-neutral">Tahun dasar (2021 = 100)</span>'
      : '<span class="pill pill-neutral">' + signedNum(cur.tumbuh_sampah, 2) + '% sejak ' + BASE_YEAR + '</span>';

    // KPI 3 pill: clarify accounting gap meaning
    var belumPill = review
      ? '<span class="pill pill-warning">Perlu tinjau · selisih laporan</span>'
      : '<span class="pill pill-neutral">Selisih laporan · bukan dibuang</span>';

    // KPI 4 pill: per-capita change vs base year
    var perCapitaDelta = base && base.timbulan_kg_per_orang_hari
      ? ((perCapita / base.timbulan_kg_per_orang_hari) - 1) * 100
      : 0;
    var perCapitaPill;
    if (year === BASE_YEAR) {
      perCapitaPill = '<span class="pill pill-neutral">Tahun dasar (' + BASE_YEAR + ')</span>';
    } else {
      var capCls = perCapitaDelta < 0 ? 'pill-success' : perCapitaDelta > 0 ? 'pill-warning' : 'pill-neutral';
      perCapitaPill = '<span class="pill ' + capCls + '">' + signedNum(perCapitaDelta, 2) + '% sejak ' + BASE_YEAR + '</span>';
    }

    var iconCheck = '<span class="kpi-icon ' + (review ? 'kpi-icon-neutral' : 'kpi-icon-teal') + '" aria-hidden="true"><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 5.5L8.2 14l-4.2-4"/></svg></span>';
    var iconVolume = '<span class="kpi-icon kpi-icon-blue" aria-hidden="true"><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14.5L10 18l7-3.5M3 10.5L10 14l7-3.5M10 3L3 6.5 10 10l7-3.5L10 3z"/></svg></span>';
    var iconGap = '<span class="kpi-icon ' + (review ? 'kpi-icon-amber' : 'kpi-icon-neutral') + '" aria-hidden="true"><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7" stroke-dasharray="3.5 3"/><path d="M10 6.5V10l2.4 1.5"/></svg></span>';
    var iconPerson = '<span class="kpi-icon kpi-icon-green" aria-hidden="true"><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="6.5" r="3"/><path d="M4.2 16.5a5.8 5.8 0 0 1 11.6 0"/></svg></span>';

    grid.innerHTML =
      '<article class="kpi-card">' +
        '<div class="kpi-top"><span class="kpi-label">Tercatat Terkelola</span>' + iconCheck + '</div>' +
        '<div>' +
          '<div class="kpi-value-wrap"><strong class="kpi-value">' + idNum(pct, 1) + '%</strong></div>' +
          '<div class="kpi-sub"><strong>' + idNum(terkelola, 0) + '</strong> ton/tahun</div>' +
          '<div class="kpi-visual">' +
            '<div class="kpi-progress" role="img" aria-label="' + idNum(pct, 1) + ' persen tercatat terkelola">' +
              '<span class="kpi-progress-fill' + (review ? ' is-review' : '') + '" style="width:' + pct.toFixed(2) + '%"></span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="kpi-footer">' + kelolaPill + '</div>' +
      '</article>' +

      '<article class="kpi-card">' +
        '<div class="kpi-top"><span class="kpi-label">Total Timbulan Sampah</span>' + iconVolume + '</div>' +
        '<div>' +
          '<div class="kpi-value-wrap"><strong class="kpi-value">' + idNum(total, 0) + '</strong><span class="kpi-unit">ton/thn</span></div>' +
          '<div class="kpi-sub">≈ <strong>' + idNum(daily, 0) + '</strong> ton/hari</div>' +
          '<div class="kpi-visual">' + kpiSparklineSvg(timbulanSeries, C.timbulan) + '</div>' +
        '</div>' +
        '<div class="kpi-footer">' + timbulanPill + '</div>' +
      '</article>' +

      '<article class="kpi-card">' +
        '<div class="kpi-top"><span class="kpi-label">Belum Tercatat Terkelola</span>' + iconGap + '</div>' +
        '<div>' +
          '<div class="kpi-value-wrap"><strong class="kpi-value">' + idNum(belum, 0) + '</strong><span class="kpi-unit">ton/thn</span></div>' +
          '<div class="kpi-sub"><strong>' + idNum(belumPct, 1) + '%</strong> dari total timbulan</div>' +
          '<div class="kpi-visual">' + kpiSparklineSvg(belumSeries, review ? '#EA8600' : '#64748B', { dashReview: true }) + '</div>' +
        '</div>' +
        '<div class="kpi-footer">' + belumPill + '</div>' +
      '</article>' +

      '<article class="kpi-card">' +
        '<div class="kpi-top"><span class="kpi-label">Timbulan per Kapita</span>' + iconPerson + '</div>' +
        '<div>' +
          '<div class="kpi-value-wrap"><strong class="kpi-value">' + idNum(perCapita, 2) + '</strong><span class="kpi-unit">kg/hr</span></div>' +
          '<div class="kpi-sub">≈ ' + idNum(perCapitaMonthly, 0) + ' kg/bln · ' + idNum(pendudukJt, 2) + ' jt jiwa</div>' +
          '<div class="kpi-visual">' + kpiSparklineSvg(perCapitaSeries, '#0D9488') + '</div>' +
        '</div>' +
        '<div class="kpi-footer">' + perCapitaPill + '</div>' +
      '</article>';
  }

  // ---------- TIER 2A RIGHT: CONSOLIDATED READING GUIDE & INSIGHTS ----------
  function knownComposition(year) {
    return compositionRowsFor(year).filter(function (row) { return row.persen !== null; })
      .sort(function (a, b) { return b.persen - a.persen; });
  }

  function renderReadingGuide() {
    var box = byId('readingGuide');
    if (!box) return;
    var badge = byId('guideYearBadge');
    if (badge) badge.textContent = String(state.year);

    var year = state.year;
    var cur = kpiAt(year);
    var py = prevYear(year);
    var prev = py ? kpiAt(py) : null;
    var review = isReviewYear(year);

    var known = knownComposition(year);
    var top1 = known[0] || { kategori: 'Sisa Makanan', persen: 0 };
    var top2 = known[1] || { kategori: 'Plastik', persen: 0 };
    var topSum = top1.persen + top2.persen;

    var totals = DATA.years.map(function (y) { return kpiAt(y).timbulan_tahunan_ton; });
    var minRb = Math.min.apply(null, totals) / 1000;
    var maxRb = Math.max.apply(null, totals) / 1000;

    var items = [];
    if (review) {
      items.push(
        '<div class="insight-item is-warning"><span class="insight-dot" aria-hidden="true"></span><div>' +
          '<strong>Status ' + year + ' (Perlu Tinjau):</strong> Tercatat ' + idNum(cur.persen_kelola, 1) +
          '% terkelola, tetapi perubahan definisi membuat angka ini tidak sebanding dengan tahun sebelumnya.' +
        '</div></div>'
      );
    } else if (py && prev) {
      var diff = cur.persen_kelola - prev.persen_kelola;
      var trendWord = diff > 0 ? 'naik' : diff < 0 ? 'turun' : 'tetap';
      items.push(
        '<div class="insight-item is-teal"><span class="insight-dot" aria-hidden="true"></span><div>' +
          '<strong>Capaian ' + year + ':</strong> ' + idNum(cur.persen_kelola, 1) + '% tercatat terkelola (' +
          trendWord + ' dari ' + idNum(prev.persen_kelola, 1) + '% pada ' + py + ').' +
        '</div></div>'
      );
    } else {
      items.push(
        '<div class="insight-item is-teal"><span class="insight-dot" aria-hidden="true"></span><div>' +
          '<strong>Tahun Dasar ' + year + ':</strong> ' + idNum(cur.persen_kelola, 1) +
          '% tercatat terkelola dari ' + idNum(cur.timbulan_tahunan_ton, 0) + ' ton timbulan.' +
        '</div></div>'
      );
    }

    items.push(
      '<div class="insight-item"><span class="insight-dot" aria-hidden="true"></span><div>' +
        '<strong>Dominasi Komposisi:</strong> ' + escapeHtml(top1.kategori) + ' (' + idNum(top1.persen, 1) +
        '%) dan ' + escapeHtml(top2.kategori) + ' (' + idNum(top2.persen, 1) + '%) mencapai <strong>' +
        idNum(topSum, 1) + '%</strong> total sampah.' +
      '</div></div>'
    );

    items.push(
      '<div class="insight-item is-muted"><span class="insight-dot" aria-hidden="true"></span><div>' +
        '<strong>Volume Stabil:</strong> Sepanjang 2021–2025, timbulan berada pada rentang sempit ' +
        idNum(minRb, 0) + '–' + idNum(maxRb, 0) + ' ribu ton/tahun (data pelaporan agregat kota).' +
      '</div></div>'
    );

    box.innerHTML = items.join('');
  }

  function renderKelolaNote() {
    var note = byId('kelolaNote');
    if (!note) return;
    var cur = kpiAt(state.year);
    var review = isReviewYear(state.year);
    note.innerHTML = '<strong>Tahun ' + state.year + ':</strong> ' + idNum(cur.persen_kelola, 1) +
      '% sampah tercatat terkelola. ' +
      (review ? 'Periode ini berstatus perlu tinjau dan bukan penilaian kinerja.' : 'Angka sebanding dengan periode 2021–2023.');
  }

  // ---------- LINE CHART (Timbulan & Indeks) ----------
  function renderLineChart(svg, config) {
    var size = chartSize(svg, config.height || 276);
    if (!size) return;
    var W = size.width;
    var H = size.height;
    var narrow = W < 480;
    var P = { top: 34, right: narrow ? 16 : 22, bottom: 32, left: narrow ? 46 : 56 };
    var plotW = W - P.left - P.right;
    var plotH = H - P.top - P.bottom;
    if (plotW < 60 || plotH < 60) return;

    clearSvg(svg);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var xs = DATA.years.map(function (_, index) {
      return P.left + (DATA.years.length === 1 ? plotW / 2 : (index / (DATA.years.length - 1)) * plotW);
    });

    var values = [];
    config.series.forEach(function (series) {
      series.values.forEach(function (value) {
        if (value !== null && value !== undefined && isFinite(value)) values.push(value);
      });
    });
    if (!values.length) return;

    var dataMin = Math.min.apply(null, values);
    var dataMax = Math.max.apply(null, values);
    var scale;
    if (config.forceZero) {
      scale = niceScale(0, dataMax, 4, true);
    } else {
      var padding = (dataMax - dataMin) * 0.18 || 1;
      scale = niceScale(dataMin - padding, dataMax + padding, 4, false);
    }
    var y = function (value) {
      return P.top + plotH - ((value - scale.lo) / (scale.hi - scale.lo)) * plotH;
    };

    // Review period background band (2024–2025)
    if (config.showBreakBand !== false) {
      var breakIndexes = BREAK_YEARS.map(function (year) { return DATA.years.indexOf(year); })
        .filter(function (index) { return index >= 0; });
      var firstBreak = breakIndexes.length ? Math.min.apply(null, breakIndexes) : -1;
      if (firstBreak >= 0) {
        var breakStart = firstBreak === 0 ? P.left : (xs[firstBreak - 1] + xs[firstBreak]) / 2;
        var breakEnd = W - P.right;
        el('rect', {
          x: breakStart, y: P.top, width: Math.max(0, breakEnd - breakStart), height: plotH, rx: 4,
          'class': 'break-band', 'aria-hidden': 'true'
        }, svg);
        if (breakEnd - breakStart > 44) {
          el('text', {
            x: breakStart + (breakEnd - breakStart) / 2, y: P.top - 12,
            'text-anchor': 'middle', 'class': 'break-label', 'aria-hidden': 'true'
          }, svg, W < 440 ? 'perlu tinjau' : '2024–2025: perlu tinjau');
        }
      }
    }

    // Selected year highlight band
    var selectedIndex = DATA.years.indexOf(state.year);
    if (selectedIndex >= 0) {
      var bandStart = selectedIndex === 0 ? P.left : (xs[selectedIndex - 1] + xs[selectedIndex]) / 2;
      var bandEnd = selectedIndex === DATA.years.length - 1 ? W - P.right : (xs[selectedIndex] + xs[selectedIndex + 1]) / 2;
      el('rect', {
        x: bandStart, y: P.top, width: Math.max(0, bandEnd - bandStart), height: plotH,
        'class': 'selected-year-band', 'aria-hidden': 'true'
      }, svg);
    }

    // Horizontal gridlines & Y ticks
    scale.ticks.forEach(function (tick) {
      el('line', {
        x1: P.left, x2: W - P.right, y1: y(tick), y2: y(tick),
        'class': 'grid-line', 'aria-hidden': 'true'
      }, svg);
      el('text', {
        x: P.left - 8, y: y(tick) + 3.5, 'text-anchor': 'end',
        'class': 'tick', 'aria-hidden': 'true'
      }, svg, config.tickFormat ? config.tickFormat(tick) : String(tick));
    });

    // Optional reference baseline (e.g., 100 for index chart)
    if (config.baseline !== undefined && config.baseline >= scale.lo && config.baseline <= scale.hi) {
      el('line', {
        x1: P.left, x2: W - P.right, y1: y(config.baseline), y2: y(config.baseline),
        'class': 'baseline-line', 'aria-hidden': 'true'
      }, svg);
    }

    // X axis line & year labels
    el('line', {
      x1: P.left, x2: W - P.right, y1: P.top + plotH, y2: P.top + plotH,
      'class': 'axis', 'aria-hidden': 'true'
    }, svg);

    DATA.years.forEach(function (year, index) {
      el('text', {
        x: xs[index], y: H - 10, 'text-anchor': 'middle',
        'class': 'tick' + (year === state.year ? ' selected-tick' : ''),
        'aria-hidden': 'true'
      }, svg, String(year));
    });

    // Optional shaded gap area with soft vertical gradient
    if (config.gapArea && config.series.length >= 2) {
      var defs = el('defs', {}, svg);
      var grad = el('linearGradient', { id: 'gapGrad', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
      el('stop', { offset: '0%', 'stop-color': '#EA8600', 'stop-opacity': '0.16' }, grad);
      el('stop', { offset: '100%', 'stop-color': '#EA8600', 'stop-opacity': '0.03' }, grad);

      var topValues = config.series[0].values;
      var bottomValues = config.series[1].values;
      var hasArea = true;
      topValues.forEach(function (value, index) {
        if (value === null || value === undefined || bottomValues[index] === null || bottomValues[index] === undefined) {
          hasArea = false;
        }
      });
      if (hasArea) {
        var area = '';
        topValues.forEach(function (value, index) {
          area += (index === 0 ? 'M' : 'L') + xs[index].toFixed(2) + ' ' + y(value).toFixed(2) + ' ';
        });
        for (var i = bottomValues.length - 1; i >= 0; i -= 1) {
          area += 'L' + xs[i].toFixed(2) + ' ' + y(bottomValues[i]).toFixed(2) + ' ';
        }
        area += 'Z';
        el('path', { d: area, fill: 'url(#gapGrad)', 'aria-hidden': 'true' }, svg);
      }
    }

    // Optional soft area gradient under each curve (used by Indeks chart)
    if (config.softArea) {
      var aDefs = el('defs', {}, svg);
      config.series.forEach(function (series, sIdx) {
        var gid = 'lineGrad_' + (svg.id || 'c') + '_' + sIdx;
        var lg = el('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' }, aDefs);
        el('stop', { offset: '0%', 'stop-color': series.color, 'stop-opacity': '0.11' }, lg);
        el('stop', { offset: '100%', 'stop-color': series.color, 'stop-opacity': '0.00' }, lg);
        var d = '';
        series.values.forEach(function (v, idx) {
          if (v === null || v === undefined || !isFinite(v)) return;
          d += (idx === 0 ? 'M' : 'L') + xs[idx].toFixed(2) + ' ' + y(v).toFixed(2) + ' ';
        });
        if (d) {
          d += 'L' + xs[xs.length - 1].toFixed(2) + ' ' + (P.top + plotH).toFixed(2) +
            ' L' + xs[0].toFixed(2) + ' ' + (P.top + plotH).toFixed(2) + ' Z';
          el('path', { d: d, fill: 'url(#' + gid + ')', 'aria-hidden': 'true' }, svg);
        }
      });
    }

    if (selectedIndex >= 0) {
      el('line', {
        x1: xs[selectedIndex], x2: xs[selectedIndex], y1: P.top, y2: P.top + plotH,
        'class': 'selected-year-line', 'aria-hidden': 'true'
      }, svg);
    }

    // Draw lines
    config.series.forEach(function (series) {
      series.values.forEach(function (value, index) {
        if (index === 0) return;
        var prevValue = series.values[index - 1];
        if (value === null || value === undefined || !isFinite(value) ||
            prevValue === null || prevValue === undefined || !isFinite(prevValue)) return;
        var segmentReview = config.dashedBreak !== false &&
          (isReviewYear(DATA.years[index]) || isReviewYear(DATA.years[index - 1]));
        el('line', {
          x1: xs[index - 1], y1: y(prevValue), x2: xs[index], y2: y(value),
          stroke: series.color, 'stroke-width': 2.5,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          'stroke-dasharray': segmentReview ? '5 4' : null,
          opacity: segmentReview ? 0.78 : 1,
          'aria-hidden': 'true'
        }, svg);
      });
    });

    // Draw points & non-overlapping selected labels
    var selectedYs = [];
    config.series.forEach(function (series, seriesIndex) {
      series.values.forEach(function (value, index) {
        if (value === null || value === undefined || !isFinite(value)) return;
        var year = DATA.years[index];
        var tipValue = config.tipFormat ? config.tipFormat(value) : idNum(value, 2);
        var selected = index === selectedIndex;
        var cy = y(value);

        if (selected) {
          el('circle', {
            cx: xs[index], cy: cy, r: 10,
            fill: series.color, opacity: '0.14', 'aria-hidden': 'true'
          }, svg);
        }

        var point = el('circle', {
          cx: xs[index], cy: cy, r: selected ? 5.5 : 3.8,
          fill: '#FFFFFF', stroke: series.color, 'stroke-width': selected ? 2.4 : 2,
          'class': 'chart-point' + (selected ? ' point-selected' : ''),
          role: 'button', tabindex: '0',
          dataYear: year,
          dataTipColor: series.color,
          'aria-label': series.name + ' ' + year + ': ' + tipValue + (isReviewYear(year) && config.dashedBreak !== false ? ', perlu tinjau' : ''),
          dataTip: series.name + '\nTahun: ' + year + '\nNilai: ' + tipValue +
            (isReviewYear(year) && config.dashedBreak !== false ? '\nStatus: perlu tinjau' : '')
        }, svg);
        el('title', {}, point, series.name + ' ' + year + ': ' + tipValue);

        if (selected && config.showSelectedLabels !== false) {
          selectedYs.push({ seriesIndex: seriesIndex, y: cy, value: value, color: series.color });
        }
      });
    });

    // Smart label placement to avoid overlap when two series are very close (e.g. 2021–2023)
    if (selectedYs.length && selectedIndex >= 0) {
      selectedYs.sort(function (a, b) { return a.y - b.y; });
      var labelAnchor = 'middle';
      var labelX = xs[selectedIndex];
      if (selectedIndex === 0) { labelAnchor = 'start'; labelX += 8; }
      else if (selectedIndex === DATA.years.length - 1) { labelAnchor = 'end'; labelX -= 8; }

      selectedYs.forEach(function (item, idx) {
        var formatted = config.labelFormat ? config.labelFormat(item.value) : idNum(item.value, 1);
        if (idx > 0 && Math.abs(item.y - selectedYs[idx - 1].y) < 2) {
          var prevFormatted = config.labelFormat ? config.labelFormat(selectedYs[idx - 1].value) : idNum(selectedYs[idx - 1].value, 1);
          if (formatted === prevFormatted) return;
        }
        var labelY = item.y - 12;
        if (idx > 0 && Math.abs(item.y - selectedYs[idx - 1].y) < 22) {
          labelY = Math.min(P.top + plotH - 6, item.y + 19);
        } else {
          labelY = Math.max(P.top + 10, labelY);
        }
        el('text', {
          x: labelX, y: labelY,
          'text-anchor': labelAnchor,
          'class': 'value-label',
          fill: item.color,
          'aria-hidden': 'true'
        }, svg, formatted);
      });
    }
  }

  function renderTimbulanChart() {
    var cur = kpiAt(state.year);
    var review = isReviewYear(state.year);
    renderLineChart(byId('chartTimbulan'), {
      height: 276,
      forceZero: true,
      gapArea: true,
      series: [
        { name: 'Timbulan sampah', color: C.timbulan, values: DATA.years.map(function (year) { return kpiAt(year).timbulan_tahunan_ton; }) },
        { name: 'Tercatat terkelola', color: C.terkelola, values: DATA.years.map(function (year) { return kpiAt(year).terkelola_tahunan_ton; }) }
      ],
      tickFormat: function (value) { return idNum(value / 1000, 0) + ' rb'; },
      tipFormat: function (value) { return idNum(value, 2) + ' ton'; },
      labelFormat: function (value) { return idNum(value / 1000, 0) + ' rb'; }
    });

    var ratio = cur.timbulan_tahunan_ton ? (cur.belum_terkelola_tahunan_ton / cur.timbulan_tahunan_ton) * 100 : null;
    var text = '<strong>' + state.year + ':</strong> Timbulan ' + idNum(cur.timbulan_tahunan_ton, 0) +
      ' ton · Tercatat ' + idNum(cur.terkelola_tahunan_ton, 0) + ' ton · Selisih belum tercatat ' +
      idNum(cur.belum_terkelola_tahunan_ton, 0) + ' ton (' + idNum(ratio, 1) + '%).';
    if (review) text += ' Garis putus-putus menandakan periode perlu tinjau.';
    var gapNote = byId('gapNote');
    if (gapNote) gapNote.innerHTML = text;
  }

  // ---------- INDEX CHART (Promoted to Row 2C) ----------
  function renderIndeksChart() {
    var base = kpiAt(BASE_YEAR);
    var cur = kpiAt(state.year);
    renderLineChart(byId('chartIndeks'), {
      height: 272,
      forceZero: false,
      baseline: 100,
      softArea: true,
      showBreakBand: false,
      dashedBreak: false,
      series: [
        {
          name: 'Indeks timbulan',
          color: C.timbulan,
          values: DATA.years.map(function (year) { return (kpiAt(year).timbulan_tahunan_ton / base.timbulan_tahunan_ton) * 100; })
        },
        {
          name: 'Indeks penduduk',
          color: C.penduduk,
          values: DATA.years.map(function (year) { return (kpiAt(year).jumlah_penduduk_jiwa / base.jumlah_penduduk_jiwa) * 100; })
        }
      ],
      tickFormat: function (value) { return idNum(value, 0); },
      tipFormat: function (value) { return idNum(value, 2) + ' (2021 = 100)'; },
      labelFormat: function (value) { return idNum(value, 1); }
    });

    var note = byId('indeksNote');
    if (note) {
      if (state.year === BASE_YEAR) {
        note.innerHTML = '<strong>Tahun dasar ' + BASE_YEAR + ':</strong> Kedua indeks bernilai 100 sebagai titik acuan perbandingan.';
      } else {
        note.innerHTML = '<strong>Sejak ' + BASE_YEAR + ' hingga ' + state.year + ':</strong> Penduduk tumbuh ' +
          signedNum(cur.tumbuh_penduduk, 2) + '%, sedangkan timbulan ' + signedNum(cur.tumbuh_sampah, 2) +
          '% — sampah per orang turun tipis.';
      }
    }
  }

  // ---------- CAPAIAN BAR CHART ----------
  function renderKelolaChart() {
    var svg = byId('chartKelola');
    var size = chartSize(svg, 282);
    if (!size) return;
    var W = size.width;
    var H = size.height;
    var P = { top: 34, right: 18, bottom: 32, left: 42 };
    var plotW = W - P.left - P.right;
    var plotH = H - P.top - P.bottom;
    if (plotW < 60 || plotH < 60) return;

    clearSvg(svg);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var defs = el('defs', {}, svg);
    var pattern = el('pattern', {
      id: 'hatchReview', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'
    }, defs);
    el('rect', { width: 7, height: 7, fill: '#F1F5F9' }, pattern);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#94A3B8', 'stroke-width': 1.8 }, pattern);

    var y = function (value) { return P.top + plotH - (value / 100) * plotH; };
    var baseline = P.top + plotH;

    [0, 20, 40, 60, 80, 100].forEach(function (tick) {
      el('line', {
        x1: P.left, x2: W - P.right, y1: y(tick), y2: y(tick),
        'class': 'grid-line', 'aria-hidden': 'true'
      }, svg);
      el('text', {
        x: P.left - 8, y: y(tick) + 3.5, 'text-anchor': 'end',
        'class': 'tick', 'aria-hidden': 'true'
      }, svg, tick + '%');
    });

    el('line', {
      x1: P.left, x2: W - P.right, y1: baseline, y2: baseline,
      'class': 'axis', 'aria-hidden': 'true'
    }, svg);

    var slot = plotW / DATA.years.length;
    var barWidth = Math.min(50, slot * 0.54);
    DATA.years.forEach(function (year, index) {
      var center = P.left + slot * (index + 0.5);
      var value = kpiAt(year).persen_kelola;
      var review = isReviewYear(year);
      var selected = year === state.year;
      var barClass = (review ? 'bar-review' : 'bar-capaian') +
        (selected ? ' bar-selected' : ' bar-dimmed');

      var tip = 'Tercatat Terkelola (' + year + ')\nPersentase: ' + idNum(value, 1) + '%\nVolume: ' +
        idNum(kpiAt(year).terkelola_tahunan_ton, 0) + ' ton\nStatus: ' +
        (review ? 'Perlu tinjau (definisi berbeda)' : 'Sebanding (2021–2023)');

      var barTop = y(value);
      var barH = Math.max(0, baseline - barTop);
      var bar = el('path', {
        d: roundedTopRectPath(center - barWidth / 2, barTop, barWidth, barH, 5),
        'class': barClass,
        role: 'button', tabindex: '0',
        dataYear: year,
        dataTipColor: review ? '#94A3B8' : C.terkelola,
        'aria-label': 'Tahun ' + year + ': ' + idNum(value, 1) + '% sampah tercatat terkelola' + (review ? ', perlu tinjau' : '') + '. Klik untuk memilih tahun ini.',
        dataTip: tip
      }, svg);
      el('title', {}, bar, year + ': ' + idNum(value, 1) + '% tercatat terkelola' + (review ? ' (perlu tinjau)' : ''));

      // Positioned cleanly ABOVE the bar (P.top = 34 ensures zero collision even at 99.1%)
      el('text', {
        x: center, y: barTop - 9,
        'text-anchor': 'middle',
        'class': selected ? 'value-label' : 'value-label-muted',
        'aria-hidden': 'true'
      }, svg, idNum(value, 1) + '%' + (review ? '*' : ''));

      el('text', {
        x: center, y: H - 10, 'text-anchor': 'middle',
        'class': 'tick' + (selected ? ' selected-tick' : ''),
        'aria-hidden': 'true'
      }, svg, String(year));
    });
  }

  // ---------- COMPOSITION CHART ----------
  function compositionRowsFor(year) {
    return DATA.komposisi.filter(function (row) { return row.tahun === year; });
  }

  function orderedComposition(rows) {
    var known = rows.filter(function (row) { return row.persen !== null; })
      .sort(function (a, b) { return b.persen - a.persen; });
    var missing = rows.filter(function (row) { return row.persen === null; });
    return known.concat(missing);
  }

  function compositionTicks(xMax) {
    var step = xMax > 60 ? 20 : xMax > 30 ? 10 : xMax > 15 ? 5 : 2;
    var ticks = [];
    for (var value = 0; value <= xMax + 1e-9; value += step) ticks.push(value);
    return ticks;
  }

  function renderKomposisiChart() {
    var svg = byId('chartKomposisi');
    var size = chartSize(svg, 312);
    if (!size) return;
    var W = size.width;
    var H = size.height;
    var narrow = W < 430;
    var P = {
      top: 8,
      right: narrow ? 44 : 54,
      bottom: 26,
      left: Math.min(118, Math.max(88, W * 0.27))
    };
    var plotW = W - P.left - P.right;
    var plotH = H - P.top - P.bottom;
    if (plotW < 60 || plotH < 60) return;

    clearSvg(svg);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var rows = orderedComposition(compositionRowsFor(state.year));
    if (!rows.length) return;
    var known = rows.filter(function (row) { return row.persen !== null; });
    var maxValue = Math.max.apply(null, known.map(function (row) { return row.persen; }).concat([1]));
    var xMax = Math.max(10, Math.ceil((maxValue * 1.1) / 5) * 5);
    var x = function (value) { return P.left + (value / xMax) * plotW; };
    var rowHeight = plotH / rows.length;
    var barHeight = Math.min(17, rowHeight * 0.56);
    var ticks = compositionTicks(xMax);

    ticks.forEach(function (tick) {
      el('line', {
        x1: x(tick), x2: x(tick), y1: P.top, y2: P.top + plotH,
        'class': tick === 0 ? 'axis' : 'grid-line', 'aria-hidden': 'true'
      }, svg);
      el('text', {
        x: x(tick), y: H - 7, 'text-anchor': 'middle',
        'class': 'tick', 'aria-hidden': 'true'
      }, svg, idNum(tick, 0) + '%');
    });

    rows.forEach(function (row, index) {
      var centerY = P.top + rowHeight * index + rowHeight / 2;
      var label = row.kategori;
      var isFocus = !!COMPOSITION_FOCUS[label];

      el('text', {
        x: P.left - 10, y: centerY + 4, 'text-anchor': 'end',
        'class': isFocus ? 'tick-cat tick-cat-focus' : 'tick-cat',
        'aria-hidden': 'true'
      }, svg, label);

      if (row.persen === null) {
        var naWidth = Math.max(32, plotW * 0.16);
        var na = el('path', {
          d: roundedRightRectPath(P.left, centerY - barHeight / 2, naWidth, barHeight, 4),
          'class': 'bar-na', role: 'img', tabindex: '0',
          dataTipColor: '#94A3B8',
          'aria-label': label + ' ' + state.year + ': tidak tersedia di sumber',
          dataTip: label + ' (' + state.year + ')\nStatus: NA — tidak tersedia di sumber'
        }, svg);
        el('title', {}, na, label + ': NA');
        el('text', {
          x: P.left + naWidth + 8, y: centerY + 4,
          'class': 'na-note', 'aria-hidden': 'true'
        }, svg, 'NA');
        return;
      }

      var barClass = label === 'Sisa Makanan' ? 'bar-komposisi-focus' :
        label === 'Plastik' ? 'bar-komposisi-plastik' : 'bar-default';
      var tipColor = label === 'Sisa Makanan' ? C.focus :
        label === 'Plastik' ? C.plastik : C.other;
      var bar = el('path', {
        d: roundedRightRectPath(P.left, centerY - barHeight / 2, Math.max(4, x(row.persen) - P.left), barHeight, 4),
        'class': barClass,
        role: 'img', tabindex: '0',
        dataTipColor: tipColor,
        'aria-label': label + ' ' + state.year + ': ' + idNum(row.persen, 2) + '%' + (isFocus ? ', kategori fokus' : ''),
        dataTip: label + ' (' + state.year + ')\nKomposisi: ' + idNum(row.persen, 2) + '%' +
          (isFocus ? '\nKategori: Dominan / fokus pemilahan' : '\nKategori: Lainnya')
      }, svg);
      el('title', {}, bar, label + ' ' + state.year + ': ' + idNum(row.persen, 2) + '%');

      el('text', {
        x: x(row.persen) + 8, y: centerY + 4, 'text-anchor': 'start',
        'class': isFocus ? 'value-label' : 'value-label-muted',
        'aria-hidden': 'true'
      }, svg, idNum(row.persen, 1) + '%');
    });
  }

  // ---------- TIER 3: INTERACTIVE TABLES (SEARCH, FILTER, SORT, PAGINATION) ----------
  function getFilteredCompositionRows() {
    var rows = compositionRowsFor(state.year).slice();
    var q = state.search.trim().toLowerCase();

    if (q) {
      rows = rows.filter(function (r) {
        return r.kategori.toLowerCase().indexOf(q) !== -1;
      });
    }

    if (state.filter === 'focus') {
      rows = rows.filter(function (r) { return !!COMPOSITION_FOCUS[r.kategori]; });
    } else if (state.filter === 'other') {
      rows = rows.filter(function (r) { return r.persen !== null && !COMPOSITION_FOCUS[r.kategori]; });
    } else if (state.filter === 'na') {
      rows = rows.filter(function (r) { return r.persen === null; });
    }

    rows.sort(function (a, b) {
      if (state.sortKey === 'kategori') {
        var cmp = a.kategori.localeCompare(b.kategori, 'id');
        return state.sortDir === 'asc' ? cmp : -cmp;
      }
      // Sort by persen: keep NA at bottom
      if (a.persen === null && b.persen === null) return 0;
      if (a.persen === null) return 1;
      if (b.persen === null) return -1;
      return state.sortDir === 'asc' ? a.persen - b.persen : b.persen - a.persen;
    });

    return rows;
  }

  function updateSortIndicators() {
    var buttons = document.querySelectorAll('#komposisiTable .sort-btn');
    Array.prototype.forEach.call(buttons, function (btn) {
      var key = btn.getAttribute('data-sort');
      var icon = btn.querySelector('.sort-icon');
      if (!icon) return;
      if (key === state.sortKey) {
        icon.textContent = state.sortDir === 'asc' ? '▲' : '▼';
        btn.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
      } else {
        icon.textContent = '';
        btn.removeAttribute('aria-sort');
      }
    });
  }

  function renderKomposisiTable() {
    var table = byId('komposisiTable');
    if (!table) return;
    var tbody = table.querySelector('tbody');
    var tfoot = table.querySelector('tfoot');
    var pagBox = byId('komposisiPagination');

    var allYearRows = compositionRowsFor(state.year);
    var allKnown = allYearRows.filter(function (row) { return row.persen !== null; });
    var allMissing = allYearRows.filter(function (row) { return row.persen === null; });
    var totalAll = allKnown.reduce(function (sum, row) { return sum + row.persen; }, 0);
    var maxVal = Math.max.apply(null, allKnown.map(function (r) { return r.persen; }).concat([1]));

    var filtered = getFilteredCompositionRows();
    var totalFiltered = filtered.length;
    var effectiveSize = (state.isPrinting || state.pageSize === 0) ? Math.max(1, totalFiltered) : state.pageSize;
    var totalPages = Math.max(1, Math.ceil(totalFiltered / effectiveSize));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    var startIdx = (state.page - 1) * effectiveSize;
    var pageRows = filtered.slice(startIdx, startIdx + effectiveSize);

    table.setAttribute('aria-label', 'Tabel komposisi sampah tahun ' + state.year);
    updateSortIndicators();

    if (!pageRows.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="table-empty"><div class="table-empty-wrap">' +
        '<span>Tidak ada kategori yang cocok dengan filter atau pencarian saat ini.</span>' +
        '<button type="button" class="page-btn" data-reset-table>Reset pencarian &amp; filter</button>' +
      '</div></td></tr>';
    } else {
      tbody.innerHTML = pageRows.map(function (row) {
        if (row.persen === null) {
          return '<tr class="row-na">' +
            '<td>' + escapeHtml(row.kategori) + '</td>' +
            '<td class="num">—</td>' +
            '<td class="cell-bar"><span class="pill pill-neutral">NA</span></td>' +
            '<td>Tidak tersedia pada data sumber</td>' +
          '</tr>';
        }
        var isFocus = !!COMPOSITION_FOCUS[row.kategori];
        var barColor = row.kategori === 'Sisa Makanan' ? C.focus :
          row.kategori === 'Plastik' ? C.plastik : C.other;
        var widthPct = Math.max(2, (row.persen / maxVal) * 100);
        return '<tr class="' + (isFocus ? 'row-focus' : '') + '">' +
          '<td>' + escapeHtml(row.kategori) + '</td>' +
          '<td class="num">' + idNum(row.persen, 2) + '%</td>' +
          '<td class="cell-bar"><div class="inline-bar-track"><span class="inline-bar-fill" style="width:' + widthPct.toFixed(1) + '%;background:' + barColor + '"></span></div></td>' +
          '<td>' + (isFocus ? '<span class="pill pill-blue">Kategori dominan</span>' : '<span class="pill pill-neutral">Lainnya</span>') + '</td>' +
        '</tr>';
      }).join('');
    }

    tfoot.innerHTML = '<tr>' +
      '<th scope="row">Total terisi (' + state.year + ')</th>' +
      '<td class="num">' + idNum(totalAll, 2) + '%</td>' +
      '<td class="cell-bar"></td>' +
      '<td>' + allKnown.length + ' kategori terisi' + (allMissing.length ? ' · ' + allMissing.length + ' NA' : '') + '</td>' +
    '</tr>';

    if (pagBox) {
      var showFrom = totalFiltered === 0 ? 0 : startIdx + 1;
      var showTo = Math.min(totalFiltered, startIdx + pageRows.length);
      pagBox.innerHTML =
        '<div class="pagination-left">' +
          '<span>Menampilkan <strong>' + showFrom + '–' + showTo + '</strong> dari <strong>' + totalFiltered + '</strong> kategori</span>' +
          '<label class="sr-only" for="pageSizeSelect">Jumlah baris per halaman</label>' +
          '<select id="pageSizeSelect" class="page-size-select">' +
            '<option value="5"' + (state.pageSize === 5 ? ' selected' : '') + '>5 / halaman</option>' +
            '<option value="0"' + (state.pageSize === 0 ? ' selected' : '') + '>Tampilkan semua</option>' +
          '</select>' +
        '</div>' +
        '<div class="pagination-right">' +
          '<button type="button" class="page-btn" data-page-nav="prev"' + (state.page <= 1 ? ' disabled' : '') + '>Sebelumnya</button>' +
          '<span>Halaman ' + state.page + ' / ' + totalPages + '</span>' +
          '<button type="button" class="page-btn" data-page-nav="next"' + (state.page >= totalPages ? ' disabled' : '') + '>Berikutnya</button>' +
        '</div>';
    }

    var note = byId('komposisiNote');
    if (note) {
      if (allMissing.length) {
        note.textContent = state.year + ' memuat ' + allKnown.length + ' kategori terisi; ' +
          allMissing.length + ' kategori (Kayu Ranting) berstatus NA di sumber. Mulai 2025 tersedia 9 kategori sehingga perbandingan lintas tahun perlu hati-hati.';
      } else {
        note.textContent = state.year + ' memuat ' + allKnown.length + ' kategori terisi, termasuk Kayu Ranting (2,00%) ' +
          'yang tidak tersedia pada 2021–2024. Semua tahun berjumlah 100%, tetapi set kategori berubah.';
      }
    }
  }

  function renderYearlyTable() {
    var tbody = byId('yearlyTableBody');
    if (!tbody) return;
    tbody.innerHTML = DATA.years.map(function (year) {
      var k = kpiAt(year);
      var review = isReviewYear(year);
      var active = year === state.year;
      var statusBadge = review
        ? '<span class="pill pill-warning">Perlu tinjau</span>'
        : year === BASE_YEAR
          ? '<span class="pill pill-neutral">Tahun dasar</span>'
          : '<span class="pill pill-success">Sebanding</span>';
      return '<tr class="' + (active ? 'is-active' : '') + '" data-row-year="' + year + '" tabindex="0" aria-label="Pilih tahun ' + year + '">' +
        '<td>' + year + (review ? '*' : '') + '</td>' +
        '<td class="num">' + idNum(k.timbulan_tahunan_ton, 0) + '</td>' +
        '<td class="num">' + idNum(k.pengurangan_tahunan_ton, 0) + '</td>' +
        '<td class="num">' + idNum(k.penanganan_tahunan_ton, 0) + '</td>' +
        '<td class="num">' + idNum(k.terkelola_tahunan_ton, 0) + ' (' + idNum(k.persen_kelola, 1) + '%)</td>' +
        '<td class="num">' + idNum(k.belum_terkelola_tahunan_ton, 0) + '</td>' +
        '<td class="num">' + idNum(k.timbulan_kg_per_orang_hari, 2) + ' kg</td>' +
        '<td class="num">' + idNum(k.jumlah_penduduk_jiwa, 0) + '</td>' +
        '<td>' + statusBadge + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderKomposisiSection() {
    renderKomposisiChart();
    renderKomposisiTable();
    renderYearlyTable();
    var badge = byId('komposisiYearBadge');
    if (badge) badge.textContent = String(state.year);
    var tabYear = byId('tabKomposisiYear');
    if (tabYear) tabYear.textContent = String(state.year);

    var known = knownComposition(state.year);
    var summary = byId('komposisiSummary');
    if (summary && known.length) {
      var top1 = known[0];
      var top2 = known[1];
      var rest = known.length - 2;
      var focusSum = top1.persen + (top2 ? top2.persen : 0);
      summary.innerHTML = '<strong>' + escapeHtml(top1.kategori) + '</strong> &amp; <strong>' +
        escapeHtml(top2.kategori) + '</strong> menyumbang <strong>' + idNum(focusSum, 1) +
        '%</strong> total sampah ' + state.year + '; sisanya di ' + rest + ' kategori lain.';
    }
  }

  // ---------- DONUT & MANAGEMENT BREAKDOWN ----------
  function arcPath(cx, cy, outer, inner, startAngle, endAngle) {
    var large = (endAngle - startAngle) > Math.PI ? 1 : 0;
    var x1 = cx + outer * Math.cos(startAngle);
    var y1 = cy + outer * Math.sin(startAngle);
    var x2 = cx + outer * Math.cos(endAngle);
    var y2 = cy + outer * Math.sin(endAngle);
    var x3 = cx + inner * Math.cos(endAngle);
    var y3 = cy + inner * Math.sin(endAngle);
    var x4 = cx + inner * Math.cos(startAngle);
    var y4 = cy + inner * Math.sin(startAngle);
    return ['M', x1, y1, 'A', outer, outer, 0, large, 1, x2, y2,
      'L', x3, y3, 'A', inner, inner, 0, large, 0, x4, y4, 'Z'].join(' ');
  }

  function renderDonut() {
    var svg = byId('chartDonut');
    var cur = kpiAt(state.year);
    var total = cur.timbulan_tahunan_ton;
    clearSvg(svg);
    if (!total) return;

    var pengurangan = cur.pengurangan_tahunan_ton || 0;
    var penanganan = cur.penanganan_tahunan_ton || 0;
    var belum = cur.belum_terkelola_tahunan_ton || 0;
    var segTotal = pengurangan + penanganan + belum;
    if (!segTotal) return;

    var segments = [
      { name: 'Pengurangan', value: pengurangan, pct: (pengurangan / segTotal) * 100, color: C.pengurangan, key: 'pengurangan' },
      { name: 'Penanganan', value: penanganan, pct: (penanganan / segTotal) * 100, color: C.penanganan, key: 'penanganan' },
      { name: 'Belum tercatat', value: belum, pct: (belum / segTotal) * 100, color: C.donutBelum, key: 'belum' }
    ];

    var cx = 90;
    var cy = 90;
    var outer = 76;
    var inner = 54;
    var angle = -Math.PI / 2;

    segments.forEach(function (segment) {
      if (segment.value <= 0) return;
      var sweep = Math.min((segment.value / segTotal) * Math.PI * 2, Math.PI * 2 - 0.0001);
      var path = el('path', {
        d: arcPath(cx, cy, outer, inner, angle, angle + sweep),
        fill: segment.color,
        'class': 'donut-seg donut-' + segment.key,
        role: 'img', tabindex: '0',
        dataTipColor: segment.color,
        'aria-label': segment.name + ': ' + idNum(segment.value, 2) + ' ton (' + idNum(segment.pct, 1) + '%)',
        dataTip: segment.name + ' (' + state.year + ')\nVolume: ' + idNum(segment.value, 0) + ' ton\nProporsi: ' + idNum(segment.pct, 1) + '%'
      }, svg);
      el('title', {}, path, segment.name + ': ' + idNum(segment.pct, 1) + '%');
      angle += sweep;
    });

    el('text', {
      x: cx, y: cy - 2, 'text-anchor': 'middle',
      'class': 'donut-center-value', 'aria-hidden': 'true'
    }, svg, idNum(cur.persen_kelola, 1) + '%');
    el('text', {
      x: cx, y: cy + 16, 'text-anchor': 'middle',
      'class': 'donut-center-label', 'aria-hidden': 'true'
    }, svg, 'tercatat');

    var legendBox = byId('donutLegend');
    if (legendBox) {
      legendBox.innerHTML = segments.map(function (segment) {
        return '<div class="donut-leg-item">' +
          '<span class="donut-leg-left"><span class="donut-swatch" style="background:' + segment.color + '"></span>' +
          '<span>' + segment.name + '</span></span>' +
          '<span class="donut-leg-val">' + idNum(segment.pct, 1) + '%</span>' +
        '</div>';
      }).join('');
    }
  }

  function renderKesenjangan() {
    var cur = kpiAt(state.year);
    var ratio = cur.timbulan_tahunan_ton ? (cur.belum_terkelola_tahunan_ton / cur.timbulan_tahunan_ton) * 100 : null;
    var badge = byId('kesenjanganYearBadge');
    if (badge) badge.textContent = String(state.year);
    renderDonut();

    var rows = [
      ['Jalur Pengurangan', idNum(cur.pengurangan_tahunan_ton, 0) + ' ton (' + idNum(cur.persen_pengurangan, 1) + '%)', false, C.pengurangan],
      ['Jalur Penanganan', idNum(cur.penanganan_tahunan_ton, 0) + ' ton (' + idNum(cur.persen_penanganan, 1) + '%)', false, C.penanganan],
      ['Total Tercatat Terkelola', idNum(cur.terkelola_tahunan_ton, 0) + ' ton (' + idNum(cur.persen_kelola, 1) + '%)', true, null],
      ['Belum Tercatat', idNum(cur.belum_terkelola_tahunan_ton, 0) + ' ton (' + idNum(ratio, 1) + '%)', false, C.donutBelum]
    ];

    var html = rows.map(function (row) {
      var dot = row[3] ? '<span class="bk-dot" style="background:' + row[3] + '" aria-hidden="true"></span>' : '';
      return '<div class="breakdown-row' + (row[2] ? ' is-total' : '') + '">' +
        '<span class="breakdown-label">' + dot + row[0] + '</span>' +
        '<span>' + row[1] + '</span></div>';
    }).join('');
    html += '<p class="card-footnote"><strong>Belum tercatat</strong> adalah selisih total timbulan dan yang tercatat terkelola, bukan volume sampah yang dibuang ke lingkungan.</p>';

    var panel = byId('kesenjanganPanel');
    if (panel) panel.innerHTML = html;
  }

  // ---------- DETAILS DRAWER ----------
  function renderSumber() {
    var doi = META.zenodo_doi || '10.5281/zenodo.24240544';
    var url = META.zenodo_url || 'https://zenodo.org/records/24240544';
    var items = [
      escapeHtml(META.sumber || 'SIPSN/KLHK (timbulan, capaian, komposisi) dan BPS (penduduk) — Kota Semarang, 2021–2025'),
      'Data mentah dan kamus variabel tersedia di folder <code>data/</code> (CSV).',
      'Dataset bersih: DOI <a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + escapeHtml(doi) + '</a> · berkas Restricted (metadata/DOI publik).',
      'Catatan: keterangan lisensi di rekaman Zenodo bukan pengganti hak redistribusi penyedia data asli.'
    ];
    var list = byId('sumberList');
    if (list) list.innerHTML = items.map(function (item) { return '<li>' + item + '</li>'; }).join('');
  }

  function badgeFor(status) {
    var value = String(status || '').toUpperCase();
    if (value === 'LULUS') return '<span class="pill pill-success">LULUS</span>';
    if (value === 'CATATAN') return '<span class="pill pill-warning">CATATAN</span>';
    return '<span class="pill pill-danger">PERLU TINJAU</span>';
  }

  function renderValidasi() {
    var body = byId('validasiBody');
    if (!body) return;
    body.innerHTML = (DATA.validasi || []).map(function (row) {
      return '<tr><td>' + escapeHtml(row.pemeriksaan) + '</td><td>' + badgeFor(row.status) +
        '</td><td>' + escapeHtml(row.hasil) + '</td></tr>';
    }).join('');
  }

  function renderKonteks() {
    var cur = kpiAt(state.year);
    var review = isReviewYear(state.year);
    var rows = compositionRowsFor(state.year);
    var filled = rows.filter(function (row) { return row.persen !== null; }).length;
    var missing = rows.length - filled;
    var status = review
      ? '<span class="pill pill-danger">perlu tinjau</span> cara mencatat 2024–2025 berbeda; angka tidak untuk dibandingkan.'
      : '<span class="pill pill-success">sebanding</span> angka dapat dibandingkan dengan tahun sebelumnya.';

    var items = [
      '<strong>Tahun ' + state.year + '</strong> — ' + status,
      'Sampah dihasilkan ' + idNum(cur.timbulan_tahunan_ton, 2) + ' ton; tercatat terkelola ' +
        idNum(cur.terkelola_tahunan_ton, 2) + ' ton (' + idNum(cur.persen_kelola, 2) +
        '%); belum tercatat ' + idNum(cur.belum_terkelola_tahunan_ton, 2) + ' ton.',
      'Daur ulang + bahan baku (metrik tambahan): ' + idNum(cur.persen_recycling_rate, 2) + '%. Komponen sumber: ' +
        idNum(cur.jml_daur_ulang_ton, 2) + ' ton daur ulang + ' + idNum(cur.jml_bahan_baku_ton, 2) + ' ton bahan baku.' +
        (review ? ' Komponen ini praktis sama dengan pengurangan/penanganan, sehingga bukan metrik daur ulang independen.' : ''),
      'Komposisi: ' + filled + ' kategori terisi' + (missing ? ' dan ' + missing + ' tidak tersedia (NA)' : '') +
        '; lihat catatan metodologi di panel ini.'
    ];
    var list = byId('konteksList');
    if (list) list.innerHTML = items.map(function (item) { return '<li>' + item + '</li>'; }).join('');
  }

  // ---------- YEAR STATE & TAB SWITCHING ----------
  function renderYearDependent() {
    var headerYear = byId('headerYear');
    if (headerYear) headerYear.textContent = String(state.year);
    renderYearPills();
    renderContextBanner();
    renderKpiGrid();
    renderReadingGuide();
    renderTimbulanChart();
    renderKelolaChart();
    renderKelolaNote();
    renderIndeksChart();
    renderKomposisiSection();
    renderKesenjangan();
    renderKonteks();
  }

  function setYear(year, options) {
    var opts = options || {};
    if (DATA.years.indexOf(year) === -1) year = LATEST_YEAR;
    state.year = year;
    state.page = 1;
    var select = byId('yearSelect');
    if (select) select.value = String(year);
    renderYearDependent();
    if (opts.updateUrl) writeYearToUrl(year, !!opts.replace);
  }

  function setTableTab(tab) {
    state.tableTab = tab;
    var isKomp = tab === 'komposisi';
    var btnKomp = byId('tabKomposisi');
    var btnTah = byId('tabTahunan');
    var panelKomp = byId('panelKomposisi');
    var panelTah = byId('panelTahunan');
    var toolbar = byId('komposisiToolbar');

    if (btnKomp) {
      btnKomp.classList.toggle('active', isKomp);
      btnKomp.setAttribute('aria-selected', String(isKomp));
    }
    if (btnTah) {
      btnTah.classList.toggle('active', !isKomp);
      btnTah.setAttribute('aria-selected', String(!isKomp));
    }
    if (panelKomp) panelKomp.hidden = !isKomp;
    if (panelTah) panelTah.hidden = isKomp;
    if (toolbar) toolbar.hidden = !isKomp;
  }

  // ---------- DIALOG ACCESSIBILITY ----------
  function setExpanded(value) {
    ['detailsToggle', 'glossaryToggle'].forEach(function (id) {
      var button = byId(id);
      if (button) button.setAttribute('aria-expanded', String(value));
    });
  }

  function focusableInPanel() {
    var panel = byId('detailsPanel');
    var nodes = panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    return Array.prototype.slice.call(nodes).filter(function (node) {
      return node.getClientRects().length > 0;
    });
  }

  function openDetails(invoker, scrollToId) {
    var panel = byId('detailsPanel');
    var backdrop = byId('detailsBackdrop');
    if (!panel) return;
    if (panel.hidden) {
      lastFocus = invoker || document.activeElement;
      panel.hidden = false;
      if (backdrop) backdrop.hidden = false;
      document.body.classList.add('dialog-open');
      setExpanded(true);
      byId('detailsClose').focus();
    }
    if (scrollToId) {
      var target = byId(scrollToId);
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function closeDetails() {
    var panel = byId('detailsPanel');
    var backdrop = byId('detailsBackdrop');
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('dialog-open');
    setExpanded(false);
    if (lastFocus && document.documentElement.contains(lastFocus)) lastFocus.focus();
    else byId('detailsToggle').focus();
    lastFocus = null;
  }

  function handleDialogKeys(event) {
    var panel = byId('detailsPanel');
    if (!panel || panel.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDetails();
      return;
    }
    if (event.key !== 'Tab') return;
    var focusable = focusableInPanel();
    if (!focusable.length) { event.preventDefault(); return; }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // ---------- INIT & EVENTS ----------
  function populateYearSelect() {
    var select = byId('yearSelect');
    if (!select) return;
    DATA.years.forEach(function (year) {
      var option = document.createElement('option');
      option.value = String(year);
      option.textContent = 'Tahun ' + year + (isReviewYear(year) ? ' · perlu tinjau' : '');
      select.appendChild(option);
    });
  }

  function renderResponsiveCharts() {
    renderTimbulanChart();
    renderKelolaChart();
    renderIndeksChart();
    renderKomposisiChart();
  }

  function scheduleCharts() {
    if (resizeRaf) return;
    resizeRaf = window.requestAnimationFrame(function () {
      resizeRaf = null;
      renderResponsiveCharts();
    });
  }

  function observeCharts() {
    var ids = ['chartTimbulan', 'chartKelola', 'chartIndeks', 'chartKomposisi'];
    var printRestoreTimer = null;
    var printMedia = window.matchMedia ? window.matchMedia('print') : null;

    function cancelPrintRestore() {
      if (printRestoreTimer) {
        window.clearTimeout(printRestoreTimer);
        printRestoreTimer = null;
      }
    }

    function enterPrint() {
      cancelPrintRestore();
      state.isPrinting = true;
      renderKomposisiTable();
      renderResponsiveCharts();
    }

    function exitPrint() {
      cancelPrintRestore();
      printRestoreTimer = window.setTimeout(function () {
        printRestoreTimer = null;
        state.isPrinting = false;
        renderKomposisiTable();
        renderResponsiveCharts();
      }, 800);
    }

    if ('ResizeObserver' in window) {
      var observer = new ResizeObserver(function () {
        if (printMedia && printMedia.matches) renderResponsiveCharts();
        else scheduleCharts();
      });
      ids.forEach(function (id) {
        var svg = byId(id);
        if (svg) observer.observe(svg);
      });
    }

    window.addEventListener('resize', function () {
      if (printMedia && printMedia.matches) return;
      cancelPrintRestore();
      scheduleCharts();
    }, { passive: true });

    window.addEventListener('beforeprint', enterPrint);
    window.addEventListener('afterprint', exitPrint);
    if (printMedia && printMedia.addEventListener) {
      printMedia.addEventListener('change', function (event) {
        if (event.matches) enterPrint();
        else exitPrint();
      });
    }
    window.addEventListener('scroll', hideTooltip, { passive: true });
  }

  function bindEvents() {
    // Year select (mobile)
    var select = byId('yearSelect');
    if (select) {
      select.addEventListener('change', function () {
        setYear(parseInt(this.value, 10), { updateUrl: true });
      });
    }

    // Segmented year pills (desktop)
    var pills = byId('yearPills');
    if (pills) {
      pills.addEventListener('click', function (event) {
        var btn = event.target && event.target.closest ? event.target.closest('[data-select-year]') : null;
        if (!btn) return;
        setYear(parseInt(btn.getAttribute('data-select-year'), 10), { updateUrl: true });
      });
    }

    // Drawer triggers
    var toggle = byId('detailsToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var panel = byId('detailsPanel');
        if (panel.hidden) openDetails(this);
        else closeDetails();
      });
    }

    var glossaryBtn = byId('glossaryToggle');
    if (glossaryBtn) {
      glossaryBtn.addEventListener('click', function () {
        openDetails(this, 'glossarySection');
      });
    }

    var close = byId('detailsClose');
    if (close) close.addEventListener('click', closeDetails);

    var backdrop = byId('detailsBackdrop');
    if (backdrop) backdrop.addEventListener('click', closeDetails);

    document.addEventListener('keydown', handleDialogKeys);

    document.addEventListener('click', function (event) {
      var link = event.target && event.target.closest ? event.target.closest('[data-open-details]') : null;
      if (!link) return;
      event.preventDefault();
      openDetails(link);
    });

    // Table tabs
    var tabKomp = byId('tabKomposisi');
    var tabTah = byId('tabTahunan');
    if (tabKomp) tabKomp.addEventListener('click', function () { setTableTab('komposisi'); });
    if (tabTah) tabTah.addEventListener('click', function () { setTableTab('tahunan'); });

    // Search input
    var search = byId('komposisiSearch');
    if (search) {
      search.addEventListener('input', function () {
        state.search = this.value;
        state.page = 1;
        renderKomposisiTable();
      });
    }

    // Filter chips
    var chips = byId('komposisiFilterChips');
    if (chips) {
      chips.addEventListener('click', function (event) {
        var btn = event.target && event.target.closest ? event.target.closest('[data-filter]') : null;
        if (!btn) return;
        state.filter = btn.getAttribute('data-filter');
        state.page = 1;
        Array.prototype.forEach.call(chips.querySelectorAll('.filter-chip'), function (c) {
          c.classList.toggle('active', c === btn);
        });
        renderKomposisiTable();
      });
    }

    // Table sorting & empty-state reset
    var kompTable = byId('komposisiTable');
    if (kompTable) {
      kompTable.addEventListener('click', function (event) {
        var resetBtn = event.target && event.target.closest ? event.target.closest('[data-reset-table]') : null;
        if (resetBtn) {
          state.search = '';
          state.filter = 'all';
          state.page = 1;
          var searchEl = byId('komposisiSearch');
          if (searchEl) searchEl.value = '';
          var chipsEl = byId('komposisiFilterChips');
          if (chipsEl) {
            Array.prototype.forEach.call(chipsEl.querySelectorAll('.filter-chip'), function (c) {
              c.classList.toggle('active', c.getAttribute('data-filter') === 'all');
            });
          }
          renderKomposisiTable();
          return;
        }
        var btn = event.target && event.target.closest ? event.target.closest('[data-sort]') : null;
        if (!btn) return;
        var key = btn.getAttribute('data-sort');
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = key === 'kategori' ? 'asc' : 'desc';
        }
        state.page = 1;
        renderKomposisiTable();
      });
    }

    // Pagination & page size
    var pagBox = byId('komposisiPagination');
    if (pagBox) {
      pagBox.addEventListener('click', function (event) {
        var btn = event.target && event.target.closest ? event.target.closest('[data-page-nav]') : null;
        if (!btn || btn.disabled) return;
        var dir = btn.getAttribute('data-page-nav');
        state.page += dir === 'next' ? 1 : -1;
        renderKomposisiTable();
      });
      pagBox.addEventListener('change', function (event) {
        if (event.target && event.target.id === 'pageSizeSelect') {
          state.pageSize = parseInt(event.target.value, 10) || 0;
          state.page = 1;
          renderKomposisiTable();
        }
      });
    }

    // Yearly table row click -> select year
    var yearlyBody = byId('yearlyTableBody');
    if (yearlyBody) {
      yearlyBody.addEventListener('click', function (event) {
        var tr = event.target && event.target.closest ? event.target.closest('[data-row-year]') : null;
        if (!tr) return;
        setYear(parseInt(tr.getAttribute('data-row-year'), 10), { updateUrl: true });
      });
      yearlyBody.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var tr = event.target && event.target.closest ? event.target.closest('[data-row-year]') : null;
        if (!tr) return;
        event.preventDefault();
        setYear(parseInt(tr.getAttribute('data-row-year'), 10), { updateUrl: true });
      });
    }

    // Browser history back/forward
    window.addEventListener('popstate', function () {
      var year = readYearFromUrl();
      setYear(year === null ? LATEST_YEAR : year, { updateUrl: false });
    });
  }

  function init() {
    populateYearSelect();
    bindEvents();
    renderSumber();
    renderValidasi();

    renderLegend('legendTimbulan', [
      { name: 'Timbulan', color: C.timbulan },
      { name: 'Tercatat terkelola', color: C.terkelola },
      { name: 'Selisih belum tercatat', color: C.gap, area: true }
    ]);
    renderLegend('legendKelola', [
      { name: 'Sebanding', color: C.terkelola, bar: true },
      { name: 'Perlu tinjau', bar: true, na: true }
    ]);
    renderLegend('legendIndeks', [
      { name: 'Timbulan', color: C.timbulan },
      { name: 'Penduduk', color: C.penduduk }
    ]);
    renderLegend('legendKomposisi', [
      { name: 'Sisa Makanan', color: C.focus, dot: true },
      { name: 'Plastik', color: C.plastik, dot: true },
      { name: 'Lainnya', color: C.other, dot: true },
      { name: 'NA', na: true }
    ]);

    var caption = byId('chartCaptionTimbulan');
    if (caption) caption.textContent = 'Sumbu Y dalam ribu ton (mulai dari nol)';

    ['chartTimbulan', 'chartKelola', 'chartIndeks', 'chartKomposisi', 'chartDonut'].forEach(function (id) {
      bindTooltips(byId(id));
    });

    var initial = readYearFromUrl();
    setYear(initial === null ? LATEST_YEAR : initial, { updateUrl: true, replace: true });
    observeCharts();
  }

  init();
})();
