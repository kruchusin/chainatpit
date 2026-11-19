import { mountLayout, esc, safeUrl } from '../ui.js';
import { getNews } from '../data.js';
import { formatThaiDate } from '../lib/thai-date.js';
import { createSanitizer } from '../lib/sanitize.js';

await mountLayout({ active: 'news' });
const article = document.getElementById('news-article');
const id = decodeURIComponent((location.pathname.match(/^\/news\/([^/]+)\/?$/) || [])[1] || '');

function notFound() {
  document.title = 'ไม่พบข่าว - โรงเรียนชัยนาทพิทยาคม';
  article.innerHTML = '<h1>ไม่พบข่าวที่ต้องการ</h1><p>ข่าวนี้อาจถูกลบหรือยกเลิกการเผยแพร่แล้ว</p><p><a href="/news.html">กลับไปหน้าข่าวทั้งหมด</a></p>';
}

try {
  const news = id && await getNews(id);
  if (!news || news.published !== true) {
    notFound();
  } else {
    const sanitize = createSanitizer(window.DOMPurify);
    document.title = `${news.title} - โรงเรียนชัยนาทพิทยาคม`;
    const cover = safeUrl(news.coverUrl);
    const gallery = (news.images || []).map(safeUrl).filter((u) => u && u !== cover)
      .map((u) => `<a href="${esc(u)}"><img src="${esc(u)}" alt="" loading="lazy"></a>`).join('');
    article.innerHTML = `<h1>${esc(news.title)}</h1>
<p class="muted"><time>${esc(formatThaiDate(news.createdAt))}</time></p>
${cover ? `<img class="news-cover" src="${esc(cover)}" alt="${esc(news.title)}">` : ''}
<div class="news-body">${sanitize(news.bodyHtml)}</div>
${gallery ? `<div class="news-gallery">${gallery}</div>` : ''}
<p><a href="/news.html">&larr; ข่าวทั้งหมด</a></p>`;
  }
} catch (e) {
  console.error(e);
  article.innerHTML = '<p>ไม่สามารถโหลดข่าวได้ กรุณาลองใหม่อีกครั้ง</p>';
}
