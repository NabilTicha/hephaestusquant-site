import { jsonResponse } from '../../../shared/auth-middleware';

export const onRequestGet: CFPagesFunction = async ({ env }) => {
  // Rank users by average placeholder score (higher = better for now).
  // Will be replaced by a real distributional scoring rule.
  const { results } = await env.FORECAST_DB.prepare(`
    SELECT u.id as user_id, u.name, u.picture_url,
           AVG(f.score) as avg_score,
           COUNT(f.id) as forecast_count
    FROM users u
    JOIN forecasts f ON f.user_id = u.id
    WHERE f.score IS NOT NULL
    GROUP BY u.id
    HAVING forecast_count > 0
    ORDER BY avg_score DESC
    LIMIT 100
  `).all();

  const ranked = (results || []).map((row, i) => ({
    rank: i + 1,
    user_id: row.user_id,
    name: row.name,
    picture_url: row.picture_url,
    score: row.avg_score,
    forecast_count: row.forecast_count,
  }));

  return jsonResponse({ leaderboard: ranked });
};
