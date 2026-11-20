import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Clip, OfferVersion } from '../src/domain';

const releaseVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const at = '2026-11-20T09:00';
const version: OfferVersion = {
  id: 'v1', at, offers: [{ sku: 'SON-MERZY', name: 'Son', code: '', price: 140000, gift: 'Mua 1 tặng 1', start: '', end: '', condition: '' }],
};

async function seedShop(page: Page, clips: Clip[]) {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Rà soát video sau sale' }).waitFor();
  await page.evaluate(async ({ at, clips, version }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ra-clip');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put({
          demo: false, clips, versions: [version], checkedAt: at, audit: null, reviews: {}, notes: {}, snapshots: [],
        }, 'shop');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
    localStorage.setItem('ra-clip-mode', 'shop');
  }, { at, clips, version });
  await page.reload();
}

test('an ASR loop cannot enter stored evidence or cause the correct purchase and gift to be flagged', async ({ page }) => {
  const noisy = Array(150).fill('nướng').join(' ');
  await page.route('**/speech.worker-*.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `self.onmessage = () => self.postMessage(${JSON.stringify({ kind: 'success', evidence: [
      { start: 0, end: 2, text: noisy, source: 'audio' },
      { start: 3, end: 6, text: 'Rất, rất rẻ. Giá 140k, mua một tặng một nhanh tay chốt đơn.', source: 'audio' },
    ] })});`,
  }));
  await seedShop(page, []);
  await page.getByRole('button', { name: 'Thêm video', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[accept*=".mp4"]').setInputFiles('public/binh-500.webm');
  await dialog.getByLabel('Tên video').fill('Mô phỏng lời thoại Merzy');
  await dialog.getByLabel('Mã phân loại (SKU)').fill('SON-MERZY');
  await dialog.getByRole('checkbox', { name: 'Chữ trên khung hình', exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Thêm vào kho' }).click();
  const detail = page.locator('#clip-evidence');
  await expect(detail).toHaveAccessibleName(/Mô phỏng lời thoại Merzy/);
  await expect(detail.locator('.evidence-card .tag')).toHaveText('Khớp bảng');
  await expect(detail.getByText(/Bỏ 1 đoạn lặp bất thường/)).toBeVisible();
  await detail.getByRole('button', { name: 'Lời thoại · 1 đoạn' }).click();
  await expect(detail.getByText('Rất, rất rẻ. Giá 140k, mua một tặng một nhanh tay chốt đơn.', { exact: true })).toBeVisible();
  await expect(detail).not.toContainText('nướng nướng');
  await page.reload();
  await expect(detail.locator('.evidence-card .tag')).toHaveText('Khớp bảng');
  await expect(detail.getByText(/Bỏ 1 đoạn lặp bất thường/)).toBeVisible();
});

test('a filtered empty transcript leads to adding subtitles and recovers a working audit', async ({ page }) => {
  await seedShop(page, [{
    id: 'filtered', sku: 'SON-MERZY', title: 'Video cần phụ đề', link: '', published: '', localMedia: false, demoMedia: true,
    evidence: [], lastScan: {
      at, audio: true, frame: false, state: 'empty', detail: 'Chưa nhận ra lời thoại. Bỏ 1 đoạn lặp bất thường.',
      sources: { audio: { state: 'empty', discarded: 1, detail: 'Chưa nhận ra lời thoại. Bỏ 1 đoạn lặp bất thường.' } },
    },
  }]);
  await expect(page.getByText(`v${releaseVersion}`, { exact: true })).toBeVisible();
  const detail = page.locator('#clip-evidence');
  await expect(detail.locator('.evidence-card')).toContainText('Lời thoại còn 0 đoạn');
  await detail.getByRole('button', { name: 'Thêm phụ đề hoặc lời thoại', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const input = dialog.getByLabel('Phụ đề hoặc ghi chú');
  await expect(input).toBeFocused();
  await input.fill('00:03 Giá 140k, mua một tặng một nhanh tay chốt đơn.');
  await dialog.getByRole('button', { name: 'Lưu video', exact: true }).click();
  await expect(detail.locator('.evidence-card .tag')).toHaveText('Khớp bảng');
  await expect(detail.getByRole('button', { name: 'Thêm phụ đề hoặc lời thoại' })).toHaveCount(0);
});

test('reviewing recovered speech on a narrow screen enables it for the audit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedShop(page, [{
    id: 'retry', sku: 'SON-MERZY', title: 'Lời thoại đọc lại', link: '', published: '', localMedia: false, demoMedia: true,
    evidence: [
      { start: 5, end: 9, source: 'audio', text: 'Giá 150k.', lowConfidence: true },
      { start: 6, end: null, source: 'frame', text: 'First Care Activating Serum' },
    ],
    lastScan: {
      at, audio: true, frame: true, state: 'partial', detail: 'Đã đọc lại lời thoại theo đoạn ngắn.',
      sources: { audio: { state: 'empty', discarded: 1, detail: 'Có đoạn độ tin cậy thấp để nghe lại.' } },
    },
  }]);
  await page.getByRole('button', { name: 'Xem bằng chứng', exact: true }).click();
  const detail = page.locator('#clip-evidence');
  await expect(detail.locator('.evidence-card .tag')).toHaveText('Cần xác nhận');
  await detail.getByRole('button', { name: 'Xem lời thoại đọc lại', exact: true }).click();
  await expect(detail.getByLabel('Nguồn đoạn trích')).toHaveValue('audio');
  await expect(detail.getByText('Độ tin cậy thấp', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: 'Kiểm tra đoạn 00:05 · Lời thoại' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Nội dung đoạn trích')).toHaveValue('Giá 150k.');
  await dialog.getByRole('button', { name: 'Lưu đoạn trích' }).click();
  await expect(detail.getByText('Đã sửa tay', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: 'Phát hiện', exact: true }).click();
  await expect(detail.locator('.evidence-card .tag')).toHaveText('Cần xử lý');
  await detail.getByRole('button', { name: /Chữ trên video · 1 đoạn/ }).click();
  await expect(detail.getByText('Độ tin cậy thấp', { exact: true })).toBeVisible();
});

test('three distinct review reasons lead to the right actions on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const common = { sku: 'SON-MERZY', link: '', published: '', localMedia: false, demoMedia: true };
  await seedShop(page, [
    { ...common, id: 'a', title: 'Chữ không có giá', evidence: [{ start: 1, end: null, text: 'Son màu đỏ', source: 'frame' }] },
    { ...common, id: 'b', title: 'Chưa chạy lời thoại', evidence: [], lastScan: {
      at, state: 'empty', frame: true, audio: false, detail: 'Chưa đọc được chữ đủ rõ.',
      sources: { frame: { state: 'empty', detail: 'Chưa đọc được chữ đủ rõ.' } },
    } },
    { ...common, id: 'c', title: 'Chưa chọn mã', sku: '', evidence: [{ start: 1, end: null, text: 'Giá 140k.', source: 'manual' }] },
  ]);
  const detail = page.locator('#clip-evidence');
  const back = detail.getByRole('button', { name: 'Về danh sách video' });
  await page.getByRole('button', { name: 'Xem bằng chứng', exact: true }).click();
  await expect(detail).toBeFocused();
  await expect(detail.locator('.evidence-card')).toContainText('Chưa thấy giá');
  await detail.getByRole('button', { name: 'Xem các đoạn đã đọc' }).click();
  await expect(detail.getByRole('region', { name: 'Các đoạn trích' })).toBeVisible();
  await back.click();
  await page.getByRole('button', { name: /Chưa chạy lời thoại/ }).click();
  await expect(detail.locator('.evidence-card')).toContainText('Chưa chạy lời thoại.');
  await expect(detail.getByRole('button', { name: 'Quét lời thoại', exact: true })).toBeVisible();
  await back.click();
  await page.getByRole('button', { name: /Chưa chọn mã/ }).click();
  await expect(detail.locator('.evidence-card')).toContainText('Video chưa được gán mã sản phẩm.');
  await detail.getByRole('button', { name: 'Gán mã sản phẩm', exact: true }).click();
  const sku = page.getByRole('dialog').getByLabel('Mã phân loại (SKU)');
  await expect(sku).toHaveValue('');
  await expect(sku).toHaveAttribute('placeholder', 'Chưa gán SKU');
});

test('successive multi-file imports keep one summary and leave unchosen SKU empty', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Thêm video', exact: true }).first();
  const dialog = page.getByRole('dialog');
  await add.click();
  await expect(dialog.getByLabel('Mã phân loại (SKU)')).toHaveAttribute('placeholder', 'Chưa gán SKU');
  await dialog.locator('input[accept*=".mp4"]').setInputFiles(['public/demo/canvas.webm', 'public/demo/cups.webm']);
  await dialog.getByRole('button', { name: 'Thêm vào kho' }).click();
  await expect(page.locator('.toast')).toHaveCount(1);
  await expect(page.locator('.toast')).toContainText('Đã lưu 2 video.');
  await expect(page.locator('.clip-row').filter({ hasText: /canvas.*Chưa gán SKU/ })).toHaveCount(1);
  await add.click();
  await expect(page.locator('.toast')).toHaveCount(0);
  await dialog.locator('input[accept*=".mp4"]').setInputFiles(['public/demo/lamp.webm', 'public/demo/fan.webm', 'public/demo/soap.webm']);
  await dialog.getByRole('button', { name: 'Thêm vào kho' }).click();
  await expect(page.locator('.toast')).toHaveCount(1);
  await expect(page.locator('.toast')).toContainText('Đã lưu 3 video.');
});

test('campaign storage shows both normal capacity and the near-full warning', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'estimate', {
      value: async () => ({ usage: sessionStorage.getItem('high-storage') ? 90 * 2 ** 20 : 40 * 2 ** 20, quota: 100 * 2 ** 20 }),
    });
  });
  await page.goto('/');
  const settings = page.getByRole('button', { name: 'Quản lý chiến dịch' });
  const dialog = page.getByRole('dialog');
  await settings.click();
  await expect(dialog.getByText('Đã dùng khoảng 40 MB / 100 MB · còn khoảng 60 MB.')).toBeVisible();
  await expect(dialog.getByText(/Dung lượng gần đầy/)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => sessionStorage.setItem('high-storage', '1'));
  await settings.click();
  await expect(dialog.getByText('Đã dùng khoảng 90 MB / 100 MB · còn khoảng 10 MB.')).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('Dung lượng gần đầy');
});

test('spreadsheet import previews zero prices and voucher scope before changing the version', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Bảng ưu đãi', exact: true }).click();
  await page.getByLabel('Nhập bảng ưu đãi', { exact: true }).setInputFiles({
    name: 'offers.csv', mimeType: 'text/csv', buffer: Buffer.from('sku,voucher,price\nAAA,SALE100,0\nBBB,SALE100,50000\n'),
  });
  const dialog = page.getByRole('dialog', { name: 'Kiểm tra bảng vừa nhập' });
  await expect(dialog).toContainText('Giá 0 đ ở SKU AAA');
  await expect(dialog).toContainText('Mã SALE100 dùng cho 2 SKU');
  await expect(page.getByRole('heading', { name: 'Bảng ưu đãi · v2', exact: true, includeHidden: true })).toBeAttached();
  await dialog.getByRole('button', { name: 'Vẫn lưu phiên bản' }).click();
  await expect(page.getByRole('heading', { name: 'Bảng ưu đãi · v3', exact: true })).toBeVisible();
});
