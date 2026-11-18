import { expect, test, type Page } from '@playwright/test';
import type { Workspace } from '../src/domain';
import { extractClaims } from '../src/claims';

async function mediaEvidence(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ra-clip', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction('workspace');
      const workspace = await new Promise<Workspace | undefined>((resolve, reject) => {
        const request = transaction.objectStore('workspace').get('demo');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return workspace?.clips.find(clip => clip.title === 'Kết quả AI')?.evidence ?? [];
    } finally { db.close(); }
  });
}

async function importFixture(page: Page, audio: boolean, frame: boolean) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Thêm video' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[accept*=".mp4"]').setInputFiles('public/binh-500.webm');
  await dialog.getByLabel('Tên video').fill('Kết quả AI');
  await dialog.getByLabel('Mã phân loại (SKU)').fill('BINH-500');
  await dialog.getByLabel('Lời thoại', { exact: true }).setChecked(audio);
  await dialog.getByLabel('Chữ trên khung hình', { exact: true }).setChecked(frame);
  await dialog.getByRole('button', { name: 'Thêm vào kho' }).click();
  await expect(page.getByRole('button', { name: /Kết quả AI/ })).toBeVisible({ timeout: 120_000 });
  return mediaEvidence(page);
}

test('reads the real on-screen voucher from a video without external requests', async ({ page }) => {
  test.setTimeout(75_000);
  const external: string[] = [];
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173\/)/, route => {
    external.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  const evidence = await importFixture(page, false, true);
  expect(evidence.some(row => row.source === 'frame' && /SALE99/i.test(row.text) && row.start >= 4)).toBe(true);
  await expect(page.locator('.evidence-card .tag')).toHaveText('Cần xử lý');
  expect(external).toEqual([]);
});

test('finds the spoken price with Vietnamese PhoWhisper', async ({ page }) => {
  test.skip(process.env.RA_CLIP_TEST_MODELS !== '1', 'Opt in to the first-use model download.');
  test.setTimeout(150_000);
  const evidence = await importFixture(page, true, false);
  const claims = extractClaims({
    id: 'audio-test', title: 'Clip thử', sku: 'BINH-500', link: '', published: '',
    localMedia: true, evidence: evidence.filter(row => row.source === 'audio'),
  }, []);
  expect(claims).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'price', value: 99000 })]));
});
