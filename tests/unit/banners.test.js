import { describe, it, expect } from 'vitest';
import { renderBanners } from '../../public/assets/js/lib/banners.js';

describe('renderBanners', () => {
  it('returns empty string when nothing renderable', () => {
    expect(renderBanners(undefined, 'x')).toBe('');
    expect(renderBanners([], 'x')).toBe('');
    expect(renderBanners([{ imageUrl: '', linkUrl: 'https://a' }, { imageUrl: 'javascript:alert(1)' }], 'x')).toBe('');
  });
  it('skips empty images, first eager and rest lazy', () => {
    const h = renderBanners([{ imageUrl: '' }, { imageUrl: 'https://x/1.jpg' }, { imageUrl: 'https://x/2.jpg' }], 'โรงเรียน');
    expect(h.match(/<img /g)).toHaveLength(2);
    expect(h.indexOf('loading="eager"')).toBeGreaterThan(-1);
    expect(h.match(/loading="lazy"/g)).toHaveLength(1);
    expect(h).toContain('alt="โรงเรียน"');
  });
  it('wraps in a link only for safe linkUrl; external gets rel noopener', () => {
    const h = renderBanners([
      { imageUrl: 'https://x/1.jpg', linkUrl: 'https://school.th/a' },
      { imageUrl: 'https://x/2.jpg', linkUrl: 'javascript:alert(1)' },
      { imageUrl: 'https://x/3.jpg', linkUrl: '/news.html' },
    ], 'a');
    expect(h).not.toContain('javascript:');
    expect(h.match(/<a /g)).toHaveLength(2);
    expect(h).toContain('href="https://school.th/a" target="_blank" rel="noopener noreferrer"');
    expect(h).toContain('href="/news.html"');
  });
  it('escapes values', () => {
    const h = renderBanners([{ imageUrl: 'https://x/a.jpg?q="><script>', linkUrl: '' }], '"><img onerror=1>');
    expect(h).not.toContain('<script>');
    expect(h).not.toContain('<img onerror');
    expect(h).toContain('&quot;&gt;&lt;img onerror=1&gt;');
  });
});
