// Home page banner strip markup (pure).
import { esc, safeUrl } from './html.js';

// banners: [{imageUrl, linkUrl}] -> html ('' when none renderable)
export function renderBanners(banners, altText) {
  const items = (Array.isArray(banners) ? banners : []).map((b) => ({ img: safeUrl(b && b.imageUrl), link: safeUrl(b && b.linkUrl) }))
    .filter((b) => b.img);
  if (!items.length) return '';
  const slides = items.map((b, i) => {
    const img = `<img src="${esc(b.img)}" alt="${esc(altText)}" loading="${i === 0 ? 'eager' : 'lazy'}">`;
    const external = /^https?:/i.test(b.link);
    const inner = b.link ? `<a href="${esc(b.link)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${img}</a>` : img;
    return `<div class="banner-slide">${inner}</div>`;
  }).join('');
  return `<div class="banner-strip${items.length === 1 ? ' banner-single' : ''}">${slides}</div>`;
}
