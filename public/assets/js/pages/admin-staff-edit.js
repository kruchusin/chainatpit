import { requireLogin } from '../auth-guard.js';
import { mountAdminLayout, requireMenu } from '../admin-ui.js';
import { isAdmin, prDepts, canEditStaff, editableStaffFields } from '../lib/permissions.js';
import { buildStaffPatch } from '../lib/staff-edit.js';
import { getStaffForEditor, updateStaff, uploadImage, listDepartments } from '../data.js';
import { ImageDecodeError, TOO_LARGE_MESSAGE } from '../lib/image-resize.js';
import { esc, safeUrl } from '../ui.js';

const { profile } = await requireLogin();
if (!requireMenu(profile, 'staff')) await new Promise(() => {});
mountAdminLayout(profile, { active: 'staff' });

const box = document.getElementById('edit-box');
const errEl = document.getElementById('page-error');
const noticeEl = document.getElementById('page-notice');
const BACK = '<p><a href="/admin/staff.html">กลับไปรายการบุคลากร</a></p>';
const stop = (msg) => { box.innerHTML = `<p>${msg}</p>${BACK}`; return new Promise(() => {}); };

const id = new URLSearchParams(location.search).get('id');
let staff = null;
if (id) {
  try { staff = await getStaffForEditor(id); } catch (e) { if (!(e && e.code === 'permission-denied')) console.error(e); }
}
if (!staff) await stop('ไม่พบบุคลากรนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');
if (!canEditStaff(profile, staff)) await stop('คุณไม่มีสิทธิ์แก้ไขบุคลากรนี้');

const admin = isAdmin(profile);
let editable = editableStaffFields(profile, staff);

let depts = [];
try { depts = await listDepartments(); } catch (e) { console.error(e); }
const nameOf = (d) => (depts.find((x) => x.id === d) || {}).name || d;

// Departments the user may tick: admin = all; dept PR = their own. Held-but-foreign ones show as read-only chips;
// a dept PR never sees departments that are neither owned nor held.
const mayOwn = admin ? depts.map((d) => d.id) : prDepts(profile);
// Only ids that actually get a checkbox count as "own" for the merge (a failed dept load or a stale
// prDepartments id must never drop a department from the record).
const tickable = editable.includes('departmentIds') ? depts.filter((d) => mayOwn.includes(d.id)) : [];
const ownIds = tickable.map((d) => d.id);

const text = (k, label, type = 'text') => editable.includes(k)
  ? `<div class="form-field"><label for="f-${k}">${label}</label><input id="f-${k}" name="${k}" type="${type}" value="${esc(staff[k] || '')}"></div>` : '';
const area = (k, label) => editable.includes(k)
  ? `<div class="form-field"><label for="f-${k}">${label}</label><textarea id="f-${k}" name="${k}">${esc(staff[k] || '')}</textarea></div>` : '';

function deptField() {
  const held = Array.isArray(staff.departmentIds) ? staff.departmentIds : [];
  const canTick = editable.includes('departmentIds');
  const chips = held.filter((d) => !tickable.some((t) => t.id === d));
  if (!tickable.length && !chips.length) return '';
  return `<fieldset class="form-field"><legend>ฝ่าย/กลุ่มสาระ</legend>
${tickable.length ? `<div class="check-grid" id="dept-grid">${tickable.map((d) =>
    `<label><input type="checkbox" name="dept" value="${esc(d.id)}"${held.includes(d.id) ? ' checked' : ''}> ${esc(d.name)}</label>`).join('')}</div>` : ''}
${chips.length ? `<p class="muted">${canTick ? 'ฝ่ายอื่นที่บุคลากรสังกัด (แก้ไขไม่ได้)' : 'ฝ่ายที่สังกัด'}</p>
<div id="dept-chips">${chips.map((d) => `<span class="chip" data-dept="${esc(d)}">${esc(nameOf(d))}</span>`).join('')}</div>` : ''}
</fieldset>`;
}

const photo = safeUrl(staff.photoUrl);
box.innerHTML = `<form id="staff-form" novalidate>
${text('prefix', 'คำนำหน้า')}
${text('name', 'ชื่อ-สกุล')}
${text('position', 'ตำแหน่ง')}
${editable.includes('photoUrl') ? `<div class="form-field"><span id="photo-label">รูปถ่าย</span>
<img id="photo-preview" class="photo-preview" alt="รูปถ่ายปัจจุบัน"${photo ? ` src="${esc(photo)}"` : ' hidden'}>
<input id="f-photo" type="file" accept="image/*" aria-labelledby="photo-label"></div>` : ''}
${area('bio', 'ประวัติโดยย่อ')}
${area('education', 'วุฒิการศึกษา')}
${text('email', 'อีเมล', 'email')}
${deptField()}
${editable.includes('active') ? `<div class="form-field"><label><input type="checkbox" id="f-active"${staff.active ? ' checked' : ''}> แสดงบนหน้าเว็บไซต์</label>${staff.active ? '' : '<p class="muted">ยังซ่อนอยู่ จะแสดงต่อเมื่อติ๊กช่องนี้และบันทึก</p>'}</div>` : ''}
<div class="form-actions"><button type="submit" class="btn" id="save-btn">บันทึก</button>
<a class="btn btn-secondary" href="/admin/staff.html">กลับไปรายการบุคลากร</a></div>
</form>`;

const form = document.getElementById('staff-form');
const fileInput = document.getElementById('f-photo');
const preview = document.getElementById('photo-preview');
let pendingFile = null;
let previewUrl = null;
if (fileInput) fileInput.addEventListener('change', () => {
  pendingFile = fileInput.files[0] || null;
  if (pendingFile) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(pendingFile);
    preview.src = previewUrl; preview.hidden = false;
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.textContent = ''; noticeEl.textContent = '';
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  try {
    const val = (k) => (form.elements[k] ? form.elements[k].value : undefined);
    const formData = {
      prefix: val('prefix'), name: val('name'), position: val('position'),
      bio: val('bio'), education: val('education'), email: val('email'),
      active: (document.getElementById('f-active') ? document.getElementById('f-active').checked : undefined),
      checkedDeptIds: Array.from(form.querySelectorAll('input[name="dept"]:checked')).map((c) => c.value),
    };
    // Validate first so a bad email never leaves an orphan upload behind.
    const check = buildStaffPatch({ old: staff, form: formData, editable, ownIds });
    if (check.error) { errEl.textContent = check.error; return; }
    if (pendingFile) formData.photoUrl = await uploadImage(`staff/${staff.id}/photo.jpg`, pendingFile);
    const { data } = buildStaffPatch({ old: staff, form: formData, editable, ownIds });
    if (!Object.keys(data).length) { noticeEl.textContent = 'ไม่มีข้อมูลที่เปลี่ยนแปลง'; return; }
    await updateStaff(staff.id, data);
    Object.assign(staff, data);
    pendingFile = null; if (fileInput) fileInput.value = '';
    noticeEl.textContent = 'บันทึกเรียบร้อยแล้ว';
    if (data.departmentIds && !canEditStaff(profile, staff)) {
      // a dept PR removed the last department they own: the record is no longer theirs to edit
      await stop('บันทึกเรียบร้อยแล้ว บุคลากรรายนี้ไม่ได้อยู่ในฝ่ายของคุณแล้ว');
    }
  } catch (err) {
    if (err instanceof ImageDecodeError || (err && err.message === TOO_LARGE_MESSAGE)) errEl.textContent = err.message;
    else if (err && (err.code === 'permission-denied' || err.code === 'FORBIDDEN')) errEl.textContent = 'ไม่มีสิทธิ์บันทึกข้อมูลนี้';
    else { console.error(err); errEl.textContent = 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'; }
  } finally {
    saveBtn.disabled = false;
  }
});
