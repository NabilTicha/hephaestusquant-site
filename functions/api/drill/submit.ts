import { getUser, jsonResponse, errorResponse } from '../../../shared/auth-middleware';

export const onRequestPost: CFPagesFunction = async ({ request, env }) => {
  const user = await getUser(request, env.JWT_SECRET);
  if (!user) return errorResponse('Unauthorized', 401);

  let body: { score?: number; correct?: number; wrong?: number; skipped?: number; duration_s?: number };
  try {
    body = await request.json() as typeof body;
  } catch {
    return errorResponse('Invalid JSON');
  }

  const { score, correct, wrong, skipped, duration_s } = body;

  if (
    typeof score !== 'number' ||
    typeof correct !== 'number' ||
    typeof wrong !== 'number' ||
    typeof skipped !== 'number' ||
    typeof duration_s !== 'number'
  ) {
    return errorResponse('Missing or invalid fields');
  }

  if (correct + wrong + skipped > 80 || duration_s > 480 || duration_s < 0) {
    return errorResponse('Invalid score data');
  }

  if (correct - 2 * wrong - 2 * skipped !== score) {
    return errorResponse('Score mismatch');
  }

  const id = crypto.randomUUID();

  await env.FORECAST_DB.prepare(
    `INSERT INTO drill_scores (id, user_id, score, correct, wrong, skipped, duration_s)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, user.sub, score, correct, wrong, skipped, duration_s)
    .run();

  return jsonResponse({ ok: true, id });
};
