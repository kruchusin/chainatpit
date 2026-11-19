import { describe, it, expect } from 'vitest';
import { parseThaiDate } from '../../migration/lib/thai-date.mjs';

const NOV19 = new Date('2026-11-19T00:00:00+07:00').getTime();

describe('parseThaiDate', () => {
  it('abbreviated month', () => expect(parseThaiDate('19 พ.ย. 2569').getTime()).toBe(NOV19));
  it('full month', () => expect(parseThaiDate('19 พฤศจิกายน 2569').getTime()).toBe(NOV19));
  it('numeric d/m/y', () => expect(parseThaiDate('19/11/2569').getTime()).toBe(NOV19));
  it('Thai digits', () => expect(parseThaiDate('๑๙ พ.ย. ๒๕๖๙').getTime()).toBe(NOV19));
  it('finds a date inside longer text', () => {
    expect(parseThaiDate('ประกาศ เมื่อวันที่ 5 มีนาคม 2568 เวลา 9.00 น.').getTime())
      .toBe(new Date('2025-03-05T00:00:00+07:00').getTime());
  });
  it('abbreviation without dots, and พ.ค. vs มี.ค.', () => {
    expect(parseThaiDate('1 พค 2567').getTime()).toBe(new Date('2024-05-01T00:00:00+07:00').getTime());
    expect(parseThaiDate('1 มี.ค. 2567').getTime()).toBe(new Date('2024-03-01T00:00:00+07:00').getTime());
  });
  it('invalid input returns null', () => {
    expect(parseThaiDate('')).toBeNull();
    expect(parseThaiDate(null)).toBeNull();
    expect(parseThaiDate('ข่าวประชาสัมพันธ์')).toBeNull();
    expect(parseThaiDate('31 ก.พ. 2569')).toBeNull();
    expect(parseThaiDate('32/01/2569')).toBeNull();
  });
});
