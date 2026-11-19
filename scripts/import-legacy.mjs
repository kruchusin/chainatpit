// One-time import of reviewed legacy JSON (from migration/scrape-legacy.mjs) into Firestore + Storage.
//   node scripts/import-legacy.mjs --news migration/out/news-2569.json --year 2569 [--dry-run] --emulator
//   node scripts/import-legacy.mjs --staff migration/out/staff-math.json --dept math --commit --yes
// --dry-run is the default (prints what would be written). --commit writes. Real project needs --commit --yes
// and GOOGLE_APPLICATION_CREDENTIALS. --overwrite replaces existing docs (default: skip, so re-running is safe).
// Optional: --bucket <name>. Run from the repo root. Never writes phone numbers.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { createSanitizer } from '../public/assets/js/lib/sanitize.js';
import { newsId, staffId, storageDownloadUrl } from '../migration/lib/ids.mjs';
import { buildNewsDoc, buildStaffDoc, findPhones } from '../migration/lib/docs.mjs';
import { findThaiDate } from '../migration/lib/thai-date.mjs';
import { uploadAll } from '../migration/lib/uploads.mjs';
import { bigImageUrl, toJpegWithinLimits } from '../migration/lib/image.mjs';

const REAL_PROJECT = 'chainatpit-a8c9c';
const EMU_PROJECT = 'demo-chainatpit';
const DEPTS = ['thai', 'math', 'sci', 'social', 'health', 'art', 'career', 'foreign',
  'academic', 'personnel', 'budget', 'general', 'executive', 'guidance', 'office', 'support'];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const die = (m) => { console.error(m); process.exit(1); };

const emulator = flag('--emulator');
const commit = flag('--commit');
const overwrite = flag('--overwrite');
const newsFile = opt('--news');
const staffFile = opt('--staff');
const year = opt('--year');
const dept = opt('--dept');

if (commit && flag('--dry-run')) die('ใช้ --dry-run และ --commit พร้อมกันไม่ได้');
if (!newsFile && !staffFile) die('ระบุ --news <ไฟล์> --year <ปี พ.ศ.> และ/หรือ --staff <ไฟล์> --dept <ฝ่าย>');
if (newsFile && !/^\d{4}$/.test(year || '')) die('--news ต้องใช้คู่กับ --year เช่น 2569');
if (staffFile && !DEPTS.includes(dept)) die(`--staff ต้องใช้คู่กับ --dept หนึ่งใน: ${DEPTS.join(', ')}`);

const project = emulator ? EMU_PROJECT : REAL_PROJECT;
const bucketName = opt('--bucket') || (emulator ? `${EMU_PROJECT}.appspot.com` : `${REAL_PROJECT}.firebasestorage.app`);
let db = null;
let bucket = null;
let urlHost = 'https://firebasestorage.googleapis.com';

if (emulator) {
  const ports = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8')).emulators;
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${ports.firestore.port}`;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = `127.0.0.1:${ports.storage.port}`;
  urlHost = `http://127.0.0.1:${ports.storage.port}`;
  initializeApp({ projectId: project, storageBucket: bucketName });
} else if (commit) {
  console.warn(`คำเตือน: จะเขียนข้อมูลลงโปรเจกต์จริง "${REAL_PROJECT}"`);
  if (!flag('--yes')) die('ปฏิเสธการทำงาน: ต้องเพิ่ม --yes เพื่อยืนยันการเขียนลงโปรเจกต์จริง (หรือใช้ --emulator)');
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) die('ต้องตั้งค่า GOOGLE_APPLICATION_CREDENTIALS ก่อน');
  initializeApp({ projectId: project, credential: applicationDefault(), storageBucket: bucketName });
}
// dry-run against the real project stays offline: existence is not checked (no credentials needed)
if (emulator || commit) { db = getFirestore(); bucket = getStorage().bucket(); }

const sanitize = createSanitizer(createDOMPurify(new JSDOM('').window));
let sharp = null;
async function getSharp() {
  if (!sharp) sharp = (await import('sharp')).default;
  return sharp;
}

async function uploadImage(srcUrl, path) {
  const res = await fetch(bigImageUrl(srcUrl));
  if (!res.ok) throw new Error(`ดาวน์โหลดรูปไม่สำเร็จ ${res.status} ${srcUrl}`);
  const jpeg = await toJpegWithinLimits(Buffer.from(await res.arrayBuffer()), await getSharp());
  const token = randomUUID();
  await bucket.file(path).save(jpeg, {
    contentType: 'image/jpeg',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  return storageDownloadUrl(urlHost, bucketName, path, token);
}

const mode = commit ? 'COMMIT' : 'DRY-RUN';
const counts = { written: 0, skipped: 0 };
const failed = []; // docs not written because an image failed

async function exists(col, id) {
  return db ? (await db.collection(col).doc(id).get()).exists : false;
}

function reportFailure(col, id, label, errors) {
  failed.push(`${col}/${id} ${label}`);
  console.warn(`  ไม่เขียน ${col}/${id} ${label}: รูปล้มเหลว ${errors.map((e) => `[${e.index + 1}] ${e.message}`).join('; ')}`);
}

async function importNews() {
  const items = JSON.parse(readFileSync(newsFile, 'utf8'));
  const now = new Date();
  for (const item of items) {
    const title = String(item.title || '').trim();
    if (!title) { console.warn('ข้ามรายการที่ไม่มีหัวข้อ'); continue; }
    const probe = buildNewsDoc({ item, year, bodyHtml: '', imageUrls: [], now });
    const id = newsId(title, probe.createdAt.toISOString());
    const dated = findThaiDate(item.dateText || '') ? '' : ' (ไม่มีวันที่: ใช้ 1 ม.ค. ของปี)';
    if (await exists('news', id) && !overwrite) {
      counts.skipped++; console.log(`[${mode}] ข้าม (มีอยู่แล้ว) news/${id} ${title}`); continue;
    }
    const bodyHtml = sanitize(item.bodyHtml || '');
    const phones = findPhones(bodyHtml);
    if (phones.length) console.warn(`  คำเตือน: เนื้อหามีเบอร์โทร ${phones.join(', ')} - ตรวจสอบก่อนเผยแพร่`);
    console.log(`[${mode}] news/${id} ${title} | ${probe.createdAt.toISOString().slice(0, 10)}${dated} | รูป ${(item.images || []).length}`);
    if (!commit) continue;
    const up = await uploadAll(item.images || [], (src, i) => uploadImage(src, `news/${id}/legacy-${i + 1}.jpg`));
    if (!up.shouldWrite) { reportFailure('news', id, title, up.errors); continue; }
    const imageUrls = up.urls;
    await db.collection('news').doc(id).set(buildNewsDoc({ item, year, bodyHtml, imageUrls, now }));
    counts.written++;
  }
}

async function importStaff() {
  const people = JSON.parse(readFileSync(staffFile, 'utf8'));
  for (const [i, person] of people.entries()) {
    const name = String(person.name || '').trim();
    if (!name) { console.warn('ข้ามรายการที่ไม่มีชื่อ'); continue; }
    const id = staffId(dept, name);
    if (await exists('staff', id) && !overwrite) {
      counts.skipped++; console.log(`[${mode}] ข้าม (มีอยู่แล้ว) staff/${id} ${name}`); continue;
    }
    console.log(`[${mode}] staff/${id} ${person.prefix || ''}${name} | ${person.position || '-'} | รูป ${person.photoUrl ? 1 : 0}`);
    if (!commit) continue;
    const up = await uploadAll(person.photoUrl ? [person.photoUrl] : [], (src) => uploadImage(src, `staff/${id}/photo.jpg`));
    if (!up.shouldWrite) { reportFailure('staff', id, name, up.errors); continue; }
    const photoUrl = up.urls[0] || '';
    await db.collection('staff').doc(id).set(buildStaffDoc({ person: { ...person, name }, dept, order: i + 1, photoUrl }));
    counts.written++;
  }
}

if (newsFile) await importNews();
if (staffFile) await importStaff();
console.log(`${mode} เสร็จสิ้น: เขียน ${counts.written}, ข้าม ${counts.skipped}, ไม่เขียนเพราะรูปล้มเหลว ${failed.length}`);
if (failed.length) {
  console.warn('รายการที่ไม่ได้เขียน:');
  failed.forEach((f) => console.warn(`  - ${f}`));
  console.warn('รันใหม่อีกครั้งเพื่อลองนำเข้ารายการเหล่านี้');
  process.exitCode = 1;
}
if (!commit) console.log('นี่คือ dry-run ยังไม่มีการเขียนข้อมูล เพิ่ม --commit เพื่อเขียนจริง');
