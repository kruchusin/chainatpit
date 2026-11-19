// Parsing logic over a minimal DOM interface: childNodes, nodeType (3 = text), tagName, getAttribute, textContent,
// and (optionally) querySelectorAll on the root. Works with node-html-parser and with hand-built fakes.
import { findThaiDate, normalizeThaiText } from './thai-date.mjs';
import { splitThaiPrefix } from './thai-name.mjs';
import { defaultParse } from './parse-html.mjs';

const SKIP = new Set(['SCRIPT', 'STYLE', 'NAV', 'HEADER', 'FOOTER', 'NOSCRIPT', 'SVG', 'IFRAME', 'BUTTON']);
const HEADING = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const BLOCK = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'SECTION', 'ARTICLE', 'TABLE', 'TR', 'TD', 'MAIN',
  'BLOCKQUOTE', 'FIGURE', ...HEADING]);

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isText = (n) => n.nodeType === 3;
const tag = (n) => String(n.tagName || '').toUpperCase();
const kids = (n) => n.childNodes || [];

function absUrl(u) {
  const s = String(u ?? '').trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  return '';
}
const imgSrc = (n) => absUrl(n.getAttribute('src')) || absUrl(n.getAttribute('data-src'));

function hasBlockDescendant(node) {
  return kids(node).some((c) => !isText(c) && !SKIP.has(tag(c)) && (BLOCK.has(tag(c)) || hasBlockDescendant(c)));
}

function collectImgs(node, out) {
  for (const c of kids(node)) {
    if (isText(c)) continue;
    if (tag(c) === 'IMG') { const s = imgSrc(c); if (s) out.push(s); } else if (!SKIP.has(tag(c))) collectImgs(c, out);
  }
}

function inline(node, links) {
  let html = '';
  for (const c of kids(node)) {
    if (isText(c)) { html += esc(c.textContent.replace(/\s+/g, ' ')); continue; }
    const t = tag(c);
    if (SKIP.has(t) || t === 'IMG') continue;
    if (t === 'BR') html += '<br>';
    else if (t === 'A') {
      const href = absUrl(c.getAttribute('href'));
      const inner = inline(c, links);
      if (href && inner.trim()) { links.push(href); html += `<a href="${esc(href)}">${inner.trim()}</a>`; } else html += inner;
    } else html += inline(c, links);
  }
  return html;
}

function emitLeaf(node, events, path) {
  const text = collapse(node.textContent);
  if (text) {
    const links = [];
    events.push({ type: 'text', text, html: inline(node, links).trim(), links, path });
  }
  const imgs = [];
  collectImgs(node, imgs);
  imgs.forEach((src) => events.push({ type: 'image', src, path }));
}

// path = ancestor elements from the content root down to the element that emitted the event (used to find staff cards)
function walk(node, events, path) {
  let run = [];
  const flush = () => {
    if (run.length) emitLeaf({ childNodes: run, textContent: run.map((r) => r.textContent).join('') }, events, path);
    run = [];
  };
  for (const c of kids(node)) {
    if (isText(c)) { run.push(c); continue; }
    const t = tag(c);
    if (SKIP.has(t)) continue;
    if (HEADING.has(t)) { flush(); const text = collapse(c.textContent); if (text) events.push({ type: 'heading', text, path: [...path, c] }); continue; }
    if (t === 'IMG') { flush(); const src = imgSrc(c); if (src) events.push({ type: 'image', src, path: [...path, c] }); continue; }
    if (!BLOCK.has(t)) { run.push(c); continue; } // inline element: joins the current run
    flush();
    if (hasBlockDescendant(c)) walk(c, events, [...path, c]); else emitLeaf(c, events, [...path, c]);
  }
  flush();
}

function contentRoot(root) {
  if (typeof root.querySelectorAll !== 'function') return root;
  for (const sel of ['main', '[role="main"]']) {
    const m = root.querySelectorAll(sel);
    if (m && m.length) return m[0];
  }
  return root;
}

// -> Array<{type:'heading'|'text'|'image', ...}> in document order
export function collectEvents(root) {
  const events = [];
  const top = contentRoot(root);
  walk(top, events, [top]);
  return events;
}

export function groupNewsBlocks(events) {
  const blocks = [];
  let cur = null;
  const finish = () => {
    if (!cur) return;
    const found = findThaiDate(cur.title) || cur.texts.map((t) => findThaiDate(t.text)).find(Boolean) || null;
    const paras = cur.texts.filter((t) => !(found && normalizeThaiText(t.text) === found.text));
    blocks.push({
      title: cur.title,
      dateText: found ? found.text : '',
      bodyHtml: paras.map((t) => `<p>${t.html}</p>`).join(''),
      images: [...new Set(cur.images)],
      links: [...new Set(paras.flatMap((t) => t.links))],
    });
  };
  for (const e of events) {
    if (e.type === 'heading') { finish(); cur = { title: e.text, texts: [], images: [] }; } else if (!cur) continue;
    else if (e.type === 'text') cur.texts.push(e);
    else if (e.type === 'image') cur.images.push(e.src);
  }
  finish();
  return blocks;
}

const PRIVATE_LINE = /โทร|tel\b|@|\d{2,3}[-\s]?\d{3}[-\s]?\d{4}|\d{9,}/i;

// Photos are scoped to a "card": the lowest common ancestor of all name-bearing nodes is found, and each of its
// children is one card. A person only gets an image from inside their own card; images never carry across cards.
// If there is no card structure (or a card holds several names) the photo is left blank for the reviewer.
export function groupStaff(events) {
  const people = [];
  let cur = null;
  for (const e of events) {
    if (e.type !== 'text' && e.type !== 'heading') continue;
    const { prefix, name } = splitThaiPrefix(e.text);
    if (prefix && name && !PRIVATE_LINE.test(e.text)) {
      cur = { prefix, name, position: '', photoUrl: '', event: e };
      people.push(cur);
    } else if (cur && e.type === 'text' && !PRIVATE_LINE.test(e.text)) {
      cur.position = cur.position ? `${cur.position} ${e.text}` : e.text;
    }
  }
  const paths = people.map((p) => p.event.path || []);
  if (paths.length) {
    let common = Math.min(...paths.map((p) => p.length)) - 1; // a name node is never its own card container
    // one name only: no siblings to compare, so take its parent as the card, but never the content root itself
    if (paths.length === 1) common = paths[0].length - 2 >= 1 ? paths[0].length - 2 : paths[0].length;
    for (const p of paths) {
      for (let i = 0; i < common; i++) if (p[i] !== paths[0][i]) { common = i; break; }
    }
    const keyOf = (e) => (e.path && e.path.length > common ? e.path[common] : null);
    const cardCount = new Map();
    for (const p of people) { const k = keyOf(p.event); if (k) cardCount.set(k, (cardCount.get(k) || 0) + 1); }
    for (const p of people) {
      const k = keyOf(p.event);
      if (!k || cardCount.get(k) !== 1) continue;
      const img = events.find((e) => e.type === 'image' && keyOf(e) === k);
      if (img) p.photoUrl = img.src;
    }
  }
  return people.map(({ prefix, name, position, photoUrl }) => ({ prefix, name, position, photoUrl }));
}

export function parseNewsArchive(html, parse = defaultParse) {
  return groupNewsBlocks(collectEvents(parse(html)));
}

export function parseStaffPage(html, deptKey, parse = defaultParse) {
  void deptKey; // reserved: per-department tweaks if some page layout needs it
  return groupStaff(collectEvents(parse(html)));
}
