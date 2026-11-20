import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildOgTags, injectIntoHead, absoluteImage, onRequestGet } from '../../functions/news/[id].js';
import { encodeFields } from '../../functions/_lib/google-auth.js';

const PID = 'proj-x';
const DOC = (id) => `https://firestore.googleapis.com/v1/projects/${PID}/databases/(default)/documents/news/${id}?key=KEY`;
const PAGE = '<html><head><title>t</title></head><body>detail</body></html>';
const NOTFOUND = '<html><head><title>404</title></head><body>ไม่พบหน้า</body></html>';

describe('buildOgTags', () => {
  it('escapes & < > " \' in content attributes', () => {
    const out = buildOgTags({ title: 'ข่าว "A" & B', description: "<x>'y'", image: 'https://e.com/a.jpg?a=1&b=2', url: 'https://e.com/news/1', siteName: 'S' });
    expect(out).toContain('content="ข่าว &quot;A&quot; &amp; B"');
    expect(out).toContain('content="&lt;x&gt;&#39;y&#39;"');
    expect(out).toContain('a=1&amp;b=2');
    expect(out).toContain('property="og:type" content="article"');
    expect(out).toContain('name="twitter:card" content="summary_large_image"');
    expect(out).toContain('property="og:url" content="https://e.com/news/1"');
  });
  it('omits og:image when no image', () => {
    const out = buildOgTags({ title: 't', description: 'd', url: 'u', siteName: 's' });
    expect(out).not.toContain('og:image');
  });
});

describe('injectIntoHead', () => {
  it('inserts before </head>', () => {
    expect(injectIntoHead('<html><head><title>t</title></head>', '<meta x>')).toBe('<html><head><title>t</title><meta x></head>');
  });
  it('replaces the existing <title> when tags carry a title', () => {
    const out = injectIntoHead('<head><title>old</title></head>', '<title>new</title><meta x>');
    expect(out).toBe('<head><title>new</title><meta x></head>');
  });
});

describe('onRequestGet', () => {
  let realFetch;
  const assets = { fetch: vi.fn(async (u) => {
    const p = new URL(String(u.url || u)).pathname;
    if (p === '/news-detail.html') return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } });
    if (p === '/404.html') return new Response(NOTFOUND, { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response('', { status: 404 });
  }) };
  const env = { FIREBASE_PROJECT_ID: PID, FIREBASE_API_KEY: 'KEY', ASSETS: assets };
  const call = (id) => onRequestGet({ request: new Request(`https://school.example/news/${id}`), env, params: { id } });
  const mockDoc = (status, data) => { globalThis.fetch = vi.fn(async () => new Response(data ? JSON.stringify({ fields: encodeFields(data) }) : '', { status })); };

  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; });

  it('og: published → 200 with og:title', async () => {
    mockDoc(200, { title: 'ข่าวดี & "ใหม่"', bodyHtml: '<p>สวัสดี <b>ครับ</b></p>', published: true, coverUrl: 'https://img/c.jpg', images: ['https://img/1.jpg'] });
    const res = await call('abc_1-Z');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('property="og:title" content="ข่าวดี &amp; &quot;ใหม่&quot;"');
    expect(html).toContain('<title>ข่าวดี &amp; &quot;ใหม่&quot; - โรงเรียนชัยนาทพิทยาคม</title>');
    expect(html).toContain('property="og:image" content="https://img/c.jpg"');
    expect(html).toContain('property="og:url" content="https://school.example/news/abc_1-Z"');
    expect(html).toContain('content="สวัสดี ครับ"');
    expect(globalThis.fetch.mock.calls[0][0]).toBe(DOC('abc_1-Z'));
  });
  it('og: image falls back to images[0]', async () => {
    mockDoc(200, { title: 't', bodyHtml: '', published: true, images: ['https://img/1.jpg'] });
    const html = await (await call('a')).text();
    expect(html).toContain('property="og:image" content="https://img/1.jpg"');
  });
  it('og: description is the first 160 chars of stripped body', async () => {
    mockDoc(200, { title: 't', bodyHtml: `<p>${'ก'.repeat(300)}</p>`, published: true });
    const html = await (await call('a')).text();
    expect(html).toContain(`property="og:description" content="${'ก'.repeat(160)}"`);
  });
  it('og: unpublished → 404', async () => {
    mockDoc(200, { title: 't', bodyHtml: '', published: false });
    const res = await call('abc');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('ไม่พบหน้า');
  });
  it('og: missing → 404', async () => {
    mockDoc(404);
    const res = await call('abc');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('ไม่พบหน้า');
  });
  it('og: firestore error or network failure → 404, never 500', async () => {
    mockDoc(403);
    expect((await call('abc')).status).toBe(404);
    globalThis.fetch = vi.fn(async () => { throw new Error('boom'); });
    expect((await call('abc')).status).toBe(404);
  });
  it('og: invalid id → 404 without calling firestore', async () => {
    globalThis.fetch = vi.fn();
    const res = await call('a/../b');
    expect(res.status).toBe(404);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('og: non-http(s) image is not emitted', async () => {
    mockDoc(200, { title: 't', bodyHtml: '', published: true, coverUrl: 'javascript:alert(1)', images: ['https://img/1.jpg'] });
    const html = await (await call('a')).text();
    expect(html).not.toContain('og:image');
    expect(html).not.toContain('javascript:');
  });
  it('og: FIRESTORE_EMULATOR_HOST alone still uses the production URL', async () => {
    mockDoc(200, { title: 't', bodyHtml: '', published: true });
    await onRequestGet({ request: new Request('https://school.example/news/a'), env: { ...env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }, params: { id: 'a' } });
    expect(globalThis.fetch.mock.calls[0][0]).toBe(DOC('a'));
  });
  it('og: both emulator vars but a non-demo project → production URL', async () => {
    mockDoc(200, { title: 't', bodyHtml: '', published: true });
    await onRequestGet({ request: new Request('https://school.example/news/a'), env: { ...env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, params: { id: 'a' } });
    expect(globalThis.fetch.mock.calls[0][0]).toBe(DOC('a'));
  });
  it('og: both emulator vars → emulator URL without key', async () => {
    mockDoc(200, { title: 't', bodyHtml: '', published: true });
    await onRequestGet({ request: new Request('https://school.example/news/a'), env: { ...env, FIREBASE_PROJECT_ID: 'demo-x', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, params: { id: 'a' } });
    expect(globalThis.fetch.mock.calls[0][0]).toBe(`http://127.0.0.1:8080/v1/projects/demo-x/databases/(default)/documents/news/a`);
  });
});

describe('absoluteImage', () => {
  it('og: relative coverUrl made absolute', () => {
    expect(absoluteImage('/media/news/n1/a.jpg?v=1', 'https://www.chainatpit.ac.th')).toBe('https://www.chainatpit.ac.th/media/news/n1/a.jpg?v=1');
  });
  it('keeps absolute http(s), rejects unsafe and protocol-relative', () => {
    expect(absoluteImage('https://x/y.jpg', 'https://o')).toBe('https://x/y.jpg');
    expect(absoluteImage('javascript:alert(1)', 'https://o')).toBeUndefined();
    expect(absoluteImage('//evil/x.jpg', 'https://o')).toBeUndefined();
    expect(absoluteImage('', 'https://o')).toBeUndefined();
  });
});
