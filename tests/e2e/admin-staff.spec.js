import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Requires the emulators (npm run test:e2e wraps with firebase emulators:exec). NOT run in the authoring sandbox.
// Never edit staff s4 here: it carries a phone number as the PDPA probe (the rules would reject the write anyway).
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

const confirmOk = (page) => page.locator('#dlg-ok');

test('prMath edits position of s1, sees academic as read-only chip', async ({ page }) => {
  await login(page, 'prMath');
  await page.goto('/admin/staff-edit.html?id=s1');
  // only the PR's own department is a checkbox; the foreign one is a chip
  await expect(page.locator('input[name="dept"]')).toHaveCount(1);
  await expect(page.locator('input[name="dept"][value="math"]')).toBeChecked();
  await expect(page.locator('#dept-chips .chip')).toHaveCount(1);
  await expect(page.locator('#dept-chips')).toContainText('ฝ่ายบริหารงานวิชาการ');
  // sci is neither owned nor held: not shown
  await expect(page.locator('#staff-form')).not.toContainText('วิทยาศาสตร์');
  await page.fill('#f-position', 'ครูชำนาญการ');
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.locator('#page-notice')).toHaveText('บันทึกเรียบร้อยแล้ว');
  await page.reload();
  await expect(page.locator('#f-position')).toHaveValue('ครูชำนาญการ');
  // foreign department survived the save
  await expect(page.locator('#dept-chips')).toContainText('ฝ่ายบริหารงานวิชาการ');
});

test('prMath does not see s2 in list', async ({ page }) => {
  await login(page, 'prMath');
  await page.goto('/admin/staff.html');
  await expect(page.locator('#staff-list li[data-id="s1"]')).toBeVisible();
  await expect(page.locator('#staff-list li[data-id="s2"]')).toHaveCount(0);
  await expect(page.locator('#staff-list li[data-id="s4"]')).toHaveCount(0);
  await expect(page.locator('#add-staff')).toBeHidden();
});

test('prMath hides s1 (active=false) → gone from public', async ({ page }) => {
  await login(page, 'prMath');
  await page.goto('/admin/staff.html');
  await page.locator('#staff-list li[data-id="s1"] [data-toggle]').click();
  await confirmOk(page).click();
  await expect(page.locator('#page-notice')).toHaveText('ซ่อนบุคลากรเรียบร้อยแล้ว');
  await expect(page.locator('#staff-list li[data-id="s1"]')).toContainText('ซ่อนอยู่');
  await page.goto('/staff.html');
  await expect(page.locator('.staff-card', { hasText: 'สมชาย' })).toHaveCount(0);
  // restore so other tests keep a stable fixture
  await page.goto('/admin/staff.html');
  await page.locator('#staff-list li[data-id="s1"] [data-toggle]').click();
  await confirmOk(page).click();
  await expect(page.locator('#page-notice')).toHaveText('แสดงบุคลากรเรียบร้อยแล้ว');
});

test('admin creates department "unit" and reorders', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/admin/departments.html');
  const name = `หน่วยทดสอบ e2e ${Date.now()}`;
  await page.fill('#c-name', name);
  await page.selectOption('#c-type', 'unit');
  await page.fill('#c-description', 'คำอธิบายหน่วย');
  await page.fill('#c-url', 'https://example.com/unit');
  await page.getByRole('button', { name: 'เพิ่มหน่วยงาน' }).click();
  await expect(page.locator('#page-notice')).toHaveText('เพิ่มหน่วยงานเรียบร้อยแล้ว');
  const items = page.locator('#dept-list > li');
  const last = items.last();
  await expect(last).toContainText(name);
  await expect(last).toContainText('หน่วยงาน');
  // move it up one place: it is no longer last, and the one it passed is now last
  const before = await items.locator('.item-title').allTextContents();
  await last.locator('[data-up]').click();
  await expect(page.locator('#page-notice')).toHaveText('เปลี่ยนลำดับเรียบร้อยแล้ว');
  const after = await items.locator('.item-title').allTextContents();
  expect(after[after.length - 2]).toBe(name);
  expect(after[after.length - 1]).toBe(before[before.length - 2]);
  // persisted
  await page.reload();
  const reloaded = await items.locator('.item-title').allTextContents();
  expect(reloaded).toEqual(after);
});

test('admin rejects a non-http externalUrl', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/admin/departments.html');
  await page.fill('#c-name', 'ลิงก์ไม่ปลอดภัย');
  await page.fill('#c-url', 'javascript:alert(1)');
  await page.getByRole('button', { name: 'เพิ่มหน่วยงาน' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'ต้องขึ้นต้นด้วย http' })).toBeVisible();
});

test('admin cannot delete department still referenced', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/admin/departments.html');
  await page.locator('#dept-list li[data-id="math"] [data-delete]').click();
  await confirmOk(page).click();
  await expect(page.locator('#page-error')).toContainText('ลบไม่ได้');
  await expect(page.locator('#dept-list li[data-id="math"]')).toBeVisible();
});

test('prMath edits only description of own department, no others listed', async ({ page }) => {
  await login(page, 'prMath');
  await page.goto('/admin/departments.html');
  await expect(page.locator('#dept-list > li')).toHaveCount(1);
  await expect(page.locator('#create-box')).toBeHidden();
  await expect(page.locator('#dept-list li[data-id="math"] input[name="name"]')).toHaveCount(0);
  await page.fill('#d-math', 'คำอธิบายใหม่ e2e');
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.locator('#page-notice')).toHaveText('บันทึกเรียบร้อยแล้ว');
});
