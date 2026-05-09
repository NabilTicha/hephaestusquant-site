import { getUser, jsonResponse } from '../../../shared/auth-middleware';

export const onRequestGet: CFPagesFunction = async ({ request, env }) => {
  const lb = await env.FORECAST_DB.prepare(`
    SELECT
      u.id          AS user_id,
      u.name,
      u.picture_url,
      ds.score      AS best_score,
      ds.correct,
      ds.wrong,
      ds.skipped,
      ds.duration_s,
      ds.created_at,
      COUNT(*)      OVER (PARTITION BY ds.user_id) AS attempt_count,
      RANK()        OVER (ORDER BY ds.score DESC, ds.created_at ASC) AS rank
    FROM drill_scores ds
    JOIN users u ON u.id = ds.user_id
    WHERE ds.id = (
      SELECT id FROM drill_scores
      WHERE user_id = ds.user_id
      ORDER BY score DESC, created_at ASC
      LIMIT 1
    )
    ORDER BY ds.score DESC, ds.created_at ASC
    LIMIT 25
  `).all();

  const user = await getUser(request, env.JWT_SECRET);
  let personal = null;

  if (user) {
    const [best, attempts] = await Promise.all([
      env.FORECAST_DB.prepare(
        `SELECT score, correct, wrong, skipped, duration_s, created_at
         FROM drill_scores WHERE user_id = ?
         ORDER BY score DESC, created_at ASC LIMIT 1`
      ).bind(user.sub).first(),
      env.FORECAST_DB.prepare(
        `SELECT COUNT(*) AS cnt FROM drill_scores WHERE user_id = ?`
      ).bind(user.sub).first(),
    ]);
    personal = best ? { best, attempts: (attempts as any)?.cnt ?? 0 } : null;
  }

  return jsonResponse({ leaderboard: lb.results, personal });
};
