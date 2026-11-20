// Pure helpers for /api/media (no URL imports: testable in Node).
// Server error shape: {error:{code,message}} (functions/_lib/http.js errorJson).
import { parseAdminResponse, GENERIC_ERROR } from './admin-api.js';

async function send(fetchFn, getToken, init) {
  try {
    const token = await getToken();
    return await fetchFn('/api/media', { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  } catch (e) {
    console.error(e);
    throw new Error(GENERIC_ERROR);
  }
}

export async function uploadMediaWith(fetchFn, getToken, path, blob) {
  const form = new FormData();
  form.append('path', path);
  form.append('file', blob, 'image.jpg');
  const body = await parseAdminResponse(await send(fetchFn, getToken, { method: 'POST', headers: {}, body: form }));
  return body.url;
}

export async function deleteMediaWith(fetchFn, getToken, target) {
  const body = await parseAdminResponse(await send(fetchFn, getToken, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(target),
  }));
  return body.deleted;
}
