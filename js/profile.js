(() => {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('id');

  if (!userId) {
    Auth.onReady(user => {
      if (user) {
        window.location.replace(`/profile.html?id=${user.id}`);
      } else {
        document.getElementById('profile-hero').innerHTML = `
          <div class="cta-block">
            <h2>Sign in to view your profile</h2>
            <p>Or visit a profile via the leaderboard.</p>
            <button class="btn btn-primary" onclick="Auth.login()">Sign in with Google</button>
          </div>
        `;
      }
    });
    return;
  }

  loadProfile(userId);

  async function loadProfile(id) {
    try {
      const res = await fetch(`/api/users/${id}`);
      if (!res.ok) {
        document.getElementById('profile-hero').innerHTML = '<div class="empty-state"><p>User not found.</p></div>';
        return;
      }
      const data = await res.json();
      renderProfile(data);
    } catch (e) {
      document.getElementById('profile-hero').innerHTML = '<div class="empty-state"><p>Failed to load profile.</p></div>';
    }
  }

  function renderProfile(data) {
    const { user, scores, forecast_count, forecasts, calibration } = data;
    const created = new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    document.getElementById('profile-hero').innerHTML = `
      <div class="profile-header">
        ${user.picture_url ? `<img src="${user.picture_url}" class="profile-avatar" referrerpolicy="no-referrer" alt="" />` : ''}
        <div class="profile-info">
          <h2 style="margin-bottom: 0.3rem;">${user.name}</h2>
          <span class="profile-meta">Member since ${created} · ${forecast_count} scored forecast${forecast_count !== 1 ? 's' : ''}</span>
        </div>
      </div>
    `;

    // Score cards
    if (forecast_count > 0) {
      document.getElementById('scores-section').style.display = '';
      const cards = document.getElementById('score-cards');
      const metrics = [
        { key: 'avg_crps', label: 'CRPS', fmt: v => v.toFixed(4) },
        { key: 'calibration_80', label: 'Calibration (80%)', fmt: v => (v * 100).toFixed(1) + '%' },
        { key: 'calibration_50', label: 'Calibration (50%)', fmt: v => (v * 100).toFixed(1) + '%' },
        { key: 'avg_sharpness_80', label: 'Sharpness', fmt: v => (v * 100).toFixed(2) + '%' },
        { key: 'directional_accuracy', label: 'Directional', fmt: v => (v * 100).toFixed(1) + '%' },
        { key: 'avg_median_error_pct', label: 'Median Error', fmt: v => (v * 100).toFixed(2) + '%' },
      ];

      cards.innerHTML = metrics.map(m => {
        const val = scores[m.key];
        return `
          <div class="score-card">
            <span class="score-value">${val !== undefined ? m.fmt(val) : '—'}</span>
            <span class="score-label">${m.label}</span>
          </div>
        `;
      }).join('');
    }

    // Calibration chart
    if (calibration && calibration.total > 0) {
      document.getElementById('calibration-section').style.display = '';
      const ctx = document.getElementById('cal-chart');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['50% Interval (P25-P75)', '80% Interval (P10-P90)'],
          datasets: [
            {
              label: 'Actual coverage',
              data: [
                calibration.hits_50 / calibration.total,
                calibration.hits_80 / calibration.total,
              ],
              backgroundColor: 'rgba(184, 156, 75, 0.6)',
              borderColor: 'rgba(184, 156, 75, 1)',
              borderWidth: 1,
            },
            {
              label: 'Ideal coverage',
              data: [0.50, 0.80],
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'rgba(255, 255, 255, 0.2)',
              borderWidth: 1,
              borderDash: [4, 4],
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              min: 0, max: 1,
              ticks: { color: '#858592', callback: v => (v * 100) + '%' },
              grid: { color: 'rgba(184, 156, 75, 0.07)' },
            },
            x: {
              ticks: { color: '#858592' },
              grid: { display: false },
            },
          },
          plugins: {
            legend: { labels: { color: '#ccccd4', font: { family: "'IBM Plex Mono', monospace", size: 11 } } },
          },
        },
      });
    }

    // Forecast history
    if (forecasts.length > 0) {
      document.getElementById('forecasts-section').style.display = '';
      const list = document.getElementById('forecast-list');
      list.innerHTML = forecasts.map(f => {
        const date = new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const resolved = f.resolved_count;
        const total = f.total_horizons;
        const statusClass = resolved === total && total > 0 ? 'resolved' : 'pending';
        const statusText = resolved === total && total > 0 ? 'Fully scored' : `${resolved}/${total} scored`;

        return `
          <li class="forecast-item">
            <div class="forecast-item-main">
              <span class="forecast-item-ticker">${f.asset_id}</span>
              <span class="forecast-item-name">${f.asset_name}</span>
            </div>
            <span class="forecast-item-date">${date}</span>
            <span class="forecast-item-status ${statusClass}">${statusText}</span>
          </li>
        `;
      }).join('');
    } else {
      document.getElementById('forecasts-section').style.display = '';
      document.getElementById('forecast-list').innerHTML = `
        <div class="empty-state">
          <p>No forecasts yet. <a href="/forecast.html">Submit your first forecast</a>.</p>
        </div>
      `;
    }
  }
})();
