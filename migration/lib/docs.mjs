// Pure builders for the Firestore documents written by scripts/import-legacy.mjs.
import { findThaiDate } from './thai-date.mjs';

export function archiveYearStart(beYear) {
  return new Date(`${String(Number(beYear) - 543).padStart(4, '0')}-01-01T00:00:00+07:00`);
}

const PHONE_RE = /(?<!\d)(?:0\d{1,2}[-\s]?\d{3}[-\s]?\d{3,4}|0\d{8,9})(?!\d)/g;
export const findPhones = (text) => String(text ?? '').match(PHONE_RE) || [];

export function buildNewsDoc({ item, year, bodyHtml, imageUrls, now }) {
  const found = findThaiDate(item.dateText || '');
  return {
    title: String(item.title ?? '').trim(),
    bodyHtml,
    coverUrl: imageUrls[0] || '',
    images: [...imageUrls],
    departmentIds: [],
    pinned: false,
    published: true,
    authorUid: 'legacy-import',
    createdAt: found ? found.date : archiveYearStart(year),
    updatedAt: now,
  };
}

export function buildStaffDoc({ person, dept, order, photoUrl }) {
  return {
    prefix: person.prefix || '',
    name: person.name,
    position: person.position || '',
    photoUrl: photoUrl || '',
    bio: '',
    education: '',
    email: '',
    departmentIds: [dept],
    uid: null,
    order,
    active: true,
  };
}
