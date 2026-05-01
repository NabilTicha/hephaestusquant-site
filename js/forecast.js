// Forecast page: asset picker + 2D probability-density painter.
// Grid represents p(price, t). Time axis is N_T columns from now → user's
// chosen horizon (horizon_days); price axis is N_P linear bins between
// priceMin and priceMax. N_T and N_P are fixed regardless of horizon so
// storage size is constant; column width (in days) = horizon_days / N_T.

const ForecastForm = (() => {
  // ---- Config ----
  const N_T = 64;            // time columns
  const N_P = 200;           // price bins
  const UNDO_LIMIT = 40;
  const DEFAULT_RANGE_FACTOR = [0.5, 1.5]; // [min, max] multiplier on spot

  // ---- Module state ----
  let assets = [];
  let selectedAsset = null;
  let spot = null;
  let horizonDays = 365;     // total forecast horizon in days

  // Painter state
  let density = new Float32Array(N_T * N_P); // row-major: idx = t*N_P + p
  let priceMin = 0;
  let priceMax = 1;
  let tool = 'brush';
  let brushRadius = 0.08;    // normalised to canvas (0..1 in both axes)
  let brushStrength = 0.4;
  let viewMode = 'raw';      // 'raw' | 'pdf'
  let isDrawing = false;
  let lastPoint = null;
  const history = [];        // stack of Float32Array snapshots
  const redoStack = [];
  let dirtyRender = true;

  // DOM refs (set in init)
  let canvas = null;
  let ctx = null;
  let offscreen = null;      // for density imageData
  let offCtx = null;
  let readout = null;
  let painterBound = false;  // DOM listeners bound only once

  // ---- Init ----
  function init() {
    Auth.onReady(user => {
      if (user) {
        document.getElementById('forecast-form-section').style.display = '';
        document.getElementById('auth-gate').style.display = 'none';
        loadAssets();
        setupSearch();
      } else {
        document.getElementById('auth-gate').style.display = '';
        document.getElementById('forecast-form-section').style.display = 'none';
      }
    });
  }

  // ---- Asset picker (unchanged logic, trimmed comments) ----
  async function loadAssets() {
    try {
      const res = await fetch('/api/assets');
      const data = await res.json();
      assets = data.assets || [];
    } catch (e) {
      console.error('Failed to load assets:', e);
    }
  }

  function setupSearch() {
    const input = document.getElementById('asset-search');
    const results = document.getElementById('asset-results');

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 1) { results.innerHTML = ''; return; }
      const matches = assets.filter(a =>
        a.id.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.asset_class.toLowerCase().includes(q)
      ).slice(0, 12);
      results.innerHTML = matches.map(a => `
        <div class="asset-result" data-id="${a.id}">
          <span class="asset-ticker">${a.id}</span>
          <span class="asset-name-text">${a.name}</span>
          <span class="asset-class-tag">${formatClass(a.asset_class)}</span>
          ${a.latest_price ? `<span class="asset-price">$${Number(a.latest_price).toFixed(2)}</span>` : ''}
        </div>
      `).join('');
      results.querySelectorAll('.asset-result').forEach(el => {
        el.addEventListener('click', () => selectAsset(el.dataset.id));
      });
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { results.innerHTML = ''; input.blur(); }
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.asset-picker')) results.innerHTML = '';
    });
  }

  function formatClass(cls) {
    const labels = {
      equity: 'Equity', index: 'Index', crypto: 'Crypto',
      commodity: 'Commodity', fx: 'FX', sector_etf: 'Sector ETF', international: 'Intl'
    };
    return labels[cls] || cls;
  }

  function selectAsset(id) {
    selectedAsset = assets.find(a => a.id === id);
    if (!selectedAsset) return;

    document.getElementById('asset-search').style.display = 'none';
    document.getElementById('asset-results').innerHTML = '';

    const el = document.getElementById('selected-asset');
    el.style.display = '';
    el.innerHTML = `
      <div class="selected-asset-info">
        <span class="asset-ticker">${selectedAsset.id}</span>
        <span class="asset-name-text">${selectedAsset.name}</span>
        <span class="asset-class-tag">${formatClass(selectedAsset.asset_class)}</span>
        ${selectedAsset.latest_price ? `<span class="asset-price">Current: $${Number(selectedAsset.latest_price).toFixed(2)}</span>` : '<span class="asset-price">No price data yet</span>'}
      </div>
      <button class="btn btn-sm" onclick="ForecastForm.clearAsset()">Change</button>
    `;

    spot = selectedAsset.latest_price ? Number(selectedAsset.latest_price) : null;
    document.getElementById('painter-form').style.display = '';
    initPainter();
  }

  function clearAsset() {
    selectedAsset = null;
    spot = null;
    document.getElementById('asset-search').style.display = '';
    document.getElementById('asset-search').value = '';
    document.getElementById('selected-asset').style.display = 'none';
    document.getElementById('painter-form').style.display = 'none';
  }

  // ---- Painter ----

  function initPainter() {
    canvas = document.getElementById('forecast-canvas');
    ctx = canvas.getContext('2d');
    offscreen = document.createElement('canvas');
    offscreen.width = N_T;
    offscreen.height = N_P;
    offCtx = offscreen.getContext('2d');
    readout = document.getElementById('painter-readout');

    // Reset state
    density = new Float32Array(N_T * N_P);
    history.length = 0;
    redoStack.length = 0;
    viewMode = 'raw';
    const viewBtn = document.getElementById('view-toggle');
    if (viewBtn) viewBtn.textContent = 'Show as PDF';

    horizonDays = 365;
    setHorizonInputs(horizonDays);
    updateHorizonSummary();
    setDefaultPriceRange();
    fillGBM();

    if (!painterBound) {
      setupPainterControls();
      setupPainterEvents();
      window.addEventListener('resize', resizeCanvas);
      requestAnimationFrame(renderLoop);
      painterBound = true;
    }
    resizeCanvas();
    dirtyRender = true;
    updateCoverage();
  }

  function setDefaultPriceRange() {
    const base = spot || 100;
    priceMin = +(base * DEFAULT_RANGE_FACTOR[0]).toFixed(2);
    priceMax = +(base * DEFAULT_RANGE_FACTOR[1]).toFixed(2);
    document.getElementById('price-min').value = priceMin;
    document.getElementById('price-max').value = priceMax;
  }

  function horizonFromUnit(value, unit) {
    switch (unit) {
      case 'days': return Math.round(value);
      case 'weeks': return Math.round(value * 7);
      case 'months': return Math.round(value * 30);
      case 'years': return Math.round(value * 365);
      default: return Math.round(value);
    }
  }
  function setHorizonInputs(days) {
    // Pick the coarsest unit that still represents the value exactly.
    let unit = 'days', value = days;
    if (days % 365 === 0) { unit = 'years'; value = days / 365; }
    else if (days % 30 === 0) { unit = 'months'; value = days / 30; }
    else if (days % 7 === 0) { unit = 'weeks'; value = days / 7; }
    document.getElementById('horizon-value').value = value;
    document.getElementById('horizon-unit').value = unit;
  }
  function updateHorizonSummary() {
    const el = document.getElementById('horizon-summary');
    if (!el) return;
    const d = new Date();
    d.setDate(d.getDate() + horizonDays);
    const end = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const colDays = horizonDays / N_T;
    const colDesc = colDays >= 1
      ? `${colDays.toFixed(colDays >= 10 ? 0 : 1)}d/col`
      : `${(colDays * 24).toFixed(1)}h/col`;
    el.textContent = `→ ${end} · ${colDesc}`;
  }

  function setupPainterControls() {
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.onclick = () => {
        tool = btn.dataset.tool;
        document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b === btn));
      };
    });

    const onHorizonChange = () => {
      const val = parseFloat(document.getElementById('horizon-value').value);
      const unit = document.getElementById('horizon-unit').value;
      const newDays = horizonFromUnit(val, unit);
      if (!Number.isFinite(newDays) || newDays < 1) return;
      if (density.some(v => v > 0) && newDays !== horizonDays) {
        if (!confirm('Changing the horizon will clear your painting. Continue?')) {
          setHorizonInputs(horizonDays);
          return;
        }
        density.fill(0);
      }
      horizonDays = newDays;
      updateHorizonSummary();
      dirtyRender = true;
      updateCoverage();
    };
    document.getElementById('horizon-value').onchange = onHorizonChange;
    document.getElementById('horizon-unit').onchange = onHorizonChange;

    document.querySelector('[data-action="undo"]').onclick = undo;
    document.querySelector('[data-action="redo"]').onclick = redo;
    document.querySelector('[data-action="clear"]').onclick = () => {
      if (density.some(v => v > 0) && !confirm('Clear the whole canvas?')) return;
      pushHistory();
      density.fill(0);
      dirtyRender = true;
      updateCoverage();
    };
    document.querySelector('[data-action="reset-range"]').onclick = () => {
      if (density.some(v => v > 0) && !confirm('Resetting the price range will clear your painting. Continue?')) return;
      density.fill(0);
      setDefaultPriceRange();
      dirtyRender = true;
      updateCoverage();
    };
    document.querySelector('[data-action="toggle-view"]').onclick = () => {
      viewMode = viewMode === 'raw' ? 'pdf' : 'raw';
      document.getElementById('view-toggle').textContent =
        viewMode === 'raw' ? 'Show as PDF' : 'Show raw strokes';
      dirtyRender = true;
    };

    document.querySelector('[data-action="fill-gbm"]').onclick = fillGBM;

    document.getElementById('brush-radius').oninput = e => { brushRadius = parseFloat(e.target.value); };
    document.getElementById('brush-opacity').oninput = e => { brushStrength = parseFloat(e.target.value); };

    const onRangeChange = () => {
      const mn = parseFloat(document.getElementById('price-min').value);
      const mx = parseFloat(document.getElementById('price-max').value);
      if (!isFinite(mn) || !isFinite(mx) || mn >= mx) return;
      if (density.some(v => v > 0)) {
        if (!confirm('Changing the price range will clear your painting. Continue?')) {
          document.getElementById('price-min').value = priceMin;
          document.getElementById('price-max').value = priceMax;
          return;
        }
        density.fill(0);
      }
      priceMin = mn; priceMax = mx;
      dirtyRender = true;
      updateCoverage();
    };
    document.getElementById('price-min').onchange = onRangeChange;
    document.getElementById('price-max').onchange = onRangeChange;
  }

  function setupPainterEvents() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointercancel', onPointerUp);
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirtyRender = true;
  }

  // Canvas → plot area mapping. We reserve margins for axes.
  function getPlotRect() {
    const rect = canvas.getBoundingClientRect();
    const left = 64, right = 12, top = 16, bottom = 40;
    return {
      x: left, y: top,
      w: Math.max(1, rect.width - left - right),
      h: Math.max(1, rect.height - top - bottom),
    };
  }

  // Convert pointer (CSS px) to normalised plot coords (0..1).
  function pointerToNormalised(e) {
    const rect = canvas.getBoundingClientRect();
    const plot = getPlotRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const nx = (px - plot.x) / plot.w;
    const ny = 1 - (py - plot.y) / plot.h; // flip y so 0=bottom (low price), 1=top
    return { nx, ny, inside: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 };
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const p = pointerToNormalised(e);
    if (!p.inside) return;
    pushHistory();
    redoStack.length = 0;
    isDrawing = true;
    lastPoint = p;
    stamp(p.nx, p.ny);
    dirtyRender = true;
  }

  function onPointerMove(e) {
    const p = pointerToNormalised(e);
    updateReadout(p);
    if (!isDrawing || !p.inside) return;

    // Interpolate between last and current to get a continuous stroke.
    if (lastPoint) {
      const dx = p.nx - lastPoint.nx;
      const dy = p.ny - lastPoint.ny;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(0.002, brushRadius * 0.3);
      const n = Math.max(1, Math.ceil(dist / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        stamp(lastPoint.nx + dx * t, lastPoint.ny + dy * t);
      }
    } else {
      stamp(p.nx, p.ny);
    }
    lastPoint = p;
    dirtyRender = true;
  }

  function onPointerUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    lastPoint = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    updateCoverage();
  }

  function onPointerLeave() {
    readout.textContent = '';
  }

  // Stamp a soft-edged circular brush at normalised (nx, ny).
  // Brush operates on grid cells, using Gaussian falloff.
  function stamp(nx, ny) {
    // Brush extent in grid units.
    const rt = brushRadius * N_T;
    const rp = brushRadius * N_P;
    const ct = nx * N_T;
    const cp = ny * N_P;

    const t0 = Math.max(0, Math.floor(ct - rt - 1));
    const t1 = Math.min(N_T - 1, Math.ceil(ct + rt + 1));
    const p0 = Math.max(0, Math.floor(cp - rp - 1));
    const p1 = Math.min(N_P - 1, Math.ceil(cp + rp + 1));

    const inv2Rt2 = 1 / (2 * Math.max(0.5, rt) ** 2);
    const inv2Rp2 = 1 / (2 * Math.max(0.5, rp) ** 2);
    const s = brushStrength;

    for (let ti = t0; ti <= t1; ti++) {
      const dt = ti + 0.5 - ct;
      for (let pi = p0; pi <= p1; pi++) {
        const dp = pi + 0.5 - cp;
        const g = Math.exp(-(dt * dt * inv2Rt2 + dp * dp * inv2Rp2));
        if (g < 0.01) continue;
        const idx = ti * N_P + pi;
        if (tool === 'brush') {
          density[idx] += s * g;
        } else {
          density[idx] *= 1 - Math.min(1, s * g);
        }
      }
    }
  }

  // Fill the grid with a log-normal (GBM) prior: zero-drift gaussian in
  // log-return space, width σ√t, widening left→right as t grows.
  function fillGBM() {
    const annualVol = parseFloat(document.getElementById('gbm-vol').value) / 100;
    if (!isFinite(annualVol) || annualVol <= 0) return;

    const center = (spot > 0) ? spot : (priceMin + priceMax) / 2;
    pushHistory();
    redoStack.length = 0;

    for (let ti = 0; ti < N_T; ti++) {
      // Clamp to at least 1 day so the first column isn't a delta function.
      const tYears = Math.max(((ti + 0.5) / N_T) * horizonDays / 365, 1 / 365);
      const sigmaT = annualVol * Math.sqrt(tYears);
      const inv2s2 = 1 / (2 * sigmaT * sigmaT);

      for (let pi = 0; pi < N_P; pi++) {
        const price = priceMin + (pi + 0.5) / N_P * (priceMax - priceMin);
        if (price <= 0) { density[ti * N_P + pi] = 0; continue; }
        const logR = Math.log(price / center);
        density[ti * N_P + pi] = Math.exp(-logR * logR * inv2s2);
      }
    }

    dirtyRender = true;
    updateCoverage();
  }

  // ---- History ----
  function pushHistory() {
    if (history.length >= UNDO_LIMIT) history.shift();
    history.push(new Float32Array(density));
  }
  function undo() {
    const snap = history.pop();
    if (!snap) return;
    redoStack.push(new Float32Array(density));
    density = snap;
    dirtyRender = true;
    updateCoverage();
  }
  function redo() {
    const snap = redoStack.pop();
    if (!snap) return;
    history.push(new Float32Array(density));
    density = snap;
    dirtyRender = true;
    updateCoverage();
  }

  // ---- Coverage ----
  function columnSums() {
    const sums = new Float64Array(N_T);
    for (let t = 0; t < N_T; t++) {
      let s = 0;
      for (let p = 0; p < N_P; p++) s += density[t * N_P + p];
      sums[t] = s;
    }
    return sums;
  }
  function updateCoverage() {
    const sums = columnSums();
    let filled = 0;
    for (let t = 0; t < N_T; t++) if (sums[t] > 1e-6) filled++;
    const el = document.getElementById('coverage-text');
    if (el) {
      el.textContent = `Coverage: ${filled} / ${N_T} columns painted`;
      el.classList.toggle('complete', filled === N_T);
    }
  }

  // ---- Rendering ----
  function renderLoop() {
    if (dirtyRender) {
      render();
      dirtyRender = false;
    }
    requestAnimationFrame(renderLoop);
  }

  function render() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    const plot = getPlotRect();

    drawAxes(plot);
    drawDensity(plot);
    drawSpotLine(plot);
    drawHorizonMarkers(plot);
    drawBorder(plot);
  }

  function drawAxes(plot) {
    ctx.save();
    ctx.fillStyle = '#858592';
    ctx.font = "11px 'IBM Plex Mono', monospace";

    // Price (y) ticks: 6 evenly spaced.
    const nY = 6;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= nY; i++) {
      const frac = i / nY;
      const y = plot.y + (1 - frac) * plot.h;
      const price = priceMin + frac * (priceMax - priceMin);
      ctx.fillText('$' + price.toFixed(price >= 100 ? 0 : 2), plot.x - 8, y);
      ctx.strokeStyle = 'rgba(184, 156, 75, 0.05)';
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }

    // Time (x) ticks: 5 evenly spaced fractions of the horizon.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const now = new Date();
    const fracs = [0, 0.25, 0.5, 0.75, 1];
    for (const f of fracs) {
      const x = plot.x + f * plot.w;
      const days = Math.round(f * horizonDays);
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      ctx.fillText(f === 0 ? 'Now' : formatHorizonTick(days, d), x, plot.y + plot.h + 6);
      ctx.strokeStyle = 'rgba(184, 156, 75, 0.05)';
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    ctx.restore();
  }

  function formatHorizonTick(days, date) {
    // Short tick label: date for <= 2y, years+date beyond that.
    if (horizonDays <= 2 * 365) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    const years = days / 365;
    return years.toFixed(years >= 10 ? 0 : 1) + 'y';
  }

  function drawDensity(plot) {
    // Offscreen image layout: width=N_T (time), height=N_P (price).
    // Pixel row 0 is the top of the image = high price, so we flip the price index.
    // viewMode='raw' scales by global max; 'pdf' normalises each time column independently.
    const img = offCtx.createImageData(N_T, N_P);
    const data = img.data;
    const r = 0xB8, g = 0x9C, b = 0x4B;

    let globalMax = 0;
    if (viewMode === 'raw') {
      for (let i = 0; i < density.length; i++) {
        if (density[i] > globalMax) globalMax = density[i];
      }
    }

    for (let t = 0; t < N_T; t++) {
      let colMax = 0;
      if (viewMode === 'pdf') {
        for (let p = 0; p < N_P; p++) {
          const v = density[t * N_P + p];
          if (v > colMax) colMax = v;
        }
      }
      for (let p = 0; p < N_P; p++) {
        const v = density[t * N_P + p];
        let intensity;
        if (viewMode === 'raw') intensity = globalMax > 0 ? v / globalMax : 0;
        else intensity = colMax > 0 ? v / colMax : 0;
        // gamma lift so faint strokes are visible
        intensity = Math.min(1, Math.pow(intensity, 0.7));
        const pixelRow = N_P - 1 - p;
        const idx = (pixelRow * N_T + t) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = Math.round(intensity * 230);
      }
    }
    offCtx.putImageData(img, 0, 0);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreen, plot.x, plot.y, plot.w, plot.h);
    ctx.restore();
  }

  function drawSpotLine(plot) {
    if (!spot) return;
    if (spot < priceMin || spot > priceMax) return;
    const frac = (spot - priceMin) / (priceMax - priceMin);
    const y = plot.y + (1 - frac) * plot.h;
    ctx.save();
    ctx.strokeStyle = 'rgba(184, 156, 75, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(184, 156, 75, 0.9)';
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('spot $' + spot.toFixed(2), plot.x + plot.w - 80, y - 8);
    ctx.restore();
  }

  function drawHorizonMarkers(plot) {
    // Faint dashed markers at meaningful sub-horizons (1w, 1m, 3m, 1y)
    // if they fall inside the painter's time range.
    const marks = [7, 30, 91, 365];
    ctx.save();
    ctx.strokeStyle = 'rgba(184, 156, 75, 0.12)';
    ctx.setLineDash([2, 4]);
    for (const days of marks) {
      if (days >= horizonDays) continue;
      const frac = days / horizonDays;
      const x = plot.x + frac * plot.w;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBorder(plot) {
    ctx.save();
    ctx.strokeStyle = 'rgba(184, 156, 75, 0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w - 1, plot.h - 1);
    ctx.restore();
  }

  // ---- Hover readout ----
  function updateReadout(p) {
    if (!readout) return;
    if (!p.inside) { readout.textContent = ''; return; }
    const price = priceMin + p.ny * (priceMax - priceMin);
    const col = Math.min(N_T - 1, Math.max(0, Math.floor(p.nx * N_T)));
    const days = Math.round((col + 0.5) / N_T * horizonDays);
    const d = new Date();
    d.setDate(d.getDate() + days);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const sums = columnSums();
    const cs = sums[col];
    let marg = 0;
    if (cs > 0) {
      const bin = Math.min(N_P - 1, Math.max(0, Math.floor(p.ny * N_P)));
      marg = density[col * N_P + bin] / cs;
    }
    readout.textContent = `t+${days}d (${dateStr}) · $${price.toFixed(2)} · p\u2248${(marg * 100).toFixed(2)}%`;
  }

  // ---- Errors ----
  function showErrors(errors) {
    const el = document.getElementById('form-errors');
    el.style.display = '';
    el.innerHTML = errors.map(e => `<div class="form-error">${e}</div>`).join('');
  }
  function hideErrors() {
    document.getElementById('form-errors').style.display = 'none';
  }

  function toBase64(bytes) {
    // chunk to avoid arg-length limits on large arrays
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  async function submit() {
    hideErrors();
    if (!selectedAsset) { showErrors(['Please select an asset first.']); return; }

    const sums = columnSums();
    const missing = [];
    for (let t = 0; t < N_T; t++) if (sums[t] <= 1e-6) missing.push(t);
    if (missing.length > 0) {
      showErrors([`Paint every time column before submitting. Missing columns: ${missing.join(', ')}`]);
      return;
    }
    if (!isFinite(priceMin) || !isFinite(priceMax) || priceMin >= priceMax || priceMin <= 0) {
      showErrors(['Price range is invalid. Both must be positive and max > min.']); return;
    }
    if (!Number.isInteger(horizonDays) || horizonDays < 1) {
      showErrors(['Horizon must be a positive integer number of days.']); return;
    }

    // Per-column-normalised PDF, quantised to uint8 (0..255 relative to column max).
    const grid = new Uint8Array(N_T * N_P);
    for (let t = 0; t < N_T; t++) {
      let colMax = 0;
      for (let p = 0; p < N_P; p++) {
        const v = density[t * N_P + p];
        if (v > colMax) colMax = v;
      }
      for (let p = 0; p < N_P; p++) {
        const v = density[t * N_P + p];
        // Ensure every painted column has at least one non-zero byte after
        // quantisation; otherwise the backend's "empty column" check will
        // reject submissions where a weak stroke rounded to zero everywhere.
        const q = colMax > 0 ? Math.round((v / colMax) * 255) : 0;
        grid[t * N_P + p] = q;
      }
      // Safety: if the entire column rounded to zero (shouldn't happen, but
      // floating-point is floating-point), paint a 1 at the bin with the
      // largest original value.
      let any = 0;
      let argmax = 0;
      let argmaxVal = -1;
      for (let p = 0; p < N_P; p++) {
        const v = density[t * N_P + p];
        if (v > argmaxVal) { argmaxVal = v; argmax = p; }
        any |= grid[t * N_P + p];
      }
      if (any === 0) grid[t * N_P + argmax] = 1;
    }

    const payload = {
      asset_id: selectedAsset.id,
      horizon_days: horizonDays,
      n_t: N_T,
      n_p: N_P,
      price_min: priceMin,
      price_max: priceMax,
      grid_b64: toBase64(grid),
      justification: document.getElementById('painter-justification').value.trim() || undefined,
    };

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    try {
      const res = await fetch('/api/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showErrors([data.error || 'Submission failed.']);
        btn.disabled = false;
        btn.textContent = 'Submit forecast';
        return;
      }

      document.getElementById('forecast-form-section').style.display = 'none';
      document.getElementById('success-section').style.display = '';
      const msg = document.getElementById('success-msg');
      if (msg) {
        msg.textContent = `Forecast saved (${grid.byteLength.toLocaleString()} bytes). ` +
          `Horizon: ${horizonDays} days. Will be scored as time passes.`;
      }
      const link = document.getElementById('view-forecast-link');
      if (link && data && data.id) link.href = `/forecast-view.html?id=${data.id}`;
    } catch (e) {
      showErrors(['Network error. Please try again.']);
      btn.disabled = false;
      btn.textContent = 'Submit forecast';
    }
  }

  init();

  return { submit, clearAsset };
})();
