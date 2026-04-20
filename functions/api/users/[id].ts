import { jsonResponse, errorResponse } from '../../../shared/auth-middleware';

export const onRequestGet: CFPagesFunction = async ({ params, env }) => {
  const id = params.id as string;

  const user = await env.FORECAST_DB.prepare(
    'SELECT id, name, picture_url, created_at FROM users WHERE id = ?1'
  ).bind(id).first();

  if (!user) return errorResponse('User not found', 404);

  const agg = await env.FORECAST_DB.prepare(
    `SELECT COUNT(*) as forecast_count, AVG(score) as avg_score
     FROM forecasts WHERE user_id = ?1`
  ).bind(id).first<{ forecast_count: number; avg_score: number | null }>();

  const { results: forecasts } = await env.FORECAST_DB.prepare(`
    SELECT f.id, f.asset_id, a.name as asset_name, a.asset_class,
           f.reference_price, f.horizon_days, f.score, f.created_at,
           fg.price_min, fg.price_max, fg.n_t, fg.n_p
    FROM forecasts f
    JOIN assets a ON f.asset_id = a.id
    LEFT JOIN forecast_grids fg ON f.id = fg.forecast_id
    WHERE f.user_id = ?1
    ORDER BY f.created_at DESC
    LIMIT 100
  `).bind(id).all();

  return jsonResponse({
    user,
    forecast_count: agg?.forecast_count || 0,
    avg_score: agg?.avg_score ?? null,
    forecasts: forecasts || [],
  });
};
