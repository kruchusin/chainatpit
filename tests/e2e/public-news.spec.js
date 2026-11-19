import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Requires the emulators (npm run test:e2e wraps with firebase emulators:exec).
test.beforeAll(() => {
  execFileSync('node', ['scripts/seed.mjs', '--emulator'], { stdio: 'inherit' });
});

test('home shows pinned first then 5 latest with Thai dates', async ({ page }) => {
  await page.goto('/');
  const cards = page.locator('#latest-news .news-card');
  await expect(cards).toHaveCount(6);
  await expect(cards.first()).toContainText('ปักหมุด');
  await expect(cards.nth(1)).not.toContainText('ปักหมุด'); // one pinned, then 5 latest
  await expect(cards.first().locator('time')).toHaveText(/\d{1,2} .+ 25\d\d/);
  await expect(cards.last()).not.toContainText('ปักหมุด');
});

test('news list paginates 12 and filters by department', async ({ page }) => {
  await page.goto('/news.html');
  const cards = page.locator('#news-list .news-card');
  await expect(cards).toHaveCount(12);
  await page.getByRole('button', { name: 'ดูข่าวเพิ่มเติม' }).click();
  await expect(cards).toHaveCount(14); // 15 seeded, 1 draft hidden
  await expect(page.locator('#load-more')).toBeHidden();

  await page.selectOption('#dept-filter', 'math');
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(14);
});

test('news detail renders sanitized body at /news/{id}', async ({ page }) => {
  await page.goto('/news/news03');
  await expect(page.locator('#news-article h1')).toContainText('ข่าวทดสอบความปลอดภัยของ HTML');
  await expect(page.locator('#news-article')).toContainText('ข้อความปกติ');
  await expect(page.locator('script[data-evil]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__evil)).toBeUndefined();
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /ข่าวทดสอบ/);
});

test('draft or missing news returns 404 page', async ({ page }) => {
  for (const id of ['news05', 'nope-123']) {
    const res = await page.goto(`/news/${id}`);
    expect(res.status()).toBe(404);
    await expect(page.locator('h1')).toContainText('ไม่พบ');
  }
});

test('layout usable at 375px width (no horizontal scroll)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ['/', '/news.html', '/news/news03']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w).toBeLessThanOrEqual(375);
  }
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'เมนู' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: 'ข่าวประชาสัมพันธ์' }).first()).toBeVisible();
});
