// createSanitizer(DOMPurify) -> (html) => safe html. DOMPurify is injected (no imports here).
const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li',
  'h2', 'h3', 'blockquote', 'img', 'iframe', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'allowfullscreen'];
const YOUTUBE_PREFIX = 'https://www.youtube.com/embed/';

export function createSanitizer(DOMPurify) {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const tag = node.nodeName && node.nodeName.toLowerCase();
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
