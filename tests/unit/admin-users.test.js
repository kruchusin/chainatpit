import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost, onRequest } from '../../functions/api/admin/users.js';
import { encodeFields, _resetCaches } from '../../functions/_lib/google-auth.js';
import { P, NOW, JWKS_URL, jwk, sign, good, makeServiceAccountPem } from './helpers/auth-fixtures.js';

const DEMO = 'demo-proj';
const TOKEN = 'https://oauth2.googleapis.com/token';
const DOC = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
const IDT = `https://identitytoolkit.googleapis.com/v1/projects/${P}`;

let env;
beforeEach(async () => {
  _resetCaches();
  const pem = await makeServiceAccountPem();
  env = { FIREBASE_PROJECT_ID: P, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'sa@x', private_key: pem }) };
});

// Router records every request; callerDoc is users/u1 (the admin caller).
function setup({ callerDoc = { role: 'admin' }, idt = {}, failPatch, failPatchStatus = 500, staffDoc = { name: 'x' }, existingUsers = {} } = {}) {
  const calls = [];
  const fetchFn = vi.fn(async (url, init = {}) => {
    url = String(url);
    calls.push({ url, method: init.method || 'GET', body: init.body ? safeParse(init.body) : undefined, auth: init.headers && init.headers.Authorization });
    if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'cache-control': 'max-age=3600' } });
    if (url === TOKEN) return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 });
    if (url === `${DOC}/users/u1` && !init.method) return new Response(JSON.stringify({ fields: encodeFields(callerDoc) }), { status: 200 });
    if (url.startsWith(DOC) && !init.method) {
      const m = /\/documents\/(staff|users)\/([^/?]+)$/.exec(url);
      const doc = m && (m[1] === 'staff' ? (m[2] === 's9' ? staffDoc : null) : existingUsers[m[2]]);
      return doc ? new Response(JSON.stringify({ fields: encodeFields(doc) }), { status: 200 }) : new Response('', { status: 404 });
    }
    if (url.startsWith(DOC)) {
      if (failPatch && url.includes(failPatch)) return new Response('boom', { status: failPatchStatus });
      return new Response('{}', { status: 200 });
    }
    if (url.startsWith(IDT)) {
      const key = url.slice(IDT.length);
      const r = idt[key] || (key === '/accounts' ? { status: 200, body: { localId: 'newuid' } } : { status: 200, body: {} });
      return new Response(JSON.stringify(r.body), { status: r.status });
    }
    return new Response('?', { status: 500 });
  });
  return { calls, fetchFn };
}
const safeParse = (s) => { try { return JSON.parse(s); } catch { return s; } };

async function call(body, opts = {}, { method = 'POST', authed = true, rawBody } = {}) {
  const s = setup(opts);
  const headers = { 'content-type': 'application/json' };
  if (authed) headers.Authorization = `Bearer ${await sign(good())}`;
  const request = new Request('https://x/api/admin/users', { method, headers, body: method === 'GET' ? undefined : (rawBody ?? JSON.stringify(body)) });
  const res = await onRequest({ request, env, data: { deps: { fetchFn: s.fetchFn, now: NOW } } });
  return { res, calls: s.calls, body: await res.json() };
}
const idtCalls = (calls) => calls.filter((c) => c.url.startsWith(IDT));

const create = (extra = {}) => ({ action: 'create', email: 't@school.ac.th', password: 'secret123', staffId: 's9', ...extra });

describe('create', () => {
  it('201 + users doc + staff.uid patched, in order', async () => {
    const { res, calls, body } = await call(create({ displayName: 'Somchai', role: 'pr_central', prDepartments: ['d1'] }));
    expect(res.status).toBe(201);
    expect(body).toEqual({ uid: 'newuid' });
    expect(calls.map((c) => c.url)).toEqual([
      JWKS_URL, TOKEN, `${DOC}/users/u1`,
      `${DOC}/staff/s9`,
      `${IDT}/accounts`,
      `${DOC}/users/newuid`,
      `${DOC}/staff/s9?updateMask.fieldPaths=uid&currentDocument.exists=true`,
    ]);
    const idt = calls[4];
    expect(idt.method).toBe('POST'); expect(idt.auth).toBe('Bearer AT');
    expect(idt.body).toEqual({ email: 't@school.ac.th', password: 'secret123', displayName: 'Somchai' });
    expect(calls[5].method).toBe('PATCH');
    expect(calls[5].body).toEqual({ fields: encodeFields({ email: 't@school.ac.th', staffId: 's9', role: 'pr_central', prDepartments: ['d1'], disabled: false }) });
    expect(calls[6].body).toEqual({ fields: encodeFields({ uid: 'newuid' }) });
  });
  it('defaults role=teacher, prDepartments=[]; no displayName sent', async () => {
    const { calls } = await call(create());
    expect(idtCalls(calls)[0].body).toEqual({ email: 't@school.ac.th', password: 'secret123' });
    expect(calls.find((c) => c.url === `${DOC}/users/newuid`).body)
      .toEqual({ fields: encodeFields({ email: 't@school.ac.th', staffId: 's9', role: 'teacher', prDepartments: [], disabled: false }) });
  });
  it('lowercases email', async () => {
    const { calls } = await call(create({ email: 'T@School.AC.th' }));
    expect(idtCalls(calls)[0].body.email).toBe('t@school.ac.th');
  });
  it('staff doc missing → 400 INVALID_INPUT, no IDT call', async () => {
    const { res, body, calls } = await call(create(), { staffDoc: null });
    expect(res.status).toBe(400);
    expect(body.error).toEqual({ code: 'INVALID_INPUT', message: 'ไม่พบข้อมูลบุคลากร' });
    expect(idtCalls(calls)).toHaveLength(0);
  });
  it('staff already linked → 409 STAFF_LINKED, no IDT call', async () => {
    const { res, body, calls } = await call(create(), { staffDoc: { uid: 'other' } });
    expect(res.status).toBe(409);
    expect(body.error).toEqual({ code: 'STAFF_LINKED', message: 'บุคลากรนี้มีบัญชีอยู่แล้ว' });
    expect(idtCalls(calls)).toHaveLength(0);
  });
  it('staff with uid:null is treated as unlinked', async () => {
    expect((await call(create(), { staffDoc: { uid: null } })).res.status).toBe(201);
  });
  const exists = { '/accounts': { status: 400, body: { error: { message: 'EMAIL_EXISTS' } } } };
  it('EMAIL_EXISTS and users doc exists → 409 EMAIL_EXISTS (lookup + users GET, no writes)', async () => {
    const { res, body, calls } = await call(create(), {
      idt: { ...exists, '/accounts:lookup': { status: 200, body: { users: [{ localId: 'old1' }] } } },
      existingUsers: { old1: { role: 'teacher' } },
    });
    expect(res.status).toBe(409); expect(body.error.code).toBe('EMAIL_EXISTS');
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
    expect(idtCalls(calls).map((c) => c.url)).toEqual([`${IDT}/accounts`, `${IDT}/accounts:lookup`]);
  });
  it('orphan recovery: EMAIL_EXISTS, no users doc → password reset, link, 201 recovered', async () => {
    const { res, body, calls } = await call(create(), {
      idt: { ...exists, '/accounts:lookup': { status: 200, body: { users: [{ localId: 'orph1' }] } } },
    });
    expect(res.status).toBe(201);
    expect(body).toEqual({ uid: 'orph1', recovered: true });
    expect(calls.map((c) => c.url).slice(3)).toEqual([
      `${DOC}/staff/s9`,
      `${IDT}/accounts`,
      `${IDT}/accounts:lookup`,
      `${DOC}/users/orph1`,
      `${IDT}/accounts:update`,
      `${DOC}/users/orph1`,
      `${DOC}/staff/s9?updateMask.fieldPaths=uid&currentDocument.exists=true`,
    ]);
    expect(calls.find((c) => c.url === `${IDT}/accounts:lookup`).body).toEqual({ email: ['t@school.ac.th'] });
    expect(calls.find((c) => c.url === `${IDT}/accounts:update`).body).toEqual({ localId: 'orph1', password: 'secret123' });
  });
  it('EMAIL_EXISTS with unusable lookup result → 409 as before', async () => {
    const { res } = await call(create(), { idt: { ...exists, '/accounts:lookup': { status: 200, body: { users: [{ localId: '../x' }] } } } });
    expect(res.status).toBe(409);
  });
  it('weak password → 400 WEAK_PASSWORD, no IDT call', async () => {
    const { res, body, calls } = await call(create({ password: '1234567' }));
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('WEAK_PASSWORD');
    expect(body.error.message).toBe('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    expect(idtCalls(calls)).toHaveLength(0);
  });
  it('duplicate email → 409 EMAIL_EXISTS, no firestore writes', async () => {
    const { res, body, calls } = await call(create(), { idt: { '/accounts': { status: 400, body: { error: { message: 'EMAIL_EXISTS' } } } } });
    expect(res.status).toBe(409);
    expect(body.error).toEqual({ code: 'EMAIL_EXISTS', message: 'อีเมลนี้มีผู้ใช้แล้ว' });
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });
  it('IDT WEAK_PASSWORD with suffix → 400 WEAK_PASSWORD; INVALID_EMAIL → 400 INVALID_INPUT; other → 500', async () => {
    const m = (message) => ({ idt: { '/accounts': { status: 400, body: { error: { message } } } } });
    expect((await call(create(), m('WEAK_PASSWORD : Password should be at least 6 characters'))).body.error.code).toBe('WEAK_PASSWORD');
    expect((await call(create(), m('INVALID_EMAIL'))).body.error.code).toBe('INVALID_INPUT');
    const r = await call(create(), m('OPERATION_NOT_ALLOWED'));
    expect(r.res.status).toBe(500); expect(r.body.error.code).toBe('INTERNAL');
  });
  it('firestore failure after account creation → 500 INTERNAL, no leak', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res, body } = await call(create(), { failPatch: '/users/newuid' });
    expect(res.status).toBe(500);
    expect(body.error).toEqual({ code: 'INTERNAL', message: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่' });
    expect(JSON.stringify(body)).not.toContain('firestore');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  for (const [_n, extra] of [
    ['bad email', { email: 'nope' }],
    ['bad staffId', { staffId: '../users/x' }],
    ['empty staffId', { staffId: '' }],
    ['bad role', { role: 'root' }],
    ['prDepartments not array', { prDepartments: 'd1' }],
    ['prDepartments bad id', { prDepartments: ['a/b'] }],
    ['displayName not string', { displayName: 5 }],
  ]) {
    it(`invalid input: ${_n} → 400 INVALID_INPUT, no IDT call`, async () => {
      const { res, body, calls } = await call(create(extra));
      expect(res.status).toBe(400);
      expect(body.error).toEqual({ code: 'INVALID_INPUT', message: 'ข้อมูลไม่ถูกต้อง' });
      expect(idtCalls(calls)).toHaveLength(0);
    });
  }
});

describe('auth', () => {
  it('teacher caller → 403, no IDT call', async () => {
    const { res, calls } = await call(create(), { callerDoc: { role: 'teacher' } });
    expect(res.status).toBe(403);
    expect(idtCalls(calls)).toHaveLength(0);
  });
  it('disabled admin → 403', async () => {
    const { res } = await call({ action: 'setDisabled', uid: 'u2', disabled: true }, { callerDoc: { role: 'admin', disabled: true } });
    expect(res.status).toBe(403);
  });
  it('bad JSON without credentials → 401 (auth before parse)', async () => {
    const { res } = await call(null, {}, { authed: false, rawBody: '{nope' });
    expect(res.status).toBe(401);
  });
  it('no Authorization → 401', async () => {
    const { res, body } = await call(create(), {}, { authed: false });
    expect(res.status).toBe(401); expect(body.error.code).toBe('UNAUTHENTICATED');
  });
  it('infrastructure error → 500 INTERNAL', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const request = new Request('https://x/', { method: 'POST', headers: { Authorization: `Bearer ${await sign(good())}` }, body: '{}' });
    const fetchFn = async (url) => { if (String(url) === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }); throw new Error('secret network detail'); };
    const res = await onRequest({ request, env, data: { deps: { fetchFn, now: NOW } } });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
    spy.mockRestore();
  });
});

describe('setPassword', () => {
  it('200 ok via accounts:update', async () => {
    const { res, body, calls } = await call({ action: 'setPassword', uid: 'u2', password: 'newpass123' });
    expect(res.status).toBe(200); expect(body).toEqual({ ok: true });
    expect(idtCalls(calls).map((c) => [c.url, c.body])).toEqual([[`${IDT}/accounts:update`, { localId: 'u2', password: 'newpass123' }]]);
  });
  it('weak → 400; bad uid → 400 INVALID_INPUT; USER_NOT_FOUND → 404', async () => {
    expect((await call({ action: 'setPassword', uid: 'u2', password: 'short' })).body.error.code).toBe('WEAK_PASSWORD');
    expect((await call({ action: 'setPassword', uid: 'a/b', password: 'newpass123' })).body.error.code).toBe('INVALID_INPUT');
    const r = await call({ action: 'setPassword', uid: 'u2', password: 'newpass123' }, { idt: { '/accounts:update': { status: 400, body: { error: { message: 'USER_NOT_FOUND' } } } } });
    expect(r.res.status).toBe(404);
    expect(r.body.error).toEqual({ code: 'NOT_FOUND', message: 'ไม่พบผู้ใช้' });
  });
});

describe('setDisabled', () => {
  it('200: IDT disableUser then users/{uid}.disabled patched with mask', async () => {
    const { res, body, calls } = await call({ action: 'setDisabled', uid: 'u2', disabled: true });
    expect(res.status).toBe(200); expect(body).toEqual({ ok: true });
    const tail = calls.slice(-2);
    expect(tail[0].url).toBe(`${IDT}/accounts:update`);
    expect(tail[0].body).toEqual({ localId: 'u2', disableUser: true });
    expect(tail[1].url).toBe(`${DOC}/users/u2?updateMask.fieldPaths=disabled&currentDocument.exists=true`);
    expect(tail[1].body).toEqual({ fields: encodeFields({ disabled: true }) });
  });
  it('enable works (disabled:false)', async () => {
    const { res, calls } = await call({ action: 'setDisabled', uid: 'u2', disabled: false });
    expect(res.status).toBe(200);
    expect(idtCalls(calls)[0].body).toEqual({ localId: 'u2', disableUser: false });
  });
  it('self → 400 CANNOT_DISABLE_SELF, no IDT call', async () => {
    const { res, body, calls } = await call({ action: 'setDisabled', uid: 'u1', disabled: true });
    expect(res.status).toBe(400);
    expect(body.error).toEqual({ code: 'CANNOT_DISABLE_SELF', message: 'ไม่สามารถปิดบัญชีของตัวเองได้' });
    expect(idtCalls(calls)).toHaveLength(0);
  });
  it('users doc PATCH carries the exists precondition', async () => {
    const { calls } = await call({ action: 'setDisabled', uid: 'u2', disabled: true });
    expect(calls.at(-1).url).toBe(`${DOC}/users/u2?updateMask.fieldPaths=disabled&currentDocument.exists=true`);
  });
  for (const status of [404, 400]) {
    it(`missing users doc (firestore ${status}) → 404 NOT_FOUND, not 500`, async () => {
      const { res, body } = await call({ action: 'setDisabled', uid: 'u2', disabled: true }, { failPatch: '/users/u2', failPatchStatus: status });
      expect(res.status).toBe(404);
      expect(body.error).toEqual({ code: 'NOT_FOUND', message: 'ไม่พบผู้ใช้' });
    });
  }
  it('other firestore failure → 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res } = await call({ action: 'setDisabled', uid: 'u2', disabled: true }, { failPatch: '/users/u2', failPatchStatus: 500 });
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
  it('non-boolean disabled → 400 INVALID_INPUT', async () => {
    expect((await call({ action: 'setDisabled', uid: 'u2', disabled: 'true' })).body.error.code).toBe('INVALID_INPUT');
  });
});

describe('misc', () => {
  it('unknown action → 400 INVALID_INPUT', async () => {
    const { res, body } = await call({ action: 'nuke' });
    expect(res.status).toBe(400); expect(body.error.code).toBe('INVALID_INPUT');
  });
  it('malformed JSON body → 400 INVALID_INPUT', async () => {
    const { res, body } = await call(null, {}, { rawBody: '{nope' });
    expect(res.status).toBe(400); expect(body.error.code).toBe('INVALID_INPUT');
  });
  it('JSON null / array body → 400 INVALID_INPUT', async () => {
    expect((await call(null, {}, { rawBody: 'null' })).res.status).toBe(400);
    expect((await call([], {})).res.status).toBe(400);
  });
  it('GET → 405 METHOD_NOT_ALLOWED', async () => {
    const { res, body } = await call(null, {}, { method: 'GET' });
    expect(res.status).toBe(405); expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
    expect(res.headers.get('Allow')).toBe('POST');
  });
  it('emulator env: uses emulator IDT and firestore hosts', async () => {
    const e = { FIREBASE_PROJECT_ID: DEMO, FIREBASE_AUTH_EMULATOR_HOST: 'h:9099', FIRESTORE_EMULATOR_HOST: 'h:8080' };
    const urls = [];
    const fetchFn = async (url, init = {}) => {
      urls.push(String(url));
      if (String(url).includes(':9099')) return new Response(JSON.stringify({ localId: 'n1' }), { status: 200 });
      return new Response(JSON.stringify({ fields: encodeFields({ role: 'admin' }) }), { status: 200 });
    };
    const un = (o) => `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(o)).toString('base64url')}.`;
    const request = new Request('https://x/', { method: 'POST', headers: { Authorization: `Bearer ${un(good({ aud: DEMO, iss: `https://securetoken.google.com/${DEMO}` }))}` }, body: JSON.stringify(create()) });
    const res = await onRequest({ request, env: e, data: { deps: { fetchFn, now: NOW } } });
    expect(res.status).toBe(201);
    expect(urls).toEqual([
      `http://h:8080/v1/projects/${DEMO}/databases/(default)/documents/users/u1`,
      `http://h:8080/v1/projects/${DEMO}/databases/(default)/documents/staff/s9`,
      `http://h:9099/identitytoolkit.googleapis.com/v1/projects/${DEMO}/accounts`,
      `http://h:8080/v1/projects/${DEMO}/databases/(default)/documents/users/n1`,
      `http://h:8080/v1/projects/${DEMO}/databases/(default)/documents/staff/s9?updateMask.fieldPaths=uid&currentDocument.exists=true`,
    ]);
  });
});
