// POST /api/admin/users — admin-only account management (create / setPassword / setDisabled).
// Identity Toolkit (Admin REST) for auth accounts, Firestore REST for users/staff docs.
import { requireAdmin, identityToolkitBase, isEmulator, firestorePatch } from '../../_lib/google-auth.js';
import { json, errorJson } from '../../_lib/http.js';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['admin', 'pr_central', 'teacher'];

const invalid = () => errorJson(400, 'INVALID_INPUT', 'ข้อมูลไม่ถูกต้อง');
const weak = () => errorJson(400, 'WEAK_PASSWORD', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
const internal = () => errorJson(500, 'INTERNAL', 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่');

const isId = (v) => typeof v === 'string' && ID_RE.test(v);
const strongEnough = (v) => typeof v === 'string' && v.length >= 8;

// Calls Identity Toolkit; on failure throws a mapped Response (or a plain Error for unknown codes).
async function idt(env, accessToken, fetchFn, path, payload) {
  const res = await fetchFn(`${identityToolkitBase(env)}/projects/${env.FIREBASE_PROJECT_ID}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (res.ok) return data || {};
  const msg = String((data && data.error && data.error.message) || '');
  if (msg === 'EMAIL_EXISTS') throw errorJson(409, 'EMAIL_EXISTS', 'อีเมลนี้มีผู้ใช้แล้ว');
  if (msg === 'USER_NOT_FOUND') throw errorJson(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');
  if (msg.startsWith('WEAK_PASSWORD')) throw weak();
  if (msg === 'INVALID_EMAIL') throw invalid();
  throw new Error(`identity toolkit ${path} failed: ${res.status} ${msg}`);
}

async function readBody(request) {
  try {
    const b = await request.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
  } catch { return null; }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const deps = (context.data && context.data.deps) || {};
  const fetchFn = deps.fetchFn || fetch;
  try {
    const { uid: callerUid, accessToken } = await requireAdmin(request, env, deps);
    const fsOpts = { fetchFn, firestoreHost: isEmulator(env) ? env.FIRESTORE_EMULATOR_HOST : undefined };
    const pid = env.FIREBASE_PROJECT_ID;

    const b = await readBody(request);
    if (!b) return invalid();

    if (b.action === 'create') {
      const { email, password, staffId, displayName } = b;
      const role = b.role === undefined ? 'teacher' : b.role;
      const prDepartments = b.prDepartments === undefined ? [] : b.prDepartments;
      if (typeof email !== 'string' || !EMAIL_RE.test(email) || !isId(staffId) || !ROLES.includes(role)
        || !Array.isArray(prDepartments) || !prDepartments.every(isId)
        || (displayName !== undefined && typeof displayName !== 'string')) return invalid();
      if (!strongEnough(password)) return weak();

      const payload = { email, password };
      if (displayName) payload.displayName = displayName;
      const { localId } = await idt(env, accessToken, fetchFn, '/accounts', payload);
      if (!localId) throw new Error('identity toolkit create returned no localId');

      // If a write below fails the account stays; the admin can retry linking.
      await firestorePatch(pid, `users/${localId}`, { email, staffId, role, prDepartments, disabled: false }, accessToken, fsOpts);
      await firestorePatch(pid, `staff/${staffId}`, { uid: localId }, accessToken, { ...fsOpts, updateMask: ['uid'] });
      return json({ uid: localId }, 201);
    }

    if (b.action === 'setPassword') {
      if (!isId(b.uid)) return invalid();
      if (!strongEnough(b.password)) return weak();
      await idt(env, accessToken, fetchFn, '/accounts:update', { localId: b.uid, password: b.password });
      return json({ ok: true });
    }

    if (b.action === 'setDisabled') {
      if (!isId(b.uid) || typeof b.disabled !== 'boolean') return invalid();
      if (b.uid === callerUid && b.disabled) return errorJson(400, 'CANNOT_DISABLE_SELF', 'ไม่สามารถปิดบัญชีของตัวเองได้');
      await idt(env, accessToken, fetchFn, '/accounts:update', { localId: b.uid, disableUser: b.disabled });
      await firestorePatch(pid, `users/${b.uid}`, { disabled: b.disabled }, accessToken, { ...fsOpts, updateMask: ['disabled'] });
      return json({ ok: true });
    }

    return invalid();
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('admin/users error:', e);
    return internal();
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return errorJson(405, 'METHOD_NOT_ALLOWED', 'ไม่รองรับวิธีเรียกนี้');
  }
  return onRequestPost(context);
}
