import { requireLogin } from '../auth-guard.js';
import { mountAdminLayout, requireMenu } from '../admin-ui.js';
import { isAdmin, canEditDepartment } from '../lib/permissions.js';
import { buildDeptPatch, DEPT_TYPES, DEPT_TYPE_LABELS } from '../lib/dept-edit.js';
import { swapOrders } from '../lib/staff-edit.js';
import { listDepartments, saveDepartment, createDepartment, deleteDepartment, swapOrder, uploadImage } from '../data.js';
import { confirmDialog } from '../admin-dialog.js';
import { ImageDecodeError, TOO_LARGE_MESSAGE } from '../lib/image-resize.js';
import { esc, safeUrl } from '../ui.js';

const { profile } = await requireLogin();
if (!requireMenu(profile, 'departments')) await new Promise(() => {});
mountAdminLayout(profile, { active: 'departments' });

const admin = isAdmin(profile);
const listEl = document.getElementById('dept-list');
const createBox = document.getElementById('create-box');
const errEl = document.getElementById('page-error');
const noticeEl = document.getElementById('page-notice');
const clear = () => { errEl.textContent = ''; noticeEl.textContent = ''; };
const fail = (e, fallback) => {
  if (e instanceof ImageDecodeError || (e && (e.message === TOO_LARGE_MESSAGE || e.code === 'dept-in-use'))) { errEl.textContent = e.message; return; }
  console.error(e);
  errEl.textContent = e && (e.code === 'permission-denied' || e.code === 'storage/unauthorized') ? 'ไม่มีสิทธิ์ดำเนินการนี้' : fallback;
};

let depts = [];
const typeSelect = (id, value) => `<select id="${id}" name="type">${DEPT_TYPES.map((t) =>
  `<option value="${t}"${t === value ? ' selected' : ''}>${DEPT_TYPE_LABELS[t]}</option>`).join('')}</select>`;

// ---- create (admin) ----
if (admin) {
  createBox.hidden = false;
  createBox.innerHTML = `<h2>เพิ่มหน่วยงาน</h2><form id="create-form" novalidate>
<div class="form-field"><label for="c-name">ชื่อ</label><input id="c-name" name="name" type="text"></div>
<div class="form-field"><label for="c-type">ประเภท</label>${typeSelect('c-type', 'subject')}</div>
<div class="form-field"><label for="c-description">คำอธิบาย</label><textarea id="c-description" name="description"></textarea></div>
<div class="form-field"><label for="c-url">ลิงก์ภายนอก (ถ้ามี)</label><input id="c-url" name="externalUrl" type="url" placeholder="https://"></div>
<div class="form-actions"><button type="submit" class="btn" id="create-btn">เพิ่มหน่วยงาน</button></div></form>`;
  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clear();
    const form = e.target;
    const btn = document.getElementById('create-btn');
    btn.disabled = true;
    try {
      const { data, error } = buildDeptPatch({
        old: null, admin: true,
        form: { name: form.elements.name.value, type: form.elements.type.value, description: form.elements.description.value, externalUrl: form.elements.externalUrl.value },
      });
      if (error) { errEl.textContent = error; return; }
      await createDepartment(data);
      form.reset();
      noticeEl.textContent = 'เพิ่มหน่วยงานเรียบร้อยแล้ว';
      await reload();
    } catch (err) {
      fail(err, 'เพิ่มหน่วยงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      btn.disabled = false;
    }
  });
}

// ---- list ----
function card(d, i) {
  const editable = canEditDepartment(profile, d.id);
  const cover = safeUrl(d.coverUrl);
  const li = document.createElement('li');
  li.dataset.id = d.id;
  const typeLabel = DEPT_TYPE_LABELS[d.type] || d.type || '';
  if (!editable) { // admin never reaches this; a dept PR does not see other departments at all
    return null;
  }
  li.innerHTML = `<div class="dept-head"><span class="item-title">${esc(d.name)}</span><span class="badge-status">${esc(typeLabel)}</span>
${admin ? `<span class="row-actions">
<button type="button" class="btn btn-secondary btn-small" data-up aria-label="เลื่อน ${esc(d.name)} ขึ้น"${i === 0 ? ' disabled' : ''}>▲</button>
<button type="button" class="btn btn-secondary btn-small" data-down aria-label="เลื่อน ${esc(d.name)} ลง"${i === depts.length - 1 ? ' disabled' : ''}>▼</button>
<button type="button" class="btn btn-danger btn-small" data-delete>ลบ</button></span>` : ''}</div>
<form class="dept-form" novalidate>
${admin ? `<div class="form-field"><label for="n-${esc(d.id)}">ชื่อ</label><input id="n-${esc(d.id)}" name="name" type="text" value="${esc(d.name)}"></div>
<div class="form-field"><label for="t-${esc(d.id)}">ประเภท</label>${typeSelect(`t-${esc(d.id)}`, d.type)}</div>` : ''}
<div class="form-field"><label for="d-${esc(d.id)}">คำอธิบาย</label><textarea id="d-${esc(d.id)}" name="description">${esc(d.description || '')}</textarea></div>
${admin ? `<div class="form-field"><label for="u-${esc(d.id)}">ลิงก์ภายนอก (ถ้ามี)</label><input id="u-${esc(d.id)}" name="externalUrl" type="url" value="${esc(d.externalUrl || '')}" placeholder="https://"></div>` : ''}
<div class="form-field"><span id="cl-${esc(d.id)}">รูปปก</span>
${cover ? `<img class="cover-preview" src="${esc(cover)}" alt="รูปปก ${esc(d.name)}">` : '<p class="muted">ยังไม่มีรูปปก</p>'}
<input name="cover" type="file" accept="image/*" aria-labelledby="cl-${esc(d.id)}"></div>
<div class="form-actions"><button type="submit" class="btn">บันทึก</button></div></form>`;
  li.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); save(d, e.target); });
  if (admin) {
    li.querySelector('[data-up]').addEventListener('click', () => move(depts[i - 1], d));
    li.querySelector('[data-down]').addEventListener('click', () => move(d, depts[i + 1]));
    li.querySelector('[data-delete]').addEventListener('click', () => remove(d));
  }
  return li;
}

function render() {
  listEl.innerHTML = '';
  let n = 0;
  depts.forEach((d, i) => { const li = card(d, i); if (li) { listEl.appendChild(li); n++; } });
  if (!n) listEl.innerHTML = '<li class="muted">ไม่มีหน่วยงานที่คุณจัดการได้</li>';
}

async function save(d, form) {
  clear();
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const f = form.elements;
    const input = { description: f.description.value };
    if (admin) Object.assign(input, { name: f.name.value, type: f.type.value, externalUrl: f.externalUrl.value });
    const check = buildDeptPatch({ old: d, form: input, admin });
    if (check.error) { errEl.textContent = check.error; return; }
    const file = f.cover.files[0];
    if (file) input.coverUrl = await uploadImage(`departments/${d.id}/cover.jpg`, file);
    const { data } = buildDeptPatch({ old: d, form: input, admin });
    if (!Object.keys(data).length) { noticeEl.textContent = 'ไม่มีข้อมูลที่เปลี่ยนแปลง'; return; }
    await saveDepartment(d.id, data);
    Object.assign(d, data);
    noticeEl.textContent = 'บันทึกเรียบร้อยแล้ว';
    render();
  } catch (e) {
    fail(e, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  } finally {
    btn.disabled = false;
  }
}

async function move(first, second) {
  clear();
  listEl.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    await swapOrder('departments', first, second);
    for (const w of swapOrders(first, second)) depts.find((x) => x.id === w.id).order = w.order;
    depts.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    noticeEl.textContent = 'เปลี่ยนลำดับเรียบร้อยแล้ว';
  } catch (e) {
    fail(e, 'เปลี่ยนลำดับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
  render();
}

async function remove(d) {
  clear();
  const ok = await confirmDialog({
    title: 'ยืนยันการลบหน่วยงาน',
    message: `ต้องการลบ "${d.name}" ใช่หรือไม่ การลบไม่สามารถกู้คืนได้`,
    okLabel: 'ลบหน่วยงาน', danger: true,
  });
  if (!ok) return;
  try {
    await deleteDepartment(d.id);
    depts = depts.filter((x) => x.id !== d.id);
    noticeEl.textContent = 'ลบหน่วยงานเรียบร้อยแล้ว';
    render();
  } catch (e) {
    fail(e, 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
}

async function reload() {
  depts = await listDepartments();
  render();
}

try {
  await reload();
} catch (e) {
  listEl.innerHTML = '';
  fail(e, 'ไม่สามารถโหลดรายการหน่วยงานได้ กรุณาลองใหม่อีกครั้ง');
}
