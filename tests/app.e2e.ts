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
  await page.getByRole('button', { name: 'Đến 00:05', exact: true }).click();
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
  await expect(page.locator('[aria-current="step"]')).toContainText('Thêm bảng ưu đãi');
  await page.getByRole('button', { name: 'Mở bảng ưu đãi' }).click();
  await page.getByLabel('Nhập bảng ưu đãi', { exact: true }).setInputFiles('tests/fixtures/offers.xlsx');
  await expect(page.getByText('Đã lưu bảng v1.')).toBeVisible();
  await expect(page.getByText('129.000 đ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm video để rà' }).click();
  const video = page.getByRole('dialog');
  await video.getByLabel('Tên video').fill('Túi của shop');
  const subtitles = video.getByLabel('Phụ đề hoặc ghi chú');
  await subtitles.fill('00:01 Túi canvas.\nGiá 129 nghìn.');
  await video.getByRole('button', { name: 'Thêm vào kho' }).click();
  await expect(video.getByRole('alert')).toContainText('Dòng 2: Thiếu mốc thời gian');
  await expect(subtitles).toBeFocused();
  await subtitles.fill('00:01 Túi canvas.\n00:12 Giá 129 nghìn.');
  await video.getByRole('button', { name: 'Thêm vào kho' }).click();
  await page.getByRole('button', { name: 'Gán mã sản phẩm cho video' }).click();
  await video.getByLabel('Mã phân loại (SKU)').fill('TUI-TEST');
  await video.getByRole('button', { name: 'Lưu video' }).click();
  await expect(page.getByRole('heading', { name: 'Báo cáo đã sẵn sàng' })).toBeVisible();
  await page.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kết quả rà soát' })).toBeFocused();
  await expect(page.locator('.evidence-card .tag')).toHaveText('Khớp bảng');
  await page.getByRole('navigation').getByRole('button', { name: 'Bảng ưu đãi' }).click();
  await page.getByRole('button', { name: 'Sửa bảng' }).click();
  await page.getByRole('textbox', { name: 'Giá (đ)' }).fill('149000');
  await page.getByRole('button', { name: 'Lưu phiên bản' }).click();
  await expect(page.getByText('Đã lưu bảng v2. Đã rà lại 1 video.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tác động của bảng v2' })).toContainText('1 có cảnh báo mới hoặc đổi');
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

test('the mobile example opens the original evidence and returns to the video list', async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Xem một cảnh báo mẫu' }).tap();
    const evidence = page.locator('#clip-evidence');
    await expect(evidence).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Kết quả rà soát' })).toBeHidden();
    await expect(evidence.locator('blockquote')).toContainText('SALE99');
    await expect(evidence.locator('.evidence-reference')).toContainText('Bảng ưu đãi');
    await expect(evidence.getByRole('button', { name: 'Đến 00:05' })).toBeVisible();
    const back = evidence.getByRole('button', { name: 'Về danh sách video' });
    await expect(back).toBeInViewport({ ratio: 1 });
    expect((await back.boundingBox())!.y).toBeGreaterThanOrEqual((await page.locator('.sidebar').boundingBox())!.height);
    await back.tap();
    await expect(evidence).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Kết quả rà soát' })).toBeFocused();
    await page.getByRole('button', { name: /Review túi canvas/ }).tap();
    await expect(evidence).toBeFocused();
    await expect(evidence).toHaveAccessibleName(/Review túi canvas/);
    await expect(back).toBeInViewport({ ratio: 1 });
  } finally { await page.close(); }
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

test('results always show evidence for a visible video, even after searching', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 766 });
  await page.goto('/');
  const search = page.getByRole('textbox', { name: 'Tìm video' });
  const evidence = page.locator('#clip-evidence');
  await search.fill('tui canvas');
  await expect(page.locator('.clip-row')).toHaveCount(1);
  await expect(evidence).toHaveAccessibleName(/Review túi canvas/);
  await expect(search).toBeFocused();
  await search.fill('không có video này');
  await expect(evidence).toHaveCount(0);
  await page.getByRole('button', { name: 'Xem một cảnh báo mẫu' }).click();
  await expect(search).toHaveValue('');
  await expect(evidence.locator('blockquote')).toContainText('SALE99');
  const rows = page.locator('.row-title strong');
  expect(await rows.evaluateAll(items => items.every(item => item.scrollWidth <= item.clientWidth))).toBe(true);
});

test('export waits for a pending audit date on both the report and work queue', async ({ page }) => {
  await page.goto('/');
  const date = page.getByLabel('Thời điểm rà (UTC+7)');
  const exportReport = page.getByRole('button', { name: 'Xuất báo cáo' });
  await date.fill('2026-11-10T09:00');
  await expect(exportReport).toBeDisabled();
  await page.getByRole('navigation').getByRole('button', { name: 'Việc cần làm' }).click();
  await expect(page.getByRole('button', { name: 'Xuất danh sách' })).toBeDisabled();
  await page.getByRole('button', { name: 'Về Rà soát' }).click();
  await page.getByRole('button', { name: 'Rà soát ngay' }).click();
  await expect(exportReport).toBeEnabled();
  const download = page.waitForEvent('download');
  await exportReport.click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('ra-clip-2026-11-10.csv');
  expect(await readFile((await file.path())!, 'utf8')).toContain('2026-11-10T09:00');
});

test('manual offer errors point to the row visible in the form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dùng dữ liệu của bạn' }).click();
  await page.getByRole('button', { name: 'Mở bảng ưu đãi' }).click();
  await page.getByRole('button', { name: 'Tạo bảng', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Lưu phiên bản' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Dòng 1: Thiếu mã phân loại (SKU).');
  await dialog.getByRole('textbox', { name: 'SKU', exact: true }).fill('TEST-QA');
  await dialog.getByRole('textbox', { name: 'Giá (đ)' }).fill('abc');
  await dialog.getByRole('button', { name: 'Lưu phiên bản' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Dòng 1: Giá không hợp lệ');
});
