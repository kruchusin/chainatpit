import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Requires the emulators (npm run test:e2e wraps with firebase emulators:exec).
test.beforeAll(() => {
  execFileSync('node', ['scripts/seed.mjs', '--emulator'], { stdio: 'inherit' });
});

async function login(page, uid, password = 'password123') {
  await page.goto('/admin/login.html');
  await page.fill('#email', `${uid}@example.com`);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
}

// Firestore emulator REST with the "owner" token bypasses rules.
async function setDisabled(uid, value) {
  const url = `http://127.0.0.1:8080/v1/projects/demo-chainatpit/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=disabled`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { disabled: { booleanValue: value } } }),
  });
  expect(res.ok).toBeTruthy();
}

test('unauthenticated /admin/news.html → login with next', async ({ page }) => {
  await page.goto('/admin/news.html');
  await expect(page).toHaveURL(/\/admin\/login\.html\?next=%2Fadmin%2Fnews\.html/);
});

test('wrong password → Thai error "อีเมลหรือรหัสผ่านไม่ถูกต้อง"', async ({ page }) => {
  await login(page, 't1', 'wrong-password');
  await expect(page.getByRole('alert')).toHaveText('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
});

test('t1 sees only โปรไฟล์ menu', async ({ page }) => {
  await login(page, 't1');
  await expect(page).toHaveURL(/\/admin\/index\.html$/);
  const links = page.locator('.admin-nav a');
  await expect(links).toHaveCount(1);
  await expect(links.first()).toHaveText('ข้อมูลของฉัน');
  await expect(page.getByRole('link', { name: 'ดูหน้าเว็บไซต์' })).toHaveAttribute('href', '/');
});

test('t1 edits bio+photo; public staff page reflects', async ({ page }) => {
  await login(page, 't1');
  await page.goto('/admin/profile.html');
  await page.fill('#f-bio', 'ประวัติทดสอบ e2e');
  await page.fill('#f-education', 'ค.บ. คณิตศาสตร์ (e2e)');
  // 1x1 PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#f-photo', { name: 'me.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.locator('#profile-notice')).toHaveText('บันทึกเรียบร้อยแล้ว');
  await page.goto('/staff.html');
  const card = page.locator('.staff-card', { hasText: 'สมชาย ใจดี' });
  await expect(card).toContainText('ค.บ. คณิตศาสตร์ (e2e)');
  await expect(card.locator('img')).toHaveAttribute('src', /\/media\/staff\/s1\/photo\.jpg/);
});

test('disabled user is signed out with message', async ({ page }) => {
  await login(page, 't1');
  await expect(page).toHaveURL(/\/admin\/index\.html$/);
  try {
    await setDisabled('t1', true); // live snapshot listener must sign the open page out
    await expect(page).toHaveURL(/\/admin\/login\.html\?reason=disabled/);
    await expect(page.getByRole('alert')).toHaveText('บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
    await page.goto('/admin/profile.html'); // signed out: must go to login, not show the page
    await expect(page).toHaveURL(/\/admin\/login\.html/);
  } finally {
    await setDisabled('t1', false);
  }
});

test('forgot password shows the same neutral message for any email', async ({ page }) => {
  await page.goto('/admin/login.html');
  for (const email of ['t1@example.com', 'nobody@example.com']) {
    await page.fill('#email', email);
    await page.getByRole('button', { name: 'ลืมรหัสผ่าน' }).click();
    await expect(page.locator('#login-notice')).toHaveText('หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว');
  }
});
