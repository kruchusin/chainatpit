import { describe, it, expect, vi } from 'vitest';
import {
  buildNewsPayload, youtubeEmbedUrl, stripDataImages, NEWS_WRITE_KEYS,
} from '../../public/assets/js/lib/news-payload.js';

const admin = { uid: 'admin', role: 'admin', prDepartments: [], disabled: false };
const prc = { uid: 'prc', role: 'pr_central', prDepartments: [], disabled: false };
const prMath = { uid: 'prMath', role: 'teacher', prDepartments: ['math'], disabled: false };
const prMulti = { uid: 'prMulti', role: 'teacher', prDepartments: ['math', 'academic'], disabled: false };
const sanitize = (h) => h.replace(/<script[^>]*>.*?<\/script>/g, '');
const form = (o = {}) => ({
  title: ' หัวข้อ ', bodyHtml: '<p>x</p>', coverUrl: 'https://x/c.jpg', images: ['https://x/1.jpg'],
  departmentIds: ['math'], pinned: true, published: true, ...o,
});

describe('youtubeEmbedUrl', () => {
  it('normalizes the common YouTube URL shapes', () => {
    const want = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe(want);
    expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?si=a')).toBe(want);
    expect(youtubeEmbedUrl('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toBe(want);
    expect(youtubeEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(want);
  });
  it('rejects everything else', () => {
    expect(youtubeEmbedUrl('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeEmbedUrl('https://www.youtube.com.evil.com/embed/dQw4w9WgXcQ')).toBeNull();
    expect(youtubeEmbedUrl('javascript:alert(1)')).toBeNull();
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(youtubeEmbedUrl('')).toBeNull();
    expect(youtubeEmbedUrl(null)).toBeNull();
  });
});

describe('stripDataImages', () => {
  it('removes data: images only', () => {
    expect(stripDataImages('<p>a</p><img src="data:image/png;base64,AAA" alt="">')).toBe('<p>a</p>');
    expect(stripDataImages('<img alt="" src=" DATA:image/png;base64,AAA">b')).toBe('b');
    expect(stripDataImages('<img src="https://x/y.jpg" alt="">')).toBe('<img src="https://x/y.jpg" alt="">');
  });
});

describe('buildNewsPayload', () => {
  it('sanitizes the body, strips data images, trims title', () => {
    const spy = vi.fn(sanitize);
    const { data } = buildNewsPayload({
      profile: admin, existing: null, sanitize: spy,
      form: form({ bodyHtml: '<p>ok</p><script>x()</script><img src="data:image/png;base64,AA">' }),
    });
    expect(spy).toHaveBeenCalled();
    expect(data.bodyHtml).toBe('<p>ok</p>');
    expect(data.title).toBe('หัวข้อ');
  });
  it('throws without a sanitizer', () => {
    expect(() => buildNewsPayload({ profile: admin, form: form(), existing: null })).toThrow();
  });
  it('only emits allowed write keys', () => {
    const { data } = buildNewsPayload({ profile: admin, form: form({ authorUid: 'x', evil: 1 }), existing: null, sanitize });
    for (const k of Object.keys(data)) expect(NEWS_WRITE_KEYS).toContain(k);
    expect(data).not.toHaveProperty('authorUid');
    expect(data).not.toHaveProperty('createdAt');
    expect(data).not.toHaveProperty('updatedAt');
  });
  it('requires a title', () => {
    const r = buildNewsPayload({ profile: admin, form: form({ title: '  ' }), existing: null, sanitize });
    expect(r.error).toBe('กรุณากรอกหัวข้อข่าว');
    expect(r.data).toBeUndefined();
  });
  it('admin and pr_central may pin and may omit departments', () => {
    expect(buildNewsPayload({ profile: admin, form: form(), existing: null, sanitize }).data.pinned).toBe(true);
    const r = buildNewsPayload({ profile: prc, form: form({ departmentIds: [], pinned: false }), existing: null, sanitize });
    expect(r.data.pinned).toBe(false);
    expect(r.data.departmentIds).toEqual([]);
  });
  it('dept PR never sends pinned (new)', () => {
    const { data } = buildNewsPayload({ profile: prMath, form: form({ pinned: true }), existing: null, sanitize });
    expect(data).not.toHaveProperty('pinned');
  });
  it('dept PR editing an already-pinned item does not send pinned', () => {
    const existing = { departmentIds: ['math'], pinned: true };
    const { data } = buildNewsPayload({ profile: prMath, form: form({ pinned: false }), existing, sanitize });
    expect(data).not.toHaveProperty('pinned');
  });
  it('dept PR needs at least one department (Thai message)', () => {
    const r = buildNewsPayload({ profile: prMath, form: form({ departmentIds: [] }), existing: null, sanitize });
    expect(r.error).toBe('กรุณาเลือกฝ่ายอย่างน้อย 1 ฝ่าย');
  });
  it('dept PR cannot add a foreign department', () => {
    const r = buildNewsPayload({ profile: prMulti, form: form({ departmentIds: ['math', 'sci'] }), existing: null, sanitize });
    expect(r.error).toBe('ไม่มีสิทธิ์บันทึกข่าวนี้');
  });
  it('dept PR cannot edit an item whose old departments are not all theirs', () => {
    const existing = { departmentIds: ['math', 'sci'] };
    const r = buildNewsPayload({ profile: prMath, form: form({ departmentIds: ['math'] }), existing, sanitize });
    expect(r.error).toBe('ไม่มีสิทธิ์บันทึกข่าวนี้');
  });
  it('dedupes departments and defaults published/images', () => {
    const { data } = buildNewsPayload({
      profile: admin, existing: null, sanitize,
      form: { title: 't', bodyHtml: '', departmentIds: ['math', 'math'] },
    });
    expect(data.departmentIds).toEqual(['math']);
    expect(data.published).toBe(false);
    expect(data.images).toEqual([]);
    expect(data.coverUrl).toBe('');
  });
  it('disabled user is rejected', () => {
    const r = buildNewsPayload({ profile: { ...admin, disabled: true }, form: form(), existing: null, sanitize });
    expect(r.error).toBe('ไม่มีสิทธิ์บันทึกข่าวนี้');
  });
});
