import { jsonResponse, errorResponse } from '../../../shared/auth-middleware';

interface YahooQuoteResult {
  symbol: string;
  regularMarketPrice?: number;
}

async function fetchYahooPrices(symbols: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const batchSize = 10;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const symbolStr = batch.join(',');

    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolStr)}&fields=regularMarketPrice`,
        { headers: { 'User-Agent': 'HephaestusQuant/1.0' } }
      );

      if (!res.ok) continue;

      const data = await res.json() as {
        quoteResponse: { result: YahooQuoteResult[] }
      };

      for (const quote of data.quoteResponse.result) {
        if (quote.regularMarketPrice) {
          prices.set(quote.symbol, quote.regularMarketPrice);
        }
      }
    } catch (e) {
      console.error(`Failed to fetch batch starting at ${i}:`, e);
    }

    if (i + batchSize < symbols.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return prices;
}

export const onRequestPost: CFPagesFunction = async ({ request, env }) => {
  const secret = request.headers.get('X-Internal-Secret');
  if (secret !== env.INTERNAL_API_SECRET) {
    return errorResponse('Unauthorized', 403);
  }

  const { results: assets } = await env.FORECAST_DB.prepare(
    'SELECT id FROM assets WHERE active = 1'
  ).all<{ id: string }>();

  if (!assets || assets.length === 0) {
    return jsonResponse({ message: 'No assets to fetch', count: 0 });
  }

  const symbols = assets.map(a => a.id);
  const prices = await fetchYahooPrices(symbols);

  const today = new Date().toISOString().split('T')[0];
  const stmts = [];

  for (const [symbol, price] of prices) {
    stmts.push(
      env.FORECAST_DB.prepare(
        `INSERT INTO price_snapshots (asset_id, date, price) VALUES (?1, ?2, ?3)
         ON CONFLICT(asset_id, date) DO UPDATE SET price = excluded.price`
      ).bind(symbol, today, price)
    );
  }

  if (stmts.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < stmts.length; i += batchSize) {
      await env.FORECAST_DB.batch(stmts.slice(i, i + batchSize));
    }
  }

  return jsonResponse({
    message: `Fetched prices for ${prices.size} of ${symbols.length} assets`,
    count: prices.size,
    date: today,
  });
};
