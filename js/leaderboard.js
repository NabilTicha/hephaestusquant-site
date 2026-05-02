// leaderboard.js — tabs for Forecasts and 80-in-8 drill

(() => {
  // ---- Tab switching ----
  function initTabs() {
    const container = document.getElementById('leaderboard-tabs');
    if (!container) return;

    container.innerHTML = `
      <div class="lb-tabs">
        <button class="lb-tab active" data-tab="forecasts">Forecasts</button>
        <button class="lb-tab" data-tab="drill">80-in-8</button>
      </div>
      <div id="leaderboard-content"></div>
    `;

    container.querySelectorAll('.lb-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadTab(btn.dataset.tab);
      });
    });

    loadTab('forecasts');
  }

  function loadTab(tab) {
    if (tab === 'forecasts') loadForecasts();
    else if (tab === 'drill') loadDrill();
  }

  // ---- Forecasts leaderboard (original) ----
  async function loadForecasts() {
    const content = document.getElementById('leaderboard-content');
    content.innerHTML = '<div class="loading">Loading…</div>';

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
        <p class="lb-note">Avg score across all forecasts. Placeholder; will be replaced by grid-based scoring.</p>
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
    } catch {
      content.innerHTML = '<div class="empty-state"><p>Failed to load leaderboard.</p></div>';
    }
  }

  // ---- 80-in-8 leaderboard ----
  async function loadDrill() {
    const content = document.getElementById('leaderboard-content');
    content.innerHTML = '<div class="loading">Loading…</div>';

    try {
      const res = await fetch('/api/drill/leaderboard');
      const data = await res.json();

      const { leaderboard, personal } = data;

      // Personal best banner (only shown when signed in and attempted)
      let personalHtml = '';
      if (personal && personal.best) {
        const b = personal.best;
        const scoreClass = b.score >= 56 ? 'score-pass' : b.score >= 0 ? 'score-neutral' : 'score-fail';
        personalHtml = `
          <div class="lb-personal">
            <span class="label">Your best</span>
            <div class="lb-personal-stats">
              <span class="lb-personal-score ${scoreClass}">${b.score}</span>
              <span class="lb-personal-detail">${b.correct}✓ · ${b.wrong}✗ · ${b.skipped} skipped · ${personal.attempts} attempt${personal.attempts !== 1 ? 's' : ''}</span>
            </div>
            <a href="/80-in-8.html" class="btn btn-sm btn-primary">Take it again</a>
          </div>
        `;
      } else if (personal === null) {
        // Authenticated but no attempts
        personalHtml = `
          <div class="lb-personal lb-personal-cta">
            <p>You haven't taken the drill yet.</p>
            <a href="/80-in-8.html" class="btn btn-primary btn-sm">Start 80-in-8</a>
          </div>
        `;
      }

      if (!leaderboard || leaderboard.length === 0) {
        content.innerHTML = `
          ${personalHtml}
          <div class="empty-state">
            <p>No scores yet. <a href="/80-in-8.html">Be the first to take the drill.</a></p>
          </div>
        `;
        return;
      }

      const rows = leaderboard.map(row => {
        const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : row.rank;
        const passClass = row.best_score >= 56 ? 'score-pass' : row.best_score >= 0 ? '' : 'score-fail';
        return `
          <tr>
            <td class="lb-rank">${medal}</td>
            <td>
              <div class="lb-user">
                ${row.picture_url ? `<img src="${row.picture_url}" class="lb-avatar" referrerpolicy="no-referrer" alt="" />` : ''}
                <span class="lb-name"><a href="/profile.html?id=${row.user_id}">${row.name}</a></span>
              </div>
            </td>
            <td class="lb-score ${passClass}">${row.best_score}</td>
            <td class="lb-detail">${row.correct}✓ · ${row.wrong}✗ · ${row.skipped} skip</td>
            <td class="lb-count">${row.attempt_count} run${row.attempt_count !== 1 ? 's' : ''}</td>
          </tr>
        `;
      }).join('');

      content.innerHTML = `
        ${personalHtml}
        <p class="lb-note">Best score per user · pass threshold: 56 · max: 80</p>
        <table class="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>User</th>
              <th>Best score</th>
              <th>Breakdown</th>
              <th>Attempts</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    } catch {
      content.innerHTML = '<div class="empty-state"><p>Failed to load leaderboard.</p></div>';
    }
  }

  // ---- Boot ----
  // The existing leaderboard.html likely has <div id="leaderboard-content">.
  // We need it to have <div id="leaderboard-tabs"> instead for tab switching.
  // If that div doesn't exist we gracefully fall back to replacing leaderboard-content.
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('leaderboard-tabs')) {
      initTabs();
    } else {
      // Fallback: wrap existing content div
      const existing = document.getElementById('leaderboard-content');
      if (existing) {
        const wrapper = document.createElement('div');
        wrapper.id = 'leaderboard-tabs';
        existing.parentNode.insertBefore(wrapper, existing);
        wrapper.appendChild(existing);
        initTabs();
      }
    }
  });
})();
