// functions/api/drill/submit.ts
// POST /api/drill/submit
// Body: { score, correct, wrong, skipped, duration_s }
// Requires: hq_token cookie (JWT)

import { getUser, jsonResponse, errorResponse } from '../../../shared/auth-middleware';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Auth check
  const user = await getUser(request, env.JWT_SECRET);
  if (!user) return errorResponse('Unauthorized', 401);

  let body: { score?: number; correct?: number; wrong?: number; skipped?: number; duration_s?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON');
  }

  const { score, correct, wrong, skipped, duration_s } = body;

  // Validate
  if (
    typeof score !== 'number' ||
    typeof correct !== 'number' ||
    typeof wrong !== 'number' ||
    typeof skipped !== 'number' ||
    typeof duration_s !== 'number'
  ) {
    return errorResponse('Missing or invalid fields');
  }

  // Sanity-check: totals can't exceed 80, duration can't exceed 480s
  if (correct + wrong + skipped > 80 || duration_s > 480 || duration_s < 0) {
    return errorResponse('Invalid score data');
  }

  // Verify score arithmetic
  const expectedScore = correct - 2 * wrong - 2 * skipped;
  if (expectedScore !== score) return errorResponse('Score mismatch');

  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO drill_scores (id, user_id, score, correct, wrong, skipped, duration_s)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, user.sub, score, correct, wrong, skipped, duration_s)
    .run();

  return jsonResponse({ ok: true, id });
};
