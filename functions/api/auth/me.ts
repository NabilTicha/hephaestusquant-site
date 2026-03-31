import { getUser, jsonResponse, errorResponse } from '../../../shared/auth-middleware';

export const onRequestGet: CFPagesFunction = async ({ request, env }) => {
  const user = await getUser(request, env.JWT_SECRET);
  if (!user) return errorResponse('Not authenticated', 401);

  return jsonResponse({
    id: user.sub,
    email: user.email,
    name: user.name,
    picture: user.picture,
  });
};
