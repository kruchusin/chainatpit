import { requireLogin } from '../auth-guard.js';
import { mountAdminLayout, requireMenu } from '../admin-ui.js';
import { getSettings, saveSettings, uploadImage } from '../data.js';
import { createSanitizer } from '../lib/sanitize.js';
import { buildSettingsPayload } from '../lib/settings-edit.js';
import { ImageDecodeError, TOO_LARGE_MESSAGE } from '../lib/image-resize.js';
import { esc, safeUrl } from '../ui.js';

const { profile } = await requireLogin();
if (!requireMenu(profile, 'settings')) await new Promise(() => {});
mountAdminLayout(profile, { active: 'settings' });

const box = document.getElementById('settings-box');
const errEl = document.getElementById('page-error');
const noticeEl = document.getElementById('page-notice');
const clear = () => { errEl.textContent = ''; noticeEl.textContent = ''; };

if (!window.DOMPurify || !window.Quill) {
  box.innerHTML = '<p>โหลดเครื่องมือแก้ไขไม่สำเร็จ กรุณารีเฟรชหน้านี้</p>';
  await new Promise(() => {});
}
const sanitize = createSanitizer(window.DOMPurify);

let settings = {};
try {
  settings = await getSettings();
} catch (e) {
  console.error(e);
  box.innerHTML = '<p>ไม่สามารถโหลดการตั้งค่าได้ กรุณาลองใหม่อีกครั้ง</p>';
  await new Promise(() => {});
}

const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
// working copies; `file` = picked image waiting for upload on save
let logoUrl = settings.logoUrl || ''; let logoFile = null;
let banners = (Array.isArray(settings.banners) ? settings.banners : []).map((b) => ({ imageUrl: b.imageUrl || '', linkUrl: b.linkUrl || '', file: null }));
let execs = (Array.isArray(settings.executives) ? settings.executives : []).map((x) => ({ name: x.name || '', position: x.position || '', photoUrl: x.photoUrl || '', file: null }));

box.innerHTML = `<form id="settings-form" novalidate>
<div class="form-field"><label for="s-name">ชื่อโรงเรียน</label><input id="s-name" name="schoolName" type="text" value="${esc(settings.schoolName || '')}"></div>
<div class="form-field"><span id="logo-label">โลโก้ (รูป JPG/PNG)</span><div id="logo-preview"></div>
<input id="s-logo" type="file" accept="image/*" aria-labelledby="logo-label"></div>
<fieldset class="form-field"><legend>แบนเนอร์</legend><div id="banner-rows"></div>
<button type="button" class="btn btn-secondary" id="add-banner">เพิ่มแบนเนอร์</button></fieldset>
<div class="form-field"><label for="s-address">ที่อยู่</label><textarea id="s-address" name="address">${esc(settings.address || '')}</textarea></div>
<div class="form-field"><label for="s-phone">เบอร์โทรศัพท์โรงเรียน</label><input id="s-phone" name="phone" type="text" value="${esc(settings.phone || '')}"></div>
<div class="form-field"><label for="s-fb">ลิงก์ Facebook</label><input id="s-fb" name="facebookUrl" type="url" placeholder="https://" value="${esc(settings.facebookUrl || '')}"></div>
<div class="form-field"><span id="about-label">ข้อมูลสถานศึกษา</span><div id="about-editor" aria-labelledby="about-label"></div></div>
<fieldset class="form-field"><legend>คณะผู้บริหาร</legend><div id="exec-rows"></div>
<button type="button" class="btn btn-secondary" id="add-exec">เพิ่มผู้บริหาร</button></fieldset>
<div class="form-actions"><button type="submit" class="btn" id="s-save">บันทึกการตั้งค่า</button></div></form>`;

const preview = (url, alt) => { const u = safeUrl(url); return u ? `<img class="cover-preview" src="${esc(u)}" alt="${esc(alt)}" width="120">` : '<p class="muted">ยังไม่มีรูป</p>'; };
const logoPrev = document.getElementById('logo-preview');
const renderLogo = () => { logoPrev.innerHTML = preview(logoUrl, 'โลโก้โรงเรียน'); };
renderLogo();
document.getElementById('s-logo').addEventListener('change', (e) => { logoFile = e.target.files[0] || null; });

// Generic list editor: rows hold text inputs bound to state + an optional image input.
function wireRows(container, list, fields, imageKey, imageLabel, render) {
  container.innerHTML = '';
  list.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'card-panel';
    row.dataset.index = i;
    row.innerHTML = `${fields.map(([key, label, type]) => `<div class="form-field"><label for="${container.id}-${key}-${i}">${esc(label)}</label>
<input id="${container.id}-${key}-${i}" data-key="${key}" type="${type}" value="${esc(item[key])}"></div>`).join('')}
<div class="form-field"><span id="${container.id}-img-${i}">${esc(imageLabel)}</span>${preview(item[imageKey], imageLabel)}
<input data-file type="file" accept="image/*" aria-labelledby="${container.id}-img-${i}"></div>
<button type="button" class="btn btn-danger btn-small" data-remove>ลบรายการนี้</button>`;
    row.querySelectorAll('input[data-key]').forEach((inp) => inp.addEventListener('input', () => { item[inp.dataset.key] = inp.value; }));
    row.querySelector('[data-file]').addEventListener('change', (e) => { item.file = e.target.files[0] || null; });
    row.querySelector('[data-remove]').addEventListener('click', () => { list.splice(i, 1); render(); });
    container.appendChild(row);
  });
}
const renderBanners = () => wireRows(document.getElementById('banner-rows'), banners,
  [['linkUrl', 'ลิงก์เมื่อคลิกแบนเนอร์ (ไม่บังคับ)', 'url']], 'imageUrl', 'รูปแบนเนอร์', renderBanners);
const renderExecs = () => wireRows(document.getElementById('exec-rows'), execs,
  [['name', 'ชื่อ-สกุล', 'text'], ['position', 'ตำแหน่ง', 'text']], 'photoUrl', 'รูปผู้บริหาร', renderExecs);
renderBanners(); renderExecs();
document.getElementById('add-banner').addEventListener('click', () => { banners.push({ imageUrl: '', linkUrl: '', file: null }); renderBanners(); });
document.getElementById('add-exec').addEventListener('click', () => { execs.push({ name: '', position: '', photoUrl: '', file: null }); renderExecs(); });

// ----- Quill (no image/video: the about text is plain rich text) -----
const quill = new window.Quill('#about-editor', {
  theme: 'snow',
  formats: ['header', 'bold', 'italic', 'underline', 'link', 'list', 'blockquote'],
  modules: { toolbar: [[{ header: [2, 3, false] }], ['bold', 'italic', 'underline', 'link'], [{ list: 'ordered' }, { list: 'bullet' }], ['blockquote']] },
});
if (settings.aboutHtml) quill.clipboard.dangerouslyPasteHTML(sanitize(settings.aboutHtml));

// ----- save -----
async function uploadPending() {
  if (logoFile) { logoUrl = await uploadImage('site/logo.jpg', logoFile); logoFile = null; }
  for (const b of banners) if (b.file) { b.imageUrl = await uploadImage(`site/banner-${rid()}.jpg`, b.file); b.file = null; }
  for (const x of execs) if (x.file) { x.photoUrl = await uploadImage(`site/exec-${rid()}.jpg`, x.file); x.file = null; }
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clear();
  const btn = document.getElementById('s-save');
  const el = e.target.elements;
  // validate text first so nothing is uploaded for a form that cannot be saved
  const text = { schoolName: el.schoolName.value, facebookUrl: el.facebookUrl.value, banners: banners.map((b) => ({ imageUrl: b.imageUrl || 'pending', linkUrl: b.linkUrl })) };
  const pre = buildSettingsPayload({ form: { ...text, executives: [] }, sanitize });
  if (pre.error) { errEl.textContent = pre.error; return; }
  btn.disabled = true;
  try {
    await uploadPending();
    const { data, error } = buildSettingsPayload({
      form: {
        schoolName: el.schoolName.value, logoUrl, banners, address: el.address.value, phone: el.phone.value,
        facebookUrl: el.facebookUrl.value, aboutHtml: quill.getSemanticHTML(), executives: execs,
      },
      sanitize,
    });
    if (error) { errEl.textContent = error; return; }
    await saveSettings(data);
    noticeEl.textContent = 'บันทึกการตั้งค่าเรียบร้อยแล้ว';
    renderLogo(); renderBanners(); renderExecs();
  } catch (err) {
    if (err instanceof ImageDecodeError || (err && err.message === TOO_LARGE_MESSAGE)) errEl.textContent = err.message;
    else {
      console.error(err);
      errEl.textContent = err && (err.code === 'permission-denied' || err.code === 'storage/unauthorized') ? 'ไม่มีสิทธิ์ดำเนินการนี้' : 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    }
  } finally {
    btn.disabled = false;
  }
});
