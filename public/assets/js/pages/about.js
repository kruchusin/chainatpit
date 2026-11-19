import { mountLayout, esc, safeUrl, renderError } from '../ui.js';
import { createSanitizer } from '../lib/sanitize.js';

const { settings } = await mountLayout({ active: 'about' });
const box = document.getElementById('about');
try {
  const sanitize = createSanitizer(window.DOMPurify);
  const execs = (Array.isArray(settings.executives) ? settings.executives : []).map((x) => {
    const photo = safeUrl(x.photoUrl);
    return `<article class="staff-card">
  <div class="staff-photo">${photo ? `<img src="${esc(photo)}" alt="${esc(x.name)}" loading="lazy" width="160" height="160">` : '<div class="staff-photo-placeholder" aria-hidden="true"></div>'}</div>
  <h3 class="staff-name">${esc(x.name)}</h3>${x.position ? `<p class="staff-position">${esc(x.position)}</p>` : ''}</article>`;
  }).join('');
  const body = settings.aboutHtml ? sanitize(settings.aboutHtml) : '';
  box.innerHTML = `${body ? `<div class="article news-body" id="about-body">${body}</div>` : '<p class="muted">ยังไม่มีข้อมูลสถานศึกษา</p>'}
${execs ? `<section aria-labelledby="exec-h"><h2 id="exec-h">คณะผู้บริหาร</h2><div class="staff-grid" id="executives">${execs}</div></section>` : ''}`;
} catch (e) { renderError(box, e); }
