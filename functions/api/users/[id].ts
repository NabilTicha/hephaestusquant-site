import { jsonResponse, errorResponse } from '../../../shared/auth-middleware';

export const onRequestGet: CFPagesFunction = async ({ params, env }) => {
  const id = params.id as string;

  const user = await env.FORECAST_DB.prepare(
    'SELECT id, name, picture_url, created_at FROM users WHERE id = ?1'
  ).bind(id).first();

  if (!user) return errorResponse('User not found', 404);

  // Aggregate scores from leaderboard cache (horizon = 'all')
  const { results: scores } = await env.FORECAST_DB.prepare(
    `SELECT metric, score, forecast_count FROM leaderboard_cache
     WHERE user_id = ?1 AND horizon = 'all'`
  ).bind(id).all();

  const scoreMap: Record<string, number> = {};
  let forecastCount = 0;
  for (const row of scores || []) {
    scoreMap[row.metric as string] = row.score as number;
    forecastCount = Math.max(forecastCount, row.forecast_count as number);
  }

  // Per-horizon scores
  const { results: horizonScores } = await env.FORECAST_DB.prepare(
    `SELECT horizon, metric, score, forecast_count FROM leaderboard_cache
     WHERE user_id = ?1 AND horizon != 'all'`
  ).bind(id).all();

  const byHorizon: Record<string, Record<string, number>> = {};
  for (const row of horizonScores || []) {
    const h = row.horizon as string;
    if (!byHorizon[h]) byHorizon[h] = {};
    byHorizon[h][row.metric as string] = row.score as number;
  }

  // Recent forecasts
  const { results: forecasts } = await env.FORECAST_DB.prepare(`
    SELECT f.id, f.asset_id, a.name as asset_name, a.asset_class,
           f.reference_price, f.created_at,
           COUNT(CASE WHEN fh.resolved = 1 THEN 1 END) as resolved_count,
           COUNT(fh.id) as total_horizons
    FROM forecasts f
    JOIN assets a ON f.asset_id = a.id
    LEFT JOIN forecast_horizons fh ON f.id = fh.forecast_id
    WHERE f.user_id = ?1
    GROUP BY f.id
    ORDER BY f.created_at DESC
    LIMIT 50
  `).bind(id).all();

  // Calibration data for chart
  const calData = await env.FORECAST_DB.prepare(`
    SELECT
      SUM(fs.calibration_hit_50) as hits_50,
      SUM(fs.calibration_hit_80) as hits_80,
      COUNT(*) as total
    FROM forecast_scores fs
    JOIN forecast_horizons fh ON fs.horizon_id = fh.id
    JOIN forecasts f ON fh.forecast_id = f.id
    WHERE f.user_id = ?1
  `).bind(id).first<{ hits_50: number; hits_80: number; total: number }>();

  return jsonResponse({
    user,
    scores: scoreMap,
    forecast_count: forecastCount,
    by_horizon: byHorizon,
    forecasts: forecasts || [],
    calibration: calData ? {
      hits_50: calData.hits_50 || 0,
      hits_80: calData.hits_80 || 0,
      total: calData.total || 0,
    } : null,
  });
};
