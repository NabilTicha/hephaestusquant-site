// Forecast detail view. Renders a stored pdf(price, t) grid and overlays the
// realised price trajectory on the same axes.

(() => {
  const params = new URLSearchParams(window.location.search);
  const forecastId = params.get('id');
  if (!forecastId) {
    document.getElementById('forecast-hero').innerHTML =
      '<div class="empty-state"><p>No forecast id in URL.</p></div>';
    return;
  }

  let data = null;
  let canvas, ctx, offscreen, offCtx, readout;
  let plotCache = null;

  load();

  async function load() {
    try {
      const res = await fetch(`/api/forecasts/${forecastId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        document.getElementById('forecast-hero').innerHTML =
          `<div class="empty-state"><p>${err.error || 'Forecast not found.'}</p></div>`;
        return;
      }
      data = await res.json();
      if (!data.grid) {
        document.getElementById('forecast-hero').innerHTML =
          '<div class="empty-state"><p>This forecast has no stored grid.</p></div>';
        return;
      }
      data.gridBytes = base64Decode(data.grid.grid_b64);
      renderHeader();
      renderCanvas();
    } catch (e) {
      document.getElementById('forecast-hero').innerHTML =
        '<div class="empty-state"><p>Failed to load forecast.</p></div>';
    }
  }

  function base64Decode(s) {
    const bin = atob(s);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }

  function fmtHorizon(days) {
    if (!days) return '';
    if (days % 365 === 0) return `${days / 365} year${days === 365 ? '' : 's'}`;
    if (days % 30 === 0) return `${days / 30} months`;
    if (days % 7 === 0) return `${days / 7} weeks`;
    return `${days} days`;
  }

  function renderHeader() {
    const f = data.forecast;
    const created = new Date(f.created_at);
    const createdStr = created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const scoreStr = f.score != null ? f.score.toFixed(4) : '—';
    const horizonStr = fmtHorizon(f.horizon_days);

    document.getElementById('forecast-hero').innerHTML = `
      <span class="label">Forecast</span>
      <h1 style="margin-bottom: 0.4rem;">${f.asset_id} · ${f.asset_name}</h1>
      <p class="subtitle" style="margin-bottom: var(--space-md);">
        By <a href="/profile.html?id=${f.user_id}">${f.user_name}</a>
        on ${createdStr} · ${horizonStr} horizon ·
        reference $${fmtPrice(f.reference_price)} ·
        placeholder score <strong>${scoreStr}</strong>
      </p>
    `;
    document.getElementById('forecast-body').style.display = '';

    const j = data.grid.justification;
    if (j) {
      const el = document.getElementById('forecast-justification');
      el.style.display = '';
      el.textContent = j;
    }
  }

  function renderCanvas() {
    canvas = document.getElementById('forecast-view-canvas');
    ctx = canvas.getContext('2d');
    offscreen = document.createElement('canvas');
    offscreen.width = data.grid.n_t;
    offscreen.height = data.grid.n_p;
    offCtx = offscreen.getContext('2d');
    readout = document.getElementById('forecast-view-readout');

    window.addEventListener('resize', resize);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', () => { readout.textContent = ''; });
    resize();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const wrap = canvas.parentElement;
    const w = wrap.clientWidth;
    const h = Math.round(w * 5 / 8);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function getPlot() {
    const pad = { l: 56, r: 12, t: 12, b: 28 };
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    return { x: pad.l, y: pad.t, w: w - pad.l - pad.r, h: h - pad.t - pad.b, fullW: w, fullH: h };
  }

  function draw() {
    const plot = getPlot();
    plotCache = plot;
    ctx.clearRect(0, 0, plot.fullW, plot.fullH);
    drawBg(plot);
    drawDensity(plot);
    drawAxes(plot);
    drawReference(plot);
    drawActual(plot);
    drawBorder(plot);
  }

  function drawBg(plot) {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 15, 20, 1)';
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.restore();
  }

  function drawDensity(plot) {
    const { n_t, n_p } = data.grid;
    const bytes = data.gridBytes;
    // uint8 values are already per-column max-normalised to [0, 255].
    const img = offCtx.createImageData(n_t, n_p);
    const r = 0xB8, g = 0x9C, b = 0x4B;
    for (let t = 0; t < n_t; t++) {
      for (let p = 0; p < n_p; p++) {
        const v = bytes[t * n_p + p] / 255;
        // gamma-lift for visibility
        const vi = Math.pow(v, 0.6);
        const rowFromTop = n_p - 1 - p;
        const idx = (rowFromTop * n_t + t) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = Math.round(vi * 220);
      }
    }
    offCtx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(offscreen, plot.x, plot.y, plot.w, plot.h);
    ctx.restore();
  }

  function drawAxes(plot) {
    ctx.save();
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(184, 156, 75, 0.55)';
    ctx.strokeStyle = 'rgba(184, 156, 75, 0.07)';

    const { price_min, price_max } = data.grid;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const pricesTicks = 6;
    for (let i = 0; i <= pricesTicks; i++) {
      const t = i / pricesTicks;
      const price = price_max - t * (price_max - price_min);
      const y = plot.y + t * plot.h;
      ctx.fillText('$' + fmtPrice(price), plot.x - 8, y);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }

    const horizonDays = data.forecast.horizon_days || 365;
    const created = new Date(data.forecast.created_at);
    const fracs = [0, 0.25, 0.5, 0.75, 1];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const f of fracs) {
      const x = plot.x + f * plot.w;
      const days = Math.round(f * horizonDays);
      const d = new Date(created);
      d.setDate(d.getDate() + days);
      const label = f === 0 ? 'Start' : formatTick(days, horizonDays, d);
      ctx.fillText(label, x, plot.y + plot.h + 6);
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    ctx.restore();
  }

  function formatTick(days, horizonDays, date) {
    if (horizonDays <= 2 * 365) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    const years = days / 365;
    return years.toFixed(years >= 10 ? 0 : 1) + 'y';
  }

  function drawReference(plot) {
    const { reference_price } = data.forecast;
    const { price_min, price_max } = data.grid;
    if (reference_price < price_min || reference_price > price_max) return;
    const ny = 1 - (reference_price - price_min) / (price_max - price_min);
    const y = plot.y + ny * plot.h;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.restore();
  }

  function priceToY(price, plot) {
    const { price_min, price_max } = data.grid;
    const clamped = Math.max(price_min, Math.min(price_max, price));
    const ny = 1 - (clamped - price_min) / (price_max - price_min);
    return plot.y + ny * plot.h;
  }

  function dateToX(dateStr, plot) {
    const horizonDays = data.forecast.horizon_days || 365;
    const created = new Date(data.forecast.created_at);
    const d = new Date(dateStr + 'T00:00:00Z');
    const elapsedDays = (d.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    const frac = elapsedDays / horizonDays;
    if (frac < 0) return null;
    if (frac > 1) return null;
    return plot.x + frac * plot.w;
  }

  function drawActual(plot) {
    const snaps = data.snapshots || [];
    if (snaps.length === 0) return;

    const { price_min, price_max } = data.grid;

    ctx.save();
    // Line
    ctx.strokeStyle = '#5ec8ff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let started = false;
    for (const s of snaps) {
      const x = dateToX(s.date, plot);
      if (x == null) continue;
      const y = priceToY(s.price, plot);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Points (small circles); clamp-markers for out-of-range values.
    for (const s of snaps) {
      const x = dateToX(s.date, plot);
      if (x == null) continue;
      const outOfRange = s.price < price_min || s.price > price_max;
      const y = priceToY(s.price, plot);
      ctx.fillStyle = outOfRange ? '#ff6b6b' : '#5ec8ff';
      ctx.beginPath();
      ctx.arc(x, y, outOfRange ? 3.5 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Latest price label
    const last = snaps[snaps.length - 1];
    const lx = dateToX(last.date, plot);
    if (lx != null) {
      const ly = priceToY(last.price, plot);
      ctx.fillStyle = '#5ec8ff';
      ctx.font = '11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const label = '$' + fmtPrice(last.price);
      const labelX = Math.min(lx + 6, plot.x + plot.w - 60);
      ctx.fillText(label, labelX, ly);
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

  function onMove(e) {
    if (!plotCache || !data) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const plot = plotCache;
    if (x < plot.x || x > plot.x + plot.w || y < plot.y || y > plot.y + plot.h) {
      readout.textContent = '';
      return;
    }
    const nx = (x - plot.x) / plot.w;
    const ny = (y - plot.y) / plot.h;
    const { n_t, n_p, price_min, price_max } = data.grid;
    const col = Math.min(n_t - 1, Math.max(0, Math.floor(nx * n_t)));
    const bin = Math.min(n_p - 1, Math.max(0, Math.floor((1 - ny) * n_p)));
    const price = price_min + (1 - ny) * (price_max - price_min);
    const horizonDays = data.forecast.horizon_days || 365;
    const days = Math.round((col + 0.5) / n_t * horizonDays);
    const created = new Date(data.forecast.created_at);
    const d = new Date(created);
    d.setDate(d.getDate() + days);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Column-normalised "probability" at this bin: v / sum(col)
    const bytes = data.gridBytes;
    let colSum = 0;
    for (let p = 0; p < n_p; p++) colSum += bytes[col * n_p + p];
    const v = bytes[col * n_p + bin];
    const marg = colSum > 0 ? v / colSum : 0;

    readout.textContent =
      `t+${days}d (${dateStr}) \u00b7 $${fmtPrice(price)} \u00b7 p\u2248${(marg * 100).toFixed(2)}%`;
  }

  function fmtPrice(p) {
    if (!isFinite(p)) return '—';
    if (p >= 1000) return p.toFixed(0);
    if (p >= 10) return p.toFixed(2);
    return p.toFixed(4);
  }
})();
