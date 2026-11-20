import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest as apiMedia } from '../../functions/api/media.js';
import { onRequest as serveMedia } from '../../functions/media/[[path]].js';
import { encodeFields, _resetCaches } from '../../functions/_lib/google-auth.js';
import { P, NOW, JWKS_URL, jwk, sign, good, makeServiceAccountPem } from './helpers/auth-fixtures.js';

const TOKEN = 'https://oauth2.googleapis.com/token';
const DOC = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
const CACHE = 'public, max-age=31536000, immutable';

let env;
beforeEach(async () => {
  _resetCaches();
  const pem = await makeServiceAccountPem();
  env = { FIREBASE_PROJECT_ID: P, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'sa@x', private_key: pem }) };
});

// Fake R2 bucket recording calls. list pages by `pageSize`.
function fakeR2(initial = {}, pageSize = 2) {
  const store = new Map(Object.entries(initial));
  const calls = { put: [], get: [], list: [], delete: [] };
  return {
    calls, store,
    async put(key, body, opts) { calls.put.push({ key, body, opts }); store.set(key, { body, opts }); },
    async get(key) {
      calls.get.push(key);
      const o = store.get(key);
      return o ? { body: o.body, httpMetadata: o.opts.httpMetadata, httpEtag: '"etag1"' } : null;
    },
    async list({ prefix = '', cursor } = {}) {
      calls.list.push({ prefix, cursor });
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = keys.slice(start, start + pageSize);
      const truncated = start + pageSize < keys.length;
      return { objects: page.map((key) => ({ key })), truncated, cursor: truncated ? String(start + pageSize) : undefined };
    },
    async delete(k) { const ks = Array.isArray(k) ? k : [k]; calls.delete.push(ks); ks.forEach((x) => store.delete(x)); },
  };
}

function fsRouter({ user = { role: 'admin' }, docs = {}, failDoc = false } = {}) {
  const calls = [];
  const fetchFn = vi.fn(async (url, init = {}) => {
    url = String(url);
    calls.push(url);
    if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'cache-control': 'max-age=3600' } });
    if (url === TOKEN) return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 });
    if (url === `${DOC}/users/u1`) return new Response(JSON.stringify({ fields: encodeFields(user) }), { status: 200 });
    if (url.startsWith(DOC)) {
      if (failDoc) return new Response('secret internal detail', { status: 500 });
      const doc = docs[url.slice(DOC.length + 1)];
      return doc ? new Response(JSON.stringify({ fields: encodeFields(doc) }), { status: 200 }) : new Response('', { status: 404 });
    }
    return new Response('?', { status: 500 });
  });
  return { calls, fetchFn };
}
const targetCalls = (calls) => calls.filter((u) => u.startsWith(DOC) && !u.endsWith('/users/u1'));

const jpg = (n = 10, type = 'image/jpeg', name = 'a.jpg') => new File([new Uint8Array(n)], name, { type });

async function post({ path = 'site/logo.jpg', file = jpg(), omitFile = false, authed = true, user, docs, failDoc, r2 = fakeR2() } = {}) {
  const fs = fsRouter({ user, docs, failDoc });
  const fd = new FormData();
  if (path !== undefined) fd.set('path', path);
  if (!omitFile) fd.set('file', file);
  const headers = authed ? { Authorization: `Bearer ${await sign(good())}` } : {};
  const request = new Request('https://x/api/media', { method: 'POST', headers, body: fd });
  const res = await apiMedia({ request, env: { ...env, MEDIA: r2 }, data: { deps: { fetchFn: fs.fetchFn, now: NOW } } });
  return { res, r2, calls: fs.calls, body: await res.json() };
}

async function del(payload, { user, docs, r2 = fakeR2(), failDoc } = {}) {
  const fs = fsRouter({ user, docs, failDoc });
  const request = new Request('https://x/api/media', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${await sign(good())}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const res = await apiMedia({ request, env: { ...env, MEDIA: r2 }, data: { deps: { fetchFn: fs.fetchFn, now: NOW } } });
  return { res, r2, calls: fs.calls, body: await res.json() };
}

describe('POST /api/media', () => {
  it('admin site/logo.jpg -> 201 url with ?v=NOW, R2 put with contentType', async () => {
    const { res, r2, body } = await post();
    expect(res.status).toBe(201);
    expect(body).toEqual({ url: `/media/site/logo.jpg?v=${NOW}` });
    expect(r2.calls.put).toHaveLength(1);
    expect(r2.calls.put[0].key).toBe('site/logo.jpg');
    expect(r2.calls.put[0].opts).toEqual({ httpMetadata: { contentType: 'image/jpeg', cacheControl: CACHE } });
  });
  it('prMath news of math -> 201', async () => {
    const { res, calls } = await post({ path: 'news/n1/cover.png', file: jpg(10, 'image/png', 'c.png'), user: { role: 'teacher', prDepartments: ['math'] }, docs: { 'news/n1': { departmentIds: ['math'] } } });
    expect(res.status).toBe(201);
    expect(calls).toContain(`${DOC}/news/n1`);
  });
  it('prMath news of sci -> 403, no put', async () => {
    const { res, r2, body } = await post({ path: 'news/n2/cover.png', user: { role: 'teacher', prDepartments: ['math'] }, docs: { 'news/n2': { departmentIds: ['sci'] } } });
    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(r2.calls.put).toHaveLength(0);
  });
  it('no bearer -> 401', async () => {
    const { res, r2, body } = await post({ authed: false });
    expect(res.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(r2.calls.put).toHaveLength(0);
  });
  it('bad path -> 400, no target Firestore call', async () => {
    for (const path of ['news/x/../site/logo.jpg', 'news/x%2Fy/a.jpg', 'site/', 'other/a.jpg']) {
      const { res, r2, calls, body } = await post({ path });
      expect(res.status).toBe(400);
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(targetCalls(calls)).toHaveLength(0);
      expect(r2.calls.put).toHaveLength(0);
    }
  });
  it('too large -> 413, no put', async () => {
    const { res, r2, body } = await post({ file: jpg(2 * 1024 * 1024 + 1) });
    expect(res.status).toBe(413);
    expect(body.error.code).toBe('TOO_LARGE');
    expect(r2.calls.put).toHaveLength(0);
  });
  it('exactly 2MiB is accepted', async () => {
    const { res } = await post({ file: jpg(2 * 1024 * 1024) });
    expect(res.status).toBe(201);
  });
  it('svg -> 415, no put', async () => {
    const { res, r2, body } = await post({ file: jpg(10, 'image/svg+xml', 'a.svg'), path: 'site/a.svg' });
    expect(res.status).toBe(415);
    expect(body.error.code).toBe('UNSUPPORTED_TYPE');
    expect(r2.calls.put).toHaveLength(0);
  });
  it('missing file field -> 400', async () => {
    const { res, r2 } = await post({ omitFile: true });
    expect(res.status).toBe(400);
    expect(r2.calls.put).toHaveLength(0);
  });
  it('Firestore failure -> 500 INTERNAL, message not echoed', async () => {
    const { res, body } = await post({ path: 'news/n1/c.jpg', user: { role: 'teacher', prDepartments: ['math'] }, failDoc: true });
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
    expect(JSON.stringify(body)).not.toContain('firestore');
  });
});

describe('early guards (before body read)', () => {
  async function rawPost({ user, headers = {}, r2 = fakeR2() } = {}) {
    const fs = fsRouter({ user });
    const fd = new FormData();
    fd.set('path', 'site/logo.jpg');
    fd.set('file', jpg());
    const request = new Request('https://x/api/media', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await sign(good())}`, ...headers },
      body: fd,
    });
    const formData = vi.spyOn(request, 'formData');
    const res = await apiMedia({ request, env: { ...env, MEDIA: r2 }, data: { deps: { fetchFn: fs.fetchFn, now: NOW } } });
    return { res, r2, formData, body: await res.json() };
  }
  it('POST by disabled user -> 403, body never read, no put', async () => {
    const { res, r2, formData, body } = await rawPost({ user: { role: 'admin', disabled: true } });
    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(formData).not.toHaveBeenCalled();
    expect(r2.calls.put).toHaveLength(0);
  });
  it('POST with missing users doc -> 403, body never read', async () => {
    const fs = fsRouter();
    const fetchFn = vi.fn(async (url, init) => (String(url) === `${DOC}/users/u1` ? new Response('', { status: 404 }) : fs.fetchFn(url, init)));
    const fd = new FormData();
    fd.set('path', 'site/logo.jpg');
    fd.set('file', jpg());
    const request = new Request('https://x/api/media', { method: 'POST', headers: { Authorization: `Bearer ${await sign(good())}` }, body: fd });
    const formData = vi.spyOn(request, 'formData');
    const r2 = fakeR2();
    const res = await apiMedia({ request, env: { ...env, MEDIA: r2 }, data: { deps: { fetchFn, now: NOW } } });
    expect(res.status).toBe(403);
    expect(formData).not.toHaveBeenCalled();
    expect(r2.calls.put).toHaveLength(0);
  });
  it('POST with Content-Length > 2.5MiB -> 413 TOO_LARGE, body never read, no put', async () => {
    const { res, r2, formData, body } = await rawPost({ headers: { 'content-length': String(2.5 * 1024 * 1024 + 1) } });
    expect(res.status).toBe(413);
    expect(body.error.code).toBe('TOO_LARGE');
    expect(formData).not.toHaveBeenCalled();
    expect(r2.calls.put).toHaveLength(0);
  });
  it('DELETE by disabled user -> 403, no delete/list', async () => {
    const r2 = fakeR2({ 'site/logo.jpg': { body: 1, opts: {} } });
    const { res } = await del({ path: 'site/logo.jpg' }, { user: { role: 'admin', disabled: true }, r2 });
    expect(res.status).toBe(403);
    expect(r2.calls.delete).toHaveLength(0);
  });
});

describe('DELETE /api/media', () => {
  const seed = () => fakeR2({
    'news/n1/a.jpg': { opts: {} }, 'news/n1/b.jpg': { opts: {} }, 'news/n1/c.jpg': { opts: {} },
    'news/n1/d.jpg': { opts: {} }, 'news/n1/e.jpg': { opts: {} }, 'news/n10/z.jpg': { opts: {} },
  });
  it('prefix news/n1/ by prMath (doc math) deletes all keys across pages', async () => {
    const r2 = seed();
    const { res, body } = await del({ prefix: 'news/n1/' }, { user: { role: 'teacher', prDepartments: ['math'] }, docs: { 'news/n1': { departmentIds: ['math'] } }, r2 });
    expect(res.status).toBe(200);
    expect(body).toEqual({ deleted: 5 });
    expect(r2.calls.list).toHaveLength(3);
    expect(r2.calls.list.every((c) => c.prefix === 'news/n1/')).toBe(true);
    expect(r2.calls.delete.flat().sort()).toEqual(['news/n1/a.jpg', 'news/n1/b.jpg', 'news/n1/c.jpg', 'news/n1/d.jpg', 'news/n1/e.jpg']);
    expect([...r2.store.keys()]).toEqual(['news/n10/z.jpg']);
  });
  it('prefix news/n9/ doc missing: prc 200, prMath 403', async () => {
    const r2a = fakeR2({ 'news/n9/a.jpg': { opts: {} } });
    const a = await del({ prefix: 'news/n9/' }, { user: { role: 'pr_central' }, r2: r2a });
    expect(a.res.status).toBe(200);
    expect(a.body).toEqual({ deleted: 1 });
    const r2b = fakeR2({ 'news/n9/a.jpg': { opts: {} } });
    const b = await del({ prefix: 'news/n9/' }, { user: { role: 'teacher', prDepartments: ['math'] }, r2: r2b });
    expect(b.res.status).toBe(403);
    expect(r2b.calls.delete).toHaveLength(0);
  });
  it('path departments/math/cover.jpg by prMath -> 200', async () => {
    const r2 = fakeR2({ 'departments/math/cover.jpg': { opts: {} } });
    const { res, body } = await del({ path: 'departments/math/cover.jpg' }, { user: { role: 'teacher', prDepartments: ['math'] }, r2 });
    expect(res.status).toBe(200);
    expect(body).toEqual({ deleted: 1 });
    expect(r2.calls.delete).toEqual([['departments/math/cover.jpg']]);
  });
  it('invalid body / prefix / path -> 400', async () => {
    for (const p of [{}, { prefix: 'site/' }, { path: '../x' }, { path: 'a/b', prefix: 'news/n1/' }]) {
      const { res, r2 } = await del(p);
      expect(res.status).toBe(400);
      expect(r2.calls.delete).toHaveLength(0);
    }
  });
});

describe('GET /media/*', () => {
  const get = (segs, r2) => serveMedia({
    request: new Request('https://x/media/' + [].concat(segs).join('/'), { method: 'GET' }),
    env: { ...env, MEDIA: r2 }, params: { path: segs }, data: {},
  });
  it('existing -> 200 with content-type, immutable cache, etag', async () => {
    const r2 = fakeR2({ 'site/logo.jpg': { body: new Uint8Array([1, 2, 3]), opts: { httpMetadata: { contentType: 'image/jpeg' } } } });
    const res = await get(['site', 'logo.jpg'], r2);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Cache-Control')).toBe(CACHE);
    expect(res.headers.get('ETag')).toBe('"etag1"');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
  });
  it('HEAD also carries security headers', async () => {
    const r2 = fakeR2({ 'site/logo.jpg': { body: new Uint8Array([1]), opts: { httpMetadata: { contentType: 'image/jpeg' } } } });
    const res = await serveMedia({ request: new Request('https://x/media/site/logo.jpg', { method: 'HEAD' }), env: { ...env, MEDIA: r2 }, params: { path: ['site', 'logo.jpg'] }, data: {} });
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");
  });
  it('missing -> 404', async () => {
    expect((await get(['site', 'nope.jpg'], fakeR2())).status).toBe(404);
  });
  it('traversal / invalid -> 404 without touching R2', async () => {
    const r2 = fakeR2();
    for (const segs of [['news', 'x', '..', 'site', 'logo.jpg'], ['news', 'x%2Fy', 'a.jpg'], ['site', ''], []]) {
      expect((await get(segs, r2)).status).toBe(404);
    }
    expect(r2.calls.get).toHaveLength(0);
  });
});

describe('methods', () => {
  it('other methods on /api/media -> 405 with Allow', async () => {
    const res = await apiMedia({ request: new Request('https://x/api/media', { method: 'GET' }), env, data: {} });
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST, DELETE');
  });
  it('non-GET on /media/* -> 405 with Allow', async () => {
    const res = await serveMedia({ request: new Request('https://x/media/site/a.jpg', { method: 'POST' }), env, params: { path: ['site', 'a.jpg'] }, data: {} });
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET, HEAD');
  });
});
