// One-time import of reviewed legacy JSON (from migration/scrape-legacy.mjs) into Firestore + Cloudflare R2.
//   node scripts/import-legacy.mjs --news migration/out/news-2569.json --year 2569 [--dry-run] --emulator
//   node scripts/import-legacy.mjs --staff migration/out/staff-math.json --dept math --commit --yes
// --dry-run is the default (prints what would be written). --commit writes. Real project needs --commit --yes
// and GOOGLE_APPLICATION_CREDENTIALS. --overwrite replaces existing docs (default: skip, so re-running is safe).
// Images go to R2 (env R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, optional R2_BUCKET = chainatpit-media) and Firestore stores
// '/media/<path>?v=<ms>'. With --emulator images are written to migration/out/media/<path> instead (no R2 needed).
// Run from the repo root. Never writes phone numbers.
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { createSanitizer } from '../public/assets/js/lib/sanitize.js';
import { newsId, staffId, mediaUrl, localMediaPath } from '../migration/lib/ids.mjs';
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
const LOCAL_MEDIA_DIR = fileURLToPath(new URL('../migration/out/media/', import.meta.url));
let db = null;
let putObject = null; // async (path, jpegBuffer) -> void, only set when --commit

if (emulator) {
  const ports = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8')).emulators;
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${ports.firestore.port}`;
  initializeApp({ projectId: project });
  if (commit) {
    putObject = async (path, jpeg) => {
      const file = localMediaPath(LOCAL_MEDIA_DIR, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, jpeg);
    };
    console.log(`--emulator: รูปจะถูกเขียนลง ${LOCAL_MEDIA_DIR}<path> ไม่ได้ส่งขึ้น R2`);
    console.log('คำแนะนำ: โฟลเดอร์นี้ใช้ตรวจรูปด้วยตาเท่านั้น ถ้าต้องการให้เว็บบนเครื่องแสดงรูป ต้องนำไฟล์เข้า R2 จำลองของ wrangler เอง');
  }
} else if (commit) {
  console.warn(`คำเตือน: จะเขียนข้อมูลลงโปรเจกต์จริง "${REAL_PROJECT}"`);
  const R2_REQUIRED = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']; // R2_BUCKET optional
  const missing = R2_REQUIRED.filter((n) => !process.env[n]);
  if (missing.length) die(`ต้องตั้งค่าตัวแปร R2 ให้ครบก่อน ยังขาด: ${missing.join(', ')} (ดู README หัวข้อ "R2 API token สำหรับย้ายข้อมูล")`);
  if (!flag('--yes')) die('ปฏิเสธการทำงาน: ต้องเพิ่ม --yes เพื่อยืนยันการเขียนลงโปรเจกต์จริง (หรือใช้ --emulator)');
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) die('ต้องตั้งค่า GOOGLE_APPLICATION_CREDENTIALS ก่อน');
  initializeApp({ projectId: project, credential: applicationDefault() });
  // loaded only here so dry-run and --emulator work without @aws-sdk/client-s3 installed
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  const r2Bucket = process.env.R2_BUCKET || 'chainatpit-media';
  putObject = (path, jpeg) => s3.send(new PutObjectCommand({
    Bucket: r2Bucket, Key: path, Body: jpeg, ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}
// dry-run against the real project stays offline: existence is not checked (no credentials needed)
if (emulator || commit) db = getFirestore();

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
  await putObject(path, jpeg);
  return mediaUrl(path, Date.now());
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
