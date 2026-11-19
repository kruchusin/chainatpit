// Pure helpers for the news editor (no imports from URLs: testable in Node).
import { canSaveNews, isAdmin, isPrCentral } from './permissions.js';

// Keys the client may write on save (updatedAt is added by data.saveNews; authorUid/createdAt only at create).
export const NEWS_WRITE_KEYS = ['title', 'bodyHtml', 'coverUrl', 'images', 'departmentIds', 'pinned', 'published', 'updatedAt'];

export const MSG_TITLE = 'กรุณากรอกหัวข้อข่าว';
export const MSG_DEPT = 'กรุณาเลือกฝ่ายอย่างน้อย 1 ฝ่าย';
export const MSG_DENIED = 'ไม่มีสิทธิ์บันทึกข่าวนี้';

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com'];

// Any YouTube link -> https://www.youtube.com/embed/<id> (the only iframe src the sanitizer keeps), else null.
export function youtubeEmbedUrl(input) {
  let u;
  try { u = new URL(String(input || '').trim()); } catch (_) { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  let id = null;
  if (u.hostname === 'youtu.be') {
    id = u.pathname.slice(1).split('/')[0];
  } else if (YT_HOSTS.includes(u.hostname)) {
    const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
    id = m ? m[1] : u.pathname === '/watch' ? u.searchParams.get('v') : null;
  }
  return id && YT_ID.test(id) ? `https://www.youtube.com/embed/${id}` : null;
}

// -> { data } ready for saveNews, or { error } (Thai message). `sanitize` is createSanitizer(DOMPurify).
// pinned is only ever emitted for admin / pr_central; a dept PR never sends it (new or existing).
export function buildNewsPayload({ profile, form, existing, sanitize }) {
  if (typeof sanitize !== 'function') throw new Error('sanitize is required');
  const title = String(form.title ?? '').trim();
  if (!title) return { error: MSG_TITLE };
  const departmentIds = [...new Set(Array.isArray(form.departmentIds) ? form.departmentIds : [])];
  const central = isAdmin(profile) || isPrCentral(profile);
  if (!central && departmentIds.length === 0) return { error: MSG_DEPT };
  const oldIds = existing ? (Array.isArray(existing.departmentIds) ? existing.departmentIds : []) : null;
  if (!canSaveNews(profile, oldIds, departmentIds)) return { error: MSG_DENIED };
  const data = {
    title,
    bodyHtml: sanitize(form.bodyHtml ?? ''), // sanitizer also drops data:/relative <img>
    coverUrl: form.coverUrl || '',
    images: Array.isArray(form.images) ? [...form.images] : [],
    departmentIds,
    published: !!form.published,
  };
  if (central) data.pinned = !!form.pinned;
  return { data };
}
