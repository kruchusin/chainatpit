// POST /api/media (upload) and DELETE /api/media (single path or whole prefix) for R2 binding MEDIA.
import { authenticate, firestoreGet } from '../_lib/google-auth.js';
import { json, errorJson } from '../_lib/http.js';
import { parseMediaPath, parseMediaPrefix, targetDocPath, canWriteMedia } from '../_lib/media-auth.js';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = 2.5 * 1024 * 1024; // multipart overhead headroom, checked before reading the body
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const CACHE = 'public, max-age=31536000, immutable';
const DELETE_CHUNK = 1000;

const invalid = () => errorJson(400, 'INVALID_INPUT', 'ข้อมูลไม่ถูกต้อง');
const forbidden = () => errorJson(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ใช้งานส่วนนี้');
const internal = () => errorJson(500, 'INTERNAL', 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่');

async function loadTarget(a, parsed, fetchFn) {
  const p = targetDocPath(parsed);
  if (!p) return null;
  return firestoreGet(a.projectId, p, a.accessToken, { fetchFn, firestoreHost: a.firestoreHost });
}

async function handlePost(context, a, deps, fetchFn) {
  const { request, env } = context;
  if (!a.user || a.user.disabled === true) return forbidden();
  const len = Number(request.headers.get('content-length'));
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) return errorJson(413, 'TOO_LARGE', 'ไฟล์รูปใหญ่เกินไป');
  let form;
  try { form = await request.formData(); } catch { return invalid(); }
  const path = form.get('path');
  const file = form.get('file');
  const parsed = parseMediaPath(path);
  if (!parsed) return invalid();
  if (!file || typeof file === 'string' || typeof file.size !== 'number') return invalid();

  const target = await loadTarget(a, parsed, fetchFn);
  if (!canWriteMedia(a.user, parsed, target, a.uid)) return forbidden();

  if (!TYPES.includes(file.type)) return errorJson(415, 'UNSUPPORTED_TYPE', 'รองรับเฉพาะไฟล์รูป JPG, PNG, WebP หรือ GIF');
  if (file.size > MAX_BYTES) return errorJson(413, 'TOO_LARGE', 'ไฟล์รูปใหญ่เกินไป');

  await env.MEDIA.put(path, await file.arrayBuffer(), { httpMetadata: { contentType: file.type, cacheControl: CACHE } });
  const now = deps.now === undefined ? Date.now() : deps.now;
  return json({ url: `/media/${path}?v=${now}` }, 201);
}

async function handleDelete(context, a, fetchFn) {
  const { request, env } = context;
  if (!a.user || a.user.disabled === true) return forbidden();
  let b = null;
  try { b = await request.json(); } catch { /* invalid JSON */ }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return invalid();
  const hasPath = b.path !== undefined;
  const hasPrefix = b.prefix !== undefined;
  if (hasPath === hasPrefix) return invalid();

  if (hasPath) {
    const parsed = parseMediaPath(b.path);
    if (!parsed) return invalid();
    const target = await loadTarget(a, parsed, fetchFn);
    if (!canWriteMedia(a.user, parsed, target, a.uid, { forDelete: true })) return forbidden();
    await env.MEDIA.delete(b.path);
    return json({ deleted: 1 });
  }

  const pre = parseMediaPrefix(b.prefix);
  if (!pre) return invalid();
  const parsed = { kind: pre.kind, id: pre.id, file: null };
  const target = await loadTarget(a, parsed, fetchFn);
  if (!canWriteMedia(a.user, parsed, target, a.uid, { forDelete: true })) return forbidden();

  const keys = [];
  let cursor;
  for (;;) {
    const page = await env.MEDIA.list(cursor ? { prefix: b.prefix, cursor } : { prefix: b.prefix });
    for (const o of page.objects) keys.push(o.key);
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  for (let i = 0; i < keys.length; i += DELETE_CHUNK) await env.MEDIA.delete(keys.slice(i, i + DELETE_CHUNK));
  return json({ deleted: keys.length });
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method !== 'POST' && method !== 'DELETE') {
    const res = errorJson(405, 'METHOD_NOT_ALLOWED', 'ไม่รองรับวิธีเรียกนี้');
    res.headers.set('Allow', 'POST, DELETE');
    return res;
  }
  // context.data.deps is a test-only seam for injecting fetchFn/now; production never sets it.
  const deps = (context.data && context.data.deps) || {};
  const fetchFn = deps.fetchFn || fetch;
  try {
    const a = await authenticate(context.request, context.env, deps);
    return method === 'POST' ? await handlePost(context, a, deps, fetchFn) : await handleDelete(context, a, fetchFn);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('media error:', e);
    return internal();
  }
}
