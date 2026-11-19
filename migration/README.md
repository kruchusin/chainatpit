# ย้ายข้อมูลจากเว็บไซต์เดิม (Google Sites)

สคริปต์ชุดนี้ใช้ครั้งเดียวบนเครื่องผู้ดูแล (Node 20 ขึ้นไป) ไม่ได้ถูก deploy ไปกับเว็บไซต์
ย้ายข่าวประชาสัมพันธ์ปีการศึกษา 2567–2569 และรายชื่อบุคลากรแต่ละกลุ่ม จาก https://www.chainatpit.ac.th/

ลำดับงาน: **scrape -> ตรวจทานไฟล์ JSON ด้วยตา -> import แบบ dry-run -> import จริง**

## 0. ติดตั้ง

```
npm install
```

(ต้องมี `node-html-parser`, `sharp`, `jsdom`, `dompurify` ซึ่งอยู่ใน devDependencies แล้ว)

## 1. เก็บ fixture และเติมตัวเลขใน test (ทำครั้งเดียว)

Google Sites แต่ละธีมมีโครงสร้าง HTML ต่างกัน ตัว parser เขียนแบบกว้างๆ (แยกบล็อกด้วยหัวข้อ `h1`–`h6`)
จึงต้องตรวจกับหน้าจริงก่อน:

```
mkdir -p tests/fixtures
curl -o tests/fixtures/legacy-news-2569.html "<URL หน้า archive ข่าวปี 2569>"
curl -o tests/fixtures/legacy-staff-math.html "<URL หน้าบุคลากรกลุ่มสาระคณิตศาสตร์>"
```

URL ให้คัดลอกจากเมนูของเว็บเดิม (slug เป็นภาษาไทยที่ตัดสระและวรรณยุกต์ออก
เช่น `/ขาวประชาสมพนธ/ปการศกษา-2569`)

แล้วเปิดไฟล์ `tests/unit/scrape-legacy.test.js` ส่วนท้ายที่เป็น `it.skip('TODO fixture: ...')` 3 ข้อ
เปลี่ยนเป็น `it(...)` และเติมค่าจริง:

- จำนวนข่าวที่นับด้วยตาในหน้า 2569 -> `expect(parseNewsArchive(html)).toHaveLength(<จำนวน>)`
- หัวข้อและวันที่ของข่าวแรกตามหน้าจริง (`dateText`)
- ชื่อครูคนแรกของกลุ่มคณิตศาสตร์ (`prefix`, `name`, `position`)

อ่าน fixture ด้วย `readFileSync('tests/fixtures/legacy-news-2569.html', 'utf8')` แล้วรัน
`npx vitest run --project unit tests/unit/scrape-legacy.test.js`
ถ้าจำนวนไม่ตรง ให้ดูว่าหน้านั้นใช้หัวข้อชนิดใดแยกข่าว แล้วปรับ `migration/lib/blocks.mjs`
(`HEADING`, `BLOCK`, `SKIP`)

## 2. Scrape

```
node migration/scrape-legacy.mjs --year 2569 --url "<URL archive ข่าวปี 2569>"
node migration/scrape-legacy.mjs --year 2568 --url "<URL ...>"
node migration/scrape-legacy.mjs --year 2567 --url "<URL ...>"
node migration/scrape-legacy.mjs --staff "<URL หน้าบุคลากร>" --dept math
```

`--dept` ใช้รหัส: thai, math, sci, social, health, art, career, foreign, academic, personnel, budget,
general, executive, guidance, office, support

ผลลัพธ์อยู่ที่ `migration/out/news-<ปี>.json` และ `migration/out/staff-<dept>.json` (โฟลเดอร์นี้ถูก gitignore)
**ตรวจรูปบุคลากรด้วยตาในไฟล์ JSON** (เปิดลิงก์ `photoUrl` เทียบกับหน้าเว็บเดิม): parser ผูกรูปกับคนตามกรอบ (card) เดียวกัน ถ้าหาโครงสร้างกรอบไม่เจอจะปล่อยรูปว่าง ไม่เดา

**แก้วันที่และชื่อใน JSON ให้ถูกก่อน `--commit` ครั้งแรก** เพราะ id คำนวณจากหัวข้อ+วันที่ (ข่าว) และฝ่าย+ชื่อ (บุคลากร) ถ้าแก้ภายหลังแล้วนำเข้าอีกครั้งจะเกิดเอกสารซ้ำ

**เปิดตรวจและแก้ไขเอง**: ลบรายการที่ไม่ใช่ข่าว แก้หัวข้อ/วันที่ที่อ่านผิด สคริปต์จะแจ้งจำนวนข่าวที่ไม่พบวันที่
(ข่าวเหล่านั้นจะใช้ 1 ม.ค. ของปีที่ระบุ) ในหน้าบุคลากรอย่าใส่เบอร์โทร (สคริปต์ตัดบรรทัดที่เหมือนเบอร์โทรออกอยู่แล้ว
และเว็บใหม่ไม่เก็บเบอร์โทรบุคลากร)

## 3. Import

ทดสอบกับ emulator ก่อน (เปิด `firebase emulators:start --only firestore,storage` ไว้):

```
node scripts/import-legacy.mjs --news migration/out/news-2569.json --year 2569 --emulator            # dry-run (ค่าเริ่มต้น)
node scripts/import-legacy.mjs --news migration/out/news-2569.json --year 2569 --emulator --commit
node scripts/import-legacy.mjs --staff migration/out/staff-math.json --dept math --emulator --commit
```

เมื่อพอใจแล้วจึงทำกับโปรเจกต์จริง (ต้องตั้ง `GOOGLE_APPLICATION_CREDENTIALS` และต้องใส่ `--yes`):

```
node scripts/import-legacy.mjs --news migration/out/news-2569.json --year 2569                       # dry-run ไม่ต้องใช้สิทธิ์
node scripts/import-legacy.mjs --news migration/out/news-2569.json --year 2569 --commit --yes
```

ตัวเลือก: `--overwrite` เขียนทับเอกสารที่มีอยู่ทั้งเอกสาร **การแก้ไขที่ผู้ดูแลทำผ่านหน้าหลังบ้านจะหายหมด** (ค่าเริ่มต้นคือข้าม จึงรันซ้ำได้อย่างปลอดภัย),
`--bucket <ชื่อ>` ถ้า Storage bucket ไม่ใช่ค่าเริ่มต้น
(`chainatpit-a8c9c.firebasestorage.app`, emulator ใช้ `demo-chainatpit.appspot.com`)

dry-run กับโปรเจกต์จริงไม่เชื่อมต่อ Firebase จึงไม่เช็กว่าเอกสารมีอยู่แล้วหรือไม่
(กับ `--emulator` เช็กให้)

ถ้าดาวน์โหลด/อัปโหลดรูปของรายการใดล้มเหลว สคริปต์จะ **ไม่เขียนเอกสารนั้น** และสรุป id ที่ล้มเหลวตอนท้าย (exit code 1) ให้รันคำสั่งเดิมซ้ำ (ไม่ต้องใส่ `--overwrite`) เพื่อลองใหม่เฉพาะรายการที่ยังไม่มี

สิ่งที่สคริปต์ทำ: ดาวน์โหลดรูป ย่อให้ด้านยาวไม่เกิน 1600px เป็น JPEG ไม่เกิน 2 MB อัปโหลดไป
`news/{id}/legacy-<n>.jpg` และ `staff/{id}/photo.jpg` แล้วเก็บ URL แบบเต็มลงเอกสาร
id คือ 20 ตัวแรกของ sha256 (ข่าว: `title|วันที่`, บุคลากร: `dept|name`)

## หมายเหตุ

- ข่าวที่นำเข้ามี `authorUid: 'legacy-import'` ซึ่งไม่ใช่ผู้ใช้จริง กฎ Firestore ไม่ต้องการให้ผู้เขียนมีอยู่จริงเพื่ออ่านข่าว
  แต่หน้าหลังบ้านจะแสดงผู้เขียนไม่ได้ และไม่มีใครแก้ข่าวเหล่านี้ได้ในฐานะเจ้าของ (admin / pr_central แก้ได้ตามปกติ)
- ข่าวที่นำเข้าไม่มีฝ่าย (`departmentIds: []`) ไม่ปักหมุด และเผยแพร่ทันที
- รูปในเนื้อข่าวถูกแยกเป็น `images` (ภาพแรกเป็นภาพปก) ไม่ได้แทรกใน `bodyHtml`
- เนื้อข่าวผ่าน sanitizer ชุดเดียวกับหน้าเว็บก่อนบันทึก ถ้ามีเบอร์โทรในเนื้อข่าวสคริปต์จะเตือนตอนรัน
