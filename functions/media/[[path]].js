// GET /media/<path> — serves images from the R2 binding MEDIA.
import { errorJson } from '../_lib/http.js';
import { parseMediaPath } from '../_lib/media-auth.js';

const notFound = () => errorJson(404, 'NOT_FOUND', 'ไม่พบไฟล์');

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const res = errorJson(405, 'METHOD_NOT_ALLOWED', 'ไม่รองรับวิธีเรียกนี้');
    res.headers.set('Allow', 'GET, HEAD');
    return res;
  }
  const segs = params && params.path;
  const path = Array.isArray(segs) ? segs.join('/') : segs;
  if (!parseMediaPath(path)) return notFound();
  try {
    const obj = await env.MEDIA.get(path);
    if (!obj) return notFound();
    const headers = new Headers({
      'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    if (obj.httpEtag) headers.set('ETag', obj.httpEtag);
    return new Response(request.method === 'HEAD' ? null : obj.body, { status: 200, headers });
  } catch (e) {
    console.error('media serve error:', e);
    return errorJson(500, 'INTERNAL', 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่');
  }
}
