import { requireLogin } from '../auth-guard.js';
import { mountAdminLayout, requireMenu } from '../admin-ui.js';
import { editableStaffFields } from '../lib/permissions.js';
import { updateStaff, uploadImage } from '../data.js';
import { ImageDecodeError, TOO_LARGE_MESSAGE } from '../lib/image-resize.js';
import { esc, safeUrl } from '../ui.js';

const { profile, staff } = await requireLogin();
if (!requireMenu(profile, 'profile')) await new Promise(() => {});
mountAdminLayout(profile, { active: 'profile' });

const box = document.getElementById('profile-box');
const errEl = document.getElementById('profile-error');
const noticeEl = document.getElementById('profile-notice');

if (!profile.staffId || !staff) {
  box.innerHTML = '<p>บัญชีนี้ยังไม่ได้ผูกกับข้อมูลบุคลากร กรุณาติดต่อผู้ดูแลระบบ</p>';
} else {
  const fields = editableStaffFields(profile, staff).filter((k) => ['photoUrl', 'bio', 'education', 'email'].includes(k));
  const fullName = [staff.prefix, staff.name].filter(Boolean).join('');
  const text = (k, label, type = 'text') =>
    `<div class="form-field"><label for="f-${k}">${label}</label><input id="f-${k}" name="${k}" type="${type}" value="${esc(staff[k] || '')}"></div>`;
  const area = (k, label) =>
    `<div class="form-field"><label for="f-${k}">${label}</label><textarea id="f-${k}" name="${k}">${esc(staff[k] || '')}</textarea></div>`;
  const photo = safeUrl(staff.photoUrl);
  box.innerHTML = `<p><strong>${esc(fullName)}</strong>${staff.position ? ` · ${esc(staff.position)}` : ''}</p>
<form id="profile-form" novalidate>
${fields.includes('photoUrl') ? `<div class="form-field"><span id="photo-label">รูปถ่าย</span>
<img id="photo-preview" class="photo-preview" alt="รูปถ่ายปัจจุบัน"${photo ? ` src="${esc(photo)}"` : ' hidden'}>
<input id="f-photo" type="file" accept="image/*" aria-labelledby="photo-label"></div>` : ''}
${fields.includes('bio') ? area('bio', 'ประวัติโดยย่อ') : ''}
${fields.includes('education') ? area('education', 'วุฒิการศึกษา') : ''}
${fields.includes('email') ? text('email', 'อีเมล', 'email') : ''}
<div class="form-actions"><button type="submit" class="btn" id="save-btn">บันทึก</button></div>
</form>`;

  const form = document.getElementById('profile-form');
  const fileInput = document.getElementById('f-photo');
  const preview = document.getElementById('photo-preview');
  let pendingFile = null;
  if (fileInput) fileInput.addEventListener('change', () => {
    pendingFile = fileInput.files[0] || null;
    if (pendingFile) { preview.src = URL.createObjectURL(pendingFile); preview.hidden = false; }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = ''; noticeEl.textContent = '';
    const saveBtn = document.getElementById('save-btn');
    saveBtn.disabled = true;
    try {
      const partial = {};
      for (const k of ['bio', 'education', 'email']) {
        if (fields.includes(k) && form.elements[k] && form.elements[k].value !== (staff[k] || '')) partial[k] = form.elements[k].value;
      }
      if (pendingFile) {
        partial.photoUrl = await uploadImage(`staff/${staff.id}/photo.jpg`, pendingFile);
      }
      if (!Object.keys(partial).length) { noticeEl.textContent = 'ไม่มีข้อมูลที่เปลี่ยนแปลง'; return; }
      await updateStaff(staff.id, partial);
      Object.assign(staff, partial);
      pendingFile = null; if (fileInput) fileInput.value = '';
      noticeEl.textContent = 'บันทึกเรียบร้อยแล้ว';
    } catch (err) {
      if (err instanceof ImageDecodeError || (err && err.message === TOO_LARGE_MESSAGE)) errEl.textContent = err.message;
      else if (err && (err.code === 'permission-denied' || err.code === 'storage/unauthorized')) errEl.textContent = 'ไม่มีสิทธิ์บันทึกข้อมูลนี้';
      else { console.error(err); errEl.textContent = 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'; }
    } finally {
      saveBtn.disabled = false;
    }
  });
}
