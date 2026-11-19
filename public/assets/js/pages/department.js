import { mountLayout, esc, safeUrl, renderStaffCard, renderNewsCard, renderError, NOT_FOUND_HTML } from '../ui.js';
import { listStaff, listNews } from '../data.js';

const { departments } = await mountLayout({ active: 'department' });
const box = document.getElementById('dept');
const id = new URLSearchParams(location.search).get('id') || '';
const dept = id && departments.find((d) => d.id === id);

if (!dept) {
  document.title = 'ไม่พบข้อมูล - โรงเรียนชัยนาทพิทยาคม';
  box.innerHTML = `<h1>ไม่พบข้อมูล</h1>${NOT_FOUND_HTML}<p><a href="/staff.html">ดูรายชื่อบุคลากร</a></p>`;
} else {
  document.title = `${dept.name} - โรงเรียนชัยนาทพิทยาคม`;
  try {
    const [staff, news] = await Promise.all([
      listStaff({ departmentId: id }),
      listNews({ departmentId: id, pageSize: 6 }),
    ]);
    const ext = safeUrl(dept.externalUrl);
    const cover = safeUrl(dept.coverUrl);
    box.innerHTML = `<h1>${esc(dept.name)}</h1>
${cover ? `<img class="dept-cover" src="${esc(cover)}" alt="">` : ''}
${dept.description ? `<p class="dept-desc">${esc(dept.description)}</p>` : ''}
${ext ? `<p><a class="btn" id="dept-external" href="${esc(ext)}" target="_blank" rel="noopener noreferrer">เว็บไซต์ของ${esc(dept.name)}</a></p>` : ''}
<section aria-labelledby="dept-staff-h"><h2 id="dept-staff-h">บุคลากร</h2>
${staff.length ? `<div class="staff-grid">${staff.map(renderStaffCard).join('')}</div>` : '<p class="muted">ยังไม่มีข้อมูลบุคลากร</p>'}</section>
<section aria-labelledby="dept-news-h"><div class="section-head"><h2 id="dept-news-h">ข่าวล่าสุด</h2><a href="/news.html">ข่าวทั้งหมด</a></div>
${news.items.length ? `<div class="news-grid">${news.items.map(renderNewsCard).join('')}</div>` : '<p class="muted">ยังไม่มีข่าวของหน่วยงานนี้</p>'}</section>`;
  } catch (e) { renderError(box, e); }
}
