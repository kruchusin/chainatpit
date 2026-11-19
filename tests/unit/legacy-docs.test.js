import { describe, it, expect } from 'vitest';
import { buildNewsDoc, buildStaffDoc, archiveYearStart, findPhones } from '../../migration/lib/docs.mjs';
import { bigImageUrl } from '../../migration/lib/image.mjs';

const NOW = new Date('2026-11-19T01:00:00Z');

describe('archiveYearStart', () => {
  it('1 Jan of the Buddhist-era year at Bangkok midnight', () =>
    expect(archiveYearStart(2569).toISOString()).toBe('2025-12-31T17:00:00.000Z'));
});

describe('buildNewsDoc', () => {
  const item = { title: 'ข่าว', dateText: '19 พ.ย. 2569', bodyHtml: '<p>x</p>', images: ['a', 'b'], links: [] };
  it('has exactly the allowed keys and legacy defaults', () => {
    const d = buildNewsDoc({ item, year: 2569, bodyHtml: '<p>x</p>', imageUrls: ['https://u/1', 'https://u/2'], now: NOW });
    expect(Object.keys(d).sort()).toEqual(['authorUid', 'bodyHtml', 'coverUrl', 'createdAt', 'departmentIds',
      'images', 'pinned', 'published', 'title', 'updatedAt']);
    expect(d).toMatchObject({ authorUid: 'legacy-import', published: true, pinned: false, departmentIds: [],
      coverUrl: 'https://u/1', images: ['https://u/1', 'https://u/2'] });
    expect(d.createdAt.toISOString()).toBe('2026-11-18T17:00:00.000Z');
    expect(d.updatedAt).toBe(NOW);
  });
  it('falls back to 1 Jan of the archive year; empty cover without images', () => {
    const d = buildNewsDoc({ item: { ...item, dateText: '' }, year: 2568, bodyHtml: '', imageUrls: [], now: NOW });
    expect(d.createdAt.toISOString()).toBe('2024-12-31T17:00:00.000Z');
    expect(d.coverUrl).toBe('');
  });
});

describe('buildNewsDoc title', () => {
  it('stores the trimmed title (matches the id)', () => {
    const d = buildNewsDoc({ item: { title: '  ข่าว  ', dateText: '' }, year: 2569, bodyHtml: '', imageUrls: [], now: NOW });
    expect(d.title).toBe('ข่าว');
  });
});

describe('buildStaffDoc', () => {
  it('has exactly the allowed keys and no phone', () => {
    const d = buildStaffDoc({ person: { prefix: 'นาย', name: 'ก ข', position: 'ครู', photoUrl: 'x', phone: '081' },
      dept: 'math', order: 3, photoUrl: 'https://u/p' });
    expect(d).toEqual({ prefix: 'นาย', name: 'ก ข', position: 'ครู', photoUrl: 'https://u/p', bio: '', education: '',
      email: '', departmentIds: ['math'], uid: null, order: 3, active: true });
  });
});

describe('findPhones', () => {
  it('detects Thai phone numbers', () => {
    expect(findPhones('โทร 081-234-5678 หรือ 056411000')).toHaveLength(2);
    expect(findPhones('ปี 2569 ห้อง 101')).toHaveLength(0);
  });
});

describe('bigImageUrl', () => {
  it('requests a 1600px rendition from googleusercontent only', () => {
    expect(bigImageUrl('https://lh3.googleusercontent.com/abc=w1280')).toBe('https://lh3.googleusercontent.com/abc=w1600');
    expect(bigImageUrl('https://lh3.googleusercontent.com/abc')).toBe('https://lh3.googleusercontent.com/abc=w1600');
    expect(bigImageUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
  });
});
