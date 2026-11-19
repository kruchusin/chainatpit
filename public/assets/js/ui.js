// Shared layout (header / nav / footer) and shared renderers.
import { getSettings, listDepartments } from './data.js';
import { formatThaiDate } from './lib/thai-date.js';

const DEFAULT_NAME = 'โรงเรียนชัยนาทพิทยาคม';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Only allow http(s) / root-relative URLs in src/href built from data.
export const safeUrl = (u) => (/^(https?:\/\/|\/(?!\/))/i.test(String(u || '')) ? String(u) : '');

export function renderNewsCard(item) {
  const cover = safeUrl(item.coverUrl || (item.images && item.images[0]));
  const date = formatThaiDate(item.createdAt);
  const img = cover
    ? `<img src="${esc(cover)}" alt="" loading="lazy" width="640" height="360">`
    : '<div class="card-img-placeholder" aria-hidden="true"></div>';
  return `<article class="news-card">
  <a class="news-card-link" href="/news/${encodeURIComponent(item.id)}">
    <div class="news-card-media">${img}${item.pinned ? '<span class="badge-pinned">ปักหมุด</span>' : ''}</div>
    <div class="news-card-body">
      ${date ? `<time class="news-card-date">${esc(date)}</time>` : ''}
      <h3 class="news-card-title">${esc(item.title)}</h3>
    </div>
  </a>
</article>`;
}

function navHtml(active, departments) {
  const link = (key, href, label) =>
    `<li><a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a></li>`;
  const group = (type) => departments.filter((d) => d.type === type)
    .map((d) => `<li><a href="/department.html?id=${encodeURIComponent(d.id)}">${esc(d.name)}</a></li>`).join('');
  const deptActive = active === 'department';
  return `<ul class="nav-list">
    ${link('home', '/', 'หน้าแรก')}
    ${link('about', '/about.html', 'ข้อมูลสถานศึกษา')}
    ${link('staff', '/staff.html', 'บุคลากร')}
    <li class="has-dropdown">
      <button type="button" class="dropdown-toggle" aria-expanded="false"${deptActive ? ' aria-current="true"' : ''}>กลุ่มสาระ/ฝ่ายงาน</button>
      <ul class="dropdown">
        <li class="dropdown-heading">กลุ่มสาระการเรียนรู้</li>${group('subject')}
        <li class="dropdown-heading">ฝ่ายงาน</li>${group('division')}
        <li class="dropdown-heading">หน่วยงาน</li>${group('unit')}
      </ul>
    </li>
    ${link('news', '/news.html', 'ข่าวประชาสัมพันธ์')}
    ${link('gallery', '/gallery.html', 'ภาพกิจกรรม')}
    ${link('documents', '/documents.html', 'เอกสาร')}
    ${link('ita', '/ita.html', 'ITA')}
    ${link('contact', '/contact.html', 'ติดต่อ')}
  </ul>`;
}

function wireNav(root) {
  const btn = root.querySelector('.nav-toggle');
  const nav = root.querySelector('#main-nav');
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
  });
  const dd = root.querySelector('.dropdown-toggle');
  dd.addEventListener('click', () => {
    const open = dd.getAttribute('aria-expanded') !== 'true';
    dd.setAttribute('aria-expanded', String(open));
    dd.parentElement.classList.toggle('open', open);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    dd.setAttribute('aria-expanded', 'false'); dd.parentElement.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false'); nav.classList.remove('open');
  });
}

export async function mountLayout({ active } = {}) {
  let settings = {}; let departments = [];
  try { [settings, departments] = await Promise.all([getSettings(), listDepartments()]); } catch (e) { console.error(e); }
  const name = settings.schoolName || DEFAULT_NAME;
  const logo = safeUrl(settings.logoUrl);

  const header = document.getElementById('site-header');
  if (header) {
    header.innerHTML = `<a class="skip-link" href="#main">ข้ามไปยังเนื้อหา</a>
<div class="container header-inner">
  <a class="brand" href="/">${logo ? `<img src="${esc(logo)}" alt="ตราโรงเรียน" width="44" height="44">` : ''}<span class="brand-name">${esc(name)}</span></a>
  <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="main-nav" aria-label="เมนู"><span class="bars" aria-hidden="true"></span></button>
  <nav id="main-nav" aria-label="เมนูหลัก">${navHtml(active, departments)}</nav>
</div>`;
    wireNav(header);
  }
  const footer = document.getElementById('site-footer');
  if (footer) {
    const line = (v, label) => (v ? `<p>${label}${esc(v)}</p>` : '');
    footer.innerHTML = `<div class="container footer-inner">
  <div><strong>${esc(name)}</strong>${line(settings.address, '')}${line(settings.phone, 'โทร. ')}${line(settings.email, 'อีเมล ')}</div>
  <p class="copyright">&copy; ${new Date().getFullYear() + 543} ${esc(name)}</p>
</div>`;
  }
  return { settings, departments };
}
