import { describe, it, expect } from 'vitest';
import { cacheBust } from '../../public/assets/js/lib/url.js';

describe('cacheBust', () => {
  it('adds v to a download URL keeping alt and token', () => {
    const u = cacheBust('https://firebasestorage.googleapis.com/v0/b/x/o/staff%2Fs1%2Fphoto.jpg?alt=media&token=abc', 123);
    const p = new URL(u).searchParams;
    expect(p.get('v')).toBe('123');
    expect(p.get('alt')).toBe('media');
    expect(p.get('token')).toBe('abc');
    expect(u).toContain('staff%2Fs1%2Fphoto.jpg');
  });
  it('replaces an existing v instead of stacking', () => {
    const u = cacheBust('https://h/p?alt=media&v=1', 2);
    expect(new URL(u).searchParams.getAll('v')).toEqual(['2']);
  });
  it('works without an existing query', () => {
    expect(cacheBust('https://h/p', 5)).toBe('https://h/p?v=5');
  });
});
