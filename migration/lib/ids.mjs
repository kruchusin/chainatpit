import { createHash } from 'node:crypto';
import { join } from 'node:path';

const hash20 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 20);
export const newsId = (title, dateISO) => hash20(`${title}|${dateISO}`);
export const staffId = (dept, name) => hash20(`${dept}|${name}`);

// Relative URL stored in Firestore for an object in R2 (served by functions/media). ts = upload time in ms.
export const mediaUrl = (path, ts) => `/media/${path}?v=${ts}`;

// Local file path for an R2 key when writing to disk (--emulator). Safe for spaces and Windows drive letters.
export const localMediaPath = (baseDir, path) => join(baseDir, ...path.split('/'));
