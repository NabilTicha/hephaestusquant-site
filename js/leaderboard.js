(() => {
  async function loadLeaderboard() {
    const content = document.getElementById('leaderboard-content');
    content.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();

      if (!data.leaderboard || data.leaderboard.length === 0) {
        content.innerHTML = `
          <div class="empty-state">
            <p>No forecasts yet. Be the first to <a href="/forecast.html">submit a forecast</a>.</p>
          </div>
        `;
        return;
      }

      content.innerHTML = `
        <p style="font-size: 0.78rem; color: var(--muted); margin-bottom: var(--space-md); font-family: var(--font-mono);">
          Avg score across all of a user's forecasts. Placeholder; will be replaced by grid-based scoring.
        </p>
        <table class="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>User</th>
              <th>Avg score</th>
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
                <td class="lb-score">${row.score != null ? row.score.toFixed(4) : '—'}</td>
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

  loadLeaderboard();
})();
