import { describe, it, expect } from 'vitest';
import { formatThaiDate, formatThaiDateTime } from '../../public/assets/js/lib/thai-date.js';

describe('thai-date', () => {
  it('formats Buddhist-era date in Asia/Bangkok', () => {
    expect(formatThaiDate(new Date('2026-11-19T10:00:00+07:00'))).toBe('19 พ.ย. 2569');
  });
  it('uses Bangkok day even near UTC midnight', () => {
    expect(formatThaiDate(new Date('2026-01-01T20:00:00Z'))).toBe('2 ม.ค. 2569');
  });
  it('accepts Firestore-like Timestamp', () => {
    const ts = { toDate: () => new Date('2026-03-05T00:00:00+07:00') };
    expect(formatThaiDate(ts)).toBe('5 มี.ค. 2569');
  });
  it('formats date time', () => {
    expect(formatThaiDateTime(new Date('2026-11-19T14:05:00+07:00'))).toBe('19 พ.ย. 2569 14:05 น.');
  });
  it('returns empty string for missing value', () => {
    expect(formatThaiDate(null)).toBe('');
  });
});
