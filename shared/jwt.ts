const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export interface JWTPayload {
  sub: string;
  email: string;
  name: string;
  picture: string;
  iat: number;
  exp: number;
}

export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string, ttlSeconds = 60 * 60 * 24 * 7): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = { ...payload, iat: now, exp: now + ttlSeconds };

  const headerB64 = base64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64url(encoder.encode(JSON.stringify(fullPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));

  return `${signingInput}.${base64url(sig)}`;
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const key = await getKey(secret);
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = base64urlDecode(sigB64);

  const valid = await crypto.subtle.verify('HMAC', key, sig.buffer as ArrayBuffer, encoder.encode(signingInput));
  if (!valid) return null;

  const decoded = base64urlDecode(payloadB64);
  const payload: JWTPayload = JSON.parse(decoder.decode(decoded));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}
