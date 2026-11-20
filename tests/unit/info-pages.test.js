import { describe, it, expect } from 'vitest';
import { DEFAULT_PAGE_TITLES, PAGE_KEYS, TITLE_MAX, BODY_MAX, buildPagePayload, sortPages } from '../../public/assets/js/lib/info-pages.js';

const id = (h) => h;

describe('DEFAULT_PAGE_TITLES', () => {
  it('has the 10 topics of the old site, in order', () => {
    expect(DEFAULT_PAGE_TITLES).toEqual([
      'ประวัติโรงเรียน', 'อัตลักษณ์', 'พันธกิจ วิสัยทัศน์ เป้าหมาย', 'เพลงประจำโรงเรียน',
      'โครงสร้างบริหารงานโรงเรียน', 'คณะกรรมการสถานศึกษาขั้นพื้นฐาน', 'ทำเนียบผู้บริหารโรงเรียน',
      'แผนผังโรงเรียน', 'จำนวนผู้บริหาร ครูและบุคลากร', 'จำนวนนักเรียน',
    ]);
  });
});

describe('buildPagePayload', () => {
  it('returns exactly PAGE_KEYS with trimmed title and sanitized body', () => {
    const { data, error } = buildPagePayload({ title: '  ประวัติ  ', bodyHtml: '<p>x</p>', order: 3, published: true }, (h) => `S:${h}`);
    expect(error).toBeUndefined();
    expect(data).toEqual({ title: 'ประวัติ', bodyHtml: 'S:<p>x</p>', order: 3, published: true });
    expect(Object.keys(data).sort()).toEqual([...PAGE_KEYS].sort());
  });
  it('requires a title', () => {
    expect(buildPagePayload({ title: '   ', bodyHtml: '', order: 0, published: false }, id).error).toBe('กรุณากรอกชื่อหัวข้อ');
  });
  it('limits title length', () => {
    expect(buildPagePayload({ title: 'ก'.repeat(TITLE_MAX + 1), bodyHtml: '', order: 0, published: true }, id).error)
      .toBe(`ชื่อหัวข้อต้องยาวไม่เกิน ${TITLE_MAX} ตัวอักษร`);
  });
  it('limits body size after sanitizing', () => {
    expect(buildPagePayload({ title: 'a', bodyHtml: 'x'.repeat(BODY_MAX + 1), order: 0, published: true }, id).error)
      .toBe('เนื้อหายาวเกินไป กรุณาแบ่งเป็นหลายหัวข้อ');
  });
  it('treats an empty Quill body as empty and coerces order/published', () => {
    const { data } = buildPagePayload({ title: 'a', bodyHtml: '<p></p>', order: '2', published: 'yes' }, id);
    expect(data.bodyHtml).toBe('');
    expect(data.order).toBe(2);
    expect(data.published).toBe(true);
    expect(buildPagePayload({ title: 'a', bodyHtml: null, order: undefined, published: false }, id).data)
      .toEqual({ title: 'a', bodyHtml: '', order: 0, published: false });
  });
});

describe('sortPages', () => {
  it('sorts by order, then title; does not mutate', () => {
    const src = [{ id: 'b', order: 2, title: 'ข' }, { id: 'a', order: 1, title: 'ก' }, { id: 'c', order: 1, title: 'ค' }, { id: 'd', title: 'ง' }];
    expect(sortPages(src).map((p) => p.id)).toEqual(['d', 'a', 'c', 'b']);
    expect(src[0].id).toBe('b');
  });
});
