// GET /news/{id}: serves news-detail.html with Open Graph meta injected.
// Missing / unpublished / unreadable news -> /404.html with status 404 (never 500).
// Workers Web APIs only; no npm imports.
import { decodeFields, isEmulator } from '../_lib/google-auth.js';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const DEFAULT_SITE_NAME = 'โรงเรียนชัยนาทพิทยาคม';
const DESC_LEN = 160;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function buildOgTags({ title, description, image, url, siteName }) {
  const tags = [
    `<title>${esc(title)}${siteName ? ` - ${esc(siteName)}` : ''}</title>`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:site_name" content="${esc(siteName)}">`,
  ];
  if (image) tags.push(`<meta property="og:image" content="${esc(image)}">`);
  tags.push(
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
  );
  if (image) tags.push(`<meta name="twitter:image" content="${esc(image)}">`);
  return tags.join('');
}

// Relative /media/... URLs become absolute (crawlers need it); only http(s) and single-slash paths pass.
export function absoluteImage(raw, origin) {
  const v = String(raw || '');
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith('/') && !v.startsWith('//')) return origin + v;
  return undefined;
}

// Pure string helper. A <title> in `tags` replaces the page's existing <title>.
export function injectIntoHead(html, tags) {
  let out = html;
  if (/<title>/i.test(tags)) out = out.replace(/<title>[\s\S]*?<\/title>/i, '');
  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, () => `${tags}</head>`);
  return tags + out;
}

function describe(bodyHtml) {
  const text = String(bodyHtml || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, DESC_LEN).join('');
}

// ASSETS.fetch may answer /x.html with a 308 to /x (Pages clean URLs): follow.
async function fetchAsset(env, origin, path) {
  let target = new URL(path, origin).toString();
  for (let i = 0; i < 3; i++) {
    const res = await env.ASSETS.fetch(new Request(target));
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) { target = new URL(loc, target).toString(); continue; }
    return res;
  }
  throw new Error('asset redirect loop');
}

async function notFound(env, origin) {
  let body = 'ไม่พบหน้าที่ต้องการ';
  let type = 'text/plain; charset=utf-8';
  try {
    const res = await fetchAsset(env, origin, '/404.html');
    if (res.ok) { body = await res.text(); type = 'text/html; charset=utf-8'; }
  } catch { /* fall through to plain text */ }
  return new Response(body, { status: 404, headers: { 'content-type': type } });
}

function docUrl(env, id) {
  const pid = env.FIREBASE_PROJECT_ID;
  const path = `/v1/projects/${pid}/databases/(default)/documents/news/${id}`;
  if (isEmulator(env)) return `http://${env.FIRESTORE_EMULATOR_HOST}${path}`; // local dev/e2e
  return `https://firestore.googleapis.com${path}?key=${encodeURIComponent(env.FIREBASE_API_KEY || '')}`;
}

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const id = Array.isArray(params && params.id) ? params.id[0] : params && params.id;
  try {
    if (!ID_RE.test(String(id || ''))) return await notFound(env, url.origin);

    const res = await fetch(docUrl(env, id));
    if (res.status !== 200) return await notFound(env, url.origin);
    const news = decodeFields((await res.json()).fields);
    if (news.published !== true) return await notFound(env, url.origin);

    const page = await fetchAsset(env, url.origin, '/news-detail.html');
    if (!page.ok) return await notFound(env, url.origin);
    const rawImage = news.coverUrl || (Array.isArray(news.images) && news.images[0]) || '';
    const image = absoluteImage(rawImage, new URL(request.url).origin);
    const tags = buildOgTags({
      title: news.title || DEFAULT_SITE_NAME,
      description: describe(news.bodyHtml),
      image,
      url: request.url,
      siteName: env.SITE_NAME || DEFAULT_SITE_NAME,
    });
    return new Response(injectIntoHead(await page.text(), tags), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' },
    });
  } catch {
    return await notFound(env, url.origin);
  }
}
