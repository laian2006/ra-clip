import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('nine sample assets play, with subtitles and category filters', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation');
  await navigation.getByRole('button', { name: 'Kho video', exact: true }).click();
  const rows = page.locator('.clip-row');
  await expect(rows).toHaveCount(9);
  for (let i = 0; i < 9; i++) {
    await rows.nth(i).click();
    const video = page.locator('.player video');
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.duration)).toBeGreaterThanOrEqual(10);
    await expect(video.locator('track')).toHaveAttribute('srclang', 'vi');
  }
  await page.getByLabel('Lọc kiểu video').selectOption('live');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Quạt cầm tay');
});

test('offer diff, corrective evidence, notes and audit history connect', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'Bảng ưu đãi' }).click();
  await page.getByRole('button', { name: 'So sánh phiên bản' }).click();
  const change = page.locator('.diff-row').filter({ hasText: 'AO-NAVY' });
  await expect(change).toContainText('139.000 đ');
  await expect(change).toContainText('159.000 đ');

  await nav.getByRole('button', { name: 'Việc cần làm' }).click();
  const row = page.locator('.queue-table tbody tr').filter({ hasText: 'Áo cotton xanh navy' });
  await row.getByRole('button', { name: 'Thêm ghi chú' }).click();
  await page.getByRole('dialog').getByLabel('Ghi chú').fill('Chờ thay giá hiển thị');
  await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
  await expect(row).toContainText('Chờ thay giá hiển thị');
  const report = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất danh sách' }).click();
  await expect.poll(async () => (await readFile((await (await report).path())!, 'utf8'))).toContain('Chờ thay giá hiển thị');

  await row.getByRole('button', { name: /Video gắn giỏ/ }).click();
  await expect(page.locator('.evidence-card')).toContainText('139k');
  await page.getByRole('button', { name: /^Đoạn trích/ }).click();
  await page.getByRole('button', { name: /Sửa đoạn 00:05/ }).click();
  await page.getByLabel('Nội dung đoạn trích').fill('Áo cotton giá 159k.');
  await page.getByRole('button', { name: 'Lưu đoạn trích' }).click();
  await expect(page.getByText('Đã sửa tay')).toBeVisible();
  await page.getByRole('button', { name: 'Phát hiện', exact: true }).click();
  await expect(page.locator('.evidence-card .tag')).toHaveText('Khớp bảng');

  await nav.getByRole('button', { name: 'Nhật ký rà', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cập nhật đoạn trích' })).toBeVisible();
  await expect(page.locator('.delta-columns')).toContainText('Áo cotton xanh navy');
});

test('a campaign backup restores a separate campaign and its actual video file', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Quản lý chiến dịch' }).click();
  await page.getByRole('button', { name: 'Tạo chiến dịch', exact: true }).click();
  await page.getByLabel('Tên chiến dịch').fill('Chiến dịch 12.12');
  await page.getByLabel('Tên shop (tùy chọn)').fill('Shop thử');
  await page.getByRole('button', { name: 'Tạo và mở chiến dịch' }).click();
  await expect(page.getByText('Kho video đang trống')).toBeVisible();
  const mode = page.getByRole('combobox', { name: 'Không gian làm việc' });
  const original = await mode.inputValue();

  await page.getByRole('button', { name: 'Thêm video', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[accept*=".mp4"]').setInputFiles('public/binh-500.webm');
  await dialog.getByLabel('Tên video').fill('Video của chiến dịch');
  await dialog.getByLabel('Lời thoại', { exact: true }).uncheck();
  await dialog.getByLabel('Chữ trên khung hình', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Thêm vào kho' }).click();
  await expect(page.getByRole('button', { name: /Video của chiến dịch/ })).toBeVisible();

  await page.getByRole('button', { name: 'Quản lý chiến dịch' }).click();
  const file = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sao lưu Chiến dịch 12.12' }).click();
  const download = await file;
  expect(download.suggestedFilename()).toMatch(/\.raclip$/);
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Đã kiểm tra khả năng mở bản sao lưu');
  await page.getByLabel('Mở bản sao lưu').setInputFiles({
    name: download.suggestedFilename(), mimeType: 'application/octet-stream', buffer: await readFile((await download.path())!),
  });
  await expect(page.getByText(/Đã mở bản sao lưu thành chiến dịch riêng/)).toBeVisible();
  const restored = await mode.inputValue();
  expect(restored).not.toBe(original);
  const video = page.locator('.player video');
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.duration)).toBeGreaterThanOrEqual(10);
  await mode.selectOption('shop');
  await expect(page.getByText('Kho video đang trống')).toBeVisible();
  await mode.selectOption(original);
  await expect(page.getByRole('button', { name: /Video của chiến dịch/ })).toBeVisible();
});

test('upgrades the existing data store without dropping shop clips', async ({ page }) => {
  await page.goto('/binh-500.vtt');
  await page.evaluate(async () => {
    const request = indexedDB.open('ra-clip', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('workspace').put({
        demo: false, clips: [{ id: 'old-clip', title: 'Clip từ bản cũ', sku: '', link: '', published: '', evidence: [], localMedia: false }],
        versions: [], checkedAt: '2026-11-12T09:00', audit: null, reviews: {},
      }, 'shop');
      db.createObjectStore('media');
    };
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    localStorage.setItem('ra-clip-mode', 'shop');
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Clip từ bản cũ/ })).toBeVisible();
});
