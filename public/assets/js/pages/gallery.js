import { mountLayout, esc, safeUrl, renderError } from '../ui.js';
import { listGalleryNews } from '../data.js';
import { formatThaiDate } from '../lib/thai-date.js';

await mountLayout({ active: 'gallery' });
const grid = document.getElementById('gallery');
const more = document.getElementById('load-more');
let cursor = null;

const tile = (n) => {
  const src = safeUrl(n.images[0]);
  if (!src) return '';
  return `<a class="gallery-item" href="/news/${encodeURIComponent(n.id)}">
<img src="${esc(src)}" alt="${esc(n.title)}" loading="lazy" width="640" height="480">
<span class="gallery-caption">${esc(n.title)}<small>${esc(formatThaiDate(n.createdAt))}</small></span></a>`;
};

async function load(first) {
  more.disabled = true;
  try {
    const { items, cursor: next } = await listGalleryNews({ pageSize: 12, after: cursor || undefined });
    if (first) grid.innerHTML = items.length ? '' : '<p class="muted">ไม่พบข้อมูล</p>';
    grid.insertAdjacentHTML('beforeend', items.map(tile).join(''));
    cursor = next;
  } catch (e) { renderError(grid, e); cursor = null; }
  more.hidden = !cursor;
  more.disabled = false;
}
more.addEventListener('click', () => load(false));
await load(true);
