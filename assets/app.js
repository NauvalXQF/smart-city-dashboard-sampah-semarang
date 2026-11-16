(function () {
  'use strict';

  var DATA = window.DASHBOARD_DATA;
  var main = document.getElementById('mainContent');
  if (!DATA || !DATA.kpi || !Array.isArray(DATA.years) || !DATA.years.length) {
    if (main) {
      main.innerHTML = '<p class="card">Gagal memuat data dashboard. Jalankan <code>python tools/build_data.py</code> lalu muat ulang halaman.</p>';
    }
    return;
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  var META = DATA.meta || {};
  var BREAK_YEARS = (META.break_years || []).map(Number);
  var LATEST_YEAR = DATA.years[DATA.years.length - 1];
  var COMPOSITION_FOCUS = { 'Sisa Makanan': true, 'Plastik': true };
  var state = { year: LATEST_YEAR };
  var resizeRaf = null;
  var lastFocus = null;

  var C = {
    timbulan: '#1f6feb',
    terkelola: '#0f766e',
    penduduk: '#b45309',
    gap: 'rgba(180, 83, 9, 0.16)',
    reviewBand: 'rgba(82, 100, 120, 0.08)',
    focus: '#1f6feb',
    plastik: '#b45309',
    other: '#a9bacb',
    donutTer: '#0f766e',
    donutBelum: '#c6d0da'
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
        else node.setAttribute(key, String(value));
      });
    }
    if (text !== undefined) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  function clearSvg(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function chartSize(svg, fallbackHeight) {
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

  function fillTooltip(raw) {
    var tip = ensureTooltip();
    var parts = String(raw).split('\n');
    tip.textContent = '';
    var title = document.createElement('div');
    title.className = 'tt-title';
    title.textContent = parts.shift() || '';
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
    var pad = 10;
    var width = tip.offsetWidth || 220;
    var height = tip.offsetHeight || 60;
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
      fillTooltip(target.getAttribute('data-tip'));
      showTooltip(event.clientX, event.clientY, false);
    });
    svg.addEventListener('mouseleave', hideTooltip);
    svg.addEventListener('focusin', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('[data-tip]') : null;
      if (!target) return;
      fillTooltip(target.getAttribute('data-tip'));
      var rect = target.getBoundingClientRect();
      showTooltip(rect.left + rect.width / 2, rect.top, true);
    });
    svg.addEventListener('focusout', function (event) {
      if (!svg.contains(event.relatedTarget)) hideTooltip();
    });
    svg.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('[data-tip]') : null;
      if (!target) return;
      fillTooltip(target.getAttribute('data-tip'));
      var rect = target.getBoundingClientRect();
      showTooltip(rect.left + rect.width / 2, rect.top, true);
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
        (item.bar ? ' bar' : '') +
        (item.area ? ' area' : '') +
        (item.na ? ' na' : '');
      if (item.color) swatch.style.background = item.color;
      span.appendChild(swatch);
      span.appendChild(document.createTextNode(item.name));
      box.appendChild(span);
    });
  }

  // ---------- ringkasan ----------
  function knownComposition(year) {
    return compositionRowsFor(year).filter(function (row) { return row.persen !== null; })
      .sort(function (a, b) { return b.persen - a.persen; });
  }

  function renderHero() {
    var year = state.year;
    var cur = kpiAt(year);
    var review = isReviewYear(year);
    var total = cur.timbulan_tahunan_ton;
    var terkelola = cur.terkelola_tahunan_ton;
    var belum = cur.belum_terkelola_tahunan_ton;
    var pct = Math.max(0, Math.min(100, cur.persen_kelola));
    var daily = total / 365;
    var box = byId('heroSummary');
    if (!box) return;

    box.className = 'hero-summary' + (review ? ' review' : '');
    box.innerHTML =
      '<div class="hero-main">' +
        '<div class="hero-topline"><span class="hero-eyebrow">Tahun ' + year + '</span>' +
          (review ? '<span class="hero-chip">perlu tinjau</span>' : '') +
        '</div>' +
        '<div class="hero-headline"><strong class="hero-number">' + idNum(pct, 1) + '%</strong>' +
          '<span class="hero-title">sampah tercatat terkelola</span></div>' +
        '<p class="hero-copy">Dari total <strong>' + idNum(total, 0) + ' ton</strong> sampah, sekitar <strong>' +
          idNum(terkelola, 0) + ' ton</strong> tercatat terkelola. <strong>' + idNum(belum, 0) +
          ' ton</strong> belum tercatat terkelola.</p>' +
        '<div class="progress-track" role="img" aria-label="Tahun ' + year + ': ' + idNum(pct, 1) +
          ' persen tercatat terkelola, ' + idNum(100 - pct, 1) + ' persen belum tercatat">' +
          '<span class="progress-done" style="width:' + pct.toFixed(2) + '%"></span>' +
        '</div>' +
        '<div class="progress-legend">' +
          '<span><i class="dot dot-terkelola"></i>Tercatat terkelola <strong>' + idNum(pct, 1) + '%</strong></span>' +
          '<span><i class="dot dot-gray"></i>Belum tercatat <strong>' + idNum(100 - pct, 1) + '%</strong></span>' +
        '</div>' +
        '<p class="hero-explain">“Tercatat terkelola” berarti sampah masuk jalur pengurangan atau penanganan dalam laporan. Bukan berarti seluruh sampah sudah hilang dari lingkungan.</p>' +
      '</div>' +
      '<div class="hero-side">' +
        '<div class="hero-stat"><span>Sampah dihasilkan</span><strong>' + idNum(total, 0) +
          ' <small>ton/tahun</small></strong><em>≈ ' + idNum(daily, 0) + ' ton/hari</em></div>' +
        '<div class="hero-stat"><span>Per orang</span><strong>' + idNum(cur.timbulan_kg_per_orang_hari, 2) +
          ' <small>kg/hari</small></strong><em>≈ ' + idNum(cur.timbulan_kg_per_orang_hari * 30.44, 0) +
          ' kg/bulan</em></div>' +
      '</div>';

    renderYearContext(review, prevYear(year));
  }

  function renderKeyFacts() {
    var known = knownComposition(state.year);
    var box = byId('keyFacts');
    if (!box || !known.length) return;
    var top1 = known[0];
    var top2 = known[1] || { kategori: '', persen: 0 };
    var focusSum = top1.persen + top2.persen;
    var totals = DATA.years.map(function (year) { return kpiAt(year).timbulan_tahunan_ton; });
    var min = Math.min.apply(null, totals) / 1000;
    var max = Math.max.apply(null, totals) / 1000;

    box.innerHTML =
      '<article class="fact-card">' +
        '<span class="fact-kicker">Isi sampah ' + state.year + '</span>' +
        '<strong>' + escapeHtml(top1.kategori) + ' ' + idNum(top1.persen, 1) + '%</strong>' +
        '<p>Disusul ' + escapeHtml(top2.kategori) + ' ' + idNum(top2.persen, 1) +
          '%. Keduanya mencakup ' + idNum(focusSum, 1) + '% dari total sampah.</p>' +
      '</article>' +
      '<article class="fact-card">' +
        '<span class="fact-kicker">Jumlah sampah</span>' +
        '<strong>Relatif stabil</strong>' +
        '<p>Rentang 2021–2025: ' + idNum(min, 0) + '–' + idNum(max, 0) +
          ' ribu ton per tahun.</p>' +
      '</article>' +
      '<article class="fact-card">' +
        '<span class="fact-kicker">Cakupan data</span>' +
        '<strong>Agregat kota</strong>' +
        '<p>Data tahunan, belum per kecamatan. Angka berasal dari laporan, bukan pengukuran lapangan.</p>' +
      '</article>';
  }

  function renderYearContext(review, py) {
    var note = byId('yearContextNote');
    if (!note) return;
    note.className = 'year-context-note' + (review ? ' review' : '');
    if (review) {
      note.innerHTML = '<strong>Tahun ' + state.year + ' perlu tinjau.</strong> ' +
        'Cara mencatat 2024–2025 berbeda dari tahun sebelumnya, jadi angka ini tidak bisa dibandingkan dengan ' +
        escapeHtml(py) + '. Pembanding terakhir yang setara: ' + escapeHtml(META.comparable_last_year || '—') +
        '. Angka tetap ditampilkan, tetapi bukan penilaian kinerja.';
    } else if (!py) {
      note.innerHTML = '<strong>Tahun dasar ' + state.year + '.</strong> Belum ada tahun sebelumnya untuk pembanding.';
    } else {
      note.innerHTML = '<strong>Tahun ' + state.year + ' sebanding dengan ' + py +
        '.</strong> Angka bisa dibandingkan langsung dengan tahun sebelumnya.';
    }
  }

  function renderReadingGuide() {
    var box = byId('readingGuide');
    if (!box) return;
    var year = state.year;
    var cur = kpiAt(year);
    var py = prevYear(year);
    var prev = py ? kpiAt(py) : null;
    var review = isReviewYear(year);
    var items = [];

    if (review) {
      items.push('<li><strong>Yang terlihat:</strong> ' + idNum(cur.persen_kelola, 1) +
        '% sampah tercatat terkelola pada ' + year + '.</li>');
      items.push('<li><strong>Jangan disimpulkan:</strong> angka ' + year +
        ' tidak bisa dibandingkan dengan tahun sebelumnya karena cara mencatatnya berubah. ' +
        '<button type="button" class="text-link" data-open-details>Mengapa?</button></li>');
      items.push('<li><strong>Yang tetap bisa dibaca:</strong> jumlah sampah, isi sampah, dan sampah per orang.</li>');
    } else if (py && prev) {
      var prevPct = prev.persen_kelola;
      var relation;
      if (cur.persen_kelola > prevPct) {
        relation = 'naik dari ' + idNum(prevPct, 1) + '% ke ' + idNum(cur.persen_kelola, 1) + '%';
      } else if (cur.persen_kelola < prevPct) {
        relation = 'turun dari ' + idNum(prevPct, 1) + '% ke ' + idNum(cur.persen_kelola, 1) + '%';
      } else {
        relation = 'tetap di ' + idNum(cur.persen_kelola, 1) + '%';
      }
      items.push('<li><strong>Tahun ' + year + ':</strong> ' + idNum(cur.persen_kelola, 1) +
        '% sampah tercatat terkelola.</li>');
      items.push('<li><strong>Dibanding ' + py + ':</strong> ' + relation + '.</li>');
      items.push('<li><strong>Jumlah sampah:</strong> ' + idNum(cur.timbulan_tahunan_ton, 0) +
        ' ton, relatif stabil.</li>');
    } else {
      items.push('<li><strong>Tahun dasar:</strong> ' + year + ' menjadi pembanding untuk tahun berikutnya.</li>');
      items.push('<li><strong>Yang terlihat:</strong> ' + idNum(cur.persen_kelola, 1) +
        '% sampah tercatat terkelola.</li>');
      items.push('<li><strong>Jumlah sampah:</strong> ' + idNum(cur.timbulan_tahunan_ton, 0) + ' ton.</li>');
    }
    items.push('<li><strong>Ingat:</strong> angka berasal dari laporan, bukan pengukuran lapangan.</li>');
    box.innerHTML = '<ul>' + items.join('') + '</ul>';
  }

  function renderKelolaNote() {
    var note = byId('kelolaNote');
    if (!note) return;
    var cur = kpiAt(state.year);
    var review = isReviewYear(state.year);
    note.innerHTML = '<strong>Tahun ' + state.year + ':</strong> ' + idNum(cur.persen_kelola, 1) +
      '% sampah tercatat terkelola. ' +
      (review ? 'Angka ini perlu tinjau; bukan penilaian kinerja.' : 'Angka ini bisa dibandingkan dengan tahun sebelumnya.');
  }

  // ---------- line chart ----------
  function renderLineChart(svg, config) {
    var size = chartSize(svg, config.height || 280);
    if (!size) return;
    var W = size.width;
    var H = size.height;
    var narrow = W < 520;
    var P = { top: narrow ? 30 : 32, right: narrow ? 12 : 18, bottom: 30, left: narrow ? 46 : 58 };
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
      var padding = (dataMax - dataMin) * 0.15 || 1;
      scale = niceScale(dataMin - padding, dataMax + padding, 4, false);
    }
    var y = function (value) {
      return P.top + plotH - ((value - scale.lo) / (scale.hi - scale.lo)) * plotH;
    };

    // Area 2024–2025 ditandai karena definisi/cakupan berubah.
    var breakIndexes = BREAK_YEARS.map(function (year) { return DATA.years.indexOf(year); })
      .filter(function (index) { return index >= 0; });
    var firstBreak = breakIndexes.length ? Math.min.apply(null, breakIndexes) : -1;
    if (firstBreak >= 0) {
      var breakStart = firstBreak === 0 ? P.left : (xs[firstBreak - 1] + xs[firstBreak]) / 2;
      var breakEnd = W - P.right;
      el('rect', {
        x: breakStart, y: P.top, width: Math.max(0, breakEnd - breakStart), height: plotH,
        'class': 'break-band', 'aria-hidden': 'true'
      }, svg);
      if (breakEnd - breakStart > 36) {
        el('text', {
          x: breakStart + (breakEnd - breakStart) / 2, y: P.top - 11,
          'text-anchor': 'middle', 'class': 'break-label', 'aria-hidden': 'true'
        }, svg, W < 470 ? 'perlu tinjau' : '2024–2025: perlu tinjau');
      }
    }

    // Pita tahun terpilih: menghubungkan filter global ke grafik.
    var selectedIndex = DATA.years.indexOf(state.year);
    if (selectedIndex >= 0) {
      var bandStart = selectedIndex === 0 ? P.left : (xs[selectedIndex - 1] + xs[selectedIndex]) / 2;
      var bandEnd = selectedIndex === DATA.years.length - 1 ? W - P.right : (xs[selectedIndex] + xs[selectedIndex + 1]) / 2;
      el('rect', {
        x: bandStart, y: P.top, width: Math.max(0, bandEnd - bandStart), height: plotH,
        'class': 'selected-year-band', 'aria-hidden': 'true'
      }, svg);
    }

    scale.ticks.forEach(function (tick) {
      el('line', {
        x1: P.left, x2: W - P.right, y1: y(tick), y2: y(tick),
        'class': 'grid-line', 'aria-hidden': 'true'
      }, svg);
      el('text', {
        x: P.left - 7, y: y(tick) + 3.5, 'text-anchor': 'end',
        'class': 'tick', 'aria-hidden': 'true'
      }, svg, config.tickFormat ? config.tickFormat(tick) : String(tick));
    });

    el('line', {
      x1: P.left, x2: W - P.right, y1: P.top + plotH, y2: P.top + plotH,
      'class': 'axis', 'aria-hidden': 'true'
    }, svg);

    DATA.years.forEach(function (year, index) {
      el('text', {
        x: xs[index], y: H - 9, 'text-anchor': 'middle',
        'class': 'tick' + (year === state.year ? ' selected-tick' : ''),
        'aria-hidden': 'true'
      }, svg, String(year));
    });

    if (config.gapArea && config.series.length >= 2) {
      var topValues = config.series[0].values;
      var bottomValues = config.series[1].values;
      var area = '';
      var hasArea = true;
      topValues.forEach(function (value, index) {
        if (value === null || value === undefined || bottomValues[index] === null || bottomValues[index] === undefined) {
          hasArea = false;
        }
      });
      if (hasArea) {
        topValues.forEach(function (value, index) {
          area += (index === 0 ? 'M' : 'L') + xs[index].toFixed(2) + ' ' + y(value).toFixed(2) + ' ';
        });
        for (var i = bottomValues.length - 1; i >= 0; i -= 1) {
          area += 'L' + xs[i].toFixed(2) + ' ' + y(bottomValues[i]).toFixed(2) + ' ';
        }
        area += 'Z';
        el('path', { d: area, 'class': 'gap-area', 'aria-hidden': 'true' }, svg);
      }
    }

    if (selectedIndex >= 0) {
      el('line', {
        x1: xs[selectedIndex], x2: xs[selectedIndex], y1: P.top, y2: P.top + plotH,
        'class': 'selected-year-line', 'aria-hidden': 'true'
      }, svg);
    }

    config.series.forEach(function (series, seriesIndex) {
      // Segmen yang menyentuh 2024–2025 dibuat putus-putus agar tidak
      // dibaca sebagai kelanjutan tren yang sebanding.
      series.values.forEach(function (value, index) {
        if (index === 0) return;
        var prevValue = series.values[index - 1];
        if (value === null || value === undefined || !isFinite(value) ||
            prevValue === null || prevValue === undefined || !isFinite(prevValue)) return;
        var segmentReview = isReviewYear(DATA.years[index]) || isReviewYear(DATA.years[index - 1]);
        el('line', {
          x1: xs[index - 1], y1: y(prevValue), x2: xs[index], y2: y(value),
          stroke: series.color, 'stroke-width': 2.4,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          'stroke-dasharray': segmentReview ? '5 4' : null,
          opacity: segmentReview ? 0.8 : 1,
          'aria-hidden': 'true'
        }, svg);
      });

      series.values.forEach(function (value, index) {
        if (value === null || value === undefined || !isFinite(value)) return;
        var year = DATA.years[index];
        var tipValue = config.tipFormat ? config.tipFormat(value) : idNum(value, 2);
        var selected = index === selectedIndex;
        var point = el('circle', {
          cx: xs[index], cy: y(value), r: selected ? 5.4 : 3.8,
          fill: '#fff', stroke: series.color, 'stroke-width': 2,
          'class': 'chart-point' + (selected ? ' point-selected' : ''),
          role: 'img', tabindex: '0',
          'aria-label': series.name + ' ' + year + ': ' + tipValue + (isReviewYear(year) ? ', perlu tinjau' : ''),
          dataTip: series.name + '\nTahun: ' + year + '\nNilai: ' + tipValue +
            (isReviewYear(year) ? '\nStatus: perlu tinjau' : '')
        }, svg);
        el('title', {}, point, series.name + ' ' + year + ': ' + tipValue);
        if (selected && config.showSelectedLabels !== false) {
          var labelAnchor = 'middle';
          var labelX = xs[index];
          if (index === 0) { labelAnchor = 'start'; labelX += 5; }
          else if (index === DATA.years.length - 1) { labelAnchor = 'end'; labelX -= 6; }
          el('text', {
            x: labelX, y: Math.max(P.top + 11, y(value) - 10 - seriesIndex * 2),
            'text-anchor': labelAnchor, 'class': 'value-label', 'aria-hidden': 'true'
          }, svg, config.labelFormat ? config.labelFormat(value) : idNum(value, 2));
        }
      });
    });
  }

  function renderTimbulanChart() {
    var cur = kpiAt(state.year);
    var review = isReviewYear(state.year);
    renderLineChart(byId('chartTimbulan'), {
      height: 280,
      forceZero: true,
      gapArea: true,
      series: [
        { name: 'Sampah dihasilkan', color: C.timbulan, values: DATA.years.map(function (year) { return kpiAt(year).timbulan_tahunan_ton; }) },
        { name: 'Tercatat terkelola', color: C.terkelola, values: DATA.years.map(function (year) { return kpiAt(year).terkelola_tahunan_ton; }) }
      ],
      tickFormat: function (value) { return idNum(value / 1000, 0) + ' rb'; },
      tipFormat: function (value) { return idNum(value, 2) + ' ton'; },
      labelFormat: function (value) { return idNum(value / 1000, 0) + ' rb'; }
    });

    var ratio = cur.timbulan_tahunan_ton ? (cur.belum_terkelola_tahunan_ton / cur.timbulan_tahunan_ton) * 100 : null;
    var text = 'Tahun <strong>' + state.year + '</strong>: <strong>' + idNum(cur.timbulan_tahunan_ton, 0) +
      ' ton</strong> sampah dihasilkan; <strong>' + idNum(cur.terkelola_tahunan_ton, 0) +
      ' ton</strong> tercatat terkelola. Selisih <strong>' + idNum(cur.belum_terkelola_tahunan_ton, 0) +
      ' ton</strong> (' + idNum(ratio, 1) + '%) belum tercatat; ini bukan volume sampah yang dibuang ke lingkungan.';
    if (review) text += ' Angka ' + state.year + ' perlu tinjau karena cara pencatatan berubah.';
    byId('gapNote').innerHTML = text;
  }

  // ---------- index chart ----------
  function renderIndeksChart() {
    var base = kpiAt(DATA.years[0]);
    renderLineChart(byId('chartIndeks'), {
      height: 230,
      forceZero: false,
      showSelectedLabels: false,
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
      tipFormat: function (value) { return idNum(value, 2) + ' (2021 = 100)'; }
    });
  }

  // ---------- capaian bar chart ----------
  function renderKelolaChart() {
    var svg = byId('chartKelola');
    var size = chartSize(svg, 230);
    if (!size) return;
    var W = size.width;
    var H = size.height;
    var narrow = W < 520;
    var P = { top: 20, right: narrow ? 18 : 24, bottom: 30, left: 40 };
    var plotW = W - P.left - P.right;
    var plotH = H - P.top - P.bottom;
    if (plotW < 60 || plotH < 60) return;

    clearSvg(svg);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var defs = el('defs', {}, svg);
    var pattern = el('pattern', {
      id: 'hatchReview', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'
    }, defs);
    el('rect', { width: 6, height: 6, fill: '#eef2f6' }, pattern);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#9aa8b7', 'stroke-width': 2 }, pattern);

    var y = function (value) { return P.top + plotH - (value / 100) * plotH; };
    var baseline = P.top + plotH;

    [0, 20, 40, 60, 80, 100].forEach(function (tick) {
      el('line', {
        x1: P.left, x2: W - P.right, y1: y(tick), y2: y(tick),
        'class': 'grid-line', 'aria-hidden': 'true'
      }, svg);
      el('text', {
        x: P.left - 7, y: y(tick) + 3.5, 'text-anchor': 'end',
        'class': 'tick', 'aria-hidden': 'true'
      }, svg, String(tick));
    });

    el('line', {
      x1: P.left, x2: W - P.right, y1: baseline, y2: baseline,
      'class': 'axis', 'aria-hidden': 'true'
    }, svg);

    var slot = plotW / DATA.years.length;
    var barWidth = Math.min(46, slot * 0.56);
    DATA.years.forEach(function (year, index) {
      var center = P.left + slot * (index + 0.5);
      var value = kpiAt(year).persen_kelola;
      var review = isReviewYear(year);
      var barClass = review ? 'bar-review' : 'bar-capaian';
      var selected = year === state.year;
      var tip = 'Tercatat terkelola\nTahun: ' + year + '\nPersentase: ' + idNum(value, 1) + '%\n' +
        (review ? 'Status: perlu tinjau — cara pencatatan berbeda' : 'Angka bisa dibandingkan dengan tahun sebelumnya');
      var bar = el('rect', {
        x: center - barWidth / 2, y: y(value), width: barWidth,
        height: Math.max(0, baseline - y(value)), rx: 3,
        'class': barClass + (selected ? ' bar-selected' : ''),
        role: 'img', tabindex: '0',
        'aria-label': year + ': ' + idNum(value, 1) + '% sampah tercatat terkelola' + (review ? ', perlu tinjau' : ''),
        dataTip: tip
      }, svg);
      el('title', {}, bar, year + ': ' + idNum(value, 1) + '% tercatat terkelola' + (review ? ' (perlu tinjau)' : ''));
      el('text', {
        x: center, y: Math.max(P.top + 12, y(value) - 6),
        'text-anchor': 'middle', 'class': 'value-label', 'aria-hidden': 'true'
      }, svg, idNum(value, 1) + '%' + (review ? '*' : ''));
      el('text', {
        x: center, y: H - 9, 'text-anchor': 'middle',
        'class': 'tick' + (selected ? ' selected-tick' : ''), 'aria-hidden': 'true'
      }, svg, String(year));
    });
  }

  // ---------- composition ----------
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
    var size = chartSize(svg, 310);
    if (!size) return;
    var W = size.width;
    var H = size.height;
    var narrow = W < 430;
    var P = {
      top: 7,
      right: narrow ? 38 : 48,
      bottom: 25,
      left: Math.min(122, Math.max(86, W * 0.29))
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
    var xMax = Math.max(10, Math.ceil((maxValue * 1.08) / 5) * 5);
    var x = function (value) { return P.left + (value / xMax) * plotW; };
    var rowHeight = plotH / rows.length;
    var barHeight = Math.min(16, rowHeight * 0.58);
    var ticks = compositionTicks(xMax);

    ticks.forEach(function (tick) {
      el('line', {
        x1: x(tick), x2: x(tick), y1: P.top, y2: P.top + plotH,
        'class': 'grid-line', 'aria-hidden': 'true'
      }, svg);
      el('text', {
        x: x(tick), y: H - 7, 'text-anchor': 'middle',
        'class': 'tick', 'aria-hidden': 'true'
      }, svg, idNum(tick, 0) + '%');
    });

    rows.forEach(function (row, index) {
      var centerY = P.top + rowHeight * index + rowHeight / 2;
      var label = row.kategori;
      el('text', {
        x: P.left - 7, y: centerY + 3.5, 'text-anchor': 'end',
        'class': 'tick', 'aria-hidden': 'true'
      }, svg, label);

      if (row.persen === null) {
        var naWidth = Math.max(26, plotW * 0.2);
        var na = el('rect', {
          x: P.left, y: centerY - barHeight / 2, width: naWidth, height: barHeight, rx: 3,
          'class': 'bar-na', role: 'img', tabindex: '0',
          'aria-label': label + ' ' + state.year + ': tidak tersedia di sumber',
          dataTip: label + '\nTahun: ' + state.year + '\nStatus: NA — tidak tersedia di sumber'
        }, svg);
        el('title', {}, na, label + ': NA');
        el('text', {
          x: P.left + 7, y: centerY + 3.5,
          'class': 'na-note', 'aria-hidden': 'true'
        }, svg, 'NA');
        return;
      }

      var isFocus = !!COMPOSITION_FOCUS[label];
      var barClass = label === 'Sisa Makanan' ? 'bar-komposisi-focus' :
        label === 'Plastik' ? 'bar-komposisi-plastik' : 'bar-default';
      var bar = el('rect', {
        x: P.left, y: centerY - barHeight / 2, width: Math.max(2, x(row.persen) - P.left),
        height: barHeight, rx: 3, 'class': barClass,
        role: 'img', tabindex: '0',
        'aria-label': label + ' ' + state.year + ': ' + idNum(row.persen, 2) + '%' + (isFocus ? ', kategori fokus' : ''),
        dataTip: label + '\nTahun: ' + state.year + '\nKomposisi: ' + idNum(row.persen, 2) + '%' + (isFocus ? '\nFokus pemilahan' : '')
      }, svg);
      el('title', {}, bar, label + ' ' + state.year + ': ' + idNum(row.persen, 2) + '%');

      var labelX = x(row.persen) + 6;
      var anchor = 'start';
      if (labelX + 36 > W - 4) { labelX = x(row.persen) - 6; anchor = 'end'; }
      el('text', {
        x: labelX, y: centerY + 3.5, 'text-anchor': anchor,
        'class': 'value-label', 'aria-hidden': 'true'
      }, svg, idNum(row.persen, 1) + '%');
    });
  }

  function renderKomposisiTable() {
    var table = byId('komposisiTable');
    if (!table) return;
    var tbody = table.querySelector('tbody');
    var tfoot = table.querySelector('tfoot');
    var rows = orderedComposition(compositionRowsFor(state.year));
    var known = rows.filter(function (row) { return row.persen !== null; });
    var missing = rows.filter(function (row) { return row.persen === null; });
    var total = known.reduce(function (sum, row) { return sum + row.persen; }, 0);

    table.setAttribute('aria-label', 'Tabel komposisi sampah tahun ' + state.year);
    tbody.innerHTML = rows.map(function (row) {
      if (row.persen === null) {
        return '<tr class="row-na"><td>' + escapeHtml(row.kategori) +
          '<span class="chip-na">NA</span></td><td class="num">—</td><td>Tidak tersedia di sumber</td></tr>';
      }
      var focus = !!COMPOSITION_FOCUS[row.kategori];
      return '<tr class="' + (focus ? 'row-focus' : '') + '"><td>' + escapeHtml(row.kategori) +
        (focus ? '<span class="chip-focus">terbesar</span>' : '') +
        '</td><td class="num">' + idNum(row.persen, 2) + '%</td><td>' +
        (focus ? 'Dua kategori terbesar' : '—') + '</td></tr>';
    }).join('');

    tfoot.innerHTML = '<tr><th scope="row">Total terisi</th><td class="num">' + idNum(total, 2) +
      '%</td><td>' + known.length + ' kategori terisi' + (missing.length ? ' · ' + missing.length + ' NA' : '') + '</td></tr>';

    var note = byId('komposisiNote');
    if (note) {
      if (missing.length) {
        note.textContent = state.year + ' menampilkan ' + known.length + ' kategori terisi; ' +
          missing.length + ' kategori (Kayu Ranting) tidak tersedia di sumber. Sejak 2025 ada 9 kategori, ' +
          'jadi perbandingan antar-tahun perlu hati-hati.';
      } else {
        note.textContent = state.year + ' menampilkan ' + known.length + ' kategori terisi, termasuk Kayu Ranting (2,00%) ' +
          'yang tidak tersedia pada 2021–2024. Semua tahun berjumlah 100%, tetapi set kategori berubah.';
      }
    }
  }

  function renderKomposisiSection() {
    renderKomposisiChart();
    renderKomposisiTable();
    var badge = byId('komposisiYearBadge');
    if (badge) badge.textContent = String(state.year);

    var known = knownComposition(state.year);
    var summary = byId('komposisiSummary');
    if (summary && known.length) {
      var top1 = known[0];
      var top2 = known[1];
      var rest = known.length - 2;
      var focusSum = top1.persen + (top2 ? top2.persen : 0);
      summary.innerHTML = '<strong>' + escapeHtml(top1.kategori) + '</strong> dan <strong>' +
        escapeHtml(top2.kategori) + '</strong> mencakup <strong>' + idNum(focusSum, 1) +
        '%</strong> dari total sampah ' + state.year + '. Sisanya tersebar di ' + rest + ' kategori lain.';
    }
  }

  // ---------- donut & gap panel ----------
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
    var total = cur.terkelola_tahunan_ton + cur.belum_terkelola_tahunan_ton;
    clearSvg(svg);
    if (!total) return;

    var pKelola = cur.terkelola_tahunan_ton / total;
    var segments = [
      { name: 'Tercatat terkelola', value: cur.terkelola_tahunan_ton, pct: pKelola * 100, color: C.donutTer, key: 'terkelola' },
      { name: 'Belum tercatat', value: cur.belum_terkelola_tahunan_ton, pct: (1 - pKelola) * 100, color: C.donutBelum, key: 'belum' }
    ];

    var cx = 80;
    var cy = 80;
    var outer = 62;
    var inner = 39;
    var angle = -Math.PI / 2;

    segments.forEach(function (segment) {
      if (segment.value <= 0) return;
      var sweep = Math.min((segment.value / total) * Math.PI * 2, Math.PI * 2 - 0.0001);
      var path = el('path', {
        d: arcPath(cx, cy, outer, inner, angle, angle + sweep),
        fill: segment.color,
        'class': 'donut-seg donut-' + segment.key,
        role: 'img', tabindex: '0',
        'aria-label': segment.name + ': ' + idNum(segment.value, 2) + ' ton (' + idNum(segment.pct, 2) + '%)',
        dataTip: segment.name + '\nNilai: ' + idNum(segment.value, 2) + ' ton\nProporsi: ' + idNum(segment.pct, 2) + '%'
      }, svg);
      el('title', {}, path, segment.name + ': ' + idNum(segment.pct, 2) + '%');
      angle += sweep;
    });

    el('text', {
      x: cx, y: cy - 2, 'text-anchor': 'middle',
      'class': 'donut-center-value', 'aria-hidden': 'true'
    }, svg, idNum(cur.persen_kelola, 1) + '%');
    el('text', {
      x: cx, y: cy + 14, 'text-anchor': 'middle',
      'class': 'donut-center-label', 'aria-hidden': 'true'
    }, svg, 'tercatat');

    byId('donutLegend').innerHTML = segments.map(function (segment) {
      return '<div class="row"><span class="swatch donut-swatch" style="background:' + segment.color + '"></span>' +
        '<span><strong>' + segment.name + '</strong> — ' + idNum(segment.value, 0) + ' ton (' +
        idNum(segment.pct, 2) + '%)</span></div>';
    }).join('');
  }

  function renderKesenjangan() {
    var cur = kpiAt(state.year);
    var review = isReviewYear(state.year);
    var ratio = cur.timbulan_tahunan_ton ? (cur.belum_terkelola_tahunan_ton / cur.timbulan_tahunan_ton) * 100 : null;
    var badge = byId('kesenjanganYearBadge');
    if (badge) badge.textContent = String(state.year);
    renderDonut();

    var html = '<div class="big' + (review ? ' big-review' : '') + '">' +
      idNum(cur.belum_terkelola_tahunan_ton, 0) + ' ton' +
      '<span class="muted"> belum tercatat terkelola (' + idNum(ratio, 1) + '%)</span></div>';
    if (review) {
      html += '<p class="review-note"><strong>Perlu tinjau.</strong> Angka ' + state.year +
        ' memakai cara pencatatan berbeda; ini bukan penilaian kinerja. ' +
        '<button type="button" class="text-link" data-open-details>Penjelasan</button></p>';
    }
    html += '<p class="plain-note"><strong>Belum tercatat bukan berarti dibuang ke lingkungan.</strong> ' +
      'Ini selisih antara total sampah dan yang tercatat terkelola.</p>';

    var rows = [
      ['Sampah dihasilkan', idNum(cur.timbulan_tahunan_ton, 0) + ' ton'],
      ['Tercatat terkelola', idNum(cur.terkelola_tahunan_ton, 0) + ' ton (' + idNum(cur.persen_kelola, 1) + '%)'],
      ['Belum tercatat', idNum(cur.belum_terkelola_tahunan_ton, 0) + ' ton'],
      ['Per orang per hari', idNum(cur.timbulan_kg_per_orang_hari, 2) + ' kg']
    ];
    html += rows.map(function (row) {
      return '<div class="row"><span>' + row[0] + '</span><span>' + row[1] + '</span></div>';
    }).join('');
    byId('kesenjanganPanel').innerHTML = html;
  }

  // ---------- details ----------
  function renderSumber() {
    var doi = META.zenodo_doi || '10.5281/zenodo.24240544';
    var url = META.zenodo_url || 'https://zenodo.org/records/24240544';
    var items = [
      escapeHtml(META.sumber || 'SIPSN/KLHK (timbulan, capaian, komposisi) dan BPS (penduduk) — Kota Semarang, 2021–2025'),
      'Data mentah dan kamus variabel tersedia di folder <code>data/</code> (CSV).',
      'Dataset bersih: DOI <a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + escapeHtml(doi) + '</a> · berkas Restricted (metadata/DOI publik).',
      'Catatan: keterangan lisensi di rekaman Zenodo bukan pengganti hak redistribusi penyedia data asli.'
    ];
    byId('sumberList').innerHTML = items.map(function (item) { return '<li>' + item + '</li>'; }).join('');
  }

  function badgeFor(status) {
    var value = String(status || '').toUpperCase();
    if (value === 'LULUS') return '<span class="badge badge-lulus">LULUS</span>';
    if (value === 'CATATAN') return '<span class="badge badge-catatan">CATATAN</span>';
    return '<span class="badge badge-tinjau">PERLU TINJAU</span>';
  }

  function renderValidasi() {
    byId('validasiBody').innerHTML = (DATA.validasi || []).map(function (row) {
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
      ? '<span class="badge badge-tinjau">perlu tinjau</span> cara mencatat 2024–2025 berbeda; angka tidak untuk dibandingkan.'
      : '<span class="badge badge-netral">sebanding</span> angka dapat dibandingkan dengan tahun sebelumnya.';

    var items = [
      '<strong>Tahun ' + state.year + '</strong> — ' + status,
      'Sampah dihasilkan ' + idNum(cur.timbulan_tahunan_ton, 2) + ' ton; tercatat terkelola ' +
        idNum(cur.terkelola_tahunan_ton, 2) + ' ton (' + idNum(cur.persen_kelola, 2) +
        '%); belum tercatat ' + idNum(cur.belum_terkelola_tahunan_ton, 2) + ' ton.',
      'Daur ulang + bahan baku (metrik tambahan): ' + idNum(cur.persen_recycling_rate, 2) + '%. Komponen sumber: ' +
        idNum(cur.jml_daur_ulang_ton, 2) + ' ton daur ulang + ' + idNum(cur.jml_bahan_baku_ton, 2) + ' ton bahan baku.' +
        (review ? ' Komponen ini praktis sama dengan pengurangan/penanganan, sehingga bukan metrik daur ulang independen.' : ''),
      'Komposisi: ' + filled + ' kategori terisi' + (missing ? ' dan ' + missing + ' tidak tersedia' : '') +
        '; lihat catatan set kategori di panel ini.'
    ];
    byId('konteksList').innerHTML = items.map(function (item) { return '<li>' + item + '</li>'; }).join('');
  }

  // ---------- sorotan ----------
  function renderCBQ() {
    var known = knownComposition(state.year);
    var top1 = known[0] || { kategori: 'Kategori terbesar', persen: 0 };
    var top2 = known[1] || { kategori: 'kategori berikutnya', persen: 0 };
    var topSum = top1.persen + top2.persen;
    var totals = DATA.years.map(function (year) { return kpiAt(year).timbulan_tahunan_ton; });
    var min = Math.min.apply(null, totals) / 1000;
    var max = Math.max.apply(null, totals) / 1000;

    var items = [
      '<li><strong>' + escapeHtml(top1.kategori) + ' dan ' + escapeHtml(top2.kategori) +
        ' mendominasi.</strong> Keduanya mencakup ' + idNum(topSum, 1) + '% dari komposisi ' + state.year +
        '. Ini dua kategori paling besar untuk dipilah.</li>',
      '<li><strong>Jumlah sampah relatif stabil.</strong> Sepanjang 2021–2025, sampah yang dihasilkan berkisar ' +
        idNum(min, 0) + '–' + idNum(max, 0) + ' ribu ton per tahun.</li>',
      '<li><strong>Hati-hati membandingkan 2024–2025.</strong> Cara pencatatan berubah, jadi angka pengelolaan ' +
        'kedua tahun itu bukan penilaian kinerja.</li>'
    ];
    byId('cbqList').innerHTML = items.join('');
  }

  // ---------- year filter ----------
  function renderYearDependent() {
    var headerYear = byId('headerYear');
    if (headerYear) headerYear.textContent = String(state.year);
    renderHero();
    renderKeyFacts();
    renderTimbulanChart();
    renderKelolaChart();
    renderKelolaNote();
    renderIndeksChart();
    renderKomposisiSection();
    renderKesenjangan();
    renderReadingGuide();
    renderKonteks();
    renderCBQ();
  }

  function setYear(year, options) {
    var opts = options || {};
    if (DATA.years.indexOf(year) === -1) year = LATEST_YEAR;
    state.year = year;
    var select = byId('yearSelect');
    if (select) select.value = String(year);
    renderYearDependent();
    if (opts.updateUrl) writeYearToUrl(year, !!opts.replace);
  }

  // ---------- dialog ----------
  function setExpanded(value) {
    ['detailsToggle', 'bannerDetails'].forEach(function (id) {
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

  function openDetails(invoker) {
    var panel = byId('detailsPanel');
    var backdrop = byId('detailsBackdrop');
    if (!panel || !panel.hidden) return;
    lastFocus = invoker || document.activeElement;
    panel.hidden = false;
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add('dialog-open');
    setExpanded(true);
    byId('detailsClose').focus();
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

  // ---------- init ----------
  function populateYearSelect() {
    var select = byId('yearSelect');
    if (!select) return;
    DATA.years.forEach(function (year) {
      var option = document.createElement('option');
      option.value = String(year);
      option.textContent = String(year) + (isReviewYear(year) ? ' · perlu tinjau' : '');
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
    var printDetails = [];

    function openPrintDetails() {
      ['.plain-details', '.table-details'].forEach(function (selector) {
        var node = document.querySelector(selector);
        if (node && !node.open) {
          node.open = true;
          if (printDetails.indexOf(node) === -1) printDetails.push(node);
        }
      });
    }

    function restorePrintDetails() {
      var nodes = printDetails.slice();
      printDetails = [];
      nodes.forEach(function (node) { node.open = false; });
      // Chrome dapat mengembalikan state cetak setelah afterprint; tutup lagi
      // sebentar setelahnya agar halaman tidak tertinggal dalam keadaan terbuka.
      window.setTimeout(function () {
        nodes.forEach(function (node) { node.open = false; });
      }, 300);
    }

    function cancelPrintRestore() {
      if (printRestoreTimer) {
        window.clearTimeout(printRestoreTimer);
        printRestoreTimer = null;
      }
    }

    function restoreAfterPrint() {
      cancelPrintRestore();
      // Chrome dapat mengambil snapshot cetak setelah afterprint; tunda render
      // ukuran layar agar viewBox cetak tidak sempat tertimpa.
      printRestoreTimer = window.setTimeout(function () {
        printRestoreTimer = null;
        renderResponsiveCharts();
      }, 1500);
    }

    if ('ResizeObserver' in window) {
      var observer = new ResizeObserver(function () {
        // Saat print, callback rAF tidak dijalankan sebelum snapshot; render sinkron.
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
    window.addEventListener('beforeprint', function () {
      cancelPrintRestore();
      openPrintDetails();
      renderResponsiveCharts();
    });
    window.addEventListener('afterprint', function () {
      restorePrintDetails();
      restoreAfterPrint();
    });
    if (printMedia && printMedia.addEventListener) {
      printMedia.addEventListener('change', function (event) {
        if (event.matches) {
          cancelPrintRestore();
          openPrintDetails();
          renderResponsiveCharts();
        } else {
          restorePrintDetails();
          restoreAfterPrint();
        }
      });
    }
    window.addEventListener('scroll', hideTooltip, { passive: true });
  }

  function bindEvents() {
    var select = byId('yearSelect');
    select.addEventListener('change', function () {
      setYear(parseInt(this.value, 10), { updateUrl: true });
    });

    var toggle = byId('detailsToggle');
    toggle.addEventListener('click', function () {
      var panel = byId('detailsPanel');
      if (panel.hidden) openDetails(this);
      else closeDetails();
    });

    var banner = byId('bannerDetails');
    if (banner) banner.addEventListener('click', function () { openDetails(this); });

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
      { name: 'Sampah dihasilkan', color: C.timbulan },
      { name: 'Tercatat terkelola', color: C.terkelola },
      { name: 'Belum tercatat', color: C.gap, area: true }
    ]);
    renderLegend('legendKelola', [
      { name: 'tercatat terkelola', color: C.terkelola, bar: true },
      { name: 'perlu tinjau', bar: true, na: true }
    ]);
    renderLegend('legendIndeks', [
      { name: 'Sampah dihasilkan (2021 = 100)', color: C.timbulan },
      { name: 'Penduduk (2021 = 100)', color: C.penduduk }
    ]);
    renderLegend('legendKomposisi', [
      { name: 'Sisa Makanan', color: C.focus },
      { name: 'Plastik', color: C.plastik },
      { name: 'Kategori lain', color: C.other },
      { name: 'NA / tidak tersedia', na: true }
    ]);

    var caption = byId('chartCaptionTimbulan');
    if (caption) caption.textContent = '· sumbu Y: ribu ton, dari nol';

    var advanced = document.querySelector('.advanced-details');
    if (advanced) {
      advanced.addEventListener('toggle', function () {
        if (advanced.open) window.requestAnimationFrame(renderIndeksChart);
      });
    }

    ['chartTimbulan', 'chartKelola', 'chartIndeks', 'chartKomposisi', 'chartDonut'].forEach(function (id) {
      bindTooltips(byId(id));
    });

    var initial = readYearFromUrl();
    setYear(initial === null ? LATEST_YEAR : initial, { updateUrl: true, replace: true });
    observeCharts();
  }

  init();
})();
