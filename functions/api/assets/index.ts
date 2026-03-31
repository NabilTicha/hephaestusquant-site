import { jsonResponse, errorResponse } from '../../../shared/auth-middleware';

export const onRequestGet: CFPagesFunction = async ({ env, request }) => {
  const url = new URL(request.url);
  const assetClass = url.searchParams.get('class');

  let query = 'SELECT a.id, a.name, a.asset_class, ps.price as latest_price, ps.date as price_date FROM assets a LEFT JOIN price_snapshots ps ON a.id = ps.asset_id AND ps.date = (SELECT MAX(date) FROM price_snapshots WHERE asset_id = a.id) WHERE a.active = 1';
  const bindings: string[] = [];

  if (assetClass) {
    query += ' AND a.asset_class = ?1';
    bindings.push(assetClass);
  }

  query += ' ORDER BY a.asset_class, a.name';

  const stmt = bindings.length > 0
    ? env.FORECAST_DB.prepare(query).bind(...bindings)
    : env.FORECAST_DB.prepare(query);

  const { results } = await stmt.all();
  if (!results) return errorResponse('Failed to fetch assets', 500);

  const grouped: Record<string, typeof results> = {};
  for (const asset of results) {
    const cls = asset.asset_class as string;
    if (!grouped[cls]) grouped[cls] = [];
    grouped[cls].push(asset);
  }

  return jsonResponse({ assets: results, grouped });
};
