import { describe, it, expect } from 'vitest';
import { uploadAll, shouldWriteDoc } from '../../migration/lib/uploads.mjs';

describe('uploadAll', () => {
  it('writes when every image uploads, keeping order', async () => {
    const r = await uploadAll(['a', 'b'], async (s, i) => `u-${s}-${i}`);
    expect(r.urls).toEqual(['u-a-0', 'u-b-1']);
    expect(r.shouldWrite).toBe(true);
  });
  it('does not write when any image fails, and reports which', async () => {
    const r = await uploadAll(['a', 'b', 'c'], async (s) => { if (s === 'b') throw new Error('404'); return s; });
    expect(r.shouldWrite).toBe(false);
    expect(r.errors).toEqual([{ index: 1, src: 'b', message: '404' }]);
  });
  it('no images is fine', async () => {
    expect((await uploadAll([], async () => 'x')).shouldWrite).toBe(true);
  });
  it('shouldWriteDoc', () => {
    expect(shouldWriteDoc([])).toBe(true);
    expect(shouldWriteDoc([{}])).toBe(false);
  });
});
