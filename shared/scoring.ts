/**
 * Scoring engine for quantile-based distributional forecasts.
 *
 * Given 5 quantiles (p10, p25, p50, p75, p90) and an actual realized price,
 * computes CRPS, calibration hits, sharpness, directional accuracy, and
 * median absolute percentage error.
 */

interface Quantiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface ScoreResult {
  crps: number;
  calibration_hit_50: number; // 1 if actual in [p25, p75], else 0
  calibration_hit_80: number; // 1 if actual in [p10, p90], else 0
  interval_width_50: number;  // (p75 - p25) / reference_price
  interval_width_80: number;  // (p90 - p10) / reference_price
  median_error_pct: number;   // |actual - p50| / reference_price
  directional_hit: number;    // 1 if predicted direction correct, else 0
}

/**
 * Quantile score (pinball loss) for a single quantile.
 * QS(q, y, alpha) = 2 * (I(y <= q) - alpha) * (q - y)
 */
function quantileScore(predicted: number, actual: number, alpha: number): number {
  const indicator = actual <= predicted ? 1 : 0;
  return 2 * (indicator - alpha) * (predicted - actual);
}

/**
 * Approximate CRPS using the average quantile score across 5 quantiles.
 * This is the standard quantile-based CRPS approximation.
 */
function computeCRPS(q: Quantiles, actual: number): number {
  const alphas = [0.10, 0.25, 0.50, 0.75, 0.90];
  const values = [q.p10, q.p25, q.p50, q.p75, q.p90];

  let totalQS = 0;
  for (let i = 0; i < alphas.length; i++) {
    totalQS += quantileScore(values[i], actual, alphas[i]);
  }
  return totalQS / alphas.length;
}

export function scoreForecast(
  q: Quantiles,
  actual: number,
  referencePrice: number
): ScoreResult {
  const crps = computeCRPS(q, actual);

  const calibration_hit_50 = (actual >= q.p25 && actual <= q.p75) ? 1 : 0;
  const calibration_hit_80 = (actual >= q.p10 && actual <= q.p90) ? 1 : 0;

  const safeRef = referencePrice > 0 ? referencePrice : 1;
  const interval_width_50 = (q.p75 - q.p25) / safeRef;
  const interval_width_80 = (q.p90 - q.p10) / safeRef;

  const median_error_pct = Math.abs(actual - q.p50) / safeRef;

  // Directional accuracy: did the median predict the correct price direction?
  const predictedDir = q.p50 - referencePrice;
  const actualDir = actual - referencePrice;
  const directional_hit = (predictedDir * actualDir > 0) ? 1 : (predictedDir === 0 && actualDir === 0) ? 1 : 0;

  return {
    crps,
    calibration_hit_50,
    calibration_hit_80,
    interval_width_50,
    interval_width_80,
    median_error_pct,
    directional_hit,
  };
}

/**
 * Aggregate scores across multiple scored forecasts for leaderboard.
 * Returns a map of metric name -> aggregate value.
 */
export interface AggregateScores {
  avg_crps: number;
  calibration_50: number; // fraction of hits
  calibration_80: number;
  avg_sharpness_50: number;
  avg_sharpness_80: number;
  avg_median_error_pct: number;
  directional_accuracy: number; // fraction
  forecast_count: number;
}

export function aggregateScores(scores: ScoreResult[]): AggregateScores {
  if (scores.length === 0) {
    return {
      avg_crps: 0, calibration_50: 0, calibration_80: 0,
      avg_sharpness_50: 0, avg_sharpness_80: 0,
      avg_median_error_pct: 0, directional_accuracy: 0,
      forecast_count: 0,
    };
  }

  const n = scores.length;
  return {
    avg_crps: scores.reduce((s, v) => s + v.crps, 0) / n,
    calibration_50: scores.reduce((s, v) => s + v.calibration_hit_50, 0) / n,
    calibration_80: scores.reduce((s, v) => s + v.calibration_hit_80, 0) / n,
    avg_sharpness_50: scores.reduce((s, v) => s + v.interval_width_50, 0) / n,
    avg_sharpness_80: scores.reduce((s, v) => s + v.interval_width_80, 0) / n,
    avg_median_error_pct: scores.reduce((s, v) => s + v.median_error_pct, 0) / n,
    directional_accuracy: scores.reduce((s, v) => s + v.directional_hit, 0) / n,
    forecast_count: n,
  };
}
