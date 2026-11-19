import { requireLogin } from '../auth-guard.js';
import { mountAdminLayout, requireMenu } from '../admin-ui.js';
import { isAdmin, isPrCentral, prDepts } from '../lib/permissions.js';
import { buildDocPayload, canManageDoc, thaiYearNow } from '../lib/doc-edit.js';
import { listDocuments, listDepartments, saveDocument, deleteDocument } from '../data.js';
import { confirmDialog } from '../admin-dialog.js';
import { esc, safeUrl } from '../ui.js';

const { profile } = await requireLogin();
if (!requireMenu(profile, 'documents')) await new Promise(() => {});
mountAdminLayout(profile, { active: 'documents' });

const central = isAdmin(profile) || isPrCentral(profile);
const listEl = document.getElementById('doc-list');
const boxEl = document.getElementById('doc-form-box');
const catList = document.getElementById('cat-options');
const errEl = document.getElementById('page-error');
const noticeEl = document.getElementById('page-notice');
const clear = () => { errEl.textContent = ''; noticeEl.textContent = ''; };
const fail = (e, fallback) => {
  console.error(e);
  errEl.textContent = e && e.code === 'permission-denied' ? 'ไม่มีสิทธิ์ดำเนินการนี้' : fallback;
};

let docs = []; let depts = [];
const deptName = (id) => (depts.find((d) => d.id === id) || {}).name || id;
const ownDepts = () => (central ? depts : depts.filter((d) => prDepts(profile).includes(d.id)));

function renderCategories() {
  const cats = [...new Set([...docs.map((d) => d.category).filter(Boolean), 'ITA'])].sort((a, b) => a.localeCompare(b, 'th'));
  catList.innerHTML = cats.map((c) => `<option value="${esc(c)}"></option>`).join('');
}

function render() {
  renderCategories();
  listEl.innerHTML = '';
  const mine = docs.filter((d) => canManageDoc(profile, d));
  for (const d of mine) {
    const li = document.createElement('li');
    li.dataset.id = d.id;
    const url = safeUrl(d.url);
    li.innerHTML = `<span class="item-title">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a>` : esc(d.title)}<br>
<span class="item-meta">${esc(d.category || 'ไม่มีหมวดหมู่')} · พ.ศ. ${esc(d.year)}${d.departmentId ? ` · ${esc(deptName(d.departmentId))}` : ''}</span></span>
<span class="row-actions"><button type="button" class="btn btn-secondary btn-small" data-edit>แก้ไข</button>
<button type="button" class="btn btn-danger btn-small" data-delete>ลบ</button></span>`;
    li.querySelector('[data-edit]').addEventListener('click', () => openForm(d));
    li.querySelector('[data-delete]').addEventListener('click', () => remove(d));
    listEl.appendChild(li);
  }
  if (!mine.length) listEl.innerHTML = '<li class="muted">ยังไม่มีเอกสาร</li>';
}

function openForm(d) {
  clear();
  const cur = d || { title: '', url: '', category: '', departmentId: '', year: thaiYearNow(), order: 0 };
  const choices = ownDepts();
  boxEl.hidden = false;
  boxEl.innerHTML = `<h2>${d ? 'แก้ไขเอกสาร' : 'เพิ่มเอกสาร'}</h2><form id="doc-form" novalidate>
<div class="form-field"><label for="f-title">ชื่อเอกสาร</label><input id="f-title" name="title" type="text" value="${esc(cur.title)}"></div>
<div class="form-field"><label for="f-url">ลิงก์เอกสาร (เช่น Google Drive)</label><input id="f-url" name="url" type="url" placeholder="https://" value="${esc(cur.url)}"></div>
<div class="form-field"><label for="f-category">หมวดหมู่ (พิมพ์เองหรือเลือก ITA สำหรับเอกสาร ITA)</label><input id="f-category" name="category" type="text" list="cat-options" value="${esc(cur.category || '')}"></div>
<div class="form-field"><label for="f-dept">ฝ่าย/กลุ่มสาระ${central ? ' (ไม่บังคับ)' : ''}</label><select id="f-dept" name="departmentId">
<option value="">${central ? '-- ไม่ระบุ (ทั้งโรงเรียน) --' : '-- เลือกฝ่าย/กลุ่มสาระ --'}</option>
${choices.map((x) => `<option value="${esc(x.id)}"${x.id === cur.departmentId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
<div class="form-field"><label for="f-year">ปี (พ.ศ.)</label><input id="f-year" name="year" type="number" value="${esc(cur.year)}"></div>
<div class="form-field"><label for="f-order">ลำดับ</label><input id="f-order" name="order" type="number" value="${esc(cur.order ?? 0)}"></div>
<div class="form-actions"><button type="submit" class="btn" id="f-save">บันทึก</button>
<button type="button" class="btn btn-secondary" id="f-cancel">ยกเลิก</button></div></form>`;
  document.getElementById('f-cancel').addEventListener('click', () => { boxEl.hidden = true; });
  document.getElementById('doc-form').addEventListener('submit', (e) => { e.preventDefault(); save(d, e.target); });
  document.getElementById('f-title').focus();
}

async function save(d, form) {
  clear();
  const el = form.elements;
  const res = buildDocPayload({
    profile,
    form: { title: el.title.value, url: el.url.value, category: el.category.value, departmentId: el.departmentId.value, year: el.year.value, order: el.order.value },
  });
  if (res.error) { errEl.textContent = res.error; return; }
  const btn = document.getElementById('f-save');
  btn.disabled = true;
  try {
    await saveDocument(d ? d.id : undefined, res.data);
    noticeEl.textContent = 'บันทึกเอกสารเรียบร้อยแล้ว';
    boxEl.hidden = true;
    await reload();
  } catch (e) {
    fail(e, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  } finally {
    btn.disabled = false;
  }
}

async function remove(d) {
  clear();
  const ok = await confirmDialog({
    title: 'ยืนยันการลบเอกสาร', message: `ต้องการลบ "${d.title}" ใช่หรือไม่ การลบไม่สามารถกู้คืนได้`,
    okLabel: 'ลบเอกสาร', danger: true,
  });
  if (!ok) return;
  try {
    await deleteDocument(d.id);
    noticeEl.textContent = 'ลบเอกสารเรียบร้อยแล้ว';
    await reload();
  } catch (e) {
    fail(e, 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
}

async function reload() {
  docs = await listDocuments();
  render();
}

document.getElementById('add-doc').addEventListener('click', () => openForm(null));

try {
  depts = await listDepartments();
  await reload();
} catch (e) {
  listEl.innerHTML = '';
  fail(e, 'ไม่สามารถโหลดรายการเอกสารได้ กรุณาลองใหม่อีกครั้ง');
}
