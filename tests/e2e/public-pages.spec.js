import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Requires the emulators (npm run test:e2e wraps with firebase emulators:exec).
test.beforeAll(() => {
  execFileSync('node', ['scripts/seed.mjs', '--emulator'], { stdio: 'inherit' });
});

test('staff page groups by department, toggle subject/division/unit', async ({ page }) => {
  await page.goto('/staff.html');
  const groups = page.locator('.staff-group');
  await expect(page.getByRole('button', { name: 'กลุ่มสาระฯ' })).toHaveAttribute('aria-pressed', 'true');
  await expect(groups.filter({ hasText: 'คณิตศาสตร์' })).toContainText('สมชาย ใจดี');
  await expect(groups.filter({ hasText: 'วิทยาศาสตร์' })).toContainText('สมหญิง รักเรียน');

  await page.getByRole('button', { name: 'ฝ่ายงาน' }).click();
  await expect(page.getByRole('button', { name: 'ฝ่ายงาน' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'กลุ่มสาระฯ' })).toHaveAttribute('aria-pressed', 'false');
  // s1 belongs to math and academic: appears in both tabs' groups
  await expect(groups.filter({ hasText: 'ฝ่ายบริหารงานวิชาการ' })).toContainText('สมชาย ใจดี');

  await page.getByRole('button', { name: 'หน่วยงาน' }).click();
  await expect(page.locator('#staff-groups')).toContainText('ไม่พบข้อมูล'); // no unit staff in the fixture
});

test('staff page never shows phone numbers', async ({ page }) => {
  await page.goto('/staff.html');
  await expect(page.locator('.staff-card').first()).toBeVisible();
  for (const tab of ['กลุ่มสาระฯ', 'ฝ่ายงาน', 'หน่วยงาน']) {
    await page.getByRole('button', { name: tab }).click();
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/0\d{8,9}/);
  }
  expect(await page.content()).not.toContain('0812345678'); // seeded phone on s1
});

test('inactive staff hidden', async ({ page }) => {
  await page.goto('/staff.html');
  await expect(page.locator('.staff-card').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('ครูที่ลาออกแล้ว');
});

test('department page shows its staff + news + external link', async ({ page }) => {
  await page.goto('/department.html?id=math');
  await expect(page.locator('h1')).toContainText('คณิตศาสตร์');
  await expect(page.locator('#dept')).toContainText('คำอธิบายกลุ่มสาระคณิตศาสตร์ตัวอย่าง');
  await expect(page.locator('#dept .staff-card')).toContainText('สมชาย ใจดี');
  await expect(page.locator('#dept')).not.toContainText('ครูที่ลาออกแล้ว');
  const n = await page.locator('#dept .news-card').count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(6);
  await expect(page.locator('#dept-external')).toHaveAttribute('href', 'https://example.com/math');

  await page.goto('/department.html?id=sci'); // no externalUrl
  await expect(page.locator('#dept-external')).toHaveCount(0);
});

test('about renders settings.aboutHtml (sanitized) + executives', async ({ page }) => {
  await page.goto('/about.html');
  await expect(page.locator('#about-body')).toContainText('ข้อมูลสถานศึกษาตัวอย่าง');
  await expect(page.locator('script[data-evil]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__evil)).toBeUndefined();
  await expect(page.locator('#executives')).toContainText('นายผู้อำนวยการ ตัวอย่าง');
  await expect(page.locator('#executives')).toContainText('ผู้อำนวยการโรงเรียน');
});

test('contact shows address, phone and map iframe', async ({ page }) => {
  await page.goto('/contact.html');
  await expect(page.locator('#contact')).toContainText('อำเภอเมืองชัยนาท');
  await expect(page.locator('#contact')).toContainText('056-411-000');
  const frame = page.locator('iframe.map-embed');
  await expect(frame).toHaveAttribute('title', /แผนที่/);
  await expect(frame).toHaveAttribute('loading', 'lazy');
  await expect(frame).toHaveAttribute('src', /^https:\/\/www\.google\.com\/maps\?q=.+&output=embed$/);
});

test('gallery shows only news with images', async ({ page }) => {
  await page.goto('/gallery.html');
  const items = page.locator('#gallery .gallery-item');
  // seed: news03,06,09,12,15 have images (all published)
  await expect(items).toHaveCount(5);
  for (const href of await items.evaluateAll((els) => els.map((e) => e.getAttribute('href')))) {
    expect(href).toMatch(/^\/news\/news(03|06|09|12|15)$/);
  }
  await expect(page.locator('#load-more')).toBeHidden();
});

test('documents filter by category; ITA page ordered', async ({ page }) => {
  await page.goto('/documents.html');
  const items = page.locator('#doc-list .doc-item');
  await expect(items).toHaveCount(2); // ITA excluded
  await expect(page.locator('#doc-list')).not.toContainText('ITA ข้อ');
  const options = await page.locator('#cat-filter option').allTextContents();
  expect(options).toContain('แผนงาน');
  expect(options).toContain('รายงาน');
  expect(options).not.toContain('ITA');
  await page.selectOption('#cat-filter', 'แผนงาน');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('แผนปฏิบัติการประจำปี');

  await page.goto('/ita.html');
  const ita = page.locator('#doc-list .doc-item');
  await expect(ita).toHaveCount(2);
  await expect(ita.nth(0)).toContainText('O2'); // order 1 first
  await expect(ita.nth(1)).toContainText('O1');
});

test('unknown department id → friendly "ไม่พบข้อมูล"', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (const url of ['/department.html?id=nope-123', '/department.html']) {
    await page.goto(url);
    await expect(page.locator('#dept')).toContainText('ไม่พบข้อมูล');
  }
  expect(errors.filter((t) => !/favicon/.test(t))).toEqual([]);
});

test('nav links every page and marks the active one', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const pages = { '/staff.html': 'บุคลากร', '/about.html': 'ข้อมูลสถานศึกษา', '/gallery.html': 'ภาพกิจกรรม', '/documents.html': 'เอกสาร', '/ita.html': 'ITA', '/contact.html': 'ติดต่อ' };
  for (const [path, label] of Object.entries(pages)) {
    await page.goto(path);
    await expect(page.locator('#main-nav a[aria-current="page"]')).toHaveText(label);
  }
});

test('new pages usable at 375px width (no horizontal scroll)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ['/staff.html', '/department.html?id=math', '/about.html', '/contact.html', '/gallery.html', '/documents.html', '/ita.html']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  }
});
