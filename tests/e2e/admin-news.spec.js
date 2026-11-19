import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Requires the emulators (npm run test:e2e wraps with firebase emulators:exec). NOT run in the authoring sandbox.
test.beforeAll(() => {
  execFileSync('node', ['scripts/seed.mjs', '--emulator'], { stdio: 'inherit' });
});

async function login(page, uid) {
  await page.goto('/admin/login.html');
  await page.fill('#email', `${uid}@example.com`);
  await page.fill('#password', 'password123');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(/\/admin\/index\.html$/);
}

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const png = (name = 'a.png') => ({ name, mimeType: 'image/png', buffer: PNG });

async function fillBody(page, text) {
  await page.locator('#editor .ql-editor').click();
  await page.keyboard.type(text);
}

test('prMath creates math news with cover; appears on home', async ({ page }) => {
  await login(page, 'prMath');
  await page.goto('/admin/news-edit.html');
  await page.fill('#f-title', 'ข่าวคณิต e2e');
  await fillBody(page, 'เนื้อหาข่าวคณิต');
  await page.setInputFiles('#f-cover', png());
  await page.getByLabel('เผยแพร่').check();
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.locator('#edit-notice')).toHaveText('บันทึกเรียบร้อยแล้ว');
  await expect(page.locator('#cover-preview')).toHaveAttribute('src', /news%2F.+%2F.+\.jpg/);
  await page.goto('/');
  await expect(page.locator('#latest-news .news-card', { hasText: 'ข่าวคณิต e2e' })).toBeVisible();
});

test('prMath dept checkboxes show only คณิตศาสตร์', async ({ page }) => {
  await login(page, 'prMath');
  await page.goto('/admin/news-edit.html');
  await expect(page.locator('input[name="dept"]')).toHaveCount(1);
  await expect(page.locator('#dept-grid')).toContainText('คณิตศาสตร์');
  await expect(page.locator('#f-pinned')).toHaveCount(0);
});

test('prMath must pick a department', async ({ page }) => {
  await login(page, 'prMath');
  await page.goto('/admin/news-edit.html');
  await page.fill('#f-title', 'ไม่มีฝ่าย');
  await page.locator('input[name="dept"]').uncheck();
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'กรุณาเลือกฝ่ายอย่างน้อย 1 ฝ่าย' })).toBeVisible();
});

test('prc creates general news (no dept) and pins it', async ({ page }) => {
  await login(page, 'prc');
  await page.goto('/admin/news-edit.html');
  await page.fill('#f-title', 'ข่าวทั่วไปปักหมุด e2e');
  await fillBody(page, 'ข่าวทั่วไป');
  await page.locator('#f-pinned').check();
  await page.getByLabel('เผยแพร่').check();
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.locator('#edit-notice')).toHaveText('บันทึกเรียบร้อยแล้ว');
  await page.goto('/');
  await expect(page.locator('#latest-news .news-card').first()).toContainText('ข่าวทั่วไปปักหมุด e2e');
  await expect(page.locator('#latest-news .news-card').first()).toContainText('ปักหมุด');
});

test('upload large image (6000x4000 jpg) succeeds, stored ≤ 2MB, ≤1600px', async ({ page }) => {
  await login(page, 'prc');
  await page.goto('/admin/news-edit.html');
  // build a 6000x4000 noisy JPEG in the browser (no image library needed in Node)
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 6000; c.height = 4000;
    const x = c.getContext('2d');
    for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${(i * 37) % 360} 70% 50%)`; x.fillRect((i * 97) % 6000, (i * 53) % 4000, 900, 700); }
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  await page.fill('#f-title', 'รูปใหญ่ e2e');
  await page.setInputFiles('#f-cover', { name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.locator('#edit-notice')).toHaveText('บันทึกเรียบร้อยแล้ว');
  const src = await page.locator('#cover-preview').getAttribute('src');
  const meta = await (await fetch(src.split('?')[0])).json();
  expect(Number(meta.size)).toBeLessThanOrEqual(2 * 1024 * 1024);
  const dims = await page.locator('#cover-preview').evaluate(async (img) => { await img.decode(); return [img.naturalWidth, img.naturalHeight]; });
  expect(Math.max(...dims)).toBeLessThanOrEqual(1600);
});

test('undecodable file shows Thai error', async ({ page }) => {
  await login(page, 'prc');
  await page.goto('/admin/news-edit.html');
  await page.fill('#f-title', 'ไฟล์เสีย e2e');
  await page.setInputFiles('#f-cover', { name: 'x.heic', mimeType: 'image/heic', buffer: Buffer.from('not an image') });
  await page.getByRole('button', { name: 'บันทึก' }).click();
  const alert = page.locator('#edit-error');
  await expect(alert).toContainText('ไม่สามารถอ่านไฟล์รูปนี้ได้');
  await expect(alert).toHaveAttribute('role', 'alert');
});

test('pasted <script> stripped in saved bodyHtml', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/admin/news-edit.html');
  await page.fill('#f-title', 'สคริปต์ e2e');
  await page.locator('#editor .ql-editor').click();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<p>ปลอดภัย</p><script>window.__evil=1</script><img src="x" onerror="window.__evil=1"><img src="data:image/png;base64,AAAA">');
    document.querySelector('#editor .ql-editor').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.getByLabel('เผยแพร่').check();
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.locator('#edit-notice')).toHaveText('บันทึกเรียบร้อยแล้ว');
  const id = new URL(page.url()).searchParams.get('id');
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/demo-chainatpit/databases/(default)/documents/news/${id}`, { headers: { Authorization: 'Bearer owner' } });
  const body = (await res.json()).fields.bodyHtml.stringValue;
  expect(body).toContain('ปลอดภัย');
  expect(body).not.toMatch(/<script|onerror|data:/i);
});

test('delete news removes it from public list', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/admin/news-edit.html');
  await page.fill('#f-title', 'ข่าวที่จะลบ e2e');
  await page.setInputFiles('#f-cover', png());
  await page.getByLabel('เผยแพร่').check();
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.locator('#edit-notice')).toHaveText('บันทึกเรียบร้อยแล้ว');
  await page.goto('/news.html');
  await expect(page.locator('.news-card', { hasText: 'ข่าวที่จะลบ e2e' })).toBeVisible();

  await page.goto('/admin/news.html');
  const row = page.locator('#news-list li', { hasText: 'ข่าวที่จะลบ e2e' });
  await row.getByRole('button', { name: 'ลบ' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ลบข่าว' }).click();
  await expect(page.locator('#news-notice')).toHaveText('ลบข่าวเรียบร้อยแล้ว');
  await expect(row).toHaveCount(0);
  await page.goto('/news.html');
  await expect(page.locator('.news-card', { hasText: 'ข่าวที่จะลบ e2e' })).toHaveCount(0);
});

test('prMath list hides news of other departments', async ({ page }) => {
  await login(page, 'prMath');
  await page.goto('/admin/news.html');
  await expect(page.locator('#news-list li').first()).toBeVisible();
  await expect(page.locator('#news-list')).not.toContainText('(ไม่มีหัวข้อ)');
  // seed news02 etc. are math; general (no dept) and sci items must be hidden
  await expect(page.locator('#news-list li', { hasText: 'ข่าวประชาสัมพันธ์ตัวอย่างที่ 5' })).toHaveCount(0);
});
