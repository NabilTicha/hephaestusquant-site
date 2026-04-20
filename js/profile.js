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
      console.error('[profile] load/render failed', e);
      document.getElementById('profile-hero').innerHTML =
        `<div class="empty-state"><p>Failed to load profile.</p><pre style="font-size:0.72rem;color:var(--muted);white-space:pre-wrap;">${(e && e.stack) || e}</pre></div>`;
    }
  }

  function fmtHorizon(days) {
    if (!days) return '';
    if (days % 365 === 0) return `${days / 365}y`;
    if (days % 30 === 0) return `${days / 30}mo`;
    if (days % 7 === 0) return `${days / 7}w`;
    return `${days}d`;
  }

  function renderProfile(data) {
    const { user, forecast_count, avg_score, forecasts } = data;
    const created = new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    document.getElementById('profile-hero').innerHTML = `
      <div class="profile-header">
        ${user.picture_url ? `<img src="${user.picture_url}" class="profile-avatar" referrerpolicy="no-referrer" alt="" />` : ''}
        <div class="profile-info">
          <h2 style="margin-bottom: 0.3rem;">${user.name}</h2>
          <span class="profile-meta">Member since ${created} · ${forecast_count} forecast${forecast_count !== 1 ? 's' : ''}</span>
        </div>
      </div>
    `;

    if (forecast_count > 0) {
      document.getElementById('scores-section').style.display = '';
      const cards = document.getElementById('score-cards');
      cards.innerHTML = `
        <div class="score-card">
          <span class="score-value">${avg_score != null ? avg_score.toFixed(4) : '—'}</span>
          <span class="score-label">Avg score (placeholder)</span>
        </div>
        <div class="score-card">
          <span class="score-value">${forecast_count}</span>
          <span class="score-label">Forecasts</span>
        </div>
      `;
    }

    document.getElementById('forecasts-section').style.display = '';
    const list = document.getElementById('forecast-list');
    if (!forecasts || forecasts.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p>No forecasts yet. <a href="/forecast.html">Submit your first forecast</a>.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = forecasts.map(f => {
      const date = new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const horizon = fmtHorizon(f.horizon_days);
      const score = f.score != null ? f.score.toFixed(3) : '—';
      return `
        <li class="forecast-item">
          <a class="forecast-item-link" href="/forecast-view.html?id=${f.id}">
            <div class="forecast-item-main">
              <span class="forecast-item-ticker">${f.asset_id}</span>
              <span class="forecast-item-name">${f.asset_name}</span>
            </div>
            <span class="forecast-item-date">${date}${horizon ? ` · ${horizon}` : ''}</span>
            <span class="forecast-item-score">${score}</span>
          </a>
        </li>
      `;
    }).join('');
  }
})();
