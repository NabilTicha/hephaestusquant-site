// leaderboard.js — 80-in-8 drill leaderboard

(() => {
  async function load() {
    const content = document.getElementById('leaderboard-content');
    if (!content) return;
    content.innerHTML = '<div class="loading">Loading…</div>';

    try {
      const res = await fetch('/api/drill/leaderboard');
      const data = await res.json();

      const { leaderboard, personal } = data;

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

  document.addEventListener('DOMContentLoaded', load);
})();
