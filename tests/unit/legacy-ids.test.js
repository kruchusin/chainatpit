import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { newsId, staffId, mediaUrl, localMediaPath } from '../../migration/lib/ids.mjs';

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
  it('mediaUrl builds a relative /media URL with cache-bust version', () => {
    expect(mediaUrl('news/a1/legacy-1.jpg', 5)).toBe('/media/news/a1/legacy-1.jpg?v=5');
    expect(mediaUrl('staff/s1/photo.jpg', 1700000000000)).toBe('/media/staff/s1/photo.jpg?v=1700000000000');
  });
  it('localMediaPath joins segments under a base dir containing a space, without encoding', () => {
    const base = join('/tmp', 'my school', 'media');
    expect(localMediaPath(base, 'news/a1/legacy-1.jpg')).toBe(join(base, 'news', 'a1', 'legacy-1.jpg'));
    expect(localMediaPath(base, 'staff/s1/photo.jpg')).not.toContain('%20');
    expect(localMediaPath(base, 'staff/s1/photo.jpg')).toContain('my school');
  });
});
