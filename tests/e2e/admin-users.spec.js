import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Requires the emulators AND `wrangler pages dev` with the emulator bindings (see playwright.config.js):
// the account actions go through POST /api/admin/users. NOT run in the authoring sandbox.
// Never edit staff s4 here: it carries a phone number as the PDPA probe.
test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  execFileSync('node', ['scripts/seed.mjs', '--emulator'], { stdio: 'inherit' });
});

const stamp = Date.now();
const NEW_EMAIL = `newteacher${stamp}@example.com`;
const NEW_PASSWORD = 'initpass123';

async function login(page, email, password = 'password123') {
  await page.goto('/admin/login.html');
  await page.fill('#email', email.includes('@') ? email : `${email}@example.com`);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(/\/admin\/index\.html$/);
}
const confirmOk = (page) => page.locator('#dlg-ok');
const userRow = (page) => page.locator('#user-list li', { hasText: NEW_EMAIL });

test('admin creates account for staff s2; new user logs in, sees profile', async ({ page, browser }) => {
  await login(page, 'admin');
  await page.goto('/admin/users.html');
  await page.locator('#create-btn').click();
  await page.selectOption('#c-staff', 's2');
  await page.fill('#c-email', NEW_EMAIL);
  await page.fill('#c-password', '1234567'); // too short: blocked client-side
  await page.locator('#c-submit').click();
  await expect(page.locator('#page-error')).toHaveText('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  await page.fill('#c-password', NEW_PASSWORD);
  await page.locator('#c-submit').click();
  await expect(page.locator('#page-notice')).toHaveText('สร้างบัญชีเรียบร้อยแล้ว');
  await expect(userRow(page)).toContainText('สมหญิง รักเรียน');

  const ctx = await browser.newContext();
  const userPage = await ctx.newPage();
  await login(userPage, NEW_EMAIL, NEW_PASSWORD);
  await userPage.goto('/admin/profile.html');
  await expect(userPage.locator('main')).toContainText('สมหญิง');
  await ctx.close();
});

test('admin sets prDepartments ["sci"] → user sees news menu', async ({ page, browser }) => {
  await login(page, 'admin');
  await page.goto('/admin/users.html');
  await userRow(page).locator('[data-role-edit]').click();
  await userRow(page).locator('input[name="dept"][value="sci"]').check();
  await userRow(page).getByRole('button', { name: 'บันทึกสิทธิ์' }).click();
  await expect(page.locator('#page-notice')).toHaveText('บันทึกสิทธิ์เรียบร้อยแล้ว');

  const ctx = await browser.newContext();
  const userPage = await ctx.newPage();
  await login(userPage, NEW_EMAIL, NEW_PASSWORD);
  await expect(userPage.locator('.admin-nav')).toContainText('ข่าวประชาสัมพันธ์');
  await ctx.close();
});

test('admin cannot demote self and has no disable button on own row', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/admin/users.html');
  const own = page.locator('#user-list li', { hasText: 'admin@example.com' });
  await expect(own.locator('[data-toggle]')).toHaveCount(0);
  await own.locator('[data-role-edit]').click();
  await own.locator('select[name="role"]').selectOption('teacher');
  await own.getByRole('button', { name: 'บันทึกสิทธิ์' }).click();
  await expect(page.locator('#page-error')).toHaveText('ไม่สามารถลดสิทธิ์ของตัวเองได้');
});

test('admin disables account → user signed out on next load', async ({ page, browser }) => {
  const ctx = await browser.newContext();
  const userPage = await ctx.newPage();
  await login(userPage, NEW_EMAIL, NEW_PASSWORD);

  await login(page, 'admin');
  await page.goto('/admin/users.html');
  await userRow(page).locator('[data-toggle]').click();
  await confirmOk(page).click();
  await expect(page.locator('#page-notice')).toHaveText('ปิดบัญชีเรียบร้อยแล้ว');
  await expect(userRow(page)).toContainText('ปิดบัญชี');

  await userPage.goto('/admin/profile.html');
  await expect(userPage).toHaveURL(/\/admin\/login\.html\?reason=disabled/);
  await ctx.close();
});

test('admin edits settings name → header updates', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/admin/settings.html');
  const original = await page.locator('#s-name').inputValue();
  const name = `โรงเรียนทดสอบ ${stamp}`;
  await page.fill('#s-name', name);
  await page.getByRole('button', { name: 'บันทึกการตั้งค่า' }).click();
  await expect(page.locator('#page-notice')).toHaveText('บันทึกการตั้งค่าเรียบร้อยแล้ว');
  await page.goto('/');
  await expect(page.locator('.brand-name')).toHaveText(name);
  // restore
  await page.goto('/admin/settings.html');
  await page.fill('#s-name', original);
  await page.getByRole('button', { name: 'บันทึกการตั้งค่า' }).click();
  await expect(page.locator('#page-notice')).toHaveText('บันทึกการตั้งค่าเรียบร้อยแล้ว');
});

test('prMath adds math document; ITA doc by admin shows on /ita.html', async ({ page, browser }) => {
  await login(page, 'prMath');
  await page.goto('/admin/documents.html');
  await page.locator('#add-doc').click();
  const title = `เอกสารคณิต ${stamp}`;
  await page.fill('#f-title', title);
  await page.fill('#f-url', 'https://drive.google.com/file/d/abc/view');
  await page.fill('#f-category', 'แผนงาน');
  await page.locator('#f-save').click();
  // dept PR must choose a department
  await expect(page.locator('#page-error')).toHaveText('กรุณาเลือกฝ่าย/กลุ่มสาระ');
  await page.selectOption('#f-dept', 'math');
  await page.locator('#f-save').click();
  await expect(page.locator('#page-notice')).toHaveText('บันทึกเอกสารเรียบร้อยแล้ว');
  await expect(page.locator('#doc-list li', { hasText: title })).toBeVisible();
  // seeded central docs are not manageable by a dept PR
  await expect(page.locator('#doc-list li', { hasText: 'แผนปฏิบัติการประจำปี' })).toHaveCount(0);

  const ctx = await browser.newContext(); // separate session for the admin
  page = await ctx.newPage();
  const adminTitle = `ITA ทดสอบ ${stamp}`;
  await login(page, 'admin');
  await page.goto('/admin/documents.html');
  await page.locator('#add-doc').click();
  await page.fill('#f-title', adminTitle);
  await page.fill('#f-url', 'https://drive.google.com/file/d/ita/view');
  await page.fill('#f-category', 'ITA');
  await page.locator('#f-save').click();
  await expect(page.locator('#page-notice')).toHaveText('บันทึกเอกสารเรียบร้อยแล้ว');
  await page.goto('/ita.html');
  await expect(page.locator('#doc-list')).toContainText(adminTitle);
  // cleanup through the UI (delete confirm dialog)
  await page.goto('/admin/documents.html');
  await page.locator('#doc-list li', { hasText: adminTitle }).locator('[data-delete]').click();
  await confirmOk(page).click();
  await expect(page.locator('#page-notice')).toHaveText('ลบเอกสารเรียบร้อยแล้ว');
  await page.goto('/ita.html');
  await expect(page.locator('#doc-list')).not.toContainText(adminTitle);
  await ctx.close();
});

test('non-admin opening /admin/users.html → redirected to dashboard', async ({ page }) => {
  await login(page, 't1');
  await page.goto('/admin/users.html');
  await expect(page).toHaveURL(/\/admin\/index\.html$/);
});
