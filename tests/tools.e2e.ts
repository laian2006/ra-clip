import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function openTool(page: Page, name: string) {
  await page.getByRole('navigation').getByRole('button', { name: 'Công cụ', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeFocused();
}

test('a creator opens a shop offer, checks an untimed script and exports findings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Bảng ưu đãi', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo phiếu cho KOC' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Ưu đãi cần gửi' }).selectOption({ label: 'BINH-500 · SALE99 · Bình giữ nhiệt · 500 ml' });
  await expect(dialog.getByLabel('Nội dung phiếu')).toHaveValue(/99\.000 đ[\s\S]*SALE99/);
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Tải phiếu' }).click();
  const file = await download;
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Tạo phiếu cho KOC' })).toBeFocused();
  await openTool(page, 'Kiểm nhanh bản nháp');
  await page.getByLabel('Mở phiếu ưu đãi').setInputFiles({
    name: file.suggestedFilename(), mimeType: 'application/json', buffer: await readFile((await file.path())!),
  });
  await expect(page.getByLabel('Giá áp dụng (đ)', { exact: true })).toHaveValue('99000');
  await page.getByLabel('Dự kiến đăng (giờ Việt Nam)').fill('2026-11-12T09:00');
  await page.getByLabel('Kịch bản hoặc phụ đề').fill('Combo giá 99k khi áp mã SALE99.');
  await page.getByRole('button', { name: 'Kiểm bản nháp' }).click();
  await expect(page.getByRole('heading', { name: 'Kết quả kiểm bản nháp' })).toBeFocused();
  await expect(page.locator('.tool-findings')).toContainText('hết hạn');
  await expect(page.locator('.tool-findings')).not.toContainText('00:00');
  const report = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải kết quả' }).click();
  const csv = await readFile((await (await report).path())!, 'utf8');
  expect(csv).toContain('Combo giá 99k khi áp mã SALE99.');
  expect(csv).toContain('Kịch bản');
  await page.getByRole('navigation').getByRole('button', { name: 'Rà soát', exact: true }).click();
  await expect(page.locator('.clip-row')).toHaveCount(9);
});

test('the shop previews a promotion deadline and opens the source at the evidence time', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Chủ shop · Vận hành.*Lịch đổi ưu đãi/ }).click();
  const expires = Date.parse('2026-11-12T00:00:00+07:00');
  await page.getByRole('combobox', { name: 'Mốc ưu đãi', exact: true }).selectOption(String(expires));
  await expect(page.getByRole('heading', { name: 'Ảnh hưởng tới video' })).toBeVisible();
  const clip = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Bình giữ nhiệt 500 ml' }) });
  await expect(clip).toContainText('Ưu đãi hết hạn');
  const seek = clip.getByRole('button', { name: 'Xem đoạn 00:05' }).first();
  await seek.click();
  const dialog = page.getByRole('dialog', { name: 'Bình giữ nhiệt 500 ml' });
  await expect(dialog).toContainText('Còn 99k khi áp mã SALE99.');
  await expect.poll(() => dialog.locator('video').evaluate((player: HTMLVideoElement) => player.currentTime)).toBeGreaterThanOrEqual(4.8);
  await page.keyboard.press('Escape');
  await expect(seek).toBeFocused();
  await page.getByRole('navigation').getByRole('button', { name: 'Rà soát', exact: true }).click();
  await expect(page.getByLabel('Thời điểm rà (UTC+7)')).toHaveValue('2026-11-12T09:00');
});

test('operations can reassign selected videos, draft reminders and view only this creator’s queue', async ({ page }) => {
  await page.goto('/');
  await openTool(page, 'Điều phối người đăng');
  await page.getByRole('button', { name: 'Đổi người đăng' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Tên người đăng mới' }).fill('@lan');
  await dialog.getByRole('checkbox', { name: /Bình giữ nhiệt 500 ml/ }).check();
  await dialog.getByRole('checkbox', { name: /Cắt livestream · Quạt cầm tay/ }).check();
  await dialog.getByRole('button', { name: 'Lưu cho 2 video' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await openTool(page, 'Điều phối người đăng');
  const lan = page.locator('.creator-list > li').filter({ has: page.getByRole('heading', { name: '@lan', exact: true }) });
  const other = page.locator('.creator-list > li').filter({ has: page.getByRole('heading', { name: 'KOC minh họa', exact: true }) });
  await expect(lan.locator('dd').first()).toHaveText('2');
  await expect(other.locator('dd').first()).toHaveText('7');
  await lan.getByRole('button', { name: 'Soạn nhắc' }).click();
  await expect(dialog.getByLabel('Nội dung bản nhắc')).toHaveValue(/Bình giữ nhiệt 500 ml/);
  await expect(dialog.getByLabel('Nội dung bản nhắc')).not.toHaveValue(/Combo 2 ly/);
  await page.keyboard.press('Escape');
  await lan.getByRole('button', { name: 'Xem việc' }).click();
  await expect(page.getByLabel('Người đăng', { exact: true })).toHaveValue('creator:@lan');
  const queue = page.locator('.queue-table tbody');
  await expect(queue).toContainText('Bình giữ nhiệt 500 ml');
  await expect(queue).not.toContainText('Combo 2 ly');
  await queue.getByRole('combobox', { name: /Tiến độ Bình giữ nhiệt 500 ml/ }).first().selectOption('done');
  await page.getByRole('button', { name: 'Điều phối người đăng' }).click();
  await expect(lan.locator('dd').nth(2)).toHaveText('1');
});

test('tool pages and the assignment dialog fit a narrow viewport and pass axe', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('/');
  async function check() {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect(await page.locator('.sidebar nav button > span:nth-child(2)').evaluateAll(labels =>
      labels.every(label => label.scrollWidth <= label.clientWidth))).toBe(true);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) }))).toEqual([]);
  }
  await openTool(page, 'Kiểm nhanh bản nháp');
  await page.getByRole('button', { name: 'Điền kịch bản mẫu' }).click();
  await page.getByRole('button', { name: 'Kiểm bản nháp' }).click();
  await expect(page.locator('.tool-findings')).toContainText('99.000 đ');
  await expect(page.locator('.tool-findings')).toContainText('129.000 đ');
  await check();
  await openTool(page, 'Lịch đổi ưu đãi');
  await check();
  await openTool(page, 'Điều phối người đăng');
  await check();
  await page.getByRole('button', { name: 'Đổi người đăng' }).click();
  await check();
});

test('quick check reads actual on-screen terms and opens the uploaded video at the finding', async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto('/');
  await openTool(page, 'Kiểm nhanh bản nháp');
  await page.getByLabel('Chọn video', { exact: true }).setInputFiles('public/binh-500.webm');
  await page.getByLabel('Giá áp dụng (đ)', { exact: true }).fill('129k');
  await page.getByRole('button', { name: 'Kiểm bản nháp' }).click();
  await expect(page.locator('.tool-findings')).toContainText('SALE99', { timeout: 55_000 });
  const evidence = page.locator('.tool-findings li').filter({ hasText: 'Chữ trên video' }).first();
  await evidence.getByRole('button', { name: /Xem đoạn/ }).click();
  await expect.poll(() => page.locator('.quick-results video').evaluate((player: HTMLVideoElement) => player.currentTime)).toBeGreaterThan(3);
});
