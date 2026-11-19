import { requireLogin } from '../auth-guard.js';
import { mountAdminLayout, requireMenu } from '../admin-ui.js';
import { isAdmin, isPrCentral, prDepts, canSaveNews } from '../lib/permissions.js';
import { getNewsForEditor, createDraftNews, saveNews, uploadImage, listDepartments } from '../data.js';
import { createSanitizer } from '../lib/sanitize.js';
import { buildNewsPayload, youtubeEmbedUrl } from '../lib/news-payload.js';
import { ImageDecodeError, TOO_LARGE_MESSAGE } from '../lib/image-resize.js';
import { promptDialog } from '../admin-dialog.js';
import { esc, safeUrl } from '../ui.js';

const { profile } = await requireLogin();
if (!requireMenu(profile, 'news')) await new Promise(() => {});
mountAdminLayout(profile, { active: 'news' });

const box = document.getElementById('edit-box');
const errEl = document.getElementById('edit-error');
const noticeEl = document.getElementById('edit-notice');
const heading = document.getElementById('edit-heading');

const central = isAdmin(profile) || isPrCentral(profile);
let id = new URLSearchParams(location.search).get('id');
let existing = null; // stored doc (or draft just created); null = nothing stored yet

if (!window.DOMPurify || !window.Quill) {
  box.innerHTML = '<p>โหลดเครื่องมือแก้ไขข่าวไม่สำเร็จ กรุณารีเฟรชหน้านี้</p>';
  await new Promise(() => {});
}
const sanitize = createSanitizer(window.DOMPurify);

if (id) {
  try {
    existing = await getNewsForEditor(id);
  } catch (e) {
    if (!(e && e.code === 'permission-denied')) console.error(e);
  }
  if (!existing) {
    box.innerHTML = '<p>ไม่พบข่าวนี้ หรือคุณไม่มีสิทธิ์เข้าถึง</p><p><a href="/admin/news.html">กลับไปรายการข่าว</a></p>';
    await new Promise(() => {});
  }
  const old = existing.departmentIds || [];
  if (!canSaveNews(profile, old, old)) {
    box.innerHTML = '<p>คุณไม่มีสิทธิ์แก้ไขข่าวนี้</p><p><a href="/admin/news.html">กลับไปรายการข่าว</a></p>';
    await new Promise(() => {});
  }
  heading.textContent = 'แก้ไขข่าว';
}

// ----- departments: all for admin/prc, only own for a dept PR -----
let depts = [];
try { depts = await listDepartments(); } catch (e) { console.error(e); }
if (!central) {
  const mine = prDepts(profile);
  depts = mine.map((d) => depts.find((x) => x.id === d) || { id: d, name: d });
}
const checkedIds = new Set(existing ? existing.departmentIds || [] : (!central && depts.length === 1 ? [depts[0].id] : []));

// ----- state of images -----
let coverUrl = existing ? existing.coverUrl || '' : '';
let images = existing && Array.isArray(existing.images) ? [...existing.images] : [];
let pendingCover = null;
let pendingGallery = [];

box.innerHTML = `<form id="news-form" novalidate>
<div class="form-field"><label for="f-title">หัวข้อข่าว</label><input id="f-title" name="title" type="text" value="${esc(existing ? existing.title : '')}"></div>
<div class="form-field"><span id="body-label">เนื้อหา</span><div id="editor" aria-labelledby="body-label"></div></div>
<div class="form-field"><span id="cover-label">รูปปก</span>
<div id="cover-box"></div>
<input id="f-cover" type="file" accept="image/*" aria-labelledby="cover-label"></div>
<div class="form-field"><span id="gallery-label">รูปประกอบ</span>
<div id="gallery-box" class="thumb-row"></div>
<input id="f-gallery" type="file" accept="image/*" multiple aria-labelledby="gallery-label"></div>
<fieldset class="form-field"><legend>ฝ่าย/กลุ่มสาระ${central ? ' (ไม่เลือก = ข่าวทั่วไป)' : ''}</legend>
<div class="check-grid" id="dept-grid">${depts.map((d) =>
    `<label><input type="checkbox" name="dept" value="${esc(d.id)}"${checkedIds.has(d.id) ? ' checked' : ''}> ${esc(d.name)}</label>`).join('')}</div></fieldset>
${central ? `<div class="form-field"><label><input type="checkbox" id="f-pinned"${existing && existing.pinned ? ' checked' : ''}> ปักหมุด</label></div>` : ''}
<div class="form-field"><label><input type="checkbox" id="f-published"${existing && existing.published ? ' checked' : ''}> เผยแพร่</label></div>
<div class="form-actions"><button type="submit" class="btn" id="save-btn">บันทึก</button>
<a class="btn btn-secondary" href="/admin/news.html">กลับไปรายการข่าว</a></div>
</form>`;

const form = document.getElementById('news-form');
const coverBox = document.getElementById('cover-box');
const galleryBox = document.getElementById('gallery-box');
const coverInput = document.getElementById('f-cover');
const galleryInput = document.getElementById('f-gallery');

function renderImages() {
  const c = safeUrl(coverUrl);
  coverBox.innerHTML = c
    ? `<img class="cover-preview" id="cover-preview" src="${esc(c)}" alt="รูปปกปัจจุบัน"><br><button type="button" class="btn-link" id="cover-remove">เอารูปปกออก</button>`
    : '<p class="muted">ยังไม่มีรูปปก</p>';
  const rm = document.getElementById('cover-remove');
  if (rm) rm.addEventListener('click', () => { coverUrl = ''; renderImages(); });
  galleryBox.innerHTML = images.map((u, i) => {
    const s = safeUrl(u);
    return s ? `<div class="thumb"><img src="${esc(s)}" alt="รูปประกอบ ${i + 1}"><button type="button" class="btn-link" data-rm="${i}">เอาออก</button></div>` : '';
  }).join('');
  galleryBox.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    images.splice(Number(b.dataset.rm), 1); renderImages();
  }));
}
renderImages();
coverInput.addEventListener('change', () => { pendingCover = coverInput.files[0] || null; });
galleryInput.addEventListener('change', () => { pendingGallery = Array.from(galleryInput.files); });

// ----- Quill: headers 2/3, bold, italic, underline, link, lists, blockquote, image (URL only), YouTube -----
const Quill = window.Quill;
const quill = new Quill('#editor', {
  theme: 'snow',
  formats: ['header', 'bold', 'italic', 'underline', 'link', 'list', 'blockquote', 'image', 'video'],
  modules: {
    toolbar: {
      container: [[{ header: [2, 3, false] }], ['bold', 'italic', 'underline', 'link'],
        [{ list: 'ordered' }, { list: 'bullet' }], ['blockquote'], ['image', 'video']],
      handlers: {
        async image() {
          const range = quill.getSelection(true);
          const url = await promptDialog({ title: 'แทรกรูปภาพ', label: 'ที่อยู่ลิงก์ของรูป (https://...)', okLabel: 'แทรกรูป' });
          if (url === null) return;
          const u = safeUrl(url.trim());
          if (!u) { errEl.textContent = 'ลิงก์รูปไม่ถูกต้อง ต้องขึ้นต้นด้วย https://'; return; }
          errEl.textContent = '';
          quill.insertEmbed(range.index, 'image', u, 'user');
        },
        async video() {
          const range = quill.getSelection(true);
          const url = await promptDialog({ title: 'แทรกวิดีโอ YouTube', label: 'ลิงก์วิดีโอ YouTube', okLabel: 'แทรกวิดีโอ' });
          if (url === null) return;
          const u = youtubeEmbedUrl(url);
          if (!u) { errEl.textContent = 'รองรับเฉพาะลิงก์ YouTube'; return; }
          errEl.textContent = '';
          quill.insertEmbed(range.index, 'video', u, 'user');
        },
      },
    },
    uploader: { handler() { errEl.textContent = 'ไม่รองรับการวางหรือลากรูปลงในเนื้อหา กรุณาอัปโหลดเป็นรูปประกอบ หรือแทรกด้วยลิงก์รูป'; } },
  },
});
const Delta = Quill.import('delta');
// pasted <img src="data:..."> (Word/Facebook/screenshots) is dropped; the sanitize step also strips them on save
quill.clipboard.addMatcher('IMG', (node, delta) => (/^\s*data:/i.test(node.getAttribute('src') || '') ? new Delta() : delta));
if (existing && existing.bodyHtml) quill.clipboard.dangerouslyPasteHTML(sanitize(existing.bodyHtml));

// ----- save -----
function readForm() {
  return {
    title: form.elements.title.value,
    bodyHtml: quill.getSemanticHTML(),
    coverUrl,
    images,
    departmentIds: Array.from(form.querySelectorAll('input[name="dept"]:checked')).map((c) => c.value),
    pinned: central ? document.getElementById('f-pinned').checked : false,
    published: document.getElementById('f-published').checked,
  };
}
const build = () => buildNewsPayload({ profile, form: readForm(), existing, sanitize });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.textContent = ''; noticeEl.textContent = '';
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  try {
    const check = build();
    if (check.error) { errEl.textContent = check.error; return; }
    if (!id) {
      id = await createDraftNews(profile, check.data.departmentIds);
      existing = { id, departmentIds: check.data.departmentIds, pinned: false, published: false };
      history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
      heading.textContent = 'แก้ไขข่าว';
    }
    if (pendingCover) {
      coverUrl = await uploadImage(`news/${id}/${crypto.randomUUID()}.jpg`, pendingCover);
      pendingCover = null; coverInput.value = ''; renderImages();
    }
    while (pendingGallery.length) {
      images.push(await uploadImage(`news/${id}/${crypto.randomUUID()}.jpg`, pendingGallery[0]));
      pendingGallery.shift(); renderImages();
    }
    galleryInput.value = '';
    const { data, error } = build(); // rebuilt: now holds the uploaded URLs
    if (error) { errEl.textContent = error; return; }
    await saveNews(id, data);
    existing = { ...existing, ...data };
    noticeEl.textContent = 'บันทึกเรียบร้อยแล้ว';
  } catch (err) {
    if (err instanceof ImageDecodeError || (err && err.message === TOO_LARGE_MESSAGE)) errEl.textContent = err.message;
    else if (err && (err.code === 'permission-denied' || err.code === 'storage/unauthorized')) errEl.textContent = 'ไม่มีสิทธิ์บันทึกข้อมูลนี้';
    else { console.error(err); errEl.textContent = 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'; }
  } finally {
    saveBtn.disabled = false;
  }
});
