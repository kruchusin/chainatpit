import { requireLogin } from '../auth-guard.js';
import { mountAdminLayout, requireMenu } from '../admin-ui.js';
import { canWriteNewsFor } from '../lib/permissions.js';
import { listNewsForEditor, listDepartments, deleteNews } from '../data.js';
import { confirmDialog } from '../admin-dialog.js';
import { formatThaiDate } from '../lib/thai-date.js';
import { esc } from '../ui.js';

const { profile } = await requireLogin();
if (!requireMenu(profile, 'news')) await new Promise(() => {});
mountAdminLayout(profile, { active: 'news' });

const listEl = document.getElementById('news-list');
const errEl = document.getElementById('news-error');
const noticeEl = document.getElementById('news-notice');
const moreBtn = document.getElementById('load-more');
const PAGE = 20;
let cursor = null;
let first = true;
let deptNames = {};

try {
  deptNames = Object.fromEntries((await listDepartments()).map((d) => [d.id, d.name]));
} catch (e) { console.error(e); } // names are cosmetic; ids are shown instead

function row(n) {
  const date = formatThaiDate(n.createdAt);
  const depts = (n.departmentIds || []).map((id) => deptNames[id] || id).join(', ');
  const li = document.createElement('li');
  li.dataset.id = n.id;
  li.innerHTML = `<span class="item-title">${esc(n.title || '(ไม่มีหัวข้อ)')}</span>
${n.published ? '<span class="badge-status">เผยแพร่แล้ว</span>' : '<span class="badge-status badge-draft">ฉบับร่าง</span>'}
${n.pinned ? '<span class="badge-status">ปักหมุด</span>' : ''}
<span class="item-meta">${esc(date)}${depts ? ` · ${esc(depts)}` : ''}</span>
<a class="btn btn-secondary" href="/admin/news-edit.html?id=${encodeURIComponent(n.id)}">แก้ไข</a>
<button type="button" class="btn btn-danger" data-delete="${esc(n.id)}">ลบ</button>`;
  li.querySelector('[data-delete]').addEventListener('click', () => onDelete(n, li));
  return li;
}

async function onDelete(n, li) {
  errEl.textContent = ''; noticeEl.textContent = '';
  const ok = await confirmDialog({
    title: 'ยืนยันการลบข่าว',
    message: `ต้องการลบข่าว "${n.title || '(ไม่มีหัวข้อ)'}" และรูปภาพทั้งหมดของข่าวนี้ใช่หรือไม่ การลบไม่สามารถกู้คืนได้`,
    okLabel: 'ลบข่าว', danger: true,
  });
  if (!ok) return;
  try {
    await deleteNews(n.id);
    li.remove();
    noticeEl.textContent = 'ลบข่าวเรียบร้อยแล้ว';
    if (!listEl.children.length) listEl.innerHTML = '<li class="muted">ยังไม่มีข่าว</li>';
  } catch (e) {
    console.error(e);
    errEl.textContent = e && e.code === 'permission-denied' ? 'ไม่มีสิทธิ์ลบข่าวนี้' : 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
  }
}

async function load() {
  moreBtn.disabled = true;
  try {
    const { items, cursor: next } = await listNewsForEditor(profile, { pageSize: PAGE, after: cursor });
    cursor = next;
    if (first) { listEl.innerHTML = ''; first = false; }
    // UI filter (rules still decide): hide items this user may not edit/delete
    for (const n of items) if (canWriteNewsFor(profile, n.departmentIds)) listEl.appendChild(row(n));
    if (!listEl.children.length) listEl.innerHTML = '<li class="muted">ยังไม่มีข่าว</li>';
    moreBtn.hidden = !cursor;
  } catch (e) {
    console.error(e);
    if (first) listEl.innerHTML = '';
    errEl.textContent = e && e.code === 'permission-denied' ? 'ไม่มีสิทธิ์ดูรายการข่าว' : 'ไม่สามารถโหลดรายการข่าวได้ กรุณาลองใหม่อีกครั้ง';
  } finally {
    moreBtn.disabled = false;
  }
}

moreBtn.addEventListener('click', load);
await load();
