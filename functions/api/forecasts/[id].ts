import { jsonResponse, errorResponse } from '../../../shared/auth-middleware';

export const onRequestGet: CFPagesFunction = async ({ params, env }) => {
  const id = params.id as string;

  const forecast = await env.FORECAST_DB.prepare(`
    SELECT f.id, f.user_id, f.asset_id, a.name as asset_name, a.asset_class,
           f.reference_price, f.created_at, u.name as user_name, u.picture_url
    FROM forecasts f
    JOIN assets a ON f.asset_id = a.id
    JOIN users u ON f.user_id = u.id
    WHERE f.id = ?1
  `).bind(id).first();

  if (!forecast) return errorResponse('Forecast not found', 404);

  const { results: horizons } = await env.FORECAST_DB.prepare(`
    SELECT fh.id, fh.horizon, fh.target_date, fh.p10, fh.p25, fh.p50, fh.p75, fh.p90,
           fh.justification, fh.resolved, fh.actual_price, fh.resolved_at,
           fs.crps, fs.calibration_hit_50, fs.calibration_hit_80,
           fs.interval_width_50, fs.interval_width_80,
           fs.median_error_pct, fs.directional_hit
    FROM forecast_horizons fh
    LEFT JOIN forecast_scores fs ON fh.id = fs.horizon_id
    WHERE fh.forecast_id = ?1
    ORDER BY CASE fh.horizon WHEN '1w' THEN 1 WHEN '1m' THEN 2 WHEN '3m' THEN 3 WHEN '1y' THEN 4 END
  `).bind(id).all();

  return jsonResponse({ ...forecast, horizons });
};
