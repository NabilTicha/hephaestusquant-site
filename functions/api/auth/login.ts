const encoder = new TextEncoder();

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Stateless, HMAC-signed OAuth state parameter. Format: nonce.ts.sig (all base64url).
// Avoids relying on a Set-Cookie surviving the OAuth redirect round trip.
async function signState(secret: string): Promise<string> {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = base64url(nonceBytes);
  const ts = Math.floor(Date.now() / 1000).toString();
  const signingInput = `${nonce}.${ts}`;
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return `${signingInput}.${base64url(sig)}`;
}

export const onRequestGet: CFPagesFunction = async ({ env }) => {
  const state = await signState(env.JWT_SECRET);
  // Tenant-scoped authorize URL: hitting TU Delft's tenant id sends users
  // straight to the TU Delft NetID login screen. If MS_TENANT_ID is missing
  // we fall back to `organizations` (any work/school account) and rely on
  // the email-domain check in the callback.
  const tenant = env.MS_TENANT_ID || 'organizations';
  const params = new URLSearchParams({
    client_id: env.MS_CLIENT_ID,
    redirect_uri: env.MS_REDIRECT_URI,
    response_type: 'code',
    response_mode: 'query',
    scope: 'openid email profile User.Read',
    state,
    prompt: 'select_account',
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`,
    },
  });
};
