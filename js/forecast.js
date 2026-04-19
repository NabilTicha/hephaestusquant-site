// Forecast page: asset picker + 2D probability-density painter.
// Grid represents p(price, t). Time axis is 52 weekly columns from now → 1y,
// price axis is N_P linear bins between price-min and price-max.

const ForecastForm = (() => {
  // ---- Config ----
  const N_T = 52;            // weekly columns over 1 year
  const N_P = 200;           // price bins
  const UNDO_LIMIT = 40;
  const DEFAULT_RANGE_FACTOR = [0.5, 1.5]; // [min, max] multiplier on spot

  // ---- Module state ----
  let assets = [];
  let selectedAsset = null;
  let spot = null;

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

    setDefaultPriceRange();

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

  function setupPainterControls() {
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.onclick = () => {
        tool = btn.dataset.tool;
        document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b === btn));
      };
    });

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
      el.textContent = `Coverage: ${filled} / ${N_T} weeks painted`;
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

    // Time (x) ticks: weeks 0, 13, 26, 39, 52 — labelled as dates.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const now = new Date();
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const ticks = [0, 13, 26, 39, 52];
    for (const w of ticks) {
      const frac = w / N_T;
      const x = plot.x + frac * plot.w;
      const d = new Date(now);
      d.setDate(d.getDate() + w * 7);
      ctx.fillText(w === 0 ? 'Now' : fmt(d), x, plot.y + plot.h + 6);
      ctx.strokeStyle = 'rgba(184, 156, 75, 0.05)';
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    ctx.restore();
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
    // Faint vertical markers at 1w, 1m, 3m, 1y-ish for reference.
    ctx.save();
    ctx.strokeStyle = 'rgba(184, 156, 75, 0.12)';
    ctx.setLineDash([2, 4]);
    const marks = [1, 4, 13]; // weeks; 52 already shown by tick
    for (const w of marks) {
      const x = plot.x + (w / N_T) * plot.w;
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
    const week = Math.min(N_T - 1, Math.max(0, Math.floor(p.nx * N_T)));
    const d = new Date();
    d.setDate(d.getDate() + week * 7);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Marginal P(price in ±1% bin) at this week, using normalised column.
    const sums = columnSums();
    const cs = sums[week];
    let marg = 0;
    if (cs > 0) {
      const bin = Math.min(N_P - 1, Math.max(0, Math.floor(p.ny * N_P)));
      marg = density[week * N_P + bin] / cs;
    }
    readout.textContent = `week ${week} (${dateStr}) · $${price.toFixed(2)} · p≈${(marg * 100).toFixed(2)}%`;
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

  // ---- Submit (STUBBED for Phase 1) ----
  function submit() {
    hideErrors();
    if (!selectedAsset) { showErrors(['Please select an asset first.']); return; }

    const sums = columnSums();
    const missing = [];
    for (let t = 0; t < N_T; t++) if (sums[t] <= 1e-6) missing.push(t);
    if (missing.length > 0) {
      showErrors([`Paint every weekly column before submitting. Missing weeks: ${missing.join(', ')}`]);
      return;
    }
    if (!isFinite(priceMin) || !isFinite(priceMax) || priceMin >= priceMax) {
      showErrors(['Price range is invalid.']); return;
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
        grid[t * N_P + p] = colMax > 0 ? Math.round((v / colMax) * 255) : 0;
      }
    }

    const payload = {
      asset_id: selectedAsset.id,
      grid_version: 1,
      n_t: N_T,
      n_p: N_P,
      t_start_days: 0,
      t_end_days: 7 * N_T,
      price_min: priceMin,
      price_max: priceMax,
      reference_price: spot,
      // For now: quantised per-column max-normalised grid as a plain array.
      // Phase 2 will base64 + gzip this and POST to /api/forecasts.
      grid_uint8_sample: Array.from(grid.slice(0, 40)),
      grid_size_bytes: grid.byteLength,
      justification: document.getElementById('painter-justification').value.trim() || undefined,
    };

    console.log('[Forecast stub] would submit:', payload);
    console.log('[Forecast stub] full grid (Uint8Array):', grid);

    document.getElementById('forecast-form-section').style.display = 'none';
    document.getElementById('success-section').style.display = '';
    const msg = document.getElementById('success-msg');
    if (msg) msg.textContent = `Prototype: grid serialised (${grid.byteLength} bytes). See console for payload. Nothing was submitted to the server.`;
  }

  init();

  return { submit, clearAsset };
})();
