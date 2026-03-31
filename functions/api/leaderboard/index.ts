import { jsonResponse } from '../../../shared/auth-middleware';

export const onRequestGet: CFPagesFunction = async ({ request, env }) => {
  const url = new URL(request.url);
  const horizon = url.searchParams.get('horizon') || 'all';
  const metric = url.searchParams.get('metric') || 'avg_crps';

  const validHorizons = ['1w', '1m', '3m', '1y', 'all'];
  const validMetrics = [
    'avg_crps', 'calibration_50', 'calibration_80',
    'avg_sharpness_80', 'avg_median_error_pct', 'directional_accuracy'
  ];

  if (!validHorizons.includes(horizon) || !validMetrics.includes(metric)) {
    return jsonResponse({ error: 'Invalid horizon or metric' }, 400);
  }

  // For CRPS, sharpness, and median error: lower is better (ASC)
  // For calibration and directional accuracy: closer to target is better
  const lowerIsBetter = ['avg_crps', 'avg_sharpness_80', 'avg_median_error_pct'].includes(metric);
  const sortDir = lowerIsBetter ? 'ASC' : 'DESC';

  const { results } = await env.FORECAST_DB.prepare(`
    SELECT lc.user_id, u.name, u.picture_url, lc.score, lc.forecast_count, lc.updated_at
    FROM leaderboard_cache lc
    JOIN users u ON lc.user_id = u.id
    WHERE lc.horizon = ?1 AND lc.metric = ?2
    ORDER BY lc.score ${sortDir}
    LIMIT 100
  `).bind(horizon, metric).all();

  const ranked = (results || []).map((row, i) => ({
    rank: i + 1,
    user_id: row.user_id,
    name: row.name,
    picture_url: row.picture_url,
    score: row.score,
    forecast_count: row.forecast_count,
  }));

  return jsonResponse({ leaderboard: ranked, horizon, metric });
};
