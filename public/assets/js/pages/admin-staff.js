import { requireLogin } from '../auth-guard.js';
import { mountAdminLayout, requireMenu } from '../admin-ui.js';
import { isAdmin, prDepts, canEditStaff } from '../lib/permissions.js';
import { swapOrders } from '../lib/staff-edit.js';
import { listStaffForEditor, listDepartments, updateStaff, swapOrder, createStaff } from '../data.js';
import { confirmDialog } from '../admin-dialog.js';
import { esc } from '../ui.js';

const { profile } = await requireLogin();
if (!requireMenu(profile, 'staff')) await new Promise(() => {});
mountAdminLayout(profile, { active: 'staff' });

const admin = isAdmin(profile);
const listEl = document.getElementById('staff-list');
const errEl = document.getElementById('page-error');
const noticeEl = document.getElementById('page-notice');
const filterEl = document.getElementById('dept-filter');
const clear = () => { errEl.textContent = ''; noticeEl.textContent = ''; };
const fail = (e, fallback) => {
  console.error(e);
  errEl.textContent = e && e.code === 'permission-denied' ? 'ไม่มีสิทธิ์ดำเนินการนี้' : fallback;
};

let depts = [];
try { depts = await listDepartments(); } catch (e) { console.error(e); }
const deptNames = Object.fromEntries(depts.map((d) => [d.id, d.name]));

// admin: "all" + every department. Dept PR: only their own departments (ordering is per department).
const filterIds = admin ? depts.map((d) => d.id) : prDepts(profile);
filterEl.innerHTML = (admin ? '<option value="">ทั้งหมด</option>' : '')
  + filterIds.map((id) => `<option value="${esc(id)}">${esc(deptNames[id] || id)}</option>`).join('');

if (admin) {
  document.getElementById('add-wrap').hidden = false;
  document.getElementById('add-staff').addEventListener('click', async (ev) => {
    clear();
    ev.target.disabled = true;
    try {
      const id = await createStaff();
      location.href = `/admin/staff-edit.html?id=${encodeURIComponent(id)}`;
    } catch (e) {
      fail(e, 'เพิ่มบุคลากรไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      ev.target.disabled = false;
    }
  });
}

let all = [];
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name), 'th');

// UI filter only (rules still decide): a dept PR sees just the staff of the selected own department.
function view() {
  const d = filterEl.value;
  return all
    .filter((s) => (admin || canEditStaff(profile, s)) && (!d || (s.departmentIds || []).includes(d)))
    .sort(byOrder);
}

function render() {
  const items = view();
  if (!items.length) { listEl.innerHTML = '<li class="muted">ยังไม่มีบุคลากร</li>'; return; }
  listEl.innerHTML = '';
  items.forEach((s, i) => {
    const full = [s.prefix, s.name].filter(Boolean).join('') || '(ยังไม่ระบุชื่อ)';
    const deptText = (s.departmentIds || []).map((id) => deptNames[id] || id).join(', ');
    const editable = canEditStaff(profile, s);
    const prev = items[i - 1];
    const next = items[i + 1];
    const canUp = !!prev && editable && canEditStaff(profile, prev);
    const canDown = !!next && editable && canEditStaff(profile, next);
    const li = document.createElement('li');
    li.dataset.id = s.id;
    li.innerHTML = `<span class="item-title">${esc(full)}${s.position ? ` <span class="item-meta">${esc(s.position)}</span>` : ''}</span>
${s.active ? '' : '<span class="badge-status badge-hidden">ซ่อนอยู่</span>'}
<span class="item-meta">${esc(deptText)}</span>
<span class="row-actions">
<button type="button" class="btn btn-secondary btn-small" data-up aria-label="เลื่อน ${esc(full)} ขึ้น"${canUp ? '' : ' disabled'}>▲</button>
<button type="button" class="btn btn-secondary btn-small" data-down aria-label="เลื่อน ${esc(full)} ลง"${canDown ? '' : ' disabled'}>▼</button>
${editable ? `<a class="btn btn-secondary btn-small" href="/admin/staff-edit.html?id=${encodeURIComponent(s.id)}">แก้ไข</a>
<button type="button" class="btn btn-secondary btn-small" data-toggle>${s.active ? 'ซ่อน' : 'แสดง'}</button>` : ''}
</span>`;
    li.querySelector('[data-up]').addEventListener('click', () => move(prev, s));
    li.querySelector('[data-down]').addEventListener('click', () => move(s, next));
    const t = li.querySelector('[data-toggle]');
    if (t) t.addEventListener('click', () => toggle(s, full));
    listEl.appendChild(li);
  });
}

// first is currently above second; after this second is above first.
async function move(first, second) {
  clear();
  listEl.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    await swapOrder('staff', first, second);
    for (const w of swapOrders(first, second)) all.find((s) => s.id === w.id).order = w.order;
    noticeEl.textContent = 'เปลี่ยนลำดับเรียบร้อยแล้ว';
  } catch (e) {
    fail(e, 'เปลี่ยนลำดับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
  render();
}

async function toggle(s, full) {
  clear();
  const hide = s.active;
  const ok = await confirmDialog({
    title: hide ? 'ยืนยันการซ่อนบุคลากร' : 'ยืนยันการแสดงบุคลากร',
    message: hide ? `ต้องการซ่อน "${full}" จากหน้าเว็บไซต์ใช่หรือไม่` : `ต้องการแสดง "${full}" บนหน้าเว็บไซต์ใช่หรือไม่`,
    okLabel: hide ? 'ซ่อน' : 'แสดง', danger: hide,
  });
  if (!ok) return;
  try {
    await updateStaff(s.id, { active: !s.active });
    s.active = !s.active;
    noticeEl.textContent = hide ? 'ซ่อนบุคลากรเรียบร้อยแล้ว' : 'แสดงบุคลากรเรียบร้อยแล้ว';
    render();
  } catch (e) {
    fail(e, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
}

filterEl.addEventListener('change', () => { clear(); render(); });
try {
  all = await listStaffForEditor(profile);
  render();
} catch (e) {
  listEl.innerHTML = '';
  fail(e, 'ไม่สามารถโหลดรายการบุคลากรได้ กรุณาลองใหม่อีกครั้ง');
}
