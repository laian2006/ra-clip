import { expect, test } from '@playwright/test';

test('offers show what newly needs attention and prepare a draft for the selected creator', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (value: string) => sessionStorage.setItem('copied-draft', value) },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Thêm video', exact: true }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tên video').fill('Áo cotton của Lan');
  await dialog.getByLabel('Mã phân loại (SKU)').fill('AO-NAVY');
  await dialog.getByLabel('Link bài đăng').fill('https://example.com/clip-lan');
  await dialog.getByText('Nhà sáng tạo và số liệu đã ghi nhận').click();
  await dialog.getByLabel('Nhà sáng tạo', { exact: true }).fill('KOC Lan');
  await dialog.getByLabel('Phụ đề hoặc ghi chú').fill('00:07 Áo cotton giá 139 nghìn.');
  await dialog.getByRole('button', { name: 'Thêm vào kho' }).click();

  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'Bảng ưu đãi' }).click();
  await page.getByRole('button', { name: 'Xem clip bị ảnh hưởng' }).click();
  await expect(dialog).toContainText('Áo cotton của Lan');
  await expect(dialog).not.toContainText('SALE99');
  await dialog.getByRole('button', { name: 'Soạn bản nhắc' }).click();
  dialog = page.getByRole('dialog', { name: 'Soạn bản nhắc cho người đăng' });
  await dialog.getByLabel('Người đăng').selectOption('KOC Lan');
  const draft = dialog.getByLabel('Nội dung bản nhắc');
  await expect(draft).toHaveValue(/Áo cotton của Lan[\s\S]*example.com\/clip-lan[\s\S]*00:07[\s\S]*139\.000[\s\S]*159\.000/);
  await expect(draft).not.toHaveValue(/Combo 2 ly/);
  await dialog.getByRole('button', { name: 'Sao chép bản nhắc' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Đã sao chép bản nhắc.');
  expect(await page.evaluate(() => sessionStorage.getItem('copied-draft'))).toContain('Áo cotton của Lan');
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  const impact = page.getByRole('dialog', { name: 'Video bị ảnh hưởng bởi bảng v2' });
  await impact.getByRole('button', { name: /00:07 · Giá bán/ }).click();
  await expect(page.locator('#clip-evidence')).toHaveAccessibleName(/Áo cotton của Lan/);
  await expect(page.locator('#clip-evidence')).toBeFocused();

  await nav.getByRole('button', { name: 'Việc cần làm' }).click();
  await page.getByLabel('Người đăng', { exact: true }).selectOption('creator:KOC Lan');
  await expect(page.locator('.queue-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.queue-table tbody tr')).toContainText('Áo cotton của Lan');
  await page.getByRole('combobox', { name: /Tiến độ Áo cotton của Lan/ }).selectOption('done');
  await expect(page.getByRole('button', { name: 'Soạn bản nhắc' })).toBeDisabled();
});

test('opens the frame behind an OCR finding without moving the player until requested', async ({ page }) => {
  await page.goto('/');
  const evidence = page.locator('#clip-evidence');
  const video = evidence.locator('video');
  await expect.poll(() => video.evaluate((player: HTMLVideoElement) => player.duration)).toBeGreaterThan(0);
  await evidence.getByRole('button', { name: 'Xem khung hình gốc' }).click();
  const frame = evidence.getByRole('img', { name: 'Khung hình video tại 00:05' });
  await expect.poll(() => frame.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(await video.evaluate((player: HTMLVideoElement) => player.currentTime)).toBeLessThan(1);
  await evidence.getByRole('button', { name: 'Tua video đến 00:05' }).click();
  await expect.poll(() => video.evaluate((player: HTMLVideoElement) => player.currentTime)).toBeGreaterThanOrEqual(4.8);
});
