// Seed script (run on an admin's machine only).
//   node scripts/seed.mjs --emulator                       emulator: departments, settings, test users, staff, 15 news
//   node scripts/seed.mjs --yes                            REAL project: departments + settings only
//   node scripts/seed.mjs --first-admin <email> <password> --yes   REAL project: first admin account + users/{uid}
// Real-project modes need GOOGLE_APPLICATION_CREDENTIALS and --yes.
import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const REAL_PROJECT = 'chainatpit-a8c9c';
const EMU_PROJECT = 'demo-chainatpit';

const args = process.argv.slice(2);
const emulator = args.includes('--emulator');
const yes = args.includes('--yes');
const faIdx = args.indexOf('--first-admin');
const firstAdmin = faIdx >= 0 ? { email: args[faIdx + 1], password: args[faIdx + 2] } : null;

if (firstAdmin && (!firstAdmin.email || !firstAdmin.password || firstAdmin.email.startsWith('--') || firstAdmin.password.startsWith('--'))) {
  console.error('การใช้งาน: node scripts/seed.mjs --first-admin <email> <password> --yes');
  process.exit(1);
}
if (firstAdmin && firstAdmin.password.length < 8) {
  console.error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  process.exit(1);
}

if (emulator) {
  const ports = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8')).emulators;
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${ports.firestore.port}`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${ports.auth.port}`;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = `127.0.0.1:${ports.storage.port}`;
  initializeApp({ projectId: EMU_PROJECT });
} else {
  console.warn(`คำเตือน: สคริปต์นี้จะเขียนข้อมูลลงโปรเจกต์จริง "${REAL_PROJECT}"`);
  if (!yes) {
    console.error('ปฏิเสธการทำงาน: ต้องเพิ่ม --yes เพื่อยืนยันว่าต้องการเขียนข้อมูลลงโปรเจกต์จริง (หรือใช้ --emulator สำหรับทดสอบ)');
    process.exit(1);
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('ต้องตั้งค่า GOOGLE_APPLICATION_CREDENTIALS ให้ชี้ไปยังไฟล์ service account key ก่อน');
    process.exit(1);
  }
  initializeApp({ projectId: REAL_PROJECT, credential: applicationDefault() });
}
const db = getFirestore();
const auth = getAuth();

const DEPARTMENTS = [
  ['thai', 'subject', 'กลุ่มสาระการเรียนรู้ภาษาไทย'],
  ['math', 'subject', 'กลุ่มสาระการเรียนรู้คณิตศาสตร์'],
  ['sci', 'subject', 'กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี'],
  ['social', 'subject', 'กลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม'],
  ['health', 'subject', 'กลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา'],
  ['art', 'subject', 'กลุ่มสาระการเรียนรู้ศิลปะ'],
  ['career', 'subject', 'กลุ่มสาระการเรียนรู้การงานอาชีพ'],
  ['foreign', 'subject', 'กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ'],
  ['academic', 'division', 'ฝ่ายบริหารงานวิชาการ'],
  ['personnel', 'division', 'ฝ่ายบริหารงานบุคคล'],
  ['budget', 'division', 'ฝ่ายบริหารงบประมาณ'],
  ['general', 'division', 'ฝ่ายบริหารงานทั่วไป'],
  ['executive', 'unit', 'คณะผู้บริหาร'],
  ['guidance', 'unit', 'แนะแนว'],
  ['office', 'unit', 'ธุรการ'],
  ['support', 'unit', 'บุคลากรสนับสนุน'],
];

const BASE_SETTINGS_KEYS = ['schoolName', 'welcomeText', 'address', 'phone', 'email', 'logoUrl'];
const SETTINGS = {
  schoolName: 'โรงเรียนชัยนาทพิทยาคม',
  welcomeText: 'ยินดีต้อนรับสู่เว็บไซต์โรงเรียนชัยนาทพิทยาคม',
  address: 'อำเภอเมืองชัยนาท จังหวัดชัยนาท',
  phone: '056-411-000',
  email: 'info@example.com',
  logoUrl: '',
  facebookUrl: 'https://www.facebook.com/example',
  aboutHtml: '<p>ข้อมูลสถานศึกษาตัวอย่าง</p><script data-evil>window.__evil = 1</script>',
  executives: [{ name: 'นายผู้อำนวยการ ตัวอย่าง', position: 'ผู้อำนวยการโรงเรียน', photoUrl: '' }],
};

const DEPT_EXTRA = {
  math: { description: 'คำอธิบายกลุ่มสาระคณิตศาสตร์ตัวอย่าง', externalUrl: 'https://example.com/math' },
};

const DOCUMENTS = [
  ['d1', { title: 'แผนปฏิบัติการประจำปี', url: 'https://example.com/plan.pdf', category: 'แผนงาน', departmentId: null, year: 2569, order: 1 }],
  ['d2', { title: 'รายงานผลการดำเนินงาน', url: 'https://example.com/report.pdf', category: 'รายงาน', departmentId: null, year: 2569, order: 2 }],
  ['d3', { title: 'ITA ข้อ O1 โครงสร้าง', url: 'https://example.com/ita-o1.pdf', category: 'ITA', departmentId: null, year: 2569, order: 2 }],
  ['d4', { title: 'ITA ข้อ O2 หน้าที่และอำนาจ', url: 'https://example.com/ita-o2.pdf', category: 'ITA', departmentId: null, year: 2569, order: 1 }],
];

// Real project gets only the base keys; sample about/executives/facebook are emulator-only.
const BASE_SETTINGS = Object.fromEntries(BASE_SETTINGS_KEYS.map((k) => [k, SETTINGS[k]]));

async function seedDepartmentsAndSettings() {
  // Real project: never overwrite existing docs (admins may have edited them). Emulator: overwrite.
  const writes = [
    ...DEPARTMENTS.map(([id, type, name], i) => [`departments/${id}`, { name, type, order: i + 1, ...(emulator ? DEPT_EXTRA[id] : {}) }]),
    ...(emulator ? DOCUMENTS.map(([id, data]) => [`documents/${id}`, data]) : []), // sample docs: emulator only
    ['settings/site', emulator ? SETTINGS : BASE_SETTINGS],
  ];
  const batch = db.batch();
  let created = 0;
  for (const [path, data] of writes) {
    const ref = db.doc(path);
    if (!emulator && (await ref.get()).exists) {
      console.log(`ข้าม ${path}: มีข้อมูลอยู่แล้ว (ไม่เขียนทับ)`);
      continue;
    }
    batch.set(ref, data);
    created++;
  }
  if (created) await batch.commit();
  console.log(`เขียนข้อมูลหน่วยงานและ settings ใหม่ ${created} จาก ${writes.length} รายการ`);
}

async function createAuthUser(uid, email, password) {
  try { await auth.deleteUser(uid); } catch { /* not found */ }
  await auth.createUser({ uid, email, password });
}

// Same users as the rules-test fixture (tests/rules/setup.js); password for all: password123
const TEST_USERS = [
  { uid: 'admin', role: 'admin', disabled: false },
  { uid: 'prc', role: 'pr_central', disabled: false },
  { uid: 'prMath', role: 'teacher', prDepartments: ['math'], disabled: false },
  { uid: 'prMulti', role: 'teacher', prDepartments: ['math', 'academic'], disabled: false },
  { uid: 't1', role: 'teacher', staffId: 's1', disabled: false },
  { uid: 'off', role: 'admin', disabled: true },
];

async function seedTestUsers() {
  for (const u of TEST_USERS) {
    const { uid, ...rest } = u;
    const email = `${uid}@example.com`;
    await createAuthUser(uid, email, 'password123');
    if (u.disabled) await auth.updateUser(uid, { disabled: true });
    await db.doc(`users/${uid}`).set({ email, prDepartments: [], ...rest });
  }
  const staff = [
    ['s1', { prefix: 'นาย', name: 'สมชาย ใจดี', position: 'ครู', departmentIds: ['math', 'academic'], uid: 't1', order: 1, active: true }],
    ['s2', { prefix: 'นางสาว', name: 'สมหญิง รักเรียน', position: 'ครู', departmentIds: ['sci'], uid: null, order: 2, active: true }],
    // PDPA probe: carries a phone (admin SDK bypasses rules). Never edit via client: staffKeysOk would deny it.
    ['s4', { prefix: 'นาย', name: 'ครูทดสอบเบอร์โทร', position: 'ครู', departmentIds: ['sci'], uid: null, order: 4, active: true, phone: '0812345678' }],
    ['s3', { prefix: 'นาย', name: 'ครูที่ลาออกแล้ว', position: 'ครู', departmentIds: ['math'], uid: null, order: 3, active: false }],
  ];
  for (const [id, data] of staff) await db.doc(`staff/${id}`).set(data);
  console.log('ใส่ผู้ใช้ทดสอบ (รหัสผ่าน password123) และบุคลากรแล้ว');
}

async function seedNews() {
  const now = Date.now();
  const DAY = 86400000;
  const img = (n) => `https://picsum.photos/seed/chainat${n}/640/360`;
  const items = [];
  for (let i = 1; i <= 15; i++) {
    items.push({
      id: `news${String(i).padStart(2, '0')}`,
      title: `ข่าวประชาสัมพันธ์ตัวอย่างที่ ${i}`,
      bodyHtml: `<p>เนื้อหาข่าวตัวอย่างที่ ${i} ของโรงเรียนชัยนาทพิทยาคม</p>`,
      coverUrl: i % 3 === 0 ? img(i) : '',
      images: i % 3 === 0 ? [img(i)] : [],
      departmentIds: i % 2 === 0 ? ['math'] : i % 5 === 0 ? ['sci'] : [],
      pinned: false,
      published: true,
      authorUid: 'admin',
      createdAt: Timestamp.fromMillis(now - i * DAY),
      updatedAt: Timestamp.fromMillis(now - i * DAY),
    });
  }
  items[6].pinned = true;   // an older item pinned: must still come first
  items[4].published = false; // draft
  items[4].title = 'ข่าวฉบับร่าง (ไม่เผยแพร่)';
  items[2].title = 'ข่าวทดสอบความปลอดภัยของ HTML';
  items[2].bodyHtml = '<p>ข้อความปกติ</p><script data-evil>window.__evil = 1</script><img src="x" onerror="window.__evil=1" alt="">';
  items[0].title = 'ข่าว "ใหม่" & ล่าสุด';
  const batch = db.batch();
  for (const { id, ...data } of items) batch.set(db.doc(`news/${id}`), data);
  await batch.commit();
  console.log('ใส่ข่าว 15 รายการแล้ว (14 เผยแพร่, 1 ฉบับร่าง)');
}

async function createFirstAdmin({ email, password }) {
  let user;
  try { user = await auth.getUserByEmail(email); } catch { user = await auth.createUser({ email, password }); }
  await db.doc(`users/${user.uid}`).set({ email, role: 'admin', prDepartments: [], disabled: false });
  console.log(`สร้างแอดมินคนแรกแล้ว: ${email} (uid ${user.uid})`);
}

if (emulator) {
  await seedDepartmentsAndSettings();
  await seedTestUsers();
  await seedNews();
} else if (firstAdmin) {
  await createFirstAdmin(firstAdmin);
} else {
  await seedDepartmentsAndSettings();
}
process.exit(0);
