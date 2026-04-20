import { getUser, jsonResponse, errorResponse } from '../../../shared/auth-middleware';

interface ForecastGridBody {
  asset_id: string;
  horizon_days: number;
  n_t: number;
  n_p: number;
  price_min: number;
  price_max: number;
  grid_b64: string;        // base64 of Uint8Array length n_t * n_p, per-column max-normalised
  justification?: string;
}

const MAX_HORIZON_DAYS = 365 * 20;  // 20 years; beyond this scoring is meaningless
const MAX_GRID_CELLS = 64 * 400;    // hard cap on decoded grid size to prevent abuse

function base64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

function validateBody(body: ForecastGridBody): string | null {
  if (!body.asset_id || typeof body.asset_id !== 'string') return 'asset_id required';
  if (!Number.isInteger(body.horizon_days) || body.horizon_days < 1 || body.horizon_days > MAX_HORIZON_DAYS) {
    return `horizon_days must be an integer in [1, ${MAX_HORIZON_DAYS}]`;
  }
  if (!Number.isInteger(body.n_t) || !Number.isInteger(body.n_p) || body.n_t < 4 || body.n_p < 4) {
    return 'n_t and n_p must be integers >= 4';
  }
  if (body.n_t * body.n_p > MAX_GRID_CELLS) {
    return `grid too large (${body.n_t}x${body.n_p} = ${body.n_t * body.n_p} cells; max ${MAX_GRID_CELLS})`;
  }
  if (!isFinite(body.price_min) || !isFinite(body.price_max) || body.price_min >= body.price_max) {
    return 'price_min and price_max must be finite with price_min < price_max';
  }
  if (body.price_min <= 0) return 'price_min must be > 0';
  if (typeof body.grid_b64 !== 'string' || body.grid_b64.length === 0) return 'grid_b64 required';
  return null;
}

export const onRequestPost: CFPagesFunction = async ({ request, env }) => {
  const user = await getUser(request, env.JWT_SECRET);
  if (!user) return errorResponse('Not authenticated', 401);

  let body: ForecastGridBody;
  try {
    body = await request.json() as ForecastGridBody;
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const validationErr = validateBody(body);
  if (validationErr) return errorResponse(validationErr);

  let gridBytes: Uint8Array;
  try {
    gridBytes = base64Decode(body.grid_b64);
  } catch {
    return errorResponse('grid_b64 is not valid base64');
  }
  const expectedLen = body.n_t * body.n_p;
  if (gridBytes.length !== expectedLen) {
    return errorResponse(`grid length mismatch: got ${gridBytes.length} bytes, expected ${expectedLen}`);
  }

  // Reject grids where any time column is entirely zero (not a valid PDF there).
  for (let t = 0; t < body.n_t; t++) {
    let any = 0;
    for (let p = 0; p < body.n_p; p++) any |= gridBytes[t * body.n_p + p];
    if (any === 0) {
      return errorResponse(`time column ${t} is empty; every column must have some density`);
    }
  }

  const asset = await env.FORECAST_DB.prepare(
    'SELECT id FROM assets WHERE id = ?1 AND active = 1'
  ).bind(body.asset_id).first();
  if (!asset) return errorResponse('Asset not found', 404);

  const latestPrice = await env.FORECAST_DB.prepare(
    'SELECT price FROM price_snapshots WHERE asset_id = ?1 ORDER BY date DESC LIMIT 1'
  ).bind(body.asset_id).first<{ price: number }>();
  const referencePrice = latestPrice?.price ?? 0;

  const forecastId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.FORECAST_DB.batch([
    env.FORECAST_DB.prepare(
      `INSERT INTO forecasts (id, user_id, asset_id, reference_price, horizon_days, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(forecastId, user.sub, body.asset_id, referencePrice, body.horizon_days, now),
    env.FORECAST_DB.prepare(
      `INSERT INTO forecast_grids (forecast_id, n_t, n_p, price_min, price_max, grid, compression, justification)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'none', ?7)`
    ).bind(
      forecastId,
      body.n_t, body.n_p,
      body.price_min, body.price_max,
      gridBytes,
      body.justification?.trim() || null
    ),
  ]);

  return jsonResponse({ id: forecastId, reference_price: referencePrice }, 201);
};

export const onRequestGet: CFPagesFunction = async ({ request, env }) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  let whereUserId: string;
  if (userId) {
    whereUserId = userId;
  } else {
    const user = await getUser(request, env.JWT_SECRET);
    if (!user) return errorResponse('Provide user_id or authenticate', 400);
    whereUserId = user.sub;
  }

  const { results } = await env.FORECAST_DB.prepare(`
    SELECT f.id, f.asset_id, a.name as asset_name, a.asset_class,
           f.reference_price, f.horizon_days, f.created_at,
           fg.price_min, fg.price_max, fg.n_t, fg.n_p
    FROM forecasts f
    JOIN assets a ON f.asset_id = a.id
    LEFT JOIN forecast_grids fg ON f.id = fg.forecast_id
    WHERE f.user_id = ?1
    ORDER BY f.created_at DESC
    LIMIT ?2 OFFSET ?3
  `).bind(whereUserId, limit, offset).all();

  return jsonResponse({ forecasts: results, page, limit });
};
