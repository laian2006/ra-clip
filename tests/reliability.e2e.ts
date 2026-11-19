import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function addVideo(page: Page, title: string, filename = 'binh-500.webm') {
  await page.getByRole('button', { name: 'Thêm video', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[accept*=".mp4"]').setInputFiles({
    name: filename, mimeType: 'video/webm', buffer: await readFile('public/binh-500.webm'),
  });
  await dialog.getByLabel('Tên video').fill(title);
  await dialog.getByLabel('Mã phân loại (SKU)').fill('BINH-500');
  await dialog.getByRole('checkbox', { name: 'Lời thoại', exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Chữ trên khung hình' }).uncheck();
  return dialog;
}

test('the same file under another name warns before writing and can be kept separately', async ({ page }) => {
  await page.goto('/');
  let dialog = await addVideo(page, 'Bản kiểm thử gốc');
  await dialog.getByRole('button', { name: 'Thêm vào kho' }).click();
  await expect(page.locator('.clip-row')).toHaveCount(10);
  await page.reload();
  dialog = await addVideo(page, 'Bản kiểm thử thứ hai', 'renamed.webm');
  await dialog.getByRole('button', { name: 'Thêm vào kho' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Bản kiểm thử gốc');
  await expect(dialog.getByRole('button', { name: 'Mở bản cũ' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Mở bản cũ' }).click();
  await expect(page.locator('.clip-row')).toHaveCount(10);
  await expect(page.locator('#clip-evidence')).toHaveAccessibleName(/Bản kiểm thử gốc/);

  dialog = await addVideo(page, 'Bản giữ riêng', 'renamed.webm');
  await dialog.getByRole('button', { name: 'Thêm vào kho' }).click();
  await dialog.getByRole('button', { name: 'Vẫn thêm bản mới' }).click();
  await expect(page.locator('.clip-row')).toHaveCount(11);
  await page.getByRole('navigation').getByRole('button', { name: 'Kho video' }).click();
  await page.getByRole('button', { name: 'Tìm video trùng' }).click();
  await expect(page.locator('.clip-row')).toHaveCount(2);
});

test('undo restores the local video and its review', async ({ page }) => {
  await page.goto('/');
  const dialog = await addVideo(page, 'Clip cần hoàn tác');
  await dialog.getByLabel('Phụ đề hoặc ghi chú').fill('00:00.5 Còn 99k khi áp mã SALE99.');
  await dialog.getByRole('button', { name: 'Thêm vào kho' }).click();
  const detail = page.locator('#clip-evidence');
  await expect(detail.getByRole('button', { name: 'Đến 00:01' })).toBeVisible();
  await detail.getByLabel('Phản hồi của shop').selectOption('known');
  await expect(detail.getByLabel('Phản hồi của shop')).toHaveValue('known');
  await detail.getByRole('button', { name: 'Xóa video' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xóa video' }).click();
  await expect(page.locator('.clip-row').filter({ hasText: 'Clip cần hoàn tác' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hoàn tác xóa' }).click();
  await expect(detail).toHaveAccessibleName(/Clip cần hoàn tác/);
  await expect(detail.getByLabel('Phản hồi của shop')).toHaveValue('known');
  await expect(detail.locator('video')).toHaveAttribute('src', /^blob:/);
});

test('a blocked model download gives a Vietnamese recovery message and keeps the OCR and SRT evidence', async ({ page, context }) => {
  test.setTimeout(70_000);
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:4173\/)/, route => route.abort('failed'));
  await page.goto('/');
  const dialog = await addVideo(page, 'Clip quét khi mất mạng');
  await dialog.getByRole('checkbox', { name: 'Lời thoại', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Chữ trên khung hình' }).check();
  await dialog.getByRole('button', { name: 'Chuẩn bị mô hình lời thoại' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Chưa mở được mô hình lời thoại', { timeout: 30_000 });
  await expect(dialog.getByRole('button', { name: 'Thử tải lại mô hình' })).toBeEnabled();
  await dialog.locator('input[accept*=".srt"]').setInputFiles({
    name: 'sub.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:04,000 --> 00:00:09,000\nCòn 99k khi áp mã SALE99.'),
  });
  await dialog.getByRole('button', { name: 'Thêm vào kho' }).click();
  const detail = page.locator('#clip-evidence');
  await expect(detail).toHaveAccessibleName(/Clip quét khi mất mạng/, { timeout: 35_000 });
  await expect(detail.getByText(/Chưa mở được mô hình lời thoại/)).toBeVisible();
  await expect(detail.getByRole('button', { name: /Chữ trên video · \d+ đoạn/ })).toBeVisible();
  await detail.getByRole('button', { name: 'Phụ đề · 1 đoạn' }).click();
  await expect(detail.getByLabel('Nguồn đoạn trích')).toHaveValue('subtitle');
  await expect(detail.getByText('Còn 99k khi áp mã SALE99.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Failed to fetch|Unable to decode audio data/i)).toHaveCount(0);
});
