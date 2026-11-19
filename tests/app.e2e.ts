import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('demo filters, seeks, remembers feedback and exports CSV', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Rà soát video sau sale' })).toBeVisible();
  await expect(page.locator('.clip-row')).toHaveCount(9);
  await page.getByRole('button', { name: /Cần xử lý/ }).filter({ has: page.locator('.metric-bottom') }).click();
  await expect(page.locator('.clip-row')).toHaveCount(4);
  await page.getByRole('button', { name: '00:05', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(4.8);
  await page.getByRole('combobox', { name: 'Phản hồi của shop' }).selectOption('new');
  await expect(page.getByRole('combobox', { name: 'Phản hồi của shop' })).toHaveValue('new');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất báo cáo' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('ra-clip-2026-11-12.csv');
  expect(await readFile((await file.path())!, 'utf8')).toContain('Mới phát hiện');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Phản hồi của shop' })).toHaveValue('new');
  expect(errors).toEqual([]);
});

test('real workspace imports Excel, takes notes, rechecks on offer change and persists', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dùng dữ liệu của bạn' }).click();
  await expect(page.getByText('Kho video đang trống')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Bảng ưu đãi' }).click();
  await page.getByLabel('Nhập bảng ưu đãi', { exact: true }).setInputFiles('tests/fixtures/offers.xlsx');
  await expect(page.getByText('Đã lưu bảng v1.')).toBeVisible();
  await expect(page.getByText('129.000 đ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm video' }).click();
  await page.getByLabel('Tên video').fill('Túi của shop');
  await page.getByLabel('Mã phân loại (SKU)').fill('TUI-TEST');
  await page.getByLabel('Phụ đề hoặc ghi chú').fill('00:12 Túi canvas giá 129 nghìn.');
  await page.getByRole('button', { name: 'Thêm vào kho' }).click();
  await expect(page.locator('.evidence-card .tag')).toHaveText('Khớp bảng');
  await page.getByRole('navigation').getByRole('button', { name: 'Bảng ưu đãi' }).click();
  await page.getByRole('button', { name: 'Sửa bảng' }).click();
  await page.getByRole('textbox', { name: 'Giá (đ)' }).fill('149000');
  await page.getByRole('button', { name: 'Lưu phiên bản' }).click();
  await expect(page.getByText('Đã lưu bảng v2. Đã rà lại 1 video.')).toBeVisible();
  await page.getByRole('button', { name: /Phiên bản 1/ }).click();
  await expect(page.getByText('129.000 đ', { exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rà soát', exact: true }).click();
  await expect(page.locator('.evidence-card .tag')).toHaveText('Cần xử lý');
  await page.reload();
  await expect(page.getByRole('button', { name: /Túi của shop/ })).toBeVisible();
  await expect(page.locator('.evidence-card .tag')).toHaveText('Cần xử lý');
  await page.getByRole('button', { name: 'Xóa video', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xóa video', exact: true }).click();
  await expect(page.getByText('Kho video đang trống')).toBeVisible();
});

test('mobile layout keeps controls visible without horizontal overflow', async ({ page }) => {
  await page.goto('/');
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('heading', { name: 'Rà soát video sau sale' })).toBeVisible();
    const button = page.getByRole('button', { name: 'Rà soát ngay' });
    await expect(button).toBeVisible();
    const bounds = (await button.boundingBox())!;
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
