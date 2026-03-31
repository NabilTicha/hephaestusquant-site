const ForecastForm = (() => {
  let assets = [];
  let selectedAsset = null;
  let distChart = null;

  function init() {
    Auth.onReady(user => {
      if (user) {
        document.getElementById('forecast-form-section').style.display = '';
        document.getElementById('auth-gate').style.display = 'none';
        loadAssets();
        setupSearch();
        setupQuantileListeners();
        setTargetDates();
      } else {
        document.getElementById('auth-gate').style.display = '';
        document.getElementById('forecast-form-section').style.display = 'none';
      }
    });
  }

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

    document.getElementById('quantile-form').style.display = '';

    if (selectedAsset.latest_price) {
      prefillQuantiles(Number(selectedAsset.latest_price));
    }
  }

  function clearAsset() {
    selectedAsset = null;
    document.getElementById('asset-search').style.display = '';
    document.getElementById('asset-search').value = '';
    document.getElementById('selected-asset').style.display = 'none';
    document.getElementById('quantile-form').style.display = 'none';
  }

  function prefillQuantiles(price) {
    const spreads = {
      '1w': [0.95, 0.97, 1.0, 1.03, 1.05],
      '1m': [0.90, 0.95, 1.0, 1.05, 1.10],
      '3m': [0.82, 0.91, 1.0, 1.10, 1.20],
      '1y': [0.70, 0.85, 1.0, 1.18, 1.40],
    };
    document.querySelectorAll('.horizon-card').forEach(card => {
      const h = card.dataset.horizon;
      const s = spreads[h];
      const inputs = card.querySelectorAll('.q-input');
      inputs.forEach((inp, i) => {
        inp.value = (price * s[i]).toFixed(2);
      });
    });
    updateChart();
  }

  function setTargetDates() {
    const now = new Date();
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const add = (days) => { const d = new Date(now); d.setDate(d.getDate() + days); return d; };
    document.getElementById('date-1w').textContent = fmt(add(7));
    document.getElementById('date-1m').textContent = fmt(add(30));
    document.getElementById('date-3m').textContent = fmt(add(91));
    document.getElementById('date-1y').textContent = fmt(add(365));
  }

  function setupQuantileListeners() {
    document.querySelectorAll('.q-input').forEach(inp => {
      inp.addEventListener('input', updateChart);
    });
  }

  function getHorizonData() {
    const horizons = {};
    document.querySelectorAll('.horizon-card').forEach(card => {
      const h = card.dataset.horizon;
      const inputs = card.querySelectorAll('.q-input');
      const justification = card.querySelector('.q-justification').value.trim();
      horizons[h] = {
        p10: parseFloat(inputs[0].value) || 0,
        p25: parseFloat(inputs[1].value) || 0,
        p50: parseFloat(inputs[2].value) || 0,
        p75: parseFloat(inputs[3].value) || 0,
        p90: parseFloat(inputs[4].value) || 0,
        justification: justification || undefined,
      };
    });
    return horizons;
  }

  function updateChart() {
    const horizons = getHorizonData();
    const labels = ['P10', 'P25', 'P50', 'P75', 'P90'];
    const quantileAlphas = [0.10, 0.25, 0.50, 0.75, 0.90];

    const datasets = Object.entries(horizons).map(([h, d], i) => {
      const values = [d.p10, d.p25, d.p50, d.p75, d.p90];
      if (values.some(v => !v || v <= 0)) return null;
      const colors = [
        'rgba(184, 156, 75, 1.0)',
        'rgba(184, 156, 75, 0.75)',
        'rgba(184, 156, 75, 0.50)',
        'rgba(184, 156, 75, 0.35)',
      ];
      return {
        label: { '1w': '1 Week', '1m': '1 Month', '3m': '3 Months', '1y': '1 Year' }[h],
        data: quantileAlphas.map((a, j) => ({ x: values[j], y: a })),
        borderColor: colors[i],
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: colors[i],
      };
    }).filter(Boolean);

    const ctx = document.getElementById('dist-chart');
    if (distChart) distChart.destroy();

    distChart = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Price', color: '#858592' },
            ticks: { color: '#858592' },
            grid: { color: 'rgba(184, 156, 75, 0.07)' },
          },
          y: {
            title: { display: true, text: 'Cumulative Probability', color: '#858592' },
            min: 0, max: 1,
            ticks: { color: '#858592', callback: v => (v * 100) + '%' },
            grid: { color: 'rgba(184, 156, 75, 0.07)' },
          },
        },
        plugins: {
          legend: { labels: { color: '#ccccd4', font: { family: "'IBM Plex Mono', monospace", size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: $${ctx.parsed.x.toFixed(2)} @ ${(ctx.parsed.y * 100).toFixed(0)}%`
            }
          }
        },
      },
    });
  }

  function showErrors(errors) {
    const el = document.getElementById('form-errors');
    el.style.display = '';
    el.innerHTML = errors.map(e => `<div class="form-error">${e}</div>`).join('');
  }

  function hideErrors() {
    document.getElementById('form-errors').style.display = 'none';
  }

  async function submit() {
    hideErrors();

    if (!selectedAsset) {
      showErrors(['Please select an asset first.']);
      return;
    }

    const horizons = getHorizonData();
    const errors = [];

    for (const [h, d] of Object.entries(horizons)) {
      const label = { '1w': '1 Week', '1m': '1 Month', '3m': '3 Months', '1y': '1 Year' }[h];
      const vals = [d.p10, d.p25, d.p50, d.p75, d.p90];
      if (vals.some(v => !v || v <= 0)) {
        errors.push(`${label}: all quantile fields are required and must be positive.`);
        continue;
      }
      if (d.p10 >= d.p25 || d.p25 >= d.p50 || d.p50 >= d.p75 || d.p75 >= d.p90) {
        errors.push(`${label}: quantiles must be strictly increasing (P10 < P25 < P50 < P75 < P90).`);
      }
    }

    if (errors.length > 0) { showErrors(errors); return; }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    try {
      const res = await fetch('/api/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: selectedAsset.id, horizons }),
      });

      const data = await res.json();
      if (!res.ok) {
        showErrors([data.error || 'Submission failed. Please try again.']);
        btn.disabled = false;
        btn.textContent = 'Submit forecast';
        return;
      }

      document.getElementById('forecast-form-section').style.display = 'none';
      document.getElementById('success-section').style.display = '';
      document.getElementById('view-forecast-link').href = `/profile.html?id=${Auth.getUser().id}`;
    } catch (e) {
      showErrors(['Network error. Please try again.']);
      btn.disabled = false;
      btn.textContent = 'Submit forecast';
    }
  }

  init();

  return { submit, clearAsset };
})();
