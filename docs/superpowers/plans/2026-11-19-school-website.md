# เว็บไซต์โรงเรียนชัยนาทพิทยาคม — แผนการสร้าง (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างเว็บไซต์โรงเรียน มีหน้าบ้านสาธารณะและหลังบ้านที่ใช้สิทธิ์ตามบทบาท โฮสต์บน Cloudflare Pages ใช้ Firebase (Auth, Firestore, Storage) และมาแทน Google Sites เดิมที่ www.chainatpit.ac.th

**Architecture:** หน้าเว็บเป็น HTML, CSS และ JS (ES modules) ไม่มีขั้นตอน build อยู่ใน `public/` และเรียก Firebase JS SDK จาก CDN โดยตรง สิทธิ์ทั้งหมดบังคับที่ `firestore.rules` และ `storage.rules` ส่วน Cloudflare Pages Functions ใน `functions/` มีเพียง 2 จุด คือจัดการบัญชีผู้ใช้ด้วย service account และ render meta OG ของหน้าข่าว โดยไม่ใช้ npm dependency ใน runtime (ใช้ WebCrypto และ fetch)

**Tech Stack:** HTML/CSS/JS (ES2022 modules), Firebase JS SDK (CDN, modular), Firestore, Firebase Auth (email/password), Cloud Storage for Firebase (Blaze), Cloudflare Pages + Pages Functions, Quill (rich text, CDN), DOMPurify (CDN) · Dev only: Node 20+, firebase-tools, @firebase/rules-unit-testing, vitest, jsdom, dompurify, playwright, wrangler

**Spec:** `docs/superpowers/specs/2026-11-19-school-website-design.md`

## Global Constraints

- ไม่มี build step: Cloudflare Pages ตั้ง Build command ว่าง, Build output directory = `public`, โฟลเดอร์ `functions/` อยู่ที่ root
- โค้ดใน `functions/` ห้าม import npm package ใช้ได้เฉพาะ Web APIs ของ Workers (fetch, crypto.subtle, HTMLRewriter)
- ไฟล์ใน `public/` ห้าม import npm package ไลบรารีภายนอกโหลดจาก CDN เท่านั้น เวอร์ชัน Firebase SDK กำหนดไว้ที่เดียวคือค่าคงที่ `FIREBASE_VERSION` ใน `public/assets/js/firebase.js` (ใช้เวอร์ชัน stable ล่าสุด ณ วันที่สร้าง)
- โมดูลใน `public/assets/js/lib/` ต้องไม่มี import จาก URL เพื่อให้ทดสอบใน Node ได้ ไลบรารีจาก CDN ให้รับเข้ามาเป็นพารามิเตอร์ (dependency injection)
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย ฟอนต์ Sarabun (เนื้อหา) และ Prompt (หัวข้อ) จาก Google Fonts วันที่แสดงเป็น พ.ศ.
- บทบาท: `admin` | `pr_central` | `teacher` และสิทธิ์ผู้ประชาสัมพันธ์ประจำฝ่ายคือ `prDepartments: string[]` ที่ไม่ว่าง
- ประเภทหน่วยงาน: `subject` | `division` | `unit`
- staff สาธารณะไม่มีฟิลด์เบอร์โทร (PDPA) ฟิลด์ที่เจ้าตัวแก้ได้มีเท่านั้น: `photoUrl`, `bio`, `education`, `email`
- รูปที่อัปโหลด: ด้านยาวไม่เกิน 1600px, ขนาดไม่เกิน 2 MB, `contentType` ขึ้นต้นด้วย `image/`
- รหัสผ่านอย่างน้อย 8 ตัวอักษร
- Secrets เป็น Pages environment variables: `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_SERVICE_ACCOUNT` (JSON string แบบ encrypted) ห้าม commit key ลง repo
- ข่าวหนึ่งหน้า: 12 รายการ
- โปรเจกต์ Firebase: `chainatpit-a8c9c` ใช้ Cloud Firestore location `asia-southeast1` **ห้ามใช้หรือแก้ Realtime Database** ที่มีอยู่ในโปรเจกต์

## Review Focus

1. **ผู้ประชาสัมพันธ์หลายฝ่ายติ๊กฝ่ายที่ตนไม่ได้รับผิดชอบเพิ่มในข่าว:** ต้องถูกปฏิเสธทั้งข่าว ไม่ใช่บันทึกได้บางส่วน → Task 3 `prMulti cannot add foreign dept to news`
2. **บัญชีที่ถูกปิดแล้ว แต่ token ยังไม่หมดอายุ:** การเขียนทุกอย่างต้องถูกปฏิเสธ และหน้าหลังบ้านต้อง sign out ทันที → Task 1/3 `disabled admin cannot write`, Task 7 `setDisabled caller disabled → 403`, Task 10 e2e `disabled user is signed out`
3. **HTML อันตรายในเนื้อข่าว** (วางมาจาก Word หรือ Facebook หรือมี `<script>`/`onerror`): ต้องถูกตัดออกทั้งตอนบันทึกและตอนแสดง แต่ iframe ของ YouTube ยังใช้ได้ → Task 5 `sanitizeHtml` tests
4. **ครูอัปโหลดรูปจากมือถือขนาด 8–12 MB หรือไฟล์ HEIC ที่เบราว์เซอร์อ่านไม่ได้:** รูปปกติต้องถูกย่อให้ผ่านกฎ ส่วนไฟล์ที่อ่านไม่ได้ต้องขึ้นข้อความภาษาไทย ไม่ใช่ค้างเงียบ → Task 5 `computeResize`, Task 11 e2e `upload large image` / `undecodable file shows Thai error`
5. **ลิงก์ข่าวที่แชร์ไว้แล้วถูกลบหรือยกเลิกเผยแพร่:** `/news/{id}` ต้องตอบ 404 พร้อมหน้าที่อ่านได้ ไม่ใช่ error 500 → Task 8 `og: unpublished → 404`

---

## File Structure

```
computer/
├── package.json                 scripts + devDependencies เท่านั้น
├── firebase.json                emulators: auth 9099, firestore 8080, storage 9199; rules paths
├── .firebaserc                  default project: chainatpit-a8c9c
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── vitest.config.js             projects: unit (node/jsdom), rules (node)
├── playwright.config.js         webServer: wrangler pages dev public --port 8788
├── .gitignore                   node_modules, .wrangler, *.key.json, migration/out/
├── README.md                    คู่มือภาษาไทยสำหรับผู้ดูแล
├── functions/
│   ├── _lib/google-auth.js      verify ID token, service-account token, Firestore REST
│   ├── _lib/http.js             json(), errorResponse()
│   ├── api/admin/users.js       POST: create / setPassword / setDisabled
│   └── news/[id].js             GET: news-detail.html + meta OG
├── public/
│   ├── _redirects
│   ├── 404.html
│   ├── index.html  news.html  news-detail.html  staff.html  department.html
│   ├── about.html  contact.html  gallery.html  documents.html  ita.html
│   ├── admin/ login.html index.html profile.html news.html news-edit.html
│   │          staff.html staff-edit.html departments.html users.html
│   │          settings.html documents.html
│   └── assets/
│       ├── css/ style.css admin.css
│       └── js/
│           ├── firebase.js      init + emulator wiring
│           ├── data.js          Firestore/Storage read-write helpers
│           ├── ui.js            header/footer/nav ร่วม
│           ├── auth-guard.js    requireLogin()
│           ├── lib/ permissions.js sanitize.js thai-date.js image-resize.js
│           └── pages/<page>.js  สคริปต์ต่อหน้า (ชื่อเดียวกับไฟล์ html; admin ใช้ prefix admin-)
├── scripts/ seed.mjs  import-legacy.mjs
├── migration/ scrape-legacy.mjs  out/ (gitignored)
└── tests/
    ├── rules/ setup.js firestore.*.test.js storage.test.js
    ├── unit/  *.test.js
    └── e2e/   *.spec.js
```

## Shared Test Fixture (ใช้ใน Task 1–4)

`tests/rules/setup.js` export `getEnv()` (`initializeTestEnvironment` + โหลด rules) และ `seed(env)` ที่เขียนข้อมูลผ่าน `withSecurityRulesDisabled`

| uid | users doc |
|---|---|
| `admin` | role admin, prDepartments [], disabled false |
| `prc` | role pr_central |
| `prMath` | role teacher, prDepartments ["math"] |
| `prMulti` | role teacher, prDepartments ["math","academic"] |
| `t1` | role teacher, staffId "s1" |
| `off` | role admin, disabled **true** |

departments: `math`(subject), `sci`(subject), `academic`(division) · staff: `s1` {uid "t1", departmentIds ["math","academic"], active true}, `s2` {uid null, departmentIds ["sci"], active true}, `s3` {active false, departmentIds ["math"]} · news: `nMath` {departmentIds ["math"], published true}, `nSci` {["sci"], true}, `nGen` {[], true}, `nDraft` {["math"], published false}

`ctx(uid)` = `env.authenticatedContext(uid).firestore()` · `anon()` = `env.unauthenticatedContext().firestore()` · `st(uid)` / `anonStorage()` = `.storage()` ของ context เดียวกัน · `img(n)` = `Uint8Array(n)` พร้อม metadata `{contentType:'image/jpeg'}` · `bytes(n, type)` = แบบเดียวกันแต่กำหนด contentType เอง

---

### Task 1: โครงโปรเจกต์ + กฎ Firestore ของ users, settings, departments

**Files:**
- Create: `package.json`, `firebase.json`, `.firebaserc`, `vitest.config.js`, `.gitignore`, `firestore.rules`, `firestore.indexes.json`, `tests/rules/setup.js`, `tests/rules/firestore.core.test.js`

**Interfaces:**
- Produces: rules helper functions `isSignedIn()`, `me()` (get users/{auth.uid}.data), `isActive()`, `isAdmin()`, `isPrCentral()`, `prDepts()` (คืน `[]` ถ้าไม่มี), `ownsDept(id)`. Task 2–4 ใช้ต่อ
- Produces: npm scripts `test:unit`, `test:rules` (= `firebase emulators:exec --only firestore,storage "vitest run --project rules"`), `test:e2e`, `seed:emu`, `dev`

- [ ] **Step 1:** `git init`, สร้างไฟล์ config ตาม File Structure, `npm install` devDependencies
- [ ] **Step 2: เขียน test ที่ fail**

```js
it('anon reads settings/site, departments', ...assertSucceeds(getDoc(anon(),'settings/site')), assertSucceeds(getDoc(anon(),'departments/math')))
it('anon cannot read users', () => assertFails(getDoc(anon(),'users/t1')))
it('user reads own users doc only', ...assertSucceeds(getDoc(ctx('t1'),'users/t1')), assertFails(getDoc(ctx('t1'),'users/prc')))
it('admin reads/writes any users doc', () => assertSucceeds(setDoc(ctx('admin'),'users/x',{role:'teacher',prDepartments:[],disabled:false})))
it('teacher cannot change own role', () => assertFails(updateDoc(ctx('t1'),'users/t1',{role:'admin'})))
it('disabled admin cannot write', () => assertFails(setDoc(ctx('off'),'settings/site',{name:'x'})))
it('only admin writes settings', ...assertFails(updateDoc(ctx('prc'),'settings/site',{name:'x'})), assertSucceeds(updateDoc(ctx('admin'),'settings/site',{name:'x'})))
it('admin creates/deletes departments', ...assertSucceeds(setDoc(ctx('admin'),'departments/art',{...})), assertSucceeds(deleteDoc(ctx('admin'),'departments/art')))
it('prMath edits only description/coverUrl of math', ...assertSucceeds(updateDoc(ctx('prMath'),'departments/math',{description:'d'})), assertFails(updateDoc(ctx('prMath'),'departments/math',{name:'n'})), assertFails(updateDoc(ctx('prMath'),'departments/sci',{description:'d'})))
it('prMath cannot create departments', () => assertFails(setDoc(ctx('prMath'),'departments/z',{name:'z'})))
```
- [ ] **Step 3:** Run `npm run test:rules` → FAIL
- [ ] **Step 4:** เขียน `firestore.rules` ส่วน users/settings/departments (ใช้ `diff(resource.data).affectedKeys().hasOnly([...])` สำหรับข้อจำกัดฟิลด์) default deny
- [ ] **Step 5:** Run `npm run test:rules` → PASS
- [ ] **Step 6:** `git commit -m "feat: scaffold project and core firestore rules"`

### Task 2: กฎ Firestore ของ staff

**Files:** Modify `firestore.rules` · Test `tests/rules/firestore.staff.test.js`
**Interfaces:** Consumes Task 1 helpers. Produces rules สำหรับ `staff/{id}`

- [ ] **Step 1: เขียน test ที่ fail**

```js
it('anon reads active staff, not inactive', ...assertSucceeds(getDoc(anon(),'staff/s1')), assertFails(getDoc(anon(),'staff/s3')))
it('anon list query must filter active==true', () => assertSucceeds(getDocs(query(collection(anon(),'staff'),where('active','==',true)))))
it('t1 edits own bio/photoUrl/education/email', () => assertSucceeds(updateDoc(ctx('t1'),'staff/s1',{bio:'b',photoUrl:'u',education:'e',email:'a@b.c'})))
it('t1 cannot edit own position or departmentIds', ...assertFails(updateDoc(ctx('t1'),'staff/s1',{position:'p'})), assertFails(updateDoc(ctx('t1'),'staff/s1',{departmentIds:['sci']})))
it('t1 cannot edit other staff', () => assertFails(updateDoc(ctx('t1'),'staff/s2',{bio:'x'})))
it('prMath edits position of s1 (math member)', () => assertSucceeds(updateDoc(ctx('prMath'),'staff/s1',{position:'ครูชำนาญการ'})))
it('prMath cannot edit s2 (sci)', () => assertFails(updateDoc(ctx('prMath'),'staff/s2',{position:'x'})))
it('prMath may remove math from s1 but keep academic', () => assertSucceeds(updateDoc(ctx('prMath'),'staff/s1',{departmentIds:['academic']})))
it('prMath cannot remove academic from s1', () => assertFails(updateDoc(ctx('prMath'),'staff/s1',{departmentIds:['math']})))
it('prMath cannot add sci to s1', () => assertFails(updateDoc(ctx('prMath'),'staff/s1',{departmentIds:['math','academic','sci']})))
it('prMath cannot change uid', () => assertFails(updateDoc(ctx('prMath'),'staff/s1',{uid:'x'})))
it('prMath can set active=false on s1', () => assertSucceeds(updateDoc(ctx('prMath'),'staff/s1',{active:false})))
it('only admin creates/deletes staff', ...assertFails(setDoc(ctx('prMath'),'staff/new',{departmentIds:['math'],active:true})), assertSucceeds(deleteDoc(ctx('admin'),'staff/s2')))
it('phone field rejected for everyone', () => assertFails(updateDoc(ctx('admin'),'staff/s1',{phone:'0812345678'})))
```
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** เขียนกฎ: การเปลี่ยน departmentIds ของ PR ตรวจด้วย `removed = old.toSet().difference(new.toSet())`, `added = new.toSet().difference(old.toSet())` และทั้งสองต้อง `hasOnly(prDepts())` โดย PR มีสิทธิ์เมื่อ `old.departmentIds.hasAny(prDepts())` ฟิลด์ที่อนุญาตทั้งหมดของ staff: `prefix,name,position,photoUrl,bio,education,email,departmentIds,uid,order,active` (PR ห้ามแก้ `uid`)
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat: staff firestore rules"`

### Task 3: กฎ Firestore ของ news และ documents

**Files:** Modify `firestore.rules`, `firestore.indexes.json` · Test `tests/rules/firestore.news.test.js`
**Interfaces:** Produces rules สำหรับ `news/{id}` และ `documents/{id}` (documents มีฟิลด์ `departmentId: string|null` → ให้ถือเป็นรายการฝ่ายที่มีสมาชิก 0 หรือ 1 ตัว แล้วใช้ตรรกะเดียวกับ news)

- [ ] **Step 1: เขียน test ที่ fail**

```js
it('anon reads published, not draft', ...assertSucceeds(getDoc(anon(),'news/nMath')), assertFails(getDoc(anon(),'news/nDraft')))
it('prMath reads own-dept draft', () => assertSucceeds(getDoc(ctx('prMath'),'news/nDraft')))
it('prc writes any news incl. general', ...assertSucceeds(updateDoc(ctx('prc'),'news/nSci',{title:'x'})), assertSucceeds(setDoc(ctx('prc'),'news/g2',newsOf([]))))
it('prMath creates math news with authorUid=self', () => assertSucceeds(setDoc(ctx('prMath'),'news/m2',newsOf(['math'],'prMath'))))
it('prMath cannot spoof authorUid', () => assertFails(setDoc(ctx('prMath'),'news/m3',newsOf(['math'],'prc'))))
it('prMath cannot create general news', () => assertFails(setDoc(ctx('prMath'),'news/g3',newsOf([],'prMath'))))
it('prMath cannot edit sci news', () => assertFails(updateDoc(ctx('prMath'),'news/nSci',{title:'x'})))
it('prMulti cannot add foreign dept to news', () => assertFails(updateDoc(ctx('prMulti'),'news/nMath',{departmentIds:['math','sci']})))
it('prMulti tags math+academic', () => assertSucceeds(setDoc(ctx('prMulti'),'news/ma',newsOf(['math','academic'],'prMulti'))))
it('prMath cannot pull sci news into math', () => assertFails(updateDoc(ctx('prMath'),'news/nSci',{departmentIds:['math']})))
it('teacher t1 cannot write news', () => assertFails(setDoc(ctx('t1'),'news/t',newsOf(['math'],'t1'))))
it('disabled cannot write news', () => assertFails(setDoc(ctx('off'),'news/o',newsOf([],'off'))))
it('documents follow same rules', ...assertSucceeds(setDoc(ctx('prMath'),'documents/d1',docOf('math'))), assertFails(setDoc(ctx('prMath'),'documents/d2',docOf(null))))
```
`newsOf(depts, author)` คืน `{title, bodyHtml, coverUrl:'', images:[], departmentIds:depts, pinned:false, published:true, authorUid:author, createdAt:serverTimestamp(), updatedAt:serverTimestamp()}` · `docOf(dept)` คืน `{title, url:'https://drive.google.com/x', category:'ทั่วไป', departmentId:dept, year:2569, order:0}`
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** เขียนกฎ news/documents และ index: `news(published ASC, pinned DESC, createdAt DESC)`, `news(published, departmentIds CONTAINS, createdAt DESC)`, `staff(active, order)`, `documents(category, year DESC, order)`
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** `git commit -m "feat: news and documents firestore rules"`

### Task 4: กฎ Storage

**Files:** Create `storage.rules` · Test `tests/rules/storage.test.js`
**Interfaces:** Produces paths `news/{newsId}/{file}`, `staff/{staffId}/photo.jpg`, `departments/{deptId}/{file}`, `site/{file}` ใช้ใน Task 9, 11–13

- [ ] **Step 1: เขียน test ที่ fail**

```js
it('anon reads any image', () => assertSucceeds(getBytes(ref(anonStorage(),'news/nMath/a.jpg'))))
it('t1 uploads own photo', () => assertSucceeds(uploadBytes(ref(st('t1'),'staff/s1/photo.jpg'), img(500_000))))
it('t1 cannot upload for s2', () => assertFails(uploadBytes(ref(st('t1'),'staff/s2/photo.jpg'), img(1000))))
it('prMath uploads to news of math', () => assertSucceeds(uploadBytes(ref(st('prMath'),'news/nMath/b.jpg'), img(1000))))
it('prMath cannot upload to nSci', () => assertFails(uploadBytes(ref(st('prMath'),'news/nSci/b.jpg'), img(1000))))
it('rejects > 2 MB', () => assertFails(uploadBytes(ref(st('admin'),'site/big.jpg'), img(2*1024*1024+1))))
it('rejects non-image', () => assertFails(uploadBytes(ref(st('admin'),'site/x.pdf'), bytes(10,'application/pdf'))))
it('only admin writes site/', () => assertFails(uploadBytes(ref(st('prc'),'site/logo.png'), img(1000))))
```
สำหรับข่าวใหม่ที่ยังไม่มีเอกสาร: ให้ client สร้าง news doc (เป็น draft) ก่อนอัปโหลด กฎจึงตรวจผ่าน `firestore.get()` ได้เสมอ (Task 11 ทำตามลำดับนี้)
- [ ] **Step 2:** Run → FAIL · **Step 3:** เขียน `storage.rules` (ใช้ `firestore.get(/databases/(default)/documents/users/$(request.auth.uid))`) · **Step 4:** Run → PASS · **Step 5:** commit `feat: storage rules`

### Task 5: ไลบรารีฝั่ง client (pure modules)

**Files:** Create `public/assets/js/lib/{permissions,sanitize,thai-date,image-resize}.js` · Test `tests/unit/{permissions,sanitize,thai-date,image-resize}.test.js`
**Interfaces (Produces):**
- `permissions.js`: `isAdmin(p)`, `isPrCentral(p)`, `prDepts(p)`, `canWriteNewsFor(p, departmentIds:string[]) -> boolean`, `canEditStaff(p, staff) -> boolean`, `editableStaffFields(p, staff) -> string[]`, `canEditDepartment(p, deptId) -> boolean`, `menuFor(p) -> string[]` (คีย์เมนู: `profile, news, staff, departments, documents, users, settings`) · `p` = `{uid, role, prDepartments, disabled, staffId}`. ตรรกะต้องตรงกับ rules ใน Task 1–3 (ใช้ซ่อนหรือแสดง UI เท่านั้น)
- `sanitize.js`: `createSanitizer(DOMPurify) -> (html:string) => string`
- `thai-date.js`: `formatThaiDate(date: Date|{toDate()}) -> string`, `formatThaiDateTime(...)`
- `image-resize.js`: `computeResize(w, h, max=1600) -> {width, height}`, `resizeImage(file: File, {max=1600, maxBytes=2*1024*1024}) -> Promise<Blob>` (browser only, ทดสอบใน e2e), `class ImageDecodeError` (message: `"ไม่สามารถอ่านไฟล์รูปนี้ได้ กรุณาใช้ไฟล์ JPG หรือ PNG"`)

- [ ] **Step 1: เขียน test ที่ fail**

```js
// permissions — ใช้ profile เดียวกับ fixture
expect(canWriteNewsFor(prMulti,['math','sci'])).toBe(false)
expect(canWriteNewsFor(prMath,[])).toBe(false); expect(canWriteNewsFor(prc,[])).toBe(true)
expect(editableStaffFields(t1,s1)).toEqual(['photoUrl','bio','education','email'])
expect(editableStaffFields(prMath,s1)).toContain('position'); expect(editableStaffFields(prMath,s1)).not.toContain('uid')
expect(canEditStaff(prMath,s2)).toBe(false)
expect(menuFor(t1)).toEqual(['profile']); expect(menuFor(prMath)).toEqual(['profile','news','staff','departments','documents'])
expect(menuFor(admin)).toEqual(['profile','news','staff','departments','documents','users','settings'])
expect(menuFor({...admin, disabled:true})).toEqual([])
// sanitize (jsdom + dompurify)
expect(s('<p onclick="x()">a</p><script>alert(1)</script>')).toBe('<p>a</p>')
expect(s('<img src=x onerror=alert(1)>')).toBe('<img src="x">')
expect(s('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
expect(s('<iframe src="https://www.youtube.com/embed/abc"></iframe>')).toContain('youtube.com/embed/abc')
expect(s('<iframe src="https://evil.com/x"></iframe>')).toBe('')
expect(s('<span style="font-family:Calibri" class="MsoNormal">ก</span>')).toBe('ก')
// thai-date
expect(formatThaiDate(new Date('2026-11-19T10:00:00+07:00'))).toBe('19 พ.ย. 2569')
// image-resize
expect(computeResize(4032,3024)).toEqual({width:1600,height:1200})
expect(computeResize(800,600)).toEqual({width:800,height:600})
expect(computeResize(3000,6000)).toEqual({width:800,height:1600})
```
ใน sanitize อนุญาตเฉพาะ tag `p br strong b em i u a ul ol li h2 h3 blockquote img iframe figure figcaption` และ attr `href target rel src alt width height allowfullscreen` iframe ต้องมี src ขึ้นต้นด้วย `https://www.youtube.com/embed/` และลิงก์ `a` บังคับ `rel="noopener"` เมื่อมี target
- [ ] **Step 2:** Run `npm run test:unit` → FAIL · **Step 3:** implement · **Step 4:** PASS · **Step 5:** commit `feat: client pure libs`

### Task 6: Functions lib — ตรวจ token และเรียก Google API

**Files:** Create `functions/_lib/google-auth.js`, `functions/_lib/http.js` · Test `tests/unit/google-auth.test.js`
**Interfaces (Produces):**
- `verifyFirebaseIdToken(token, projectId, {fetchFn=fetch, now=Date.now()}) -> Promise<{uid, email}>` ใช้ JWKS `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com` (cache ตาม `max-age`) ตรวจ RS256, `aud===projectId`, `iss===https://securetoken.google.com/${projectId}`, `exp>now`, `iat<=now`, `sub` ไม่ว่าง ถ้าไม่ผ่านให้ throw `AuthError`
- `getAccessToken(sa:{client_email, private_key}, scopes:string[], {fetchFn, now}) -> Promise<string>` เซ็น JWT ด้วย PKCS8 ผ่าน WebCrypto, POST `https://oauth2.googleapis.com/token`, cache จนถึง exp−60s
- `decodeFields(fields) -> object`, `encodeFields(obj) -> fields` (Firestore REST typed values: string, integer, double, boolean, null, timestamp, array, map)
- `firestoreGet(projectId, path, token, {fetchFn}) -> Promise<object|null>`, `firestorePatch(projectId, path, data, token, {fetchFn, updateMask?})`
- `requireAdmin(request, env, deps?) -> Promise<{uid}>` ถ้าไม่ผ่าน throw `Response` 401 (ไม่มีหรือผิด token) หรือ 403 (ไม่ใช่ admin หรือถูก disabled)
- `http.js`: `json(data, status=200)`, `errorJson(status, code, messageTh)`
- Emulator mode: ถ้า `env.FIREBASE_AUTH_EMULATOR_HOST` และ `env.FIRESTORE_EMULATOR_HOST` ถูกตั้งไว้ ให้ใช้ base URL ของ emulator, ข้ามการตรวจลายเซ็น ID token (emulator ไม่เซ็น) และใช้ access token `owner` (ใช้ใน e2e ของ Task 13 เท่านั้น)

  test เพิ่มเติม: `it('emulator bypass ignored when env var absent', () => unsigned token → rejects AuthError)`

- [ ] **Step 1: เขียน test ที่ fail** (สร้างคีย์ RSA ใน test ด้วย `crypto.subtle.generateKey` แล้ว mock fetch ให้คืน JWKS นั้น)

```js
it('accepts valid token', async () => expect(await verify(sign({aud:P,iss:ISS,sub:'u1',exp:T+3600,iat:T}))).toEqual({uid:'u1',email:undefined}))
it('rejects wrong aud / iss / expired / unknown kid / bad signature', ...each → rejects.toBeInstanceOf(AuthError))
it('decodeFields roundtrip', () => expect(decodeFields(encodeFields({a:'x',n:3,b:true,l:['p'],m:{k:null}}))).toEqual({a:'x',n:3,b:true,l:['p'],m:{k:null}}))
it('requireAdmin 401 without header', ...expect((await caught(requireAdmin(req()))).status).toBe(401))
it('requireAdmin 403 for teacher', ...status 403)
it('requireAdmin 403 for disabled admin', ...status 403)
it('getAccessToken caches', ... fetch called once for two calls)
```
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS · **Step 5:** commit `feat: functions google auth lib`

### Task 7: Function จัดการบัญชีผู้ใช้

**Files:** Create `functions/api/admin/users.js` · Test `tests/unit/admin-users.test.js`
**Interfaces:**
- Consumes: `requireAdmin`, `getAccessToken`, `firestorePatch`, `json`, `errorJson`
- Produces: `POST /api/admin/users` header `Authorization: Bearer <idToken>` body:
  - `{action:'create', email, password, staffId, role='teacher', prDepartments=[]}` → 201 `{uid}` สร้างบัญชีผ่าน `POST https://identitytoolkit.googleapis.com/v1/projects/{pid}/accounts` แล้วเขียน `users/{uid}` `{email, staffId, role, prDepartments, disabled:false}` และ `staff/{staffId}.uid = uid` (updateMask uid)
  - `{action:'setPassword', uid, password}` → 200 `{ok:true}` (`accounts:update`)
  - `{action:'setDisabled', uid, disabled:boolean}` → 200 `{ok:true}` (`accounts:update` + `disableUser` และ patch `users/{uid}.disabled`)
  - error codes: `INVALID_INPUT` 400, `WEAK_PASSWORD` 400 (<8), `EMAIL_EXISTS` 409, `NOT_FOUND` 404, `UNAUTHENTICATED` 401, `FORBIDDEN` 403 ทุก error มี `message` ภาษาไทย
  - ห้าม admin ปิดบัญชีของตัวเอง (`CANNOT_DISABLE_SELF` 400)

- [ ] **Step 1: เขียน test ที่ fail** (mock `deps` ที่มี fetchFn บันทึกทุก request)

```js
it('create → 201 + users doc + staff.uid patched', ...expect(res.status).toBe(201); expect(calls.map(c=>c.url)).toEqual([TOKEN, IDT_CREATE, FS_USERS_uid, FS_STAFF_s9]))
it('create weak password → 400 WEAK_PASSWORD', ...)
it('create duplicate email (IDT returns EMAIL_EXISTS) → 409', ...)
it('teacher caller → 403, no IDT call', ...)
it('setDisabled caller disabled → 403', ...)
it('setDisabled self → 400 CANNOT_DISABLE_SELF', ...)
it('unknown action → 400 INVALID_INPUT', ...)
it('GET → 405', ...)
```
- [ ] **Step 2:** FAIL · **Step 3:** implement `onRequestPost(context)` และ `onRequest` สำหรับ 405 · **Step 4:** PASS · **Step 5:** commit `feat: admin users function`

### Task 8: โครงหน้าบ้าน + หน้าแรก + ข่าว + meta OG

**Files:** Create `public/assets/js/{firebase,data,ui}.js`, `public/assets/css/style.css`, `public/{index,news,news-detail,404}.html`, `public/assets/js/pages/{index,news,news-detail}.js`, `functions/news/[id].js`, `scripts/seed.mjs`, `playwright.config.js` · Test `tests/unit/og.test.js`, `tests/e2e/public-news.spec.js`
**Interfaces (Produces):**
- `firebase.js`: export `app, auth, db, storage` เมื่อ `location.hostname` เป็น `localhost` หรือ `127.0.0.1` ให้เชื่อมต่อ emulator (ports ตาม firebase.json)
- `data.js`: `getSettings()`, `listDepartments(type?)`, `listNews({departmentId?, pageSize=12, after?}) -> {items, cursor}` (เฉพาะ published เรียง pinned แล้วตาม createdAt), `getNews(id)`, `listStaff({departmentId?})`, `listDocuments({category?})` ส่วนฟังก์ชันเขียนข้อมูลเพิ่มใน Task 10–13
- `ui.js`: `mountLayout({active}) -> Promise<{settings, departments}>` (ใส่ header/nav/footer ลง `#site-header`/`#site-footer`) เมนู: หน้าแรก, ข้อมูลสถานศึกษา, บุคลากร, กลุ่มสาระ/ฝ่ายงาน (dropdown), ข่าวประชาสัมพันธ์, ภาพกิจกรรม, เอกสาร, ITA, ติดต่อ
- `functions/news/[id].js`: export `buildOgTags({title, description, image, url, siteName}) -> string` (escape `& < > " '`), `injectIntoHead(html, tags) -> string`, `onRequestGet` อ่าน `news/{id}` ผ่าน Firestore REST ด้วย `?key=FIREBASE_API_KEY` (ไม่ใช้ token) ดึง `/news-detail.html` ผ่าน `env.ASSETS.fetch` description = 160 ตัวอักษรแรกของ bodyHtml ที่ตัด tag ออกแล้ว ถ้าข่าวไม่พบหรือ `published!==true` ให้คืน `/404.html` พร้อม status 404
- `news-detail.js` อ่าน id จาก `location.pathname` (`/news/{id}`) แสดง bodyHtml ผ่าน `createSanitizer(window.DOMPurify)`
- `scripts/seed.mjs`: `--first-admin <email> <password>` สร้างบัญชีแอดมินคนแรกและ `users/{uid}` (role admin) ในโปรเจกต์จริงด้วย firebase-admin (devDependency, รันบนเครื่องผู้ดูแลเท่านั้น) · `--emulator` ใส่ข้อมูลกลุ่มสาระ 8 กลุ่ม, ฝ่าย 4 ฝ่าย, หน่วย (คณะผู้บริหาร, แนะแนว, ธุรการ, บุคลากรสนับสนุน), settings ตัวอย่าง, ผู้ใช้ทดสอบตาม fixture (รหัส `password123`) และข่าว 15 รายการ ถ้าไม่มี flag ให้ใส่เฉพาะ departments และ settings ลงโปรเจกต์จริง (ต้องใช้ `GOOGLE_APPLICATION_CREDENTIALS`)

- [ ] **Step 1: เขียน test ที่ fail**

```js
// og.test.js
expect(buildOgTags({title:'ข่าว "A" & B',...})).toContain('content="ข่าว &quot;A&quot; &amp; B"')
expect(injectIntoHead('<html><head><title>t</title></head>','<meta x>')).toBe('<html><head><title>t</title><meta x></head>')
it('og: published → 200 with og:title', ...)   it('og: unpublished → 404', ...)   it('og: missing → 404', ...)
// public-news.spec.js (emulator + seed)
test('home shows pinned first then 5 latest with Thai dates', ...expect(first card).toContainText('ปักหมุด'); expect(date).toMatch(/\d{1,2} .+ 25\d\d/))
test('news list paginates 12 and filters by department', ...)
test('news detail renders sanitized body at /news/{id}', ...expect(page.locator('script[data-evil]')).toHaveCount(0))
test('layout usable at 375px width (no horizontal scroll)', ...expect(scrollWidth).toBeLessThanOrEqual(375))
```
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** Run `npm run test:unit && npm run test:e2e -- public-news` → PASS · **Step 5:** commit `feat: public layout, home, news, og`

### Task 9: หน้าบ้านส่วนที่เหลือ

**Files:** Create `public/{staff,department,about,contact,gallery,documents,ita}.html` + `pages/*.js` · Test `tests/e2e/public-pages.spec.js`
**Interfaces:** Consumes `data.js`, `ui.js`. หน้า `department.html?id=` แสดงคำอธิบาย บุคลากร ข่าว 6 รายการล่าสุด และปุ่ม `externalUrl` ถ้ามี ส่วน `gallery.html` = ข่าวที่ `images.length>0` แสดงเป็นตาราง `ita.html` = documents ที่ `category=='ITA'` เรียงตาม `order`

- [ ] **Step 1: test ที่ fail**

```js
test('staff page groups by department, toggle subject/division/unit', ...)
test('staff page never shows phone numbers', ...expect(body).not.toMatch(/0\d{8,9}/))
test('inactive staff hidden', ...)
test('department page shows its staff + news + external link', ...)
test('about renders settings.aboutHtml + executives', ...)
test('gallery shows only news with images', ...)
test('documents filter by category; ITA page ordered', ...)
test('unknown department id → friendly "ไม่พบข้อมูล"', ...)
```
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: remaining public pages`

### Task 10: หลังบ้าน — login, auth guard, แดชบอร์ด, โปรไฟล์

**Files:** Create `public/assets/js/auth-guard.js`, `public/assets/css/admin.css`, `public/admin/{login,index,profile}.html` + `pages/admin-{login,index,profile}.js` · Modify `data.js` · Test `tests/e2e/admin-auth.spec.js`
**Interfaces (Produces):**
- `requireLogin() -> Promise<{user, profile, staff}>` ถ้ายังไม่ล็อกอินให้ redirect ไป `/admin/login.html?next=<path>` ถ้า `profile.disabled` ให้ signOut แล้ว redirect พร้อม `?reason=disabled`
- `mountAdminLayout(profile)` สร้างเมนูจาก `menuFor(profile)`
- `data.js`: `getMyProfile(uid)`, `updateStaff(id, partial)`, `uploadImage(path, file) -> Promise<url>` (เรียก `resizeImage` ก่อนอัปโหลด)
- หน้า profile แสดงฟอร์มเฉพาะฟิลด์จาก `editableStaffFields` · หน้า login มีปุ่ม "ลืมรหัสผ่าน" (`sendPasswordResetEmail`)

- [ ] **Step 1: test ที่ fail**

```js
test('unauthenticated /admin/news.html → login with next', ...)
test('wrong password → Thai error "อีเมลหรือรหัสผ่านไม่ถูกต้อง"', ...)
test('t1 sees only โปรไฟล์ menu', ...)
test('t1 edits bio+photo; public staff page reflects', ...)
test('disabled user is signed out with message', ...)
```
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: admin auth and profile`

### Task 11: หลังบ้าน — จัดการข่าว

**Files:** Create `public/admin/{news,news-edit}.html` + `pages/admin-news{,-edit}.js` · Modify `data.js` · Test `tests/e2e/admin-news.spec.js`
**Interfaces:**
- `data.js`: `listNewsForEditor(profile, {pageSize, after})` (admin/prc เห็นทั้งหมด, PR เห็นเฉพาะฝ่ายตน ส่ง query แยกต่อฝ่ายด้วย `array-contains-any` ได้สูงสุด 30 ค่า), `createDraftNews(profile, departmentIds) -> id`, `saveNews(id, data)`, `deleteNews(id)` (ลบรูปใน `news/{id}/` ด้วย)
- ฟอร์ม: หัวข้อ, Quill editor, รูปปก, รูปประกอบหลายรูป, checkbox ฝ่ายที่แสดงเฉพาะ `prDepts` (หรือทุกฝ่ายสำหรับ admin/prc), ปักหมุด (เฉพาะ admin/prc), เผยแพร่ ลำดับการทำงาน: สร้าง draft → อัปโหลดรูป → บันทึก (เพื่อให้ storage rules ตรวจผ่าน) bodyHtml ผ่าน sanitizer ก่อนบันทึก

- [ ] **Step 1: test ที่ fail**

```js
test('prMath creates math news with cover; appears on home', ...)
test('prMath dept checkboxes show only คณิตศาสตร์', ...)
test('prc creates general news (no dept) and pins it', ...)
test('upload large image (6000x4000 jpg) succeeds, stored ≤ 2MB, ≤1600px', ...)
test('undecodable file shows Thai error', ...expect(alert).toContainText('ไม่สามารถอ่านไฟล์รูปนี้ได้'))
test('pasted <script> stripped in saved bodyHtml', ...)
test('delete news removes it from public list', ...)
```
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: admin news management`

### Task 12: หลังบ้าน — บุคลากรและหน่วยงาน

**Files:** Create `public/admin/{staff,staff-edit,departments}.html` + `pages/*.js` · Modify `data.js` · Test `tests/e2e/admin-staff.spec.js`
**Interfaces:** `data.js`: `listStaffForEditor(profile)`, `saveDepartment(id, data)`, `createDepartment(data)` (admin), `deleteDepartment(id)` (admin; ถ้ายังมี staff หรือ news อ้างถึงให้ปฏิเสธพร้อมข้อความ) ฟอร์ม staff แสดงเฉพาะ `editableStaffFields` และรายการฝ่ายให้ติ๊กได้เฉพาะ `prDepts` ส่วนฝ่ายอื่นแสดงแบบอ่านอย่างเดียว ลำดับการแสดงใช้ปุ่มเลื่อนขึ้นหรือลง (`order`)

- [ ] **Step 1: test ที่ fail**

```js
test('prMath edits position of s1, sees academic as read-only chip', ...)
test('prMath does not see s2 in list', ...)
test('prMath hides s1 (active=false) → gone from public', ...)
test('admin creates department "unit" and reorders', ...)
test('admin cannot delete department still referenced', ...)
```
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: admin staff and departments`

### Task 13: หลังบ้าน — ผู้ใช้, ตั้งค่า, เอกสาร

**Files:** Create `public/admin/{users,settings,documents}.html` + `pages/*.js` · Modify `data.js` · Test `tests/e2e/admin-users.spec.js`
**Interfaces:** `data.js`: `callAdminUsers(action, payload) -> Promise<object>` (แนบ `await auth.currentUser.getIdToken()`), `updateUserRole(uid, {role, prDepartments})` (เขียน Firestore ตรง), `saveSettings(data)`, `saveDocument(id?, data)`, `deleteDocument(id)`
- หน้า users: ตารางผู้ใช้, ปุ่ม "สร้างบัญชี" (เลือกบุคลากรที่ยังไม่มี uid กรอกอีเมลและรหัสเริ่มต้น), ตั้งรหัสใหม่, ปิดหรือเปิดบัญชี, แก้บทบาทและฝ่ายที่รับผิดชอบ
- หน้า settings: ชื่อ, โลโก้, แบนเนอร์ (หลายรูป + ลิงก์), ที่อยู่, เบอร์โรงเรียน, Facebook, aboutHtml (Quill), executives[]
- e2e ใช้ `wrangler pages dev` ที่ตั้ง env ชี้ไปยัง Auth emulator: ใน `google-auth.js` ถ้ามี `env.FIREBASE_AUTH_EMULATOR_HOST` ให้ใช้ base URL `http://{host}/identitytoolkit.googleapis.com` ข้ามการตรวจลายเซ็น token (emulator token ไม่มีลายเซ็น) และใช้ token `owner` ตามเอกสาร emulator ห้ามมีผลใน production โดยเพิ่ม unit test `emulator bypass ignored when env var absent` ใน Task 6

- [ ] **Step 1: test ที่ fail**

```js
test('admin creates account for staff s2; new user logs in, sees profile', ...)
test('admin sets prDepartments ["sci"] → user sees news menu', ...)
test('admin disables account → user signed out on next load', ...)
test('admin edits settings name → header updates', ...)
test('prMath adds math document; ITA doc by admin shows on /ita.html', ...)
test('non-admin opening /admin/users.html → redirected to dashboard', ...)
```
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: admin users, settings, documents`

### Task 14: ย้ายข้อมูลจาก Google Sites เดิม

**Files:** Create `migration/scrape-legacy.mjs`, `scripts/import-legacy.mjs` · Test `tests/unit/scrape-legacy.test.js` + fixture `tests/fixtures/legacy-news-2569.html` (บันทึกจากหน้าจริงตอนทำ task)
**Interfaces:**
- `scrape-legacy.mjs`: `parseNewsArchive(html) -> Array<{title, dateText, bodyHtml, images:string[], links:string[]}>`, `parseStaffPage(html, deptKey) -> Array<{prefix, name, position, photoUrl}>`, `parseThaiDate(text) -> Date|null` (รองรับ "19 พ.ย. 2569", "19 พฤศจิกายน 2569") CLI เขียน `migration/out/{news,staff}.json` เพื่อให้คนตรวจทาน
- `import-legacy.mjs --dry-run|--commit`: อ่าน JSON ที่ตรวจแล้ว ดาวน์โหลดรูปไปที่ Storage (ย่อตาม Global Constraints ด้วย `sharp`) สร้าง news (`published:true`, `authorUid:'legacy-import'`) และ staff (`active:true`, `uid:null`) ทำงานซ้ำได้โดยใช้ id = hash ของ title + date
- แหล่งข้อมูล: `https://www.chainatpit.ac.th/` หน้า archive ข่าวปีการศึกษา 2567–2569 และหน้าบุคลากรแต่ละกลุ่ม (ใช้ URL จริงจากเมนูของเว็บเดิม ณ วันที่ทำ)

- [ ] **Step 1:** บันทึก HTML จริงของหน้า archive 2569 และหน้าบุคลากร 1 กลุ่มเป็น fixture
- [ ] **Step 2: test ที่ fail**: `parseNewsArchive(fixture).length` เท่ากับจำนวนข่าวที่นับด้วยตาในหน้านั้น (จดตัวเลขไว้ใน test), ข่าวแรกมี title และ date ตรงกับหน้าจริง, `parseThaiDate('19 พฤศจิกายน 2569')` = 2026-11-19, `parseStaffPage` คืนชื่อครูคนแรกถูกต้อง
- [ ] **Step 3–4:** implement → PASS
- [ ] **Step 5:** รัน `--dry-run` กับ emulator ตรวจว่าข่าวปี 2569 ครบ (เกณฑ์ใน spec)
- [ ] **Step 6:** commit `feat: legacy migration scripts`

### Task 15: Deploy, redirect และคู่มือ

**Files:** Create `public/_redirects`, `README.md` · Modify `firebase.json` (deploy targets rules/indexes/storage) · Test `tests/unit/redirects.test.js`
**Interfaces:** `_redirects` แมป URL ภาษาไทยของหัวข้อหลักในเว็บเดิม (ข้อมูลสถานศึกษา → `/about.html`, คณะผู้บริหารและบุคลากร → `/staff.html`, ข่าวประชาสัมพันธ์/* → `/news.html`, ภาพกิจกรรม/* → `/gallery.html`) ด้วย 301 ใช้ path จริงจากเว็บเดิม (ทั้งแบบ percent-encoded และไม่ encoded)

- [ ] **Step 1: test ที่ fail**: parse `_redirects` แล้วต้องมีกฎครบทุกเมนูหลักที่ scrape ได้ใน Task 14 และทุกปลายทางต้องเป็นไฟล์ที่มีอยู่ใน `public/`
- [ ] **Step 2–3:** เขียน `_redirects` → PASS
- [ ] **Step 4:** เขียน `README.md` ภาษาไทยทีละขั้น: สร้างโปรเจกต์ Firebase และเปิด Blaze + ตั้ง budget alert 100 บาท, เปิด Email/Password Auth, `firebase deploy --only firestore,storage`, สร้าง service account และวาง JSON ใน Pages env, สร้าง GitHub repo และอัปโหลดผ่านหน้าเว็บ, เชื่อม Cloudflare Pages (build ว่าง, output `public`), รัน `seed.mjs` (ข้อมูลหน่วยงาน) และสร้างแอดมินคนแรก (สคริปต์ `scripts/seed.mjs --first-admin <email>`), เพิ่ม Authorized domains, **checklist วันเปิดใช้**: นำเข้าข้อมูล → ตรวจหน้าเว็บบน pages.dev → เพิ่ม custom domain `www.chainatpit.ac.th` ใน Pages → เปลี่ยน CNAME ของ www ที่ผู้ให้บริการ DNS → ตั้ง redirect จาก apex ไป www → ทดสอบแชร์ลิงก์ข่าวด้วย Facebook Sharing Debugger
- [ ] **Step 5:** รันทดสอบทั้งหมด `npm run test:unit && npm run test:rules && npm run test:e2e` → ทั้งหมด PASS
- [ ] **Step 6:** commit `docs: deploy guide and redirects`
