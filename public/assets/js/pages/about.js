import { mountLayout, renderStaffCard, renderError } from '../ui.js';
import { createSanitizer } from '../lib/sanitize.js';

const { settings } = await mountLayout({ active: 'about' });
const box = document.getElementById('about');

// Body is sanitized on its own: if DOMPurify failed to load the body is omitted but executives still render.
let body = '';
try {
  if (settings.aboutHtml) body = createSanitizer(window.DOMPurify)(settings.aboutHtml);
} catch (e) { console.error(e); }

try {
  const execs = (Array.isArray(settings.executives) ? settings.executives : [])
    .map((x) => renderStaffCard({ name: x.name, position: x.position, photoUrl: x.photoUrl })).join('');
  box.innerHTML = `${body ? `<div class="article news-body" id="about-body">${body}</div>` : '<p class="muted">ยังไม่มีข้อมูลสถานศึกษา</p>'}
${execs ? `<section aria-labelledby="exec-h"><h2 id="exec-h">คณะผู้บริหาร</h2><div class="staff-grid" id="executives">${execs}</div></section>` : ''}`;
} catch (e) { renderError(box, e); }
