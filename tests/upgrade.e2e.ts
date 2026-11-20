import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('imports a previewed catalog, skips duplicates, and prioritizes imported order counts', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'Kho video', exact: true }).click();
  await page.getByRole('button', { name: 'Nhập danh sách' }).click();
  await page.getByLabel('Chọn bảng video').setInputFiles({
    name: 'danh-sach.csv', mimeType: 'text/csv',
    buffer: Buffer.from('title,sku,link,creator,views,orders\nBản ghi mới,,https://example.com/a,KOC An,1234,34\nTrùng,,https://example.com/a,KOC An,999,99\nSai,,javascript:run,,,'),
  });
  await expect(page.getByRole('dialog')).toContainText('1 mới · 0 cập nhật · 2 dòng cần xem');
  await page.getByLabel('Chỉ xem dòng có vấn đề').check();
  await expect(page.getByRole('dialog').locator('tbody tr')).toHaveCount(2);
  await page.setViewportSize({ width: 320, height: 830 });
  expect(await page.getByRole('dialog').evaluate(dialog => dialog.scrollWidth - dialog.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Nhập 1 video hợp lệ' }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByLabel('Lọc theo dữ liệu chuẩn bị').selectOption('sku');
  await expect(page.locator('.clip-row')).toHaveCount(1);
  await expect(page.locator('.clip-row')).toContainText('KOC An');
  await nav.getByRole('button', { name: 'Việc cần làm' }).click();
  await page.getByLabel('Sắp xếp').selectOption('orders');
  await expect(page.locator('.queue-table tbody tr').first()).toContainText('Áo cotton xanh navy');
});

test('batch scan saves each clip independently and can be stopped', async ({ page }) => {
  test.setTimeout(65_000);
  await page.goto('/');
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'Kho video', exact: true }).click();
  await page.getByRole('button', { name: 'Quét hàng loạt' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Bỏ chọn' }).click();
  await dialog.getByRole('checkbox', { name: /Bình giữ nhiệt/ }).check();
  await dialog.getByRole('checkbox', { name: /Quạt cầm tay/ }).check();
  await dialog.getByLabel('Nguồn phân tích').selectOption('frame');
  await expect(dialog.getByText('Ước lượng trước quét', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/2 video chưa biết thời lượng/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Quét 2 video' }).click();
  await expect(dialog.getByText(/Đã chạy \d+ giây/)).toBeVisible();
  await expect(dialog.getByText('Đã hoàn tất 1/2 video trong lượt này')).toBeVisible({ timeout: 40_000 });
  await expect(dialog.getByText(/Trung bình/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Dừng lượt quét' }).click();
  await expect(dialog.getByRole('button', { name: 'Quét 1 video' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await page.reload();
  await nav.getByRole('button', { name: 'Kho video', exact: true }).click();
  await expect(page.locator('.clip-row').filter({ hasText: 'Bình giữ nhiệt' })).toContainText('Có kết quả');
  await expect(page.locator('.clip-row').filter({ hasText: 'Quạt cầm tay' })).not.toContainText('Có kết quả');
});

test('keyboard skip, focus return, and caption toggle', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Rà soát video sau sale' }).waitFor();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Bỏ qua điều hướng' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const caption = page.getByRole('button', { name: 'Phụ đề', exact: true });
  await caption.focus();
  await page.keyboard.press('Space');
  await expect(caption).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.locator('.player video').evaluate((video: HTMLVideoElement) => video.textTracks[0]?.mode)).toBe('showing');
  await page.getByRole('button', { name: /Review túi canvas/ }).click();
  await expect(caption).toHaveAttribute('aria-pressed', 'true');
  const add = page.getByRole('button', { name: 'Thêm video', exact: true }).first();
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByRole('heading')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(add).toBeFocused();
});

test('user subtitles load as an actual WebVTT track', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dùng dữ liệu của bạn' }).click();
  await page.getByRole('button', { name: 'Thêm video', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[accept*=".mp4"]').setInputFiles('public/binh-500.webm');
  await dialog.getByLabel('Tên video').fill('Video có lời thoại đã chỉnh');
  await dialog.getByLabel('Lời thoại', { exact: true }).uncheck();
  await dialog.getByLabel('Chữ trên khung hình', { exact: true }).uncheck();
  await dialog.getByLabel('Phụ đề hoặc ghi chú').fill('00:01 Lời thoại người dùng nhập.');
  await dialog.getByRole('button', { name: 'Thêm vào kho' }).click();
  await page.getByRole('button', { name: 'Phụ đề', exact: true }).click();
  await expect.poll(() => page.locator('.player video').evaluate((video: HTMLVideoElement) => {
    const cue = video.textTracks[0]?.cues?.[0] as VTTCue | undefined;
    return cue?.text;
  })).toBe('Lời thoại người dùng nhập.');
});

test('axe checks core pages, first-use setup, and import and scan dialogs', async ({ page }) => {
  test.setTimeout(70_000);
  await page.goto('/');
  await page.getByRole('heading', { name: 'Rà soát video sau sale' }).waitFor();
  const navigate = async (label: string) => page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();
  const assertAxe = async (screen: string) => {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations.map(violation => ({
      rule: violation.id,
      nodes: violation.nodes.map(node => ({ target: node.target, failure: node.failureSummary })),
    })), screen).toEqual([]);
  };
  await assertAxe('Rà soát');
  for (const label of ['Việc cần làm', 'Bảng ưu đãi', 'Nhật ký rà', 'Kho video']) {
    await navigate(label);
    await assertAxe(label);
  }
  await page.getByRole('button', { name: 'Nhập danh sách' }).click();
  await assertAxe('Nhập danh sách');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quét hàng loạt' }).click();
  await assertAxe('Quét hàng loạt');
  await page.keyboard.press('Escape');
  await navigate('Rà soát');
  await page.getByRole('button', { name: 'Dùng dữ liệu của bạn' }).click();
  await page.getByRole('heading', { name: 'Bắt đầu rà video của bạn' }).waitFor();
  await assertAxe('Bắt đầu rà video của bạn');
});
