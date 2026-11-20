import { createHash } from 'node:crypto';

const hash20 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 20);
export const newsId = (title, dateISO) => hash20(`${title}|${dateISO}`);
export const staffId = (dept, name) => hash20(`${dept}|${name}`);

// Relative URL stored in Firestore for an object in R2 (served by functions/media). ts = upload time in ms.
export const mediaUrl = (path, ts) => `/media/${path}?v=${ts}`;
