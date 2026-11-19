// Pure HTML helpers shared by ui.js and lib/* (importable in Node tests).
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Only allow http(s) / root-relative URLs in src/href built from data.
// Rejects //host and /\host (browsers treat a backslash like a slash).
export const safeUrl = (u) => (/^(https?:\/\/|\/(?![\/\\]))/i.test(String(u || '')) ? String(u) : '');
