// createSanitizer(DOMPurify) -> (html) => safe html. DOMPurify is injected (no imports here).
const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li',
  'h2', 'h3', 'blockquote', 'img', 'iframe', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 's'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'allowfullscreen', 'style'];

// Inline style is kept only for text colour, highlight and alignment, with plain colour values
// (no url(), expression(), var() ...). Everything else in style="" is dropped.
const STYLE_PROPS = ['color', 'background-color', 'text-align'];
const COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)|[a-z]{3,20})$/i;
const ALIGN_RE = /^(left|right|center|justify)$/i;

export function filterStyle(style) {
  const out = [];
  for (const decl of String(style ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    if (!STYLE_PROPS.includes(prop)) continue;
    const ok = prop === 'text-align' ? ALIGN_RE.test(value) : COLOR_RE.test(value) && !/^(inherit|initial|unset|expression)$/i.test(value);
    if (ok) out.push(`${prop}: ${value.toLowerCase()}`);
  }
  return out.join('; ');
}
const YOUTUBE_PREFIX = 'https://www.youtube.com/embed/';

export function createSanitizer(DOMPurify) {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const tag = node.nodeName && node.nodeName.toLowerCase();
    if (node.hasAttribute && node.hasAttribute('style')) {
      const st = filterStyle(node.getAttribute('style'));
      if (st) node.setAttribute('style', st); else node.removeAttribute('style');
    }
    if (tag === 'iframe') {
      const src = node.getAttribute('src') || '';
      if (!src.startsWith(YOUTUBE_PREFIX)) node.parentNode && node.parentNode.removeChild(node);
    } else if (tag === 'img') {
      // only http(s) images or same-origin /media/ (single slash; not // or /\): removes data: and any other source
      const src = (node.getAttribute('src') || '').trim().toLowerCase();
      const ok = src.startsWith('https://') || src.startsWith('http://') || (src.startsWith('/media/') && !/^\/[\\/]/.test(src));
      if (!ok) node.parentNode && node.parentNode.removeChild(node);
    } else if (tag === 'a' && node.hasAttribute('target')) {
      node.setAttribute('rel', 'noopener');
    }
  });
  return (html) => DOMPurify.sanitize(String(html ?? ''), { ALLOWED_TAGS, ALLOWED_ATTR });
}
