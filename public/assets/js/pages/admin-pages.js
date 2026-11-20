// "ข้อมูลสถานศึกษา" sub-pages: list, reorder, show/hide, edit (rich text + uploaded images + tables), delete.
import { requireLogin } from '../auth-guard.js';
import { mountAdminLayout, requireMenu } from '../admin-ui.js';
import {
  listInfoPagesForEditor, saveInfoPage, newInfoPageId, createInfoPages, deleteInfoPage, swapOrder, uploadImage,
} from '../data.js';
import { DEFAULT_PAGE_TITLES, buildPagePayload, sortPages, TITLE_MAX } from '../lib/info-pages.js';
import { swapOrders } from '../lib/staff-edit.js';
import { createSanitizer } from '../lib/sanitize.js';
import { youtubeEmbedUrl } from '../lib/news-payload.js';
import { ImageDecodeError, TOO_LARGE_MESSAGE } from '../lib/image-resize.js';
import { confirmDialog, promptDialog } from '../admin-dialog.js';
import { esc } from '../ui.js';

const { profile } = await requireLogin();
if (!requireMenu(profile, 'pages')) await new Promise(() => {});
mountAdminLayout(profile, { active: 'pages' });

const listEl = document.getElementById('page-list');
const boxEl = document.getElementById('page-form-box');
const defaultsBtn = document.getElementById('add-defaults');
const errEl = document.getElementById('page-error');
const noticeEl = document.getElementById('page-notice');
const clear = () => { errEl.textContent = ''; noticeEl.textContent = ''; };
const fail = (e, fallback) => {
  if (e instanceof ImageDecodeError || (e && e.message === TOO_LARGE_MESSAGE)) { errEl.textContent = e.message; return; }
  console.error(e);
  errEl.textContent = e && (e.code === 'permission-denied' || e.code === 'FORBIDDEN') ? 'ไม่มีสิทธิ์ดำเนินการนี้' : fallback;
};

if (!window.DOMPurify || !window.Quill) {
  listEl.innerHTML = '<li>โหลดเครื่องมือแก้ไขไม่สำเร็จ กรุณารีเฟรชหน้านี้</li>';
  await new Promise(() => {});
}
const sanitize = createSanitizer(window.DOMPurify);

let pages = [];
let dirty = false; // unsaved edits in the open form
const nextOrder = () => (pages.length ? Math.max(...pages.map((p) => p.order ?? 0)) + 1 : 1);

async function load() {
  try {
    pages = await listInfoPagesForEditor();
    render();
  } catch (e) {
    listEl.innerHTML = '';
    fail(e, 'ไม่สามารถโหลดรายการได้ กรุณาลองใหม่อีกครั้ง');
  }
}

function render() {
  pages = sortPages(pages);
  defaultsBtn.hidden = pages.length > 0;
  listEl.innerHTML = '';
  if (!pages.length) { listEl.innerHTML = '<li class="muted">ยังไม่มีหัวข้อ กด "เพิ่มหัวข้อเริ่มต้น 10 หัวข้อ" เพื่อเริ่มจากหัวข้อของเว็บเดิม</li>'; return; }
  pages.forEach((p, i) => {
    const li = document.createElement('li');
    li.dataset.id = p.id;
    li.innerHTML = `<span class="item-title">${esc(p.title)}
<span class="badge-status${p.published ? '' : ' badge-draft'}">${p.published ? 'แสดง' : 'ซ่อน'}</span>
${p.bodyHtml ? '' : '<span class="item-meta">(ยังไม่มีเนื้อหา)</span>'}</span>
<span class="row-actions">
<button type="button" class="btn btn-secondary btn-small" data-up aria-label="เลื่อน ${esc(p.title)} ขึ้น"${i === 0 ? ' disabled' : ''}>▲</button>
<button type="button" class="btn btn-secondary btn-small" data-down aria-label="เลื่อน ${esc(p.title)} ลง"${i === pages.length - 1 ? ' disabled' : ''}>▼</button>
${p.published ? `<a class="btn btn-secondary btn-small" href="/about.html?p=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">ดูหน้าเว็บ</a>` : ''}
<button type="button" class="btn btn-secondary btn-small" data-edit>แก้ไข</button>
<button type="button" class="btn btn-danger btn-small" data-delete>ลบ</button></span>`;
    li.querySelector('[data-up]').addEventListener('click', () => move(pages[i - 1], p));
    li.querySelector('[data-down]').addEventListener('click', () => move(p, pages[i + 1]));
    li.querySelector('[data-edit]').addEventListener('click', () => openForm(p));
    li.querySelector('[data-delete]').addEventListener('click', () => remove(p));
    listEl.appendChild(li);
  });
}

async function move(first, second) {
  clear();
  try {
    await swapOrder('pages', first, second);
    for (const w of swapOrders(first, second)) pages.find((x) => x.id === w.id).order = w.order;
    render();
  } catch (e) { fail(e, 'เลื่อนลำดับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'); }
}

async function remove(p) {
  clear();
  const ok = await confirmDialog({ title: 'ลบหัวข้อ', message: `ลบ "${p.title}" พร้อมรูปในหัวข้อนี้? กู้คืนไม่ได้`, okLabel: 'ลบ', danger: true });
  if (!ok) return;
  try {
    await deleteInfoPage(p.id);
    pages = pages.filter((x) => x.id !== p.id);
    if (boxEl.dataset.id === p.id) closeForm();
    render();
    noticeEl.textContent = 'ลบหัวข้อเรียบร้อยแล้ว';
  } catch (e) { fail(e, 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'); }
}

defaultsBtn.addEventListener('click', async () => {
  clear();
  defaultsBtn.disabled = true;
  try {
    await createInfoPages(DEFAULT_PAGE_TITLES, nextOrder());
    await load();
    noticeEl.textContent = 'เพิ่ม 10 หัวข้อแล้ว (ยังซ่อนอยู่) กด "แก้ไข" เพื่อใส่เนื้อหาและติ๊ก "แสดงในเมนู"';
  } catch (e) { fail(e, 'เพิ่มหัวข้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'); } finally { defaultsBtn.disabled = false; }
});
document.getElementById('add-page').addEventListener('click', () => openForm(null));

function closeForm() { boxEl.hidden = true; boxEl.innerHTML = ''; delete boxEl.dataset.id; dirty = false; }

async function openForm(p) {
  clear();
  if (dirty && !(await confirmDialog({ title: 'ยังไม่ได้บันทึก', message: 'ทิ้งการแก้ไขที่ยังไม่บันทึก?', okLabel: 'ทิ้ง', danger: true }))) return;
  const isNew = !p;
  const id = p ? p.id : newInfoPageId(); // known up front so images can be uploaded under pages/<id>/
  const cur = p || { title: '', bodyHtml: '', order: nextOrder(), published: true };
  boxEl.hidden = false;
  boxEl.dataset.id = id;
  boxEl.innerHTML = `<h2>${isNew ? 'เพิ่มหัวข้อ' : `แก้ไข: ${esc(cur.title)}`}</h2><form id="page-form" novalidate>
<div class="form-field"><label for="p-title">ชื่อหัวข้อ (แสดงในเมนู)</label><input id="p-title" name="title" type="text" maxlength="${TITLE_MAX}" value="${esc(cur.title)}"></div>
<label class="check-inline"><input type="checkbox" name="published"${cur.published ? ' checked' : ''}> แสดงในเมนูของหน้าเว็บ</label>
<div class="form-field"><span id="body-label">เนื้อหา</span>
<p class="muted">ปุ่มรูปภาพ = อัปโหลดรูปจากเครื่อง · ปุ่ม "ตาราง" = แทรกตาราง 3×3 แล้วคลิกในตารางเพื่อเพิ่ม/ลบแถวหรือคอลัมน์</p>
<div id="page-editor" aria-labelledby="body-label"></div></div>
<div class="form-actions"><button type="submit" class="btn" id="p-save">บันทึก</button>
<button type="button" class="btn btn-secondary" id="p-cancel">ปิด</button></div></form>`;

  const quill = makeEditor(id);
  if (cur.bodyHtml) quill.clipboard.dangerouslyPasteHTML(sanitize(cur.bodyHtml));
  dirty = false;
  quill.on('text-change', (_d, _o, source) => { if (source === 'user') dirty = true; });
  const form = boxEl.querySelector('#page-form');
  form.addEventListener('input', () => { dirty = true; });
  boxEl.querySelector('#p-cancel').addEventListener('click', async () => {
    if (dirty && !(await confirmDialog({ title: 'ยังไม่ได้บันทึก', message: 'ทิ้งการแก้ไขที่ยังไม่บันทึก?', okLabel: 'ทิ้ง', danger: true }))) return;
    closeForm();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clear();
    const { data, error } = buildPagePayload({
      title: form.elements.title.value, bodyHtml: quill.getSemanticHTML(),
      order: cur.order, published: form.elements.published.checked,
    }, sanitize);
    if (error) { errEl.textContent = error; return; }
    const btn = boxEl.querySelector('#p-save');
    btn.disabled = true;
    try {
      await saveInfoPage(id, data);
      const i = pages.findIndex((x) => x.id === id);
      if (i >= 0) pages[i] = { id, ...data }; else pages.push({ id, ...data });
      render();
      dirty = false;
      boxEl.querySelector('h2').textContent = `แก้ไข: ${data.title}`;
      noticeEl.textContent = data.published ? 'บันทึกแล้ว หัวข้อนี้แสดงในเมนูของหน้าเว็บ' : 'บันทึกแล้ว (ซ่อนอยู่ ยังไม่แสดงบนหน้าเว็บ)';
    } catch (err) { fail(err, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'); } finally { btn.disabled = false; }
  });
  boxEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// school palette (purple / gold, as on the school's printed materials) + a few accents
const TEXT_COLORS = ['#1f2933', '#5b2a86', '#8e44ad', '#b8860b', '#c0392b', '#1f6f43', '#1c4e80', '#d35400', '#7f8c8d'];
const HIGHLIGHTS = [false, '#f3e8ff', '#fff3cd', '#fde2e1', '#e8f4ea', '#e3f0fb'];

function makeEditor(id) {
  const Quill = window.Quill;
  // alignment as inline style (kept by the sanitizer) instead of ql-align-* classes
  Quill.register(Quill.import('attributors/style/align'), true);
  const table = () => quill.getModule('table');
  const inTable = (fn) => () => {
    quill.focus();
    const [cell] = table().getTable();
    if (!cell) { errEl.textContent = 'กรุณาคลิกในตารางก่อน'; return; }
    errEl.textContent = '';
    fn(table());
  };
  const quill = new Quill('#page-editor', {
    theme: 'snow',
    formats: ['header', 'bold', 'italic', 'underline', 'strike', 'color', 'background', 'align', 'link', 'list', 'indent', 'blockquote', 'image', 'video', 'table'],
    modules: {
      table: true,
      toolbar: {
        container: [[{ header: [2, 3, false] }], ['bold', 'italic', 'underline', 'strike', 'link'],
          [{ color: TEXT_COLORS }, { background: HIGHLIGHTS }], [{ align: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }], ['blockquote'], ['image', 'video'],
          ['tbl-insert', 'tbl-row', 'tbl-col', 'tbl-delrow', 'tbl-delcol', 'tbl-del']],
        handlers: {
          image() {
            const range = quill.getSelection(true);
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.addEventListener('change', async () => {
              const file = input.files[0];
              if (!file) return;
              clear();
              noticeEl.textContent = 'กำลังอัปโหลดรูป...';
              try {
                const url = await uploadImage(`pages/${id}/${crypto.randomUUID()}.jpg`, file);
                quill.insertEmbed(range.index, 'image', url, 'user');
                quill.setSelection(range.index + 1, 0, 'silent');
                noticeEl.textContent = 'แทรกรูปแล้ว อย่าลืมกดบันทึก';
              } catch (e) { noticeEl.textContent = ''; fail(e, 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'); }
            });
            input.click();
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
          'tbl-insert': () => { quill.focus(); table().insertTable(3, 3); },
          'tbl-row': inTable((t) => t.insertRowBelow()),
          'tbl-col': inTable((t) => t.insertColumnRight()),
          'tbl-delrow': inTable((t) => t.deleteRow()),
          'tbl-delcol': inTable((t) => t.deleteColumn()),
          'tbl-del': inTable((t) => t.deleteTable()),
        },
      },
      uploader: { handler() { errEl.textContent = 'กรุณาใช้ปุ่มรูปภาพบนแถบเครื่องมือเพื่ออัปโหลดรูป'; } },
    },
  });
  quill.root.setAttribute('aria-labelledby', 'body-label');
  quill.root.classList.add('info-body'); // same look as the public page
  [['tbl-insert', 'แทรกตาราง'], ['tbl-row', 'เพิ่มแถว'], ['tbl-col', 'เพิ่มคอลัมน์'], ['tbl-delrow', 'ลบแถว'], ['tbl-delcol', 'ลบคอลัมน์'], ['tbl-del', 'ลบตาราง']]
    .forEach(([k, label]) => { const b = boxEl.querySelector(`.ql-${k}`); if (b) b.setAttribute('aria-label', label); });
  return quill;
}

window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

await load();
