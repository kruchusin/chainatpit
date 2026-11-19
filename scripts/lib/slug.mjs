// Google Sites slug for a menu title: Thai combining marks removed, spaces -> '-'.
// Marks: U+0E31, U+0E34-U+0E3A, U+0E47-U+0E4E.
const MARKS = /[ัิ-ฺ็-๎]/g;

export function googleSitesSlug(title) {
  return String(title).trim().replace(MARKS, '').replace(/\s+/g, '-').toLowerCase();
}
