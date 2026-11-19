import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { newsId, staffId, storageDownloadUrl } from '../../migration/lib/ids.mjs';

const h = (s) => createHash('sha256').update(s).digest('hex').slice(0, 20);

describe('legacy ids', () => {
  it('newsId = sha256(title|dateISO) first 20 hex', () => {
    const id = newsId('ข่าวทดสอบ', '2026-11-18T17:00:00.000Z');
    expect(id).toMatch(/^[0-9a-f]{20}$/);
    expect(id).toBe(h('ข่าวทดสอบ|2026-11-18T17:00:00.000Z'));
  });
  it('is deterministic and sensitive to both inputs', () => {
    expect(newsId('a', 'd1')).toBe(newsId('a', 'd1'));
    expect(newsId('a', 'd1')).not.toBe(newsId('a', 'd2'));
    expect(newsId('a', 'd1')).not.toBe(newsId('b', 'd1'));
  });
  it('staffId = sha256(dept|name) first 20 hex', () => {
    expect(staffId('math', 'สมชาย ใจดี')).toBe(h('math|สมชาย ใจดี'));
    expect(staffId('math', 'x')).not.toBe(staffId('sci', 'x'));
  });
  it('storageDownloadUrl builds an absolute, encoded URL', () => {
    const u = storageDownloadUrl('https://firebasestorage.googleapis.com', 'b.app', 'news/abc/legacy-1.jpg', 'tok');
    expect(u).toBe('https://firebasestorage.googleapis.com/v0/b/b.app/o/news%2Fabc%2Flegacy-1.jpg?alt=media&token=tok');
  });
});
