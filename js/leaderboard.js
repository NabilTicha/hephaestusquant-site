(() => {
  let currentHorizon = 'all';
  let currentMetric = 'avg_crps';

  const metricLabels = {
    avg_crps: 'CRPS',
    calibration_50: 'Cal. 50%',
    calibration_80: 'Calibration',
    avg_sharpness_80: 'Sharpness',
    avg_median_error_pct: 'Median Error',
    directional_accuracy: 'Direction',
  };

  const metricDescriptions = {
    avg_crps: 'Lower is better. Measures overall distributional accuracy.',
    calibration_80: 'Closer to 80% is better. Fraction of actuals within P10-P90.',
    avg_sharpness_80: 'Lower is better (if calibrated). Interval width relative to price.',
    directional_accuracy: 'Higher is better. Fraction of correct directional predictions.',
    avg_median_error_pct: 'Lower is better. Median absolute percentage error.',
  };

  function formatScore(metric, score) {
    if (score === null || score === undefined) return '—';
    if (metric.startsWith('calibration') || metric === 'directional_accuracy') {
      return (score * 100).toFixed(1) + '%';
    }
    if (metric === 'avg_median_error_pct' || metric === 'avg_sharpness_80') {
      return (score * 100).toFixed(2) + '%';
    }
    return score.toFixed(4);
  }

  async function loadLeaderboard() {
    const content = document.getElementById('leaderboard-content');
    content.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const res = await fetch(`/api/leaderboard?horizon=${currentHorizon}&metric=${currentMetric}`);
      const data = await res.json();

      if (!data.leaderboard || data.leaderboard.length === 0) {
        content.innerHTML = `
          <div class="empty-state">
            <p>No scored forecasts yet. Be the first to <a href="/forecast.html">submit a forecast</a>.</p>
          </div>
        `;
        return;
      }

      const desc = metricDescriptions[currentMetric] || '';

      content.innerHTML = `
        <p style="font-size: 0.78rem; color: var(--muted); margin-bottom: var(--space-md); font-family: var(--font-mono);">${desc}</p>
        <table class="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>User</th>
              <th>${metricLabels[currentMetric] || currentMetric}</th>
              <th>Forecasts</th>
            </tr>
          </thead>
          <tbody>
            ${data.leaderboard.map(row => `
              <tr>
                <td class="lb-rank">${row.rank}</td>
                <td>
                  <div class="lb-user">
                    ${row.picture_url ? `<img src="${row.picture_url}" class="lb-avatar" referrerpolicy="no-referrer" alt="" />` : ''}
                    <span class="lb-name"><a href="/profile.html?id=${row.user_id}">${row.name}</a></span>
                  </div>
                </td>
                <td class="lb-score">${formatScore(currentMetric, row.score)}</td>
                <td class="lb-count">${row.forecast_count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      content.innerHTML = '<div class="empty-state"><p>Failed to load leaderboard.</p></div>';
    }
  }

  function setupFilters() {
    document.querySelectorAll('#horizon-filters .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#horizon-filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentHorizon = btn.dataset.horizon;
        loadLeaderboard();
      });
    });

    document.querySelectorAll('#metric-filters .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#metric-filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMetric = btn.dataset.metric;
        loadLeaderboard();
      });
    });
  }

  setupFilters();
  loadLeaderboard();
})();
