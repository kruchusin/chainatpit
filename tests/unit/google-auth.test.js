import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  verifyFirebaseIdToken, AuthError, getAccessToken, decodeFields, encodeFields,
  firestoreGet, firestorePatch, requireAdmin, identityToolkitBase, _resetCaches,
} from '../../functions/_lib/google-auth.js';

const P = 'proj-1';
const ISS = `https://securetoken.google.com/${P}`;
const T = 1_800_000_000; // seconds
const NOW = T * 1000;
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));

const kp = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const other = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

async function sign(payload, { kid = 'k1', key = kp.privateKey } = {}) {
  const h = enc({ alg: 'RS256', kid, typ: 'JWT' });
  const body = enc(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${h}.${body}`));
  return `${h}.${body}.${b64u(sig)}`;
}
const unsigned = (payload) => `${enc({ alg: 'none', typ: 'JWT' })}.${enc(payload)}.`;
const good = (extra = {}) => ({ aud: P, iss: ISS, sub: 'u1', exp: T + 3600, iat: T, ...extra });

const jwksFetch = (headers = { 'cache-control': 'public, max-age=3600' }) =>
  vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers }));
const verify = (token, fetchFn = jwksFetch()) => verifyFirebaseIdToken(token, P, { fetchFn, now: NOW });

beforeEach(() => _resetCaches());

describe('verifyFirebaseIdToken', () => {
  it('accepts valid token', async () => {
    expect(await verify(await sign(good()))).toEqual({ uid: 'u1', email: undefined });
  });
  it('returns email when present', async () => {
    expect((await verify(await sign(good({ email: 'a@b.c' })))).email).toBe('a@b.c');
  });
  it('rejects wrong aud', async () => {
    await expect(verify(await sign(good({ aud: 'x' })))).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects wrong iss', async () => {
    await expect(verify(await sign(good({ iss: 'https://evil' })))).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects expired', async () => {
    await expect(verify(await sign(good({ exp: T - 1 })))).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects exp == now (exp must be > now)', async () => {
    await expect(verify(await sign(good({ exp: T })))).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects iat far in future but tolerates 5 min skew', async () => {
    await expect(verify(await sign(good({ iat: T + 301 })))).rejects.toBeInstanceOf(AuthError);
    expect((await verify(await sign(good({ iat: T + 299 })))).uid).toBe('u1');
  });
  it('rejects empty sub', async () => {
    await expect(verify(await sign(good({ sub: '' })))).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects unknown kid', async () => {
    await expect(verify(await sign(good(), { kid: 'nope' }))).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects bad signature', async () => {
    await expect(verify(await sign(good(), { key: other.privateKey }))).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects garbage', async () => {
    await expect(verify('not.a.jwt')).rejects.toBeInstanceOf(AuthError);
    await expect(verify('')).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects alg none', async () => {
    await expect(verify(unsigned(good()))).rejects.toBeInstanceOf(AuthError);
  });
  it('caches JWKS per max-age', async () => {
    const f = jwksFetch();
    const t = await sign(good());
    await verify(t, f); await verify(t, f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe(JWKS_URL);
    // after max-age expires, refetch
    await verifyFirebaseIdToken(t, P, { fetchFn: f, now: NOW + 3601_000 }).catch(() => {});
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('emulator bypass ignored when env var absent', async () => {
    await expect(verify(unsigned(good()))).rejects.toBeInstanceOf(AuthError);
  });
});

describe('getAccessToken', () => {
  let pem;
  beforeEach(async () => {
    const k = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', k.privateKey)).toString('base64');
    pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  });
  const tokFetch = () => vi.fn(async () => new Response(JSON.stringify({ access_token: 'ya29.x', expires_in: 3600 }), { status: 200 }));

  it('caches (fetch called once for two calls) and posts a signed JWT', async () => {
    const f = tokFetch();
    const sa = { client_email: 'sa@x.iam', private_key: pem };
    const a = await getAccessToken(sa, ['s1'], { fetchFn: f, now: NOW });
    const b = await getAccessToken(sa, ['s1'], { fetchFn: f, now: NOW + 1000 });
    expect(a).toBe('ya29.x'); expect(b).toBe('ya29.x');
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const params = new URLSearchParams(init.body);
    expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const claims = JSON.parse(Buffer.from(params.get('assertion').split('.')[1], 'base64url'));
    expect(claims).toMatchObject({ iss: 'sa@x.iam', scope: 's1', aud: 'https://oauth2.googleapis.com/token', iat: T, exp: T + 3600 });
  });
  it('refetches after exp-60s and for different scopes', async () => {
    const f = tokFetch();
    const sa = { client_email: 'sa@x.iam', private_key: pem };
    await getAccessToken(sa, ['s1'], { fetchFn: f, now: NOW });
    await getAccessToken(sa, ['s1'], { fetchFn: f, now: NOW + 3541_000 });
    await getAccessToken(sa, ['s2'], { fetchFn: f, now: NOW + 3541_000 });
    expect(f).toHaveBeenCalledTimes(3);
  });
  it('throws on non-2xx', async () => {
    const f = vi.fn(async () => new Response('no', { status: 400 }));
    await expect(getAccessToken({ client_email: 'a', private_key: pem }, ['s'], { fetchFn: f, now: NOW })).rejects.toThrow();
  });
});

describe('encode/decodeFields', () => {
  it('roundtrip', () => {
    const o = { a: 'x', n: 3, b: true, l: ['p'], m: { k: null } };
    expect(decodeFields(encodeFields(o))).toEqual(o);
  });
  it('typed encoding', () => {
    expect(encodeFields({ i: 3, d: 1.5 })).toEqual({ i: { integerValue: '3' }, d: { doubleValue: 1.5 } });
  });
  it('date roundtrip', () => {
    const d = new Date('2026-01-02T03:04:05.000Z');
    const f = encodeFields({ at: d });
    expect(f.at).toEqual({ timestampValue: '2026-01-02T03:04:05.000Z' });
    expect(decodeFields(f).at).toEqual(d);
  });
});

describe('firestore REST', () => {
  const base = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
  it('get returns decoded, null on 404, throws otherwise', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ fields: { role: { stringValue: 'admin' } } }), { status: 200 }));
    expect(await firestoreGet(P, 'users/u1', 'tok', { fetchFn: ok })).toEqual({ role: 'admin' });
    expect(ok.mock.calls[0][0]).toBe(`${base}/users/u1`);
    expect(ok.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(await firestoreGet(P, 'users/u1', 't', { fetchFn: async () => new Response('', { status: 404 }) })).toBeNull();
    const err = await firestoreGet(P, 'users/u1', 't', { fetchFn: async () => new Response('', { status: 500 }) }).catch((e) => e);
    expect(err).toBeInstanceOf(Error); expect(err.status).toBe(500);
  });
  it('patch uses updateMask.fieldPaths', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    await firestorePatch(P, 'users/u1', { disabled: true }, 'tok', { fetchFn: f, updateMask: ['disabled', 'role'] });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${base}/users/u1?updateMask.fieldPaths=disabled&updateMask.fieldPaths=role`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ fields: { disabled: { booleanValue: true } } });
  });
  it('emulator host used when given', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    await firestorePatch(P, 'a/b', { x: 1 }, 'owner', { fetchFn: f, firestoreHost: 'localhost:8080' });
    expect(f.mock.calls[0][0]).toBe(`http://localhost:8080/v1/projects/${P}/databases/(default)/documents/a/b`);
  });
});

describe('identityToolkitBase', () => {
  it('prod vs emulator', () => {
    expect(identityToolkitBase({})).toBe('https://identitytoolkit.googleapis.com/v1');
    expect(identityToolkitBase({ FIREBASE_AUTH_EMULATOR_HOST: 'h:9099', FIRESTORE_EMULATOR_HOST: 'h:8080' }))
      .toBe('http://h:9099/identitytoolkit.googleapis.com/v1');
    expect(identityToolkitBase({ FIREBASE_AUTH_EMULATOR_HOST: 'h:9099' })).toBe('https://identitytoolkit.googleapis.com/v1');
  });
});

describe('requireAdmin', () => {
  let saPem;
  beforeEach(async () => {
    const k = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', k.privateKey)).toString('base64');
    saPem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  });
  const env = () => ({ FIREBASE_PROJECT_ID: P, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'sa@x', private_key: saPem }) });
  const req = (token) => new Request('https://x/api', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const router = (userDoc) => vi.fn(async (url) => {
    url = String(url);
    if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'cache-control': 'max-age=3600' } });
    if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 });
    if (url.includes('/documents/users/u1')) {
      return userDoc ? new Response(JSON.stringify({ fields: encodeFields(userDoc) }), { status: 200 }) : new Response('', { status: 404 });
    }
    return new Response('?', { status: 500 });
  });
  const caught = (p) => p.then(() => null, (e) => e);

  it('401 without header', async () => {
    const r = await caught(requireAdmin(req(), env(), { fetchFn: router({}), now: NOW }));
    expect(r).toBeInstanceOf(Response); expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe('UNAUTHENTICATED');
  });
  it('401 for invalid token', async () => {
    const r = await caught(requireAdmin(req('bad.token.x'), env(), { fetchFn: router({}), now: NOW }));
    expect(r.status).toBe(401);
  });
  it('200 path returns uid and accessToken for admin', async () => {
    const t = await sign(good());
    expect(await requireAdmin(req(t), env(), { fetchFn: router({ role: 'admin' }), now: NOW })).toEqual({ uid: 'u1', accessToken: 'AT' });
  });
  it('403 for teacher', async () => {
    const r = await caught(requireAdmin(req(await sign(good())), env(), { fetchFn: router({ role: 'teacher' }), now: NOW }));
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe('FORBIDDEN');
  });
  it('403 for disabled admin', async () => {
    const r = await caught(requireAdmin(req(await sign(good())), env(), { fetchFn: router({ role: 'admin', disabled: true }), now: NOW }));
    expect(r.status).toBe(403);
  });
  it('403 when user doc missing', async () => {
    const r = await caught(requireAdmin(req(await sign(good())), env(), { fetchFn: router(null), now: NOW }));
    expect(r.status).toBe(403);
  });
  it('emulator mode: unsigned token accepted, owner token, emulator firestore', async () => {
    const e = { FIREBASE_PROJECT_ID: P, FIREBASE_AUTH_EMULATOR_HOST: 'h:9099', FIRESTORE_EMULATOR_HOST: 'h:8080' };
    const f = vi.fn(async () => new Response(JSON.stringify({ fields: encodeFields({ role: 'admin' }) }), { status: 200 }));
    const out = await requireAdmin(req(unsigned(good())), e, { fetchFn: f, now: NOW });
    expect(out).toEqual({ uid: 'u1', accessToken: 'owner' });
    expect(f.mock.calls[0][0]).toBe(`http://h:8080/v1/projects/${P}/databases/(default)/documents/users/u1`);
  });
  it('emulator mode still checks aud and exp', async () => {
    const e = { FIREBASE_PROJECT_ID: P, FIREBASE_AUTH_EMULATOR_HOST: 'h:9099', FIRESTORE_EMULATOR_HOST: 'h:8080' };
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    expect((await caught(requireAdmin(req(unsigned(good({ aud: 'z' }))), e, { fetchFn: f, now: NOW }))).status).toBe(401);
    expect((await caught(requireAdmin(req(unsigned(good({ exp: T - 5 }))), e, { fetchFn: f, now: NOW }))).status).toBe(401);
  });
});
