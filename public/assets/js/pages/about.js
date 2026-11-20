import { mountLayout, renderStaffCard, renderError, NOT_FOUND_HTML, esc } from '../ui.js';
import { getInfoPage } from '../data.js';
import { createSanitizer } from '../lib/sanitize.js';

// /about.html            -> overview (settings.aboutHtml + executives + links to the sub-pages)
// /about.html?p=<pageId> -> one sub-page from the `pages` collection
const pageId = new URLSearchParams(location.search).get('p');
const { settings, pages } = await mountLayout({ active: 'about', activePage: pageId });
const box = document.getElementById('about');
const heading = document.querySelector('main h1');

const clean = (html) => {
  try { return html ? createSanitizer(window.DOMPurify)(html) : ''; } catch (e) { console.error(e); return ''; }
};

if (pageId) {
  try {
    const page = await getInfoPage(pageId);
    if (!page || page.published !== true) {
      box.innerHTML = NOT_FOUND_HTML;
    } else {
      heading.textContent = page.title;
      document.title = `${page.title} - ข้อมูลสถานศึกษา`;
      const body = clean(page.bodyHtml);
      box.innerHTML = body ? `<div class="article news-body">${body}</div>` : '<p class="muted">ยังไม่มีเนื้อหาในหัวข้อนี้</p>';
    }
  } catch (e) { renderError(box, e); }
} else {
  // Body is sanitized on its own: if DOMPurify failed to load the body is omitted but executives still render.
  const body = clean(settings.aboutHtml);
  try {
    const execs = (Array.isArray(settings.executives) ? settings.executives : [])
      .map((x) => renderStaffCard({ name: x.name, position: x.position, photoUrl: x.photoUrl })).join('');
    const links = (pages || []).map((p) => `<li><a href="/about.html?p=${encodeURIComponent(p.id)}">${esc(p.title)}</a></li>`).join('');
    box.innerHTML = `${body ? `<div class="article news-body" id="about-body">${body}</div>` : (links ? '' : '<p class="muted">ยังไม่มีข้อมูลสถานศึกษา</p>')}
${links ? `<section aria-labelledby="topics-h"><h2 id="topics-h">หัวข้อข้อมูลสถานศึกษา</h2><ul class="topic-list">${links}</ul></section>` : ''}
${execs ? `<section aria-labelledby="exec-h"><h2 id="exec-h">คณะผู้บริหาร</h2><div class="staff-grid" id="executives">${execs}</div></section>` : ''}`;
  } catch (e) { renderError(box, e); }
}
