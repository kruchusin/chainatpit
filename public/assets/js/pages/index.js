import { mountLayout, renderNewsCard } from '../ui.js';
import { listNews } from '../data.js';
import { renderBanners } from '../lib/banners.js';

const { settings } = await mountLayout({ active: 'home' });
const hero = document.getElementById('hero-text');
if (hero && settings.welcomeText) hero.textContent = settings.welcomeText;

const bannerBox = document.getElementById('banners');
if (bannerBox) {
  const html = renderBanners(settings.banners, settings.schoolName || 'โรงเรียนชัยนาทพิทยาคม');
  if (html) { bannerBox.innerHTML = html; bannerBox.hidden = false; }
}

const box = document.getElementById('latest-news');
try {
  // pinned first, then newest: 1 pinned + 5 latest on the sample data
  const { items } = await listNews({ pageSize: 6 });
  box.innerHTML = items.length ? items.map(renderNewsCard).join('') : '<p class="muted">ยังไม่มีข่าวประชาสัมพันธ์</p>';
} catch (e) {
  console.error(e);
  box.innerHTML = '<p class="muted">ไม่สามารถโหลดข่าวได้ กรุณาลองใหม่อีกครั้ง</p>';
}
