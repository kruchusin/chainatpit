import { describe, it, expect } from 'vitest';
import {
  computeResize, ImageDecodeError, encodeUnderLimit, TOO_LARGE_MESSAGE,
} from '../../public/assets/js/lib/image-resize.js';

describe('computeResize', () => {
  it('shrinks landscape to max long side', () => {
    expect(computeResize(4032, 3024)).toEqual({ width: 1600, height: 1200 });
  });
  it('keeps small images', () => {
    expect(computeResize(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('shrinks portrait', () => {
    expect(computeResize(3000, 6000)).toEqual({ width: 800, height: 1600 });
  });
  it('honours custom max', () => {
    expect(computeResize(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
  });
});

describe('ImageDecodeError', () => {
  it('has Thai message', () => {
    const e = new ImageDecodeError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ImageDecodeError');
    expect(e.message).toBe('ไม่สามารถอ่านไฟล์รูปนี้ได้ กรุณาใช้ไฟล์ JPG หรือ PNG');
  });
});

describe('encodeUnderLimit', () => {
  const mk = (sizes) => {
    const calls = [];
    return { calls, encode: async (q) => { calls.push(q); return { size: sizes[calls.length - 1] }; } };
  };
  it('stops at first quality under limit', async () => {
    const m = mk([300, 100]);
    const b = await encodeUnderLimit(m.encode, 200);
    expect(b.size).toBe(100);
    expect(m.calls).toEqual([0.85, 0.75]);
  });
  it('throws Thai error when never small enough', async () => {
    const m = mk([300, 300, 300, 300]);
    await expect(encodeUnderLimit(m.encode, 200)).rejects.toThrow(TOO_LARGE_MESSAGE);
    expect(m.calls).toEqual([0.85, 0.75, 0.65, 0.55]);
    expect(TOO_LARGE_MESSAGE).toBe('ไฟล์รูปใหญ่เกินไป');
  });
});
