# เอกสารออกแบบ (ฉบับสั้น): ย้ายที่เก็บรูปไป Cloudflare R2

วันที่: 2026-11-20 · สถานะ: อนุมัติแล้ว · แก้ไขเพิ่มเติมจาก `2026-11-19-school-website-design.md` (หัวข้อ 9 ข้อ 2)

## เจตนา
โรงเรียนไม่ต้องการอัปเกรด Firebase เป็นแผน Blaze ซึ่งจำเป็นสำหรับ Cloud Storage จึงย้ายรูปทั้งหมด (ข่าว รูปครู ปกหน่วยงาน โลโก้ แบนเนอร์ ผู้บริหาร) ไปเก็บใน **Cloudflare R2** บนบัญชี Cloudflare เดียวกับที่วางเว็บ ผู้ใช้เลือกทางนี้แล้ว (ผูกบัตรกับ Cloudflare ได้)

## เป้าหมาย / สิ่งที่ไม่ทำ / ถือว่าล้มเหลว
- **เป้าหมาย:** ครูอัปโหลดรูปจากหลังบ้านได้เหมือนเดิม (ย่อรูปฝั่ง client ตามเดิม) สิทธิ์ตรงกับกฎ Storage เดิมทุกข้อ และ Firebase ใช้แผน Spark (ฟรี) ได้
- **สิ่งที่ไม่ทำ:** ไม่เปิด bucket สาธารณะ (`r2.dev`) ไม่ใช้ลิงก์เซ็นชื่ออัปตรงจากเบราว์เซอร์ และไม่ใช้ Google Drive
- **ถือว่าล้มเหลว:** ผู้ไม่มีสิทธิ์อัปหรือลบรูปได้ รูปเก่าหายเมื่อแก้ไขอย่างอื่น หรือแชร์ข่าวแล้วไม่ขึ้นรูป OG

## แนวทางที่พิจารณา
1. **อัปผ่าน Pages Function → R2 binding และแสดงผ่าน Function บนโดเมนเดียวกัน** ← เลือก: การตรวจสิทธิ์อยู่ที่เดียว ไม่ต้องตั้ง CORS หรือคีย์ฝั่ง client และทดสอบด้วย unit test ได้
2. เปิด bucket สาธารณะ `r2.dev`: Cloudflare จำกัดความเร็วและไม่แนะนำใช้งานจริง
3. Presigned URL อัปตรงจากเบราว์เซอร์: ต้องตั้ง CORS และเก็บคีย์ S3 ใน Function โดยไม่ได้ประโยชน์เพิ่มสำหรับเว็บขนาดนี้

## การออกแบบ
- **R2 bucket:** `chainatpit-media` ผูกกับ Pages project ด้วย binding ชื่อ `MEDIA` (Production และ Preview)
- **`POST /api/media`** (multipart: `path`, `file`, header `Authorization: Bearer <idToken>`)
  - ตรวจ token ด้วย `verifyFirebaseIdToken` และอ่าน `users/{uid}` รวมถึงเอกสารเป้าหมายด้วย service account (ใช้ `google-auth.js` เดิม)
  - สิทธิ์ตาม path ให้ตรงกับ `storage.rules` เดิม:
    - `news/{newsId}/{file}`: admin หรือ pr_central หรือ PR ที่ `departmentIds` ของข่าวไม่ว่างและ hasOnly(prDepartments)
    - `staff/{staffId}/photo.jpg`: admin หรือเจ้าตัว (staff.uid == uid) หรือ PR ที่ prDepartments hasAny staff.departmentIds
    - `departments/{deptId}/{file}`: admin หรือ PR เจ้าของ deptId
    - `site/{file}`: admin เท่านั้น
    - path อื่นถูกปฏิเสธ ชื่อไฟล์ต้องตรง `^[A-Za-z0-9._-]{1,100}$` และ id ต้องตรง `^[A-Za-z0-9_-]{1,128}$`
  - รับเฉพาะ `image/jpeg|png|webp|gif` ขนาดไม่เกิน 2 MB ผู้ใช้ต้อง active (disabled !== true)
  - คืนค่า `{url: "/media/<path>?v=<timestamp>"}` เป็น URL แบบ relative เพื่อให้ย้ายโดเมนได้
- **`DELETE /api/media`** body `{path}` หรือ `{prefix}` (`news/{id}/` หรือ `departments/{id}/`) ใช้สิทธิ์เดียวกับการเขียน การลบเอกสารต้นทางไปแล้วต้องยังลบรูปได้: ข่าวที่ไม่มีเอกสารแล้ว ให้ admin หรือ pr_central ลบได้ และ client ต้องลบรูปก่อนลบเอกสาร (ลำดับเดิมใน `deleteNews`)
- **`GET /media/[[path]]`** อ่านจาก `env.MEDIA` คืน content-type ที่เก็บไว้ พร้อม `Cache-Control: public, max-age=31536000, immutable` (เพราะมี `?v=`) ถ้าไม่พบคืน 404
- **Client:**
  - `data.js` `uploadImage(path, file)` ยังเป็น interface เดิม: ย่อรูป → POST `/api/media` → คืน url
  - `deleteNews` และ `deleteDepartment` เรียก `DELETE /api/media`
  - เอา Firebase Storage SDK ออกจาก `firebase.js`
- **แสดงผล:** `safeUrl` รับ `/media/...` อยู่แล้ว ส่วน OG function ต้องแปลง `coverUrl` แบบ relative เป็น absolute ด้วย origin ของ request ก่อนใส่ `og:image`
- **ลบของเดิม:** `storage.rules`, การตั้งค่า storage ใน `firebase.json`, emulator storage, `tests/rules/storage.test.js` และขั้นตอน Blaze ใน README
- **สคริปต์ย้ายข้อมูล:** `import-legacy.mjs` อัปเข้า R2 ผ่าน S3-compatible API (`@aws-sdk/client-s3`, env `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) และเก็บ URL `/media/<path>?v=<ts>`
- **ทดสอบในเครื่อง:** `wrangler pages dev` ใช้ `--r2=MEDIA` (R2 จำลองในเครื่อง) e2e ใช้แบบเดียวกัน

## สิ่งที่ผู้ใช้ต้องทำเอง (ใส่ใน README)
เปิด R2 ใน Cloudflare (ผูกบัตรเพื่อยืนยัน) → สร้าง bucket `chainatpit-media` → Pages project → Settings → Bindings → เพิ่ม R2 binding `MEDIA` → (ถ้าจะย้ายข้อมูล) สร้าง R2 API token

## ปล่อยให้ผู้สร้างตัดสิน
โครงสร้างไฟล์ของ Function (`functions/api/media.js`, `functions/media/[[path]].js`, ตรรกะสิทธิ์แบบ pure ใน `functions/_lib/media-auth.js`), รูปแบบ error ภาษาไทย (ใช้ `errorJson` เดิม) และการ parse multipart ด้วย `request.formData()`
