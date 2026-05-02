// functions/api/drill/leaderboard.ts
// GET /api/drill/leaderboard
// Returns: { leaderboard: [...], personal: { best, attempts } | null }
// personal is populated only when the caller is authenticated.

import { getUser, jsonResponse } from '../../../shared/auth-middleware';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  // Top 25 — best score per user, ties broken by most recent run
  const lb = await env.DB.prepare(`
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

  // Personal stats (if authenticated)
  const user = await getUser(request, env.JWT_SECRET);
  let personal = null;

  if (user) {
    const [best, attempts] = await Promise.all([
      env.DB.prepare(
        `SELECT score, correct, wrong, skipped, duration_s, created_at
         FROM drill_scores WHERE user_id = ?
         ORDER BY score DESC, created_at ASC LIMIT 1`
      ).bind(user.sub).first(),
      env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM drill_scores WHERE user_id = ?`
      ).bind(user.sub).first<{ cnt: number }>(),
    ]);
    personal = best ? { best, attempts: attempts?.cnt ?? 0 } : null;
  }

  return jsonResponse({ leaderboard: lb.results, personal });
};
