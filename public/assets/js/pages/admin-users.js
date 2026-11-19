import { requireLogin } from '../auth-guard.js';
import { mountAdminLayout, requireMenu } from '../admin-ui.js';
import { listUsers, listStaffForEditor, listDepartments, callAdminUsers, updateUserRole } from '../data.js';
import { confirmDialog, promptDialog } from '../admin-dialog.js';
import { validateCreateAccount, checkRoleChange, joinUsersWithStaff, ROLES, ROLE_LABELS, RECOVERED_MESSAGE, MIN_PASSWORD, PASSWORD_MESSAGE } from '../lib/user-admin.js';
import { esc } from '../ui.js';

const { profile } = await requireLogin();
if (!requireMenu(profile, 'users')) await new Promise(() => {});
mountAdminLayout(profile, { active: 'users' });

const listEl = document.getElementById('user-list');
const createBox = document.getElementById('create-box');
const createBtn = document.getElementById('create-btn');
const errEl = document.getElementById('page-error');
const noticeEl = document.getElementById('page-notice');
const clear = () => { errEl.textContent = ''; noticeEl.textContent = ''; };
const fail = (e, fallback) => {
  if (e && e.code === 'permission-denied') { errEl.textContent = 'ไม่มีสิทธิ์ดำเนินการนี้'; return; }
  if (e && typeof e.message === 'string' && /[฀-๿]/.test(e.message)) { errEl.textContent = e.message; return; }
  console.error(e);
  errEl.textContent = fallback;
};

let users = []; let staff = []; let depts = [];
const roleOptions = (value) => ROLES.map((r) => `<option value="${r}"${r === value ? ' selected' : ''}>${esc(ROLE_LABELS[r])}</option>`).join('');

function rows() { return joinUsersWithStaff(users, staff); }

function row(u) {
  const own = u.uid === profile.uid;
  const li = document.createElement('li');
  li.dataset.uid = u.uid;
  const deptNames = (u.prDepartments || []).map((id) => (depts.find((d) => d.id === id) || {}).name || id);
  li.innerHTML = `<div class="user-head"><span class="item-title">${esc(u.staffName || '(ไม่ผูกกับบุคลากร)')}<br><span class="item-meta">${esc(u.email || '')}</span></span>
<span class="badge-status">${esc(ROLE_LABELS[u.role] || u.role || '')}</span>
${u.disabled ? '<span class="badge-status badge-hidden">ปิดบัญชี</span>' : ''}
<span class="row-actions">
<button type="button" class="btn btn-secondary btn-small" data-role-edit>แก้บทบาท</button>
<button type="button" class="btn btn-secondary btn-small" data-setpw>ตั้งรหัสผ่านใหม่</button>
${own ? '' : `<button type="button" class="btn ${u.disabled ? 'btn-secondary' : 'btn-danger'} btn-small" data-toggle>${u.disabled ? 'เปิดบัญชี' : 'ปิดบัญชี'}</button>`}</span></div>
${deptNames.length ? `<p class="item-meta">ฝ่ายที่รับผิดชอบ: ${deptNames.map((n) => `<span class="chip">${esc(n)}</span>`).join('')}</p>` : ''}
<form class="role-form" hidden novalidate>
<div class="form-field"><label for="r-${esc(u.uid)}">บทบาท</label><select id="r-${esc(u.uid)}" name="role">${roleOptions(u.role)}</select></div>
<fieldset class="form-field"><legend>ฝ่ายที่รับผิดชอบ (ผู้ประชาสัมพันธ์ประจำฝ่าย)</legend>
${depts.map((d) => `<label class="check"><input type="checkbox" name="dept" value="${esc(d.id)}"${(u.prDepartments || []).includes(d.id) ? ' checked' : ''}> ${esc(d.name)}</label>`).join(' ')}</fieldset>
<div class="form-actions"><button type="submit" class="btn">บันทึกสิทธิ์</button></div></form>`;
  const form = li.querySelector('.role-form');
  li.querySelector('[data-role-edit]').addEventListener('click', () => { form.hidden = !form.hidden; });
  form.addEventListener('submit', (e) => { e.preventDefault(); saveRole(u, form); });
  li.querySelector('[data-setpw]').addEventListener('click', () => setPassword(u));
  const t = li.querySelector('[data-toggle]');
  if (t) t.addEventListener('click', () => toggleDisabled(u));
  return li;
}

function render() {
  listEl.innerHTML = '';
  const all = rows();
  all.forEach((u) => listEl.appendChild(row(u)));
  if (!all.length) listEl.innerHTML = '<li class="muted">ยังไม่มีผู้ใช้</li>';
}

async function saveRole(u, form) {
  clear();
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const res = checkRoleChange({
      callerUid: profile.uid, targetUid: u.uid, currentRole: u.role, role: form.elements.role.value,
      prDepartments: Array.from(form.querySelectorAll('input[name="dept"]:checked')).map((c) => c.value),
    });
    if (res.error) { errEl.textContent = res.error; return; }
    await updateUserRole(u.uid, res.data);
    Object.assign(u, res.data);
    noticeEl.textContent = 'บันทึกสิทธิ์เรียบร้อยแล้ว';
    render();
  } catch (e) {
    fail(e, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  } finally {
    btn.disabled = false;
  }
}

async function setPassword(u) {
  clear();
  const pw = await promptDialog({
    title: 'ตั้งรหัสผ่านใหม่', label: `รหัสผ่านใหม่ของ ${u.email || u.uid} (อย่างน้อย ${MIN_PASSWORD} ตัวอักษร)`,
    okLabel: 'ตั้งรหัสผ่าน', inputType: 'password',
  });
  if (pw === null) return;
  if (pw.length < MIN_PASSWORD) { errEl.textContent = PASSWORD_MESSAGE; return; }
  try {
    await callAdminUsers('setPassword', { uid: u.uid, password: pw });
    noticeEl.textContent = 'ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว';
  } catch (e) {
    fail(e, 'ตั้งรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
}

async function toggleDisabled(u) {
  clear();
  const disable = !u.disabled;
  const ok = await confirmDialog({
    title: disable ? 'ยืนยันการปิดบัญชี' : 'ยืนยันการเปิดบัญชี',
    message: disable ? `ต้องการปิดบัญชี ${u.email} ใช่หรือไม่ ผู้ใช้จะถูกออกจากระบบและเข้าสู่ระบบไม่ได้`
      : `ต้องการเปิดบัญชี ${u.email} ใช่หรือไม่`,
    okLabel: disable ? 'ปิดบัญชี' : 'เปิดบัญชี', danger: disable,
  });
  if (!ok) return;
  try {
    await callAdminUsers('setDisabled', { uid: u.uid, disabled: disable });
    u.disabled = disable;
    noticeEl.textContent = disable ? 'ปิดบัญชีเรียบร้อยแล้ว' : 'เปิดบัญชีเรียบร้อยแล้ว';
    render();
  } catch (e) {
    fail(e, 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
}

// ---- create ----
function renderCreate() {
  const free = staff.filter((s) => !s.uid).sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'));
  createBox.innerHTML = `<h2>สร้างบัญชี</h2>${free.length ? `<form id="create-form" novalidate>
<div class="form-field"><label for="c-staff">บุคลากร (ที่ยังไม่มีบัญชี)</label><select id="c-staff" name="staffId">
<option value="">-- เลือกบุคลากร --</option>${free.map((s) => `<option value="${esc(s.id)}">${esc([s.prefix, s.name].filter(Boolean).join(''))}</option>`).join('')}</select></div>
<div class="form-field"><label for="c-email">อีเมล</label><input id="c-email" name="email" type="email" autocomplete="off"></div>
<div class="form-field"><label for="c-password">รหัสผ่านเริ่มต้น (อย่างน้อย ${MIN_PASSWORD} ตัวอักษร)</label><input id="c-password" name="password" type="password" autocomplete="new-password"></div>
<div class="form-field"><label for="c-role">บทบาท</label><select id="c-role" name="role">${roleOptions('teacher')}</select></div>
<div class="form-actions"><button type="submit" class="btn" id="c-submit">สร้างบัญชี</button></div></form>`
    : '<p class="muted">บุคลากรทุกคนมีบัญชีแล้ว</p>'}`;
  const form = document.getElementById('create-form');
  if (form) form.addEventListener('submit', onCreate);
}

async function onCreate(e) {
  e.preventDefault();
  clear();
  const form = e.target;
  const btn = document.getElementById('c-submit');
  const v = validateCreateAccount({
    staffId: form.elements.staffId.value, email: form.elements.email.value,
    password: form.elements.password.value, role: form.elements.role.value,
  });
  if (v.error) { errEl.textContent = v.error; return; }
  btn.disabled = true;
  try {
    const s = staff.find((x) => x.id === v.data.staffId);
    const out = await callAdminUsers('create', { ...v.data, displayName: s ? [s.prefix, s.name].filter(Boolean).join('') : undefined });
    noticeEl.textContent = out.recovered ? RECOVERED_MESSAGE : 'สร้างบัญชีเรียบร้อยแล้ว';
    form.reset();
    createBox.hidden = true;
    await reload();
  } catch (err) {
    fail(err, 'สร้างบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  } finally {
    btn.disabled = false;
  }
}

createBtn.addEventListener('click', () => {
  clear();
  createBox.hidden = !createBox.hidden;
  if (!createBox.hidden) renderCreate();
});

async function reload() {
  [users, staff, depts] = await Promise.all([listUsers(), listStaffForEditor(profile), listDepartments()]);
  render();
}

try {
  await reload();
} catch (e) {
  listEl.innerHTML = '';
  fail(e, 'ไม่สามารถโหลดรายชื่อผู้ใช้ได้ กรุณาลองใหม่อีกครั้ง');
}
