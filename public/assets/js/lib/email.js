// Returns the address if it is safe to put in a mailto: href, else ''.
// Excludes ? & / # , ; so a teacher-editable value cannot add mailto headers (bcc=, subject=...).
export function safeEmail(v) {
  const s = String(v ?? '');
  return /^[^\s@<>"'?&/#,;]+@[^\s@<>"'?&/#,;]+\.[^\s@<>"'?&/#,;]+$/.test(s) ? s : '';
}
