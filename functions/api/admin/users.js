// POST /api/admin/users — admin-only account management (create / setPassword / setDisabled).
// Identity Toolkit (Admin REST) for auth accounts, Firestore REST for users/staff docs.
import { requireAdmin, identityToolkitBase, isEmulator, firestorePatch, firestoreGet } from '../../_lib/google-auth.js';
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
  // context.data.deps is a test-only seam for injecting fetchFn/now; production never sets it.
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

      const staff = await firestoreGet(pid, `staff/${staffId}`, accessToken, fsOpts);
      if (!staff) return errorJson(400, 'INVALID_INPUT', 'ไม่พบข้อมูลบุคลากร');
      if (staff.uid !== undefined && staff.uid !== null && staff.uid !== '') {
        return errorJson(409, 'STAFF_LINKED', 'บุคลากรนี้มีบัญชีอยู่แล้ว');
      }

      const mail = email.toLowerCase();
      const payload = { email: mail, password };
      if (displayName) payload.displayName = displayName;

      const link = async (uid) => {
        // If a write fails the account stays; retrying create recovers it (see below).
        await firestorePatch(pid, `users/${uid}`, { email: mail, staffId, role, prDepartments, disabled: false }, accessToken, fsOpts);
        await firestorePatch(pid, `staff/${staffId}`, { uid }, accessToken, { ...fsOpts, updateMask: ['uid'], mustExist: true });
      };

      let localId;
      try {
        ({ localId } = await idt(env, accessToken, fetchFn, '/accounts', payload));
      } catch (e) {
        if (!(e instanceof Response) || e.status !== 409) throw e;
        // Email taken: if the account has no users doc it is our orphan from a failed earlier create.
        const found = await idt(env, accessToken, fetchFn, '/accounts:lookup', { email: [mail] });
        const existing = found.users && found.users[0] && found.users[0].localId;
        if (!isId(existing)) throw e;
        if (await firestoreGet(pid, `users/${existing}`, accessToken, fsOpts)) throw e;
        await idt(env, accessToken, fetchFn, '/accounts:update', { localId: existing, password });
        await link(existing);
        return json({ uid: existing, recovered: true }, 201);
      }
      if (!localId) throw new Error('identity toolkit create returned no localId');
      await link(localId);
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
      try {
        await firestorePatch(pid, `users/${b.uid}`, { disabled: b.disabled }, accessToken, { ...fsOpts, updateMask: ['disabled'], mustExist: true });
      } catch (e) {
        // failed currentDocument.exists precondition surfaces as 404 NOT_FOUND (or 400 FAILED_PRECONDITION)
        if (e && (e.status === 404 || e.status === 400)) throw errorJson(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');
        throw e;
      }
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
    const res = errorJson(405, 'METHOD_NOT_ALLOWED', 'ไม่รองรับวิธีเรียกนี้');
    res.headers.set('Allow', 'POST');
    return res;
  }
  return onRequestPost(context);
}
