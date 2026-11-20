# เว็บไซต์โรงเรียนชัยนาทพิทยาคม

คู่มือนี้เขียนสำหรับคุณครูที่ไม่ใช่นักพัฒนา ทำตามทีละข้อจากบนลงล่างได้เลย ไม่ต้องรีบ ข้อไหนไม่แน่ใจให้หยุดและถามก่อนไปต่อ

## 0. โปรเจกต์นี้คืออะไร

เว็บไซต์โรงเรียนที่มีหน้าสาธารณะ (ข่าว บุคลากร เอกสาร ฯลฯ) และหลังบ้านสำหรับให้ครูและผู้ประชาสัมพันธ์เข้าไปเพิ่ม/แก้ข้อมูลเอง
**ไม่มีขั้นตอน build** ไฟล์ใน `public/` คือเว็บไซต์ตัวจริงที่ถูกเสิร์ฟตรงๆ

| ส่วน | ใช้ทำอะไร |
|---|---|
| Cloudflare Pages | เก็บและเสิร์ฟเว็บไซต์ (ฟรี ส่วน `functions/` มีโควตา 100,000 คำขอ/วัน ดูข้อ 6.1) |
| Firebase (โปรเจกต์ `chainatpit-a8c9c`) | ฐานข้อมูล Firestore และระบบล็อกอิน (ใช้แผน Spark ฟรีได้ ไม่ต้องผูกบัตร) |
| Cloudflare R2 (bucket `chainatpit-media`) | เก็บรูปภาพทั้งหมด (ข่าว บุคลากร ฝ่าย) เสิร์ฟผ่านที่อยู่ `/media/...` ของเว็บเอง |
| GitHub | เก็บไฟล์ของเว็บ เมื่อมีการอัปเดต Cloudflare จะนำไปเผยแพร่ให้เอง |

แผนผังโฟลเดอร์

```
public/            เว็บไซต์ทั้งหมด (หน้า .html, assets/, admin/ = หลังบ้าน, _redirects = ลิงก์เก่า -> ใหม่)
functions/         โค้ดฝั่งเซิร์ฟเวอร์ของ Cloudflare (api/admin/users.js = จัดการบัญชีผู้ใช้,
                   news/[id].js = หน้าข่าวพร้อมข้อมูลสำหรับแชร์ Facebook,
                   api/media.js = อัปโหลด/ลบรูปใน R2, media/ = เสิร์ฟรูปจาก R2 ที่ /media/...)
scripts/           seed.mjs (ใส่ข้อมูลเริ่มต้น/สร้างแอดมินคนแรก), gen-redirects.mjs, import-legacy.mjs
migration/         เครื่องมือย้ายข้อมูลจากเว็บเดิม (อ่านไฟล์ migration/README.md)
tests/             unit/ (ทดสอบฟังก์ชัน), rules/ (ทดสอบกฎความปลอดภัย), e2e/ (ทดสอบเปิดเบราว์เซอร์จริง)
firestore.rules    กฎว่าใครอ่าน/เขียนข้อมูลอะไรได้
firestore.indexes.json  ดัชนีที่ Firestore ต้องใช้
firebase.json      ตั้งค่า Firebase (deploy กฎ/ดัชนี และ emulator สำหรับทดสอบ)
package.json       รายการคำสั่งและเครื่องมือทดสอบ
```

> สำคัญ: โปรเจกต์ Firebase นี้มี **Realtime Database** เดิมอยู่แล้ว ห้ามใช้และห้ามแก้ไข เว็บใหม่ใช้ **Cloud Firestore** เท่านั้น

---

## 1. ติดตั้งโปรแกรมบน Windows

ติดตั้งตามลำดับ (กด Next ไปเรื่อยๆ ใช้ค่าเริ่มต้นได้)

1. **Node.js เวอร์ชัน LTS** จาก https://nodejs.org
2. **Git** จาก https://git-scm.com/download/win
3. **Java 21** (เช่น Temurin จาก https://adoptium.net) จำเป็นเฉพาะเวลารันชุดทดสอบ/ลองบนเครื่อง (emulator ของ Firebase ใช้ Java) ถ้าไม่ทดสอบก็ข้ามได้

ไม่ต้องติดตั้ง XAMPP เว็บนี้ไม่ใช้ PHP หรือ MySQL

ตรวจว่าติดตั้งแล้ว เปิด PowerShell แล้วพิมพ์

```
node --version
git --version
java -version
```

---

## 2. ตั้งค่า Firebase (โปรเจกต์ `chainatpit-a8c9c`)

เข้า https://console.firebase.google.com แล้วเลือกโปรเจกต์ `chainatpit-a8c9c`

1. **สร้าง Cloud Firestore** เมนู Build -> Firestore Database -> Create database
   เลือก location **`asia-southeast1` (สิงคโปร์)** แล้วเริ่มด้วย Production mode (กฎจริงจะถูก deploy ในข้อ 2.4 ด้านล่าง)
   **อย่าไปใช้ Realtime Database ที่มีอยู่เดิม**
2. **เปิดล็อกอินด้วยอีเมล** เมนู Build -> Authentication -> Get started -> Sign-in method -> Email/Password -> Enable

   > **Firebase ใช้แผน Spark (ฟรี) ได้เลย ไม่ต้องอัปเกรดเป็น Blaze และไม่ต้องผูกบัตร** เพราะรูปภาพไม่ได้เก็บใน Firebase แล้ว แต่เก็บใน Cloudflare R2 (ดูข้อ 6.1)

3. **คัดลอกค่า Web app config** ไปใส่ในโค้ด
   Project settings (รูปเฟือง) -> General -> Your apps -> ถ้ายังไม่มีให้กดสร้าง Web app (ไอคอน `</>`) แล้วคัดลอกค่าจาก `firebaseConfig`
   เปิดไฟล์ `public/assets/js/firebase.js` แล้วแทนค่า placeholder **3 ตัว** นี้เท่านั้น

   | แทนที่ข้อความ | ด้วยค่าจาก firebaseConfig |
   |---|---|
   | `REPLACE_WITH_WEB_API_KEY` | `apiKey` |
   | `REPLACE_WITH_MESSAGING_SENDER_ID` | `messagingSenderId` |
   | `REPLACE_WITH_APP_ID` | `appId` |

   ค่า `authDomain`, `projectId` ถูกใส่ไว้ให้แล้ว ให้ตรวจว่าตรงกับของคุณ
   (ค่าเหล่านี้ไม่ใช่ความลับ เป็นข้อมูลสาธารณะที่อยู่ในหน้าเว็บอยู่แล้ว ความปลอดภัยอยู่ที่กฎ Firestore)
4. **Deploy กฎและดัชนี** เปิด PowerShell ในโฟลเดอร์โปรเจกต์

   ```
   npm install
   npx firebase login
   npx firebase deploy --only firestore --project chainatpit-a8c9c
   ```

   คำสั่งนี้ส่ง `firestore.rules` และ `firestore.indexes.json` ขึ้นไป (ดัชนีใช้เวลาสร้างสักครู่ ดูสถานะได้ใน Firestore -> Indexes)
5. **สร้าง service account key** (ใช้ในข้อ 6 และ 7 ด้านล่าง) Project settings -> Service accounts -> Generate new private key
   จะได้ไฟล์ `.json` หนึ่งไฟล์ เก็บไว้ในที่ปลอดภัยนอกโฟลเดอร์โปรเจกต์ เช่น `C:\keys\chainatpit.key.json`

   > **คำเตือน: ห้าม commit หรืออัปโหลดไฟล์ key นี้ขึ้น GitHub เด็ดขาด** ใครได้ไฟล์นี้ไปจะเข้าถึงฐานข้อมูลทั้งหมดได้
   > ถ้าหลุดไปแล้วให้ลบ key นั้นทิ้งที่ Service accounts ทันทีแล้วสร้างใหม่

---

## 3. รันชุดทดสอบบนเครื่องของคุณ

```
npm install
npx playwright install chromium
npm test
```

`npm test` รันสามชุดต่อกัน แยกรันได้ดังนี้

| คำสั่ง | ทดสอบอะไร | ต้องใช้ |
|---|---|---|
| `npm run test:unit` | ฟังก์ชันทั่วไป (วันที่ พ.ศ., สิทธิ์, sanitize, ย่อรูป, redirect ฯลฯ) | Node |
| `npm run test:rules` | กฎความปลอดภัย Firestore | Java 21 |
| `npm run test:e2e` | เปิดเบราว์เซอร์จริงทดสอบหน้าเว็บและหลังบ้าน | Java 21 + Chromium |

**ความจริงที่ต้องบอกตรงๆ:** ระหว่างพัฒนา เครื่องที่ใช้สร้างเว็บนี้ **ไม่มีอินเทอร์เน็ต** จึงติดตั้งแพ็กเกจไม่ได้
ชุดทดสอบ **กฎความปลอดภัย (`test:rules`), e2e (`test:e2e`) และชุดทดสอบ sanitize (ที่ต้องใช้ jsdom/dompurify)
ถูกเขียนไว้ครบแล้วแต่ยังไม่เคยถูกรันจริง** (ตรวจได้แค่ไวยากรณ์และอ่านเทียบกับโค้ด)
ส่วนที่เป็นตรรกะล้วนทดสอบแล้ว แต่ส่วนที่ต้องใช้ฐานข้อมูลจำลองและเบราว์เซอร์ยังไม่ได้ทดสอบ
**ดังนั้นคุณต้องรัน `npm test` ให้ผ่านทั้งหมดก่อนเปิดใช้งานจริง** ถ้ามีข้อใดไม่ผ่านให้ส่งข้อความ error ให้ผู้พัฒนาแก้

---

## 4. ลองใช้บนเครื่องของคุณก่อน (ไม่แตะข้อมูลจริง)

ใช้ emulator ของ Firebase ซึ่งเป็นฐานข้อมูลจำลองบนเครื่อง ต้องเปิด PowerShell 3 หน้าต่างในโฟลเดอร์โปรเจกต์

0. สร้างไฟล์ `.dev.vars` ในโฟลเดอร์โปรเจกต์ (ไฟล์นี้ถูกกันไม่ให้ commit แล้ว) เนื้อหา

   ```
   FIREBASE_PROJECT_ID=demo-chainatpit
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
   ```

1. หน้าต่างที่ 1: เปิด emulator

   ```
   npx firebase emulators:start --project demo-chainatpit --only auth,firestore
   ```

2. หน้าต่างที่ 2: ใส่ข้อมูลตัวอย่าง

   ```
   npm run seed:emu
   ```

3. หน้าต่างที่ 3: เปิดเว็บ

   ```
   npm run dev
   ```

   คำสั่งนี้รัน R2 จำลองบนเครื่องให้ (`wrangler pages dev ... --r2=MEDIA`) รูปที่อัปโหลดตอนทดลองจึงไม่ไปปนกับ R2 จริง
   แล้วเปิด http://localhost:8788 (หลังบ้านที่ http://localhost:8788/admin/login.html)

บัญชีทดสอบ (รหัสผ่านทุกบัญชี `password123`)

| อีเมล | บทบาท |
|---|---|
| `admin@example.com` | แอดมิน |
| `prc@example.com` | ผู้ประชาสัมพันธ์ส่วนกลาง (`pr_central`) |
| `prMath@example.com` | ครู + ผู้ประชาสัมพันธ์ฝ่ายคณิตศาสตร์ |
| `prMulti@example.com` | ครู + ผู้ประชาสัมพันธ์ฝ่ายคณิตศาสตร์และฝ่ายวิชาการ |
| `t1@example.com` | ครูทั่วไป (ผูกกับบุคลากร s1) |
| `off@example.com` | บัญชีที่ถูกปิดใช้งาน (ล็อกอินไม่ได้) |

เมื่อเว็บรันบน `localhost` โค้ดจะต่อ emulator อัตโนมัติ ไม่ใช้ค่าจริงของ Firebase

---

## 5. สร้าง GitHub repo และอัปโหลดไฟล์ผ่านหน้าเว็บ

1. สมัคร/ล็อกอิน https://github.com แล้วกด New repository ตั้งชื่อ เช่น `chainatpit-website` (เลือก Private ถ้าไม่อยากให้สาธารณะเห็น)
2. ในหน้า repo ที่ว่างอยู่ กด **uploading an existing file** แล้ว **ลากไฟล์และโฟลเดอร์ทั้งหมดไปวางในหน้าเว็บ** (drag-and-drop ใช้ได้) กด Commit changes
   (ถ้ามีไฟล์มาก GitHub อาจจำกัดจำนวนต่อครั้ง ให้อัปโหลดทีละกลุ่มโฟลเดอร์)

**ห้ามอัปโหลดสิ่งเหล่านี้**

- `node_modules/` (โฟลเดอร์ใหญ่ ไม่จำเป็น ติดตั้งใหม่ได้เสมอ)
- ไฟล์ key JSON ของ service account (ชื่อที่ `.gitignore` กันไว้ให้คือ `*.key.json`, `*-key.json`, `*adminsdk*.json`, `*serviceAccount*.json` แนะนำให้เปลี่ยนชื่อไฟล์ที่ดาวน์โหลดเป็น `chainatpit.key.json`)
- `.dev.vars` (ไฟล์ตั้งค่าบนเครื่อง)
- `migration/out/` (ข้อมูลที่ scrape มา)

ไฟล์ `.gitignore` กันสิ่งเหล่านี้ไว้ให้ถ้าคุณใช้ Git แต่การลากวางผ่านเว็บ **ไม่ผ่าน .gitignore** จึงต้องเลือกไฟล์เองให้ดี

---

## 6. เชื่อม Cloudflare Pages

1. สมัคร/ล็อกอิน https://dash.cloudflare.com -> Workers & Pages -> Create -> Pages -> **Connect to Git** แล้วเลือก repo จากข้อ 5
2. ตั้งค่า build
   - **Build command: เว้นว่าง**
   - **Build output directory: `public`**
   - Root directory: เว้นว่าง (โฟลเดอร์ `functions/` ต้องอยู่ที่ราก repo)
3. เพิ่ม Environment variables (Settings -> Variables and Secrets ตั้งให้ครบ **ทั้ง Production และ Preview** เหมือนการผูก `MEDIA` ไม่เช่นนั้นการอัปโหลดรูปและการจัดการผู้ใช้จะใช้ไม่ได้บน preview deployment)

   | ชื่อ | ค่า |
   |---|---|
   | `FIREBASE_PROJECT_ID` | `chainatpit-a8c9c` |
   | `FIREBASE_API_KEY` | Web API Key ตัวเดียวกับที่ใส่ใน `firebase.js` (หรือคีย์แยกตามหมายเหตุด้านล่าง) |
   | `FIREBASE_SERVICE_ACCOUNT` | **เปิด Encrypt** แล้ววางเนื้อหา JSON ของ service account key **ทั้งไฟล์** (เปิดไฟล์ด้วย Notepad คัดลอกทั้งหมด) |

4. (ไม่บังคับ) ตัวแปร `SITE_NAME` ชื่อเว็บที่ใช้ในการ์ดแชร์ Facebook (Open Graph) ถ้าไม่ตั้งจะใช้ "โรงเรียนชัยนาทพิทยาคม"
5. (ไม่บังคับ แนะนำ) ใช้ API key **แยกกัน 2 ตัว** ที่ Google Cloud Console -> APIs & Services -> Credentials:
   ตัวที่ใส่ใน `firebase.js` ให้จำกัด HTTP referrer (`www.chainatpit.ac.th/*`, `*.pages.dev/*`)
   ส่วนตัวที่ใส่ใน Pages `FIREBASE_API_KEY` ให้จำกัด API เฉพาะ Cloud Firestore API และ **ไม่จำกัด referrer** เพราะเซิร์ฟเวอร์ Cloudflare เรียกโดยไม่มี referrer
6. กด Save and Deploy จะได้ที่อยู่แบบ `https://ชื่อโปรเจกต์.pages.dev`

> หมายเหตุ: การอัปโหลดแบบ drag-and-drop ในหน้า dashboard ของ Cloudflare **ไม่รองรับ Functions**
> (หน้าข่าวแชร์ Facebook การจัดการบัญชีผู้ใช้ และการอัปโหลด/แสดงรูปภาพจะไม่ทำงาน) จึงต้องใช้วิธีเชื่อม GitHub ตามนี้เท่านั้น
> โปรเจกต์นี้ตั้งใจ **ไม่มีไฟล์ `wrangler.toml`** (ตัวแปรและ binding ตั้งในหน้า dashboard) ถ้าเพิ่มไฟล์นี้พร้อม `pages_build_output_dir` ค่าใน dashboard จะถูกแทนที่
> ถ้าแก้ตัวแปรแล้วต้อง Deploy ใหม่ (Retry deployment) ค่าจึงจะมีผล

### 6.1 เปิด Cloudflare R2 (ที่เก็บรูป) และผูกกับ Pages

ทำหลังสร้างโปรเจกต์ Pages ในข้อ 6 แล้ว (ต้องทำก่อนทดลองอัปโหลดรูปบนเว็บจริง)

1. Cloudflare dashboard -> **R2 Object Storage** -> กดเปิดใช้งาน R2 Cloudflare จะให้ **ผูกบัตรเพื่อยืนยันตัวตน** (ไม่เก็บเงินถ้าใช้ไม่เกินโควตาฟรีของ R2 ซึ่งโรงเรียนขนาดนี้ใช้ไม่ถึงโดยปกติ)
2. กด **Create bucket** ตั้งชื่อ **`chainatpit-media`** (ชื่อนี้ต้องตรงตามนี้)
3. ไปที่ Workers & Pages -> เลือกโปรเจกต์ Pages -> **Settings -> Bindings -> Add -> R2 bucket**
   - **Variable name: `MEDIA`** (ต้องพิมพ์ตัวพิมพ์ใหญ่ตามนี้)
   - R2 bucket: เลือก `chainatpit-media`
   - ทำให้ครบทั้ง **Production และ Preview**
4. กด **Redeploy** (Deployments -> ... -> Retry deployment) เพื่อให้การผูกมีผล

ตรวจว่าใช้ได้: ล็อกอินหลังบ้านแล้วลองอัปโหลดรูปข่าว รูปต้องแสดงที่ที่อยู่แบบ `/media/news/...`

> **โควตา Functions รายวัน:** รูปทุกรูปเสิร์ฟผ่าน Pages Function (`functions/media/[[path]].js`) การเปิดดูรูปครั้งแรกแต่ละรูปนับเป็น 1 คำขอ
> แผน Free ของ Workers/Pages Functions จำกัด **100,000 คำขอต่อวัน** รวมกับ `/api/*` และ `/news/*` ดูการใช้งานได้ที่ Workers & Pages -> เลือกโปรเจกต์ -> **Metrics**
> ถ้าเกินโควตา ให้อัปเกรดเป็นแผน **Workers Paid** (วิธีแก้)

---

## 7. สร้างแอดมินคนแรก และใส่ข้อมูลเริ่มต้น

ต้องทำบนเครื่องของคุณ โดยชี้ไปที่ไฟล์ key จากข้อ 2.5 (เปลี่ยนที่อยู่ไฟล์ให้ตรงกับของคุณ)

**Command Prompt (cmd)**

```
set GOOGLE_APPLICATION_CREDENTIALS=C:\keys\chainatpit.key.json
node scripts/seed.mjs --first-admin ชื่ออีเมล@example.com รหัสผ่านอย่างน้อย8ตัว --yes
node scripts/seed.mjs --yes
```

**PowerShell**

```
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\keys\chainatpit.key.json"
node scripts/seed.mjs --first-admin ชื่ออีเมล@example.com รหัสผ่านอย่างน้อย8ตัว --yes
node scripts/seed.mjs --yes
```

- บรรทัดแรกสร้างบัญชีแอดมินคนแรก (รหัสผ่านอย่างน้อย 8 ตัวอักษร)
- บรรทัดสุดท้ายใส่รายชื่อกลุ่มสาระ/ฝ่ายงาน 16 รายการ และข้อมูลตั้งค่าเว็บเริ่มต้น ลงโปรเจกต์จริง (ไม่ใส่ข่าวหรือบัญชีทดสอบ)
- ถ้าไม่ใส่ `--yes` สคริปต์จะปฏิเสธการทำงาน เพื่อกันเขียนข้อมูลจริงโดยไม่ตั้งใจ
- หลังเสร็จให้ล็อกอินที่ `/admin/login.html` แล้วไปหน้า "ตั้งค่าเว็บไซต์" แก้ชื่อ ที่อยู่ เบอร์โทร ให้เป็นข้อมูลจริง

---

## 8. เพิ่ม Authorized domains ใน Firebase Auth

Firebase console -> Authentication -> Settings -> Authorized domains -> Add domain แล้วเพิ่ม **ทั้งสองชื่อ**

- `ชื่อโปรเจกต์.pages.dev` (ที่อยู่จากข้อ 6)
- `www.chainatpit.ac.th`

ถ้าไม่เพิ่ม การล็อกอินและรีเซ็ตรหัสผ่านบนโดเมนนั้นจะใช้ไม่ได้

---

## 9. ย้ายเนื้อหาจากเว็บเดิม (Google Sites)

อ่านขั้นตอนทั้งหมดที่ [`migration/README.md`](migration/README.md) (scrape -> ตรวจทานด้วยตา -> import แบบ dry-run -> import จริง)

### R2 API token สำหรับย้ายข้อมูล

สคริปต์นำเข้า (`scripts/import-legacy.mjs`) อัปโหลดรูปเข้า R2 ผ่านคีย์ API แยกต่างหาก ต้องทำเฉพาะตอนนำเข้าจริง (`--commit`)

1. Cloudflare dashboard -> R2 Object Storage -> **Manage API Tokens** -> Create API token
2. สิทธิ์: **Object Read & Write** เลือกเฉพาะ bucket `chainatpit-media`
3. กดสร้าง แล้วจดค่า **Access Key ID**, **Secret Access Key** (แสดงครั้งเดียว) และ **Account ID** (อยู่ในหน้า R2 ด้านขวา)
4. ตั้งตัวแปรในหน้าต่างที่จะรันสคริปต์ (ตั้งใหม่ทุกครั้งที่เปิดหน้าต่างใหม่)

**Command Prompt (cmd)**

```
set R2_ACCOUNT_ID=ใส่_account_id
set R2_ACCESS_KEY_ID=ใส่_access_key_id
set R2_SECRET_ACCESS_KEY=ใส่_secret_access_key
set R2_BUCKET=chainatpit-media
```

**PowerShell**

```
$env:R2_ACCOUNT_ID = "ใส่_account_id"
$env:R2_ACCESS_KEY_ID = "ใส่_access_key_id"
$env:R2_SECRET_ACCESS_KEY = "ใส่_secret_access_key"
$env:R2_BUCKET = "chainatpit-media"
```

> **คำเตือน:** Secret Access Key เป็นความลับ ห้ามเขียนลงไฟล์ในโปรเจกต์หรืออัปโหลดขึ้น GitHub ถ้าหลุดให้ลบ token นั้นทิ้งแล้วสร้างใหม่
> ตัวแปรที่จำเป็นคือ `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` ส่วน `R2_BUCKET` **ไม่บังคับ** ถ้าไม่ตั้งจะใช้ `chainatpit-media`
> ถ้าตัวแปรที่จำเป็นไม่ครบ สคริปต์จะแจ้งชื่อตัวแปรที่ขาดและหยุดทำงาน (dry-run และ `--emulator` ไม่ต้องใช้ตัวแปรเหล่านี้)

### ลิงก์เก่าของ Google Sites (`public/_redirects`)

ไฟล์ `public/_redirects` ส่งผู้ที่เปิดลิงก์เก่าไปหน้าใหม่ด้วย 301 (ข้อมูลสถานศึกษา -> `/about.html`, คณะผู้บริหารและบุคลากร -> `/staff.html`,
ข่าวประชาสัมพันธ์และหน้าย่อยรายปี -> `/news.html`, ภาพกิจกรรมและหน้าย่อย -> `/gallery.html`) ไฟล์นี้สร้างจากสคริปต์ `node scripts/gen-redirects.mjs`

**ข้อควรระวัง:** ชื่อลิงก์ (slug) ของ Google Sites ถูกสร้างจากชื่อเมนูโดยตัดสระบน/ล่างและวรรณยุกต์ออก ผู้พัฒนาไม่สามารถเปิดเว็บเดิมเพื่อยืนยันได้
จึง **คาดเดาจากชื่อเมนู** ให้คุณ **เปิดเว็บเดิมแล้วเทียบ URL จริงในแถบที่อยู่** ถ้ามีลิงก์ใดที่ไม่ตรงหรือขาด ให้เพิ่มชื่อเมนูใน `REDIRECT_TITLES`
ของไฟล์ `scripts/lib/redirects.mjs` หรือเพิ่มบรรทัดใน `public/_redirects` ตรงๆ ในรูปแบบ `/path-เดิม /หน้าใหม่.html 301`
(ถ้าเพิ่มด้วยมือแล้วรัน `gen-redirects` ใหม่ บรรทัดนั้นจะหาย) ดูผลได้หลังเว็บขึ้นแล้วด้วยการเปิดลิงก์เก่าบน pages.dev

---

## 10. Checklist วันเปิดใช้งานจริง

ทำตามลำดับ และอย่าข้ามข้อ

- [ ] 1. **นำเข้าข้อมูล** จากเว็บเดิม (ข้อ 9) และตรวจว่าข่าว/บุคลากรขึ้นถูกต้องในหลังบ้าน
- [ ] 2. **ตรวจเว็บบน pages.dev** เปิดทุกหน้า (หน้าแรก ข่าว บุคลากร เอกสาร ติดต่อ) ล็อกอินหลังบ้าน ลองเพิ่มข่าว/อัปโหลดรูป และลองลิงก์เก่าตามข้อ 9
- [ ] 3. **เพิ่ม custom domain `www.chainatpit.ac.th` ใน Pages** (Pages -> Custom domains -> Set up a custom domain) Cloudflare จะบอกค่า CNAME ที่ต้องตั้ง
- [ ] 4. **เปลี่ยน CNAME ของ `www`** ที่ผู้ให้บริการ DNS ปัจจุบันของโรงเรียน ให้ชี้ไปที่ `ชื่อโปรเจกต์.pages.dev` ตามที่ Cloudflare แจ้ง (DNS อาจใช้เวลาหลายนาทีถึงหลายชั่วโมง)
- [ ] 5. **ตั้ง redirect จากโดเมนเปล่า (apex) `chainatpit.ac.th` ไปที่ `www.chainatpit.ac.th`** ที่ผู้ให้บริการ DNS/โดเมน (ใช้ฟีเจอร์ URL redirect/forwarding แบบ 301)
- [ ] 6. **ทดสอบแชร์ลิงก์ข่าวด้วย Facebook Sharing Debugger** https://developers.facebook.com/tools/debug/ วางลิงก์ `https://www.chainatpit.ac.th/news/<รหัสข่าว>` กด Debug (และ Scrape Again) ต้องเห็นชื่อข่าว/คำอธิบาย/รูป
- [ ] 7. **เก็บ Google Sites เดิมไว้** จนกว่าทุกอย่างข้างบนจะยืนยันแล้วว่าใช้งานได้ ห้ามลบก่อน
- [ ] 8. ตรวจว่าเพิ่ม Authorized domains ครบแล้ว (ข้อ 8) และทำรายการ "ก่อนใช้งานจริง" ในข้อ 12 ครบ

---

## 11. การใช้งานประจำวัน แยกตามบทบาท

ล็อกอินที่ `/admin/login.html` ระบบแสดงเมนูตามสิทธิ์ของแต่ละคน (ลืมรหัสผ่านกดลิงก์ "ลืมรหัสผ่าน" ในหน้าล็อกอิน)

| บทบาท | ทำอะไรได้ |
|---|---|
| **แอดมิน** (`admin`) | ทำได้ทุกอย่าง: จัดการข่าวทั้งหมด บุคลากร กลุ่มสาระ/ฝ่ายงาน เอกสาร **ผู้ใช้และสิทธิ์** (สร้างบัญชี ตั้งรหัสผ่านใหม่ เปลี่ยนบทบาท ปิด/เปิดบัญชี) และ **ตั้งค่าเว็บไซต์** (ชื่อ แบนเนอร์ ข้อมูลสถานศึกษา คณะผู้บริหาร) |
| **ผู้ประชาสัมพันธ์ส่วนกลาง** (`pr_central`) | เพิ่ม/แก้/ลบข่าวและเอกสารได้ทุกฝ่าย |
| **ผู้ประชาสัมพันธ์ประจำฝ่าย** (ครูที่ถูกกำหนดฝ่ายใน `prDepartments`) | เพิ่ม/แก้ข่าวและเอกสารของฝ่ายตนเอง (ข่าวที่ติ๊กฝ่ายอื่นที่ไม่ได้รับผิดชอบจะถูกปฏิเสธทั้งข่าว) และดูแลบุคลากรในฝ่ายตน |
| **ครู** (`teacher`) | แก้ข้อมูลของตนเองในเมนู "ข้อมูลของฉัน" ได้เฉพาะ รูป ประวัติ/คำแนะนำตัว วุฒิการศึกษา และอีเมล (ไม่มีเบอร์โทร เพื่อความเป็นส่วนตัวตาม PDPA) |

ข้อควรรู้

- รูปที่อัปโหลดต้องไม่เกิน 2 MB และด้านยาวไม่เกิน 1600 px (ระบบย่อรูปจากมือถือให้อัตโนมัติ ถ้าเป็นไฟล์ที่เบราว์เซอร์อ่านไม่ได้ เช่น HEIC บางเครื่อง จะขึ้นข้อความแจ้งเป็นภาษาไทย)
- หน้าข่าวแสดงหน้าละ 12 รายการ
- บัญชีที่ถูกปิดใช้งานจะถูกออกจากระบบทันทีที่ตรวจพบ และเขียนข้อมูลไม่ได้อีก
- การเพิ่มผู้ใช้ใหม่: แอดมินสร้างบัญชีที่เมนู "ผู้ใช้และสิทธิ์" (ต้องเลือกบุคลากรในฟอร์มสร้างบัญชี จึงต้องเพิ่มบุคลากรในเมนู "บุคลากร" ก่อน)

---

## 12. ก่อนใช้งานจริง (Production checklist)

- [ ] **ยืนยันเวอร์ชันไลบรารีจาก CDN** เวอร์ชันเหล่านี้ถูกเลือกจากความจำของผู้พัฒนา ไม่ได้ตรวจกับอินเทอร์เน็ต ให้ตรวจว่ามีเวอร์ชันนี้อยู่จริง และอัปเดตถ้าต้องการ
  - **Firebase SDK** ค่าคงที่ `FIREBASE_VERSION` (ปัจจุบัน `11.10.0`) ที่ `public/assets/js/firebase.js` (ที่เดียวเท่านั้น)
  - **DOMPurify `3.2.6`** (`https://cdn.jsdelivr.net/npm/dompurify@3.2.6/...`) อยู่ใน `public/about.html`, `public/news-detail.html`, `public/admin/news-edit.html`, `public/admin/settings.html`
  - **Quill `2.0.3`** (`https://cdn.jsdelivr.net/npm/quill@2.0.3/...`) อยู่ใน `public/admin/news-edit.html`, `public/admin/settings.html`
  - วิธีตรวจ: เปิดลิงก์ CDN ในเบราว์เซอร์ ถ้าได้ไฟล์ แปลว่ามีเวอร์ชันนั้น แล้วเปิดเว็บ/หลังบ้านเช็กว่าไม่มี error ใน Console (กด F12)
- [ ] **ใส่ SRI hash** ในทุกที่ที่มี `TODO` (`grep -rn "TODO" public` หรือค้นคำว่า `integrity` ในไฟล์ HTML ข้างบน) SRI คือค่ายืนยันว่าไฟล์จาก CDN ไม่ถูกแก้
  คำนวณจากไฟล์จริงที่ตรวจสอบแล้ว (เช่นจาก https://www.srihash.org หรือคำสั่ง `openssl dgst -sha384 -binary ไฟล์ | openssl base64 -A`) แล้วเพิ่ม `integrity="sha384-..."` ในแท็ก `<script>`/`<link>` ที่ตรงกัน
  (ต้องคงแอตทริบิวต์ `crossorigin="anonymous"` ไว้) **อย่าเดาค่าแฮช** ถ้าค่าผิดไลบรารีจะไม่โหลดเลย
- [ ] **รัน `npm test` ผ่านทั้งหมด** (ข้อ 3) โดยเฉพาะ rules, e2e และ sanitize ที่ยังไม่เคยถูกรันจริง
- [ ] **ตรวจข้อจำกัดที่ทราบแล้ว** (ออกแบบหรือยอมรับไว้โดยเจตนา)
  - **รูปค้างใน R2 (orphan):** เมื่อลบข่าว/บุคลากร หรือเปลี่ยนรูป ไฟล์รูปเดิมอาจยังค้างใน R2 (เปลืองพื้นที่เล็กน้อย) ไม่มีระบบลบอัตโนมัติ ลบเองที่ Cloudflare dashboard -> R2 -> `chainatpit-media` เป็นครั้งคราวได้
  - **ผู้ประชาสัมพันธ์ประจำฝ่ายดูร่างข่าวของฝ่ายอื่นได้ (เฉพาะการ list):** กฎ Firestore พิสูจน์ได้เพียงว่าเป็นผู้ประชาสัมพันธ์ จึงอนุญาตให้ผู้ประชาสัมพันธ์ฝ่ายใดก็ได้ query ดูร่างข่าวของฝ่ายอื่นได้ (หน้าหลังบ้านกรองให้เห็นเฉพาะฝ่ายตน) แต่แก้ไข/ลบข่าวฝ่ายอื่นไม่ได้ ยอมรับไว้เพราะเป็นบุคลากรภายใน
  - **ผู้ประชาสัมพันธ์ประจำฝ่ายดูรายชื่อบุคลากรที่ลาออก (`active: false`) ของฝ่ายอื่นได้** ด้วยเหตุผลเดียวกัน
  - **ข่าวที่นำเข้าจากเว็บเดิมไม่มีเจ้าของจริง** (`authorUid: 'legacy-import'`) หน้าหลังบ้านแสดงผู้เขียนไม่ได้ แก้ได้เฉพาะแอดมิน/ผู้ประชาสัมพันธ์ส่วนกลาง
  - **รูปในเนื้อข่าวที่นำเข้า** ถูกแยกเป็นแกลเลอรี ไม่ได้แทรกกลางเนื้อหา
  - **`_redirects` ของลิงก์เก่าเป็นการคาดเดา** จากชื่อเมนู ต้องเทียบกับ URL จริง (ข้อ 9)
  - **บัญชีที่ถูกปิดใช้งานแต่ token ยังไม่หมดอายุ** (สูงสุดราว 1 ชั่วโมง) กฎจะปฏิเสธการเขียนทันที แต่การอ่านข้อมูลสาธารณะยังทำได้ตามปกติ
- [ ] **สำรองข้อมูล** ตั้งสำรอง Firestore เป็นระยะ (Firestore -> Disaster recovery หรือ export ผ่าน Google Cloud) เพราะข่าวเป็นข้อมูลสำคัญ

---

## 13. แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| **`permission-denied`** / "ไม่มีสิทธิ์บันทึกข้อมูลนี้" | (1) ยังไม่ได้ deploy กฎ ให้รัน `npx firebase deploy --only firestore --project chainatpit-a8c9c` (2) บัญชีไม่มีเอกสารใน `users` หรือถูกปิดใช้งาน หรือบทบาทไม่พอ ตรวจที่เมนู "ผู้ใช้และสิทธิ์" (3) ครูแก้ฟิลด์ที่ไม่อนุญาต (ครูแก้ได้เฉพาะ รูป ประวัติ วุฒิ อีเมล) (4) ข่าวที่ผู้ประชาสัมพันธ์ฝ่ายติ๊กฝ่ายที่ตนไม่ได้รับผิดชอบ |
| Console ขึ้น **"The query requires an index"** พร้อมลิงก์ยาว | กดลิงก์นั้น (ล็อกอิน Firebase แล้ว) แล้วกด Create index รอจนสถานะเป็น Enabled หรือรัน `npx firebase deploy --only firestore --project chainatpit-a8c9c` เพื่อ deploy จาก `firestore.indexes.json` (ถ้าต้องเพิ่มดัชนี ให้เพิ่มในไฟล์นั้นด้วยเพื่อไม่ให้หายตอน deploy ครั้งถัดไป) |
| Functions ตอบ **401** (`UNAUTHENTICATED`) | ไม่ได้ล็อกอินหรือ token หมดอายุ/ผิด ให้ออกจากระบบแล้วเข้าใหม่ และตรวจว่า `FIREBASE_PROJECT_ID` ใน Pages ตรงกับ `chainatpit-a8c9c` |
| Functions ตอบ **403** (`FORBIDDEN`) | บัญชีนี้ไม่ใช่แอดมิน หรือถูกปิดใช้งาน (การจัดการผู้ใช้ทำได้เฉพาะแอดมิน) |
| รูปขึ้น **404** หรืออัปโหลดรูปแล้วได้ **500** | ตรวจว่า Pages ผูก R2 bucket `chainatpit-media` ด้วยชื่อตัวแปร `MEDIA` ครบทั้ง Production และ Preview (ข้อ 6.1) แล้วกด Redeploy |
| รูปหายทั้งเว็บแต่หน้าเว็บเปิดได้ / อัปโหลดไม่ได้ | ตรวจโควตา Functions รายวัน (100,000 คำขอ/วัน แผน Free) ที่ Workers & Pages -> โปรเจกต์ -> Metrics ถ้าเต็มให้รอรีเซ็ตวันถัดไปหรืออัปเกรดเป็น Workers Paid (ข้อ 6.1) |
| Functions ตอบ **500** หรือสร้างบัญชีไม่ได้ | ตรวจ `FIREBASE_SERVICE_ACCOUNT` ใน Pages: ต้องเป็น JSON ทั้งไฟล์ครบทุกบรรทัด ไม่ใช่เฉพาะบางส่วน และได้กด Retry deployment หลังแก้แล้ว |
| หน้าข่าวแชร์ Facebook ไม่ขึ้นรูป/ชื่อ | ตรวจ `FIREBASE_API_KEY` ใน Pages และว่า API key ไม่ได้ถูกจำกัด HTTP referrer (เซิร์ฟเวอร์ Cloudflare เรียกโดยไม่มี referrer จึงจะถูกปฏิเสธ) แล้วกด Scrape Again ใน Sharing Debugger |
| ล็อกอินไม่ได้บนโดเมนจริง | ยังไม่ได้เพิ่ม Authorized domains (ข้อ 8) |
| เว็บขึ้นแต่ข้อมูลว่าง/ล็อกอินไม่ได้เลย | ยังไม่ได้แทน placeholder `REPLACE_WITH_...` ใน `public/assets/js/firebase.js` (ข้อ 2.3) |
| `seed.mjs` ปฏิเสธการทำงาน | ต้องใส่ `--yes` และตั้ง `GOOGLE_APPLICATION_CREDENTIALS` ให้ถูก (ข้อ 7) |
| ลิงก์ Google Sites เดิมเปิดแล้วเจอ 404 | slug ไม่ตรงกับที่คาดเดาไว้ ให้เพิ่มกฎใน `_redirects` (ข้อ 9) |
