import { createHash } from 'node:crypto';

const hash20 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 20);
export const newsId = (title, dateISO) => hash20(`${title}|${dateISO}`);
export const staffId = (dept, name) => hash20(`${dept}|${name}`);

// Absolute download URL for an object uploaded with metadata firebaseStorageDownloadTokens = token.
// host: 'https://firebasestorage.googleapis.com' (real) or 'http://127.0.0.1:9199' (emulator).
export const storageDownloadUrl = (host, bucket, path, token) =>
  `${host}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
