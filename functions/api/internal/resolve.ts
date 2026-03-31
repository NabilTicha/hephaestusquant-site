import { jsonResponse, errorResponse } from '../../../shared/auth-middleware';
import { scoreForecast } from '../../../shared/scoring';

export const onRequestPost: CFPagesFunction = async ({ request, env }) => {
  const secret = request.headers.get('X-Internal-Secret');
  if (secret !== env.INTERNAL_API_SECRET) {
    return errorResponse('Unauthorized', 403);
  }

  const today = new Date().toISOString().split('T')[0];

  // Find all unresolved horizons whose target date has passed
  const { results: matured } = await env.FORECAST_DB.prepare(`
    SELECT fh.id as horizon_id, fh.forecast_id, fh.horizon,
           fh.p10, fh.p25, fh.p50, fh.p75, fh.p90,
           f.asset_id, f.reference_price, f.user_id
    FROM forecast_horizons fh
    JOIN forecasts f ON fh.forecast_id = f.id
    WHERE fh.resolved = 0 AND fh.target_date <= ?1
  `).bind(today).all();

  if (!matured || matured.length === 0) {
    return jsonResponse({ message: 'No horizons to resolve', resolved: 0 });
  }

  let resolvedCount = 0;
  const stmts: D1PreparedStatement[] = [];

  for (const row of matured) {
    // Get the price closest to the target date
    const priceRow = await env.FORECAST_DB.prepare(`
      SELECT price FROM price_snapshots
      WHERE asset_id = ?1 AND date <= ?2
      ORDER BY date DESC LIMIT 1
    `).bind(row.asset_id as string, today).first<{ price: number }>();

    if (!priceRow) continue;

    const actual = priceRow.price;
    const q = {
      p10: row.p10 as number,
      p25: row.p25 as number,
      p50: row.p50 as number,
      p75: row.p75 as number,
      p90: row.p90 as number,
    };

    const scores = scoreForecast(q, actual, row.reference_price as number);

    // Mark horizon as resolved
    stmts.push(
      env.FORECAST_DB.prepare(
        `UPDATE forecast_horizons SET resolved = 1, actual_price = ?1, resolved_at = ?2 WHERE id = ?3`
      ).bind(actual, new Date().toISOString(), row.horizon_id as string)
    );

    // Insert scores
    stmts.push(
      env.FORECAST_DB.prepare(
        `INSERT INTO forecast_scores (id, horizon_id, crps, calibration_hit_50, calibration_hit_80, interval_width_50, interval_width_80, median_error_pct, directional_hit)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
      ).bind(
        crypto.randomUUID(),
        row.horizon_id as string,
        scores.crps,
        scores.calibration_hit_50,
        scores.calibration_hit_80,
        scores.interval_width_50,
        scores.interval_width_80,
        scores.median_error_pct,
        scores.directional_hit
      )
    );

    resolvedCount++;
  }

  // Batch execute
  if (stmts.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < stmts.length; i += batchSize) {
      await env.FORECAST_DB.batch(stmts.slice(i, i + batchSize));
    }
  }

  // Rebuild leaderboard cache
  await rebuildLeaderboard(env);

  return jsonResponse({ message: `Resolved ${resolvedCount} forecast horizons`, resolved: resolvedCount });
};

async function rebuildLeaderboard(env: Env): Promise<void> {
  const horizons = ['1w', '1m', '3m', '1y', 'all'];
  const metrics = [
    'avg_crps', 'calibration_50', 'calibration_80',
    'avg_sharpness_80', 'avg_median_error_pct', 'directional_accuracy'
  ];

  await env.FORECAST_DB.prepare('DELETE FROM leaderboard_cache').run();

  for (const horizon of horizons) {
    const horizonFilter = horizon === 'all' ? '' : `AND fh.horizon = '${horizon}'`;

    const { results: userScores } = await env.FORECAST_DB.prepare(`
      SELECT f.user_id,
             AVG(fs.crps) as avg_crps,
             AVG(CAST(fs.calibration_hit_50 AS REAL)) as calibration_50,
             AVG(CAST(fs.calibration_hit_80 AS REAL)) as calibration_80,
             AVG(fs.interval_width_80) as avg_sharpness_80,
             AVG(fs.median_error_pct) as avg_median_error_pct,
             AVG(CAST(fs.directional_hit AS REAL)) as directional_accuracy,
             COUNT(*) as forecast_count
      FROM forecast_scores fs
      JOIN forecast_horizons fh ON fs.horizon_id = fh.id
      JOIN forecasts f ON fh.forecast_id = f.id
      WHERE 1=1 ${horizonFilter}
      GROUP BY f.user_id
      HAVING forecast_count >= 1
    `).all();

    if (!userScores) continue;

    const stmts: D1PreparedStatement[] = [];
    for (const row of userScores) {
      for (const metric of metrics) {
        const value = row[metric] as number;
        if (value === null || value === undefined) continue;
        stmts.push(
          env.FORECAST_DB.prepare(
            `INSERT INTO leaderboard_cache (user_id, horizon, metric, score, forecast_count, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`
          ).bind(row.user_id as string, horizon, metric, value, row.forecast_count as number)
        );
      }
    }

    if (stmts.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < stmts.length; i += batchSize) {
        await env.FORECAST_DB.batch(stmts.slice(i, i + batchSize));
      }
    }
  }
}
