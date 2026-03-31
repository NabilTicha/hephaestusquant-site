import { getUser, jsonResponse, errorResponse } from '../../../shared/auth-middleware';

interface HorizonInput {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  justification?: string;
}

interface ForecastBody {
  asset_id: string;
  horizons: {
    '1w': HorizonInput;
    '1m': HorizonInput;
    '3m': HorizonInput;
    '1y': HorizonInput;
  };
}

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function targetDateForHorizon(horizon: string, now: Date): string {
  switch (horizon) {
    case '1w': return addDays(now, 7);
    case '1m': return addDays(now, 30);
    case '3m': return addDays(now, 91);
    case '1y': return addDays(now, 365);
    default: throw new Error(`Unknown horizon: ${horizon}`);
  }
}

function validateQuantiles(h: HorizonInput, label: string): string | null {
  const fields = ['p10', 'p25', 'p50', 'p75', 'p90'] as const;
  for (const f of fields) {
    if (typeof h[f] !== 'number' || isNaN(h[f]) || h[f] <= 0) {
      return `${label}.${f} must be a positive number`;
    }
  }
  if (h.p10 >= h.p25 || h.p25 >= h.p50 || h.p50 >= h.p75 || h.p75 >= h.p90) {
    return `${label} quantiles must be strictly increasing: p10 < p25 < p50 < p75 < p90`;
  }
  return null;
}

export const onRequestPost: CFPagesFunction = async ({ request, env }) => {
  const user = await getUser(request, env.JWT_SECRET);
  if (!user) return errorResponse('Not authenticated', 401);

  const body = await request.json() as ForecastBody;
  if (!body.asset_id || !body.horizons) {
    return errorResponse('Missing asset_id or horizons');
  }

  const asset = await env.FORECAST_DB.prepare(
    'SELECT id FROM assets WHERE id = ?1 AND active = 1'
  ).bind(body.asset_id).first();
  if (!asset) return errorResponse('Asset not found', 404);

  const horizonKeys = ['1w', '1m', '3m', '1y'] as const;
  for (const h of horizonKeys) {
    if (!body.horizons[h]) return errorResponse(`Missing horizon: ${h}`);
    const err = validateQuantiles(body.horizons[h], h);
    if (err) return errorResponse(err);
  }

  const latestPrice = await env.FORECAST_DB.prepare(
    'SELECT price FROM price_snapshots WHERE asset_id = ?1 ORDER BY date DESC LIMIT 1'
  ).bind(body.asset_id).first<{ price: number }>();

  const referencePrice = latestPrice?.price ?? 0;

  const forecastId = crypto.randomUUID();
  const now = new Date();

  const stmts = [
    env.FORECAST_DB.prepare(
      'INSERT INTO forecasts (id, user_id, asset_id, reference_price, created_at) VALUES (?1, ?2, ?3, ?4, ?5)'
    ).bind(forecastId, user.sub, body.asset_id, referencePrice, now.toISOString()),
  ];

  for (const h of horizonKeys) {
    const hData = body.horizons[h];
    stmts.push(
      env.FORECAST_DB.prepare(
        `INSERT INTO forecast_horizons (id, forecast_id, horizon, target_date, p10, p25, p50, p75, p90, justification)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
      ).bind(
        crypto.randomUUID(), forecastId, h, targetDateForHorizon(h, now),
        hData.p10, hData.p25, hData.p50, hData.p75, hData.p90,
        hData.justification || null
      )
    );
  }

  await env.FORECAST_DB.batch(stmts);

  return jsonResponse({ id: forecastId, reference_price: referencePrice }, 201);
};

export const onRequestGet: CFPagesFunction = async ({ request, env }) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  let query = `
    SELECT f.id, f.asset_id, a.name as asset_name, a.asset_class,
           f.reference_price, f.created_at,
           COUNT(CASE WHEN fh.resolved = 1 THEN 1 END) as resolved_count,
           COUNT(fh.id) as total_horizons
    FROM forecasts f
    JOIN assets a ON f.asset_id = a.id
    LEFT JOIN forecast_horizons fh ON f.id = fh.forecast_id
  `;

  const bindings: (string | number)[] = [];

  if (userId) {
    query += ' WHERE f.user_id = ?1';
    bindings.push(userId);
  } else {
    const user = await getUser(request, env.JWT_SECRET);
    if (!user) return errorResponse('Provide user_id or authenticate', 400);
    query += ' WHERE f.user_id = ?1';
    bindings.push(user.sub);
  }

  query += ' GROUP BY f.id ORDER BY f.created_at DESC LIMIT ?2 OFFSET ?3';
  bindings.push(limit, offset);

  const stmt = env.FORECAST_DB.prepare(query).bind(...bindings);
  const { results } = await stmt.all();

  return jsonResponse({ forecasts: results, page, limit });
};
