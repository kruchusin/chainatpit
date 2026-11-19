// Pure helpers for POST /api/admin/users (no URL imports: testable in Node).
export const GENERIC_ERROR = 'เกิดข้อผิดพลาด กรุณาลองใหม่';

// Server error shape: {error:{code,message}} (functions/_lib/http.js errorJson).
export async function parseAdminResponse(res) {
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON body */ }
  if (res.ok) return body && typeof body === 'object' ? body : {};
  const e = body && body.error;
  const err = new Error((e && typeof e.message === 'string' && e.message) || GENERIC_ERROR);
  if (e && typeof e.code === 'string') err.code = e.code;
  err.status = res.status;
  throw err;
}

export async function callAdminUsersWith({ fetchFn, getToken, action, payload }) {
  let res;
  try {
    const token = await getToken();
    res = await fetchFn('/api/admin/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, action }),
    });
  } catch (e) {
    console.error(e);
    throw new Error(GENERIC_ERROR);
  }
  return parseAdminResponse(res);
}
