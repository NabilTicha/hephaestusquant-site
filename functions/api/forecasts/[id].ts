import { jsonResponse, errorResponse } from '../../../shared/auth-middleware';

// Convert Uint8Array to base64. Note: `Buffer` is not available in Workers,
// so we chunk and use btoa.
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

export const onRequestGet: CFPagesFunction = async ({ params, env }) => {
  const id = params.id as string;

  const forecast = await env.FORECAST_DB.prepare(`
    SELECT f.id, f.user_id, f.asset_id, a.name as asset_name, a.asset_class,
           f.reference_price, f.horizon_days, f.score, f.created_at,
           u.name as user_name, u.picture_url
    FROM forecasts f
    JOIN assets a ON f.asset_id = a.id
    JOIN users u ON f.user_id = u.id
    WHERE f.id = ?1
  `).bind(id).first();

  if (!forecast) return errorResponse('Forecast not found', 404);

  const grid = await env.FORECAST_DB.prepare(`
    SELECT n_t, n_p, price_min, price_max, grid, compression, justification
    FROM forecast_grids WHERE forecast_id = ?1
  `).bind(id).first<{
    n_t: number;
    n_p: number;
    price_min: number;
    price_max: number;
    grid: ArrayBuffer | Uint8Array;
    compression: string;
    justification: string | null;
  }>();

  let gridPayload: {
    n_t: number;
    n_p: number;
    price_min: number;
    price_max: number;
    grid_b64: string;
    compression: string;
    justification: string | null;
  } | null = null;

  if (grid) {
    const bytes = grid.grid instanceof Uint8Array
      ? grid.grid
      : new Uint8Array(grid.grid as ArrayBuffer);
    gridPayload = {
      n_t: grid.n_t,
      n_p: grid.n_p,
      price_min: grid.price_min,
      price_max: grid.price_max,
      grid_b64: toBase64(bytes),
      compression: grid.compression,
      justification: grid.justification,
    };
  }

  // Actual price trajectory from the forecast's creation date up to the end
  // of the horizon (or today, whichever is sooner). Used to overlay the
  // actual price path on top of the painted cloud.
  const createdAt = new Date(forecast.created_at as string);
  const horizonDays = (forecast.horizon_days as number) || 365;
  const endDate = new Date(createdAt);
  endDate.setDate(endDate.getDate() + horizonDays);
  const todayIso = new Date().toISOString().split('T')[0];
  const startIso = createdAt.toISOString().split('T')[0];
  const endIso = endDate.toISOString().split('T')[0];
  const upperIso = endIso < todayIso ? endIso : todayIso;

  const { results: snapshots } = await env.FORECAST_DB.prepare(`
    SELECT date, price FROM price_snapshots
    WHERE asset_id = ?1 AND date >= ?2 AND date <= ?3
    ORDER BY date ASC
  `).bind(forecast.asset_id as string, startIso, upperIso).all<{ date: string; price: number }>();

  return jsonResponse({
    forecast,
    grid: gridPayload,
    snapshots: snapshots || [],
  });
};
