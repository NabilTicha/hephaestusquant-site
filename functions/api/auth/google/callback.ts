import { signJWT } from '../../../../shared/jwt';

export const onRequestGet: CFPagesFunction = async ({ request, env }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 });
  }

  const cookie = request.headers.get('Cookie') || '';
  const savedState = cookie.match(/(?:^|;\s*)hq_oauth_state=([^;]+)/)?.[1];
  if (state !== savedState) {
    const debug = {
      error: 'Invalid state',
      urlState: state,
      cookieHeaderPresent: !!request.headers.get('Cookie'),
      cookieHeaderLength: cookie.length,
      cookieNamesSeen: cookie.split(/;\s*/).map(c => c.split('=')[0]).filter(Boolean),
      hqOauthStateFound: savedState !== undefined,
      hqOauthStateValue: savedState ?? null,
      matches: state === savedState,
    };
    return new Response(JSON.stringify(debug, null, 2), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return new Response('Token exchange failed', { status: 500 });
  }

  const tokens = await tokenRes.json() as { access_token: string };

  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    return new Response('Failed to fetch user info', { status: 500 });
  }

  const userInfo = await userInfoRes.json() as {
    id: string; email: string; name: string; picture: string;
  };

  const userId = crypto.randomUUID();

  await env.FORECAST_DB.prepare(`
    INSERT INTO users (id, google_id, email, name, picture_url, last_login)
    VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
    ON CONFLICT(google_id) DO UPDATE SET
      name = excluded.name,
      picture_url = excluded.picture_url,
      last_login = datetime('now')
  `).bind(userId, userInfo.id, userInfo.email, userInfo.name, userInfo.picture).run();

  const dbUser = await env.FORECAST_DB.prepare(
    'SELECT id, email, name, picture_url FROM users WHERE google_id = ?1'
  ).bind(userInfo.id).first<{ id: string; email: string; name: string; picture_url: string }>();

  if (!dbUser) {
    return new Response('Failed to create user', { status: 500 });
  }

  const jwt = await signJWT({
    sub: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    picture: dbUser.picture_url || '',
  }, env.JWT_SECRET);

  const cookieHeader = `hq_token=${jwt}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${7 * 24 * 60 * 60}`;
  const clearState = 'hq_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0';

  return new Response(null, {
    status: 302,
    headers: new Headers([
      ['Location', env.SITE_URL || '/'],
      ['Set-Cookie', cookieHeader],
      ['Set-Cookie', clearState],
    ]),
  });
};
