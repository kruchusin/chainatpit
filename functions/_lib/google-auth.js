// Cloudflare Workers helpers: Firebase ID token verification, Google OAuth
// access tokens from a service account, Firestore REST. No npm imports.
import { errorJson } from './http.js';

export class AuthError extends Error {
  constructor(message) { super(message); this.name = 'AuthError'; }
}

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IAT_SKEW_SEC = 300;

const jwksCache = new Map();   // url -> { keys, expiresAt(ms) }
const tokenCache = new Map();  // email|scopes -> { token, expiresAt(ms) }

export function _resetCaches() { jwksCache.clear(); tokenCache.clear(); }

const te = new TextEncoder();
const td = new TextDecoder();

function b64uToBytes(s) {
  const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
function bytesToB64u(bytes) {
  let s = '';
  for (const c of new Uint8Array(bytes)) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const strToB64u = (s) => bytesToB64u(te.encode(s));
const parseSeg = (seg) => JSON.parse(td.decode(b64uToBytes(seg)));

export function isEmulator(env) {
  // Requires a demo- project id so stray emulator vars can never disable signature checks on a real project.
  return !!(env && env.FIREBASE_AUTH_EMULATOR_HOST && env.FIRESTORE_EMULATOR_HOST
    && String(env.FIREBASE_PROJECT_ID || '').startsWith('demo-'));
}

export function identityToolkitBase(env) {
  return isEmulator(env)
    ? `http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`
    : 'https://identitytoolkit.googleapis.com/v1';
}

async function getJwks(fetchFn, now) {
  const hit = jwksCache.get(JWKS_URL);
  if (hit && hit.expiresAt > now) return hit.keys;
  const res = await fetchFn(JWKS_URL);
  if (!res.ok) throw new AuthError('cannot fetch JWKS');
  const body = await res.json();
  const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  const ttl = m ? Number(m[1]) : 0;
  jwksCache.set(JWKS_URL, { keys: body.keys || [], expiresAt: now + ttl * 1000 });
  return body.keys || [];
}

function checkClaims(p, projectId, now) {
  const nowSec = Math.floor(now / 1000);
  if (p.aud !== projectId) throw new AuthError('bad aud');
  if (p.iss !== `https://securetoken.google.com/${projectId}`) throw new AuthError('bad iss');
  if (typeof p.exp !== 'number' || !(p.exp > nowSec)) throw new AuthError('expired');
  if (typeof p.iat !== 'number' || p.iat > nowSec + IAT_SKEW_SEC) throw new AuthError('bad iat');
  if (typeof p.sub !== 'string' || !p.sub) throw new AuthError('bad sub');
}

export async function verifyFirebaseIdToken(token, projectId, { fetchFn = fetch, now = Date.now(), emulator = false } = {}) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new AuthError('malformed token');
    const header = parseSeg(parts[0]);
    const payload = parseSeg(parts[1]);
    if (!emulator) {
      if (header.alg !== 'RS256' || !header.kid) throw new AuthError('bad header');
      const keys = await getJwks(fetchFn, now);
      const jwk = keys.find((k) => k.kid === header.kid);
      if (!jwk) throw new AuthError('unknown kid');
      const key = await crypto.subtle.importKey(
        'jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5', key, b64uToBytes(parts[2]), te.encode(`${parts[0]}.${parts[1]}`));
      if (!ok) throw new AuthError('bad signature');
    }
    checkClaims(payload, projectId, now);
    return { uid: payload.sub, email: payload.email };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError('invalid token');
  }
}

function pemToDer(pem) {
  const b64 = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  return b64uToBytes(b64.replace(/\+/g, '-').replace(/\//g, '_'));
}

export async function getAccessToken(sa, scopes, { fetchFn = fetch, now = Date.now() } = {}) {
  const scope = scopes.join(' ');
  const cacheKey = `${sa.client_email}|${scope}`;
  const hit = tokenCache.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit.token;

  const iat = Math.floor(now / 1000);
  const claims = { iss: sa.client_email, scope, aud: TOKEN_URL, iat, exp: iat + 3600 };
  const unsignedJwt = `${strToB64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${strToB64u(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, te.encode(unsignedJwt));
  const assertion = `${unsignedJwt}.${bytesToB64u(sig)}`;

  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  if (!res.ok) {
    const err = new Error(`token endpoint ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  const ttl = Number(body.expires_in) || 3600;
  tokenCache.set(cacheKey, { token: body.access_token, expiresAt: now + (ttl - 60) * 1000 });
  return body.access_token;
}

// ---- Firestore typed values ----
function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  switch (typeof v) {
    case 'string': return { stringValue: v };
    case 'boolean': return { booleanValue: v };
    case 'number': return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    case 'object':
      if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
      return { mapValue: { fields: encodeFields(v) } };
    default: throw new Error(`unsupported value type: ${typeof v}`);
  }
}
function decodeValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return undefined;
}
export function encodeFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k] = encodeValue(v);
  return out;
}
export function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
}

function docUrl(projectId, path, firestoreHost) {
  const root = firestoreHost ? `http://${firestoreHost}` : 'https://firestore.googleapis.com';
  return `${root}/v1/projects/${projectId}/databases/(default)/documents/${path}`;
}

export async function firestoreGet(projectId, path, token, { fetchFn = fetch, firestoreHost } = {}) {
  const res = await fetchFn(docUrl(projectId, path, firestoreHost), { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = new Error(`firestore GET ${path} failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const doc = await res.json();
  return decodeFields(doc.fields);
}

export async function firestorePatch(projectId, path, data, token, { fetchFn = fetch, updateMask, firestoreHost, mustExist } = {}) {
  let url = docUrl(projectId, path, firestoreHost);
  const q = [];
  if (updateMask && updateMask.length) q.push(...updateMask.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`));
  if (mustExist) q.push('currentDocument.exists=true'); // precondition: fail instead of upserting
  if (q.length) url += '?' + q.join('&');
  const res = await fetchFn(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!res.ok) {
    const err = new Error(`firestore PATCH ${path} failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function authenticate(request, env, deps = {}) {
  const { fetchFn = fetch, now = Date.now() } = deps;
  const unauth = () => errorJson(401, 'UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ');

  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  if (!m) throw unauth();

  const emulator = isEmulator(env);
  let uid;
  try {
    ({ uid } = await verifyFirebaseIdToken(m[1].trim(), env.FIREBASE_PROJECT_ID, { fetchFn, now, emulator }));
  } catch (e) {
    if (e instanceof AuthError) throw unauth();
    throw e;
  }

  const projectId = env.FIREBASE_PROJECT_ID;
  const firestoreHost = emulator ? env.FIRESTORE_EMULATOR_HOST : undefined;
  const accessToken = emulator
    ? 'owner'
    : await getAccessToken(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT), ['https://www.googleapis.com/auth/cloud-platform'] /* Firestore + Identity Toolkit */, { fetchFn, now });
  // user is null when the users doc is missing; the caller decides what that means.
  const user = await firestoreGet(projectId, `users/${uid}`, accessToken, { fetchFn, firestoreHost });
  return { uid, accessToken, user, projectId, firestoreHost };
}

export async function requireAdmin(request, env, deps = {}) {
  const { uid, accessToken, user } = await authenticate(request, env, deps);
  if (!user || user.role !== 'admin' || user.disabled === true) throw errorJson(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ใช้งานส่วนนี้');
  return { uid, accessToken };
}
