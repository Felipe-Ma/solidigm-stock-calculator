const TEAM_DOMAIN_SUFFIX = '.cloudflareaccess.com';
const CERTS_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_STATE_BYTES = 2 * 1024 * 1024;

let certsCache = { key: '', expiresAt: 0, keys: null };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeJwtSegment(segment) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

async function loadAccessCerts(teamDomain) {
  const now = Date.now();
  if (certsCache.keys && certsCache.key === teamDomain && certsCache.expiresAt > now) {
    return certsCache.keys;
  }

  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) return null;

  const payload = await response.json();
  const keys = Array.isArray(payload?.keys) ? payload.keys : null;
  if (!keys) return null;

  certsCache = { key: teamDomain, expiresAt: now + CERTS_CACHE_TTL_MS, keys };
  return keys;
}

async function verifyAccessJwt(token, teamDomain, audience) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerSegment, payloadSegment, signatureSegment] = parts;

  let header;
  let claims;
  try {
    header = decodeJwtSegment(headerSegment);
    claims = decodeJwtSegment(payloadSegment);
  } catch {
    return null;
  }

  if (header.alg !== 'RS256' || !header.kid) return null;

  const keys = await loadAccessCerts(teamDomain);
  const jwk = keys?.find((candidate) => candidate.kid === header.kid);
  if (!jwk) return null;

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signed = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);
  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    base64UrlToBytes(signatureSegment),
    signed,
  );
  if (!isValid) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return null;
  if (typeof claims.nbf === 'number' && claims.nbf > nowSeconds + 60) return null;
  if (claims.iss !== `https://${teamDomain}`) return null;

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(audience)) return null;

  return claims;
}

function readAccessCookie(request) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === 'CF_Authorization') return rest.join('=');
  }
  return null;
}

async function resolveUser(request, env, ctx) {
  if (ctx.access) {
    const identity = await ctx.access.getIdentity();
    if (identity?.email) return String(identity.email).toLowerCase();
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion') || readAccessCookie(request);
  if (!token) return null;

  const teamDomain = String(env.ACCESS_TEAM_DOMAIN || '').trim().toLowerCase();
  const audience = String(env.ACCESS_AUD || '').trim();
  if (!teamDomain.endsWith(TEAM_DOMAIN_SUFFIX) || !audience) return null;

  const claims = await verifyAccessJwt(token, teamDomain, audience);
  const email = claims?.email || claims?.common_name;
  return email ? String(email).toLowerCase() : null;
}

function isSameOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

async function handleApi(request, env, ctx, url) {
  const user = await resolveUser(request, env, ctx);
  if (!user) {
    return json(
      {
        error: 'unauthorized',
        message: 'This app must be placed behind Cloudflare Access before saved data can be read or written.',
      },
      401,
    );
  }

  if (url.pathname === '/api/me') {
    return json({ email: user });
  }

  if (url.pathname !== '/api/state') {
    return json({ error: 'not_found' }, 404);
  }

  const key = `state:${user}`;

  if (request.method === 'GET') {
    const stored = await env.APP_STATE.getWithMetadata(key, { type: 'json' });
    return json({
      email: user,
      state: stored.value ?? null,
      updatedAt: stored.metadata?.updatedAt ?? null,
    });
  }

  if (request.method === 'PUT') {
    if (!isSameOrigin(request, url)) {
      return json({ error: 'bad_origin' }, 403);
    }

    const body = await request.text();
    if (body.length > MAX_STATE_BYTES) {
      return json({ error: 'payload_too_large' }, 413);
    }

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    const state = parsed?.state;
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return json({ error: 'invalid_state' }, 400);
    }

    const updatedAt = new Date().toISOString();
    await env.APP_STATE.put(key, JSON.stringify(state), { metadata: { updatedAt } });
    return json({ ok: true, updatedAt });
  }

  return json({ error: 'method_not_allowed' }, 405);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, ctx, url);
    }

    return env.ASSETS.fetch(request);
  },
};
