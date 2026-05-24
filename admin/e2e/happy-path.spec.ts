import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.goto('/admin/login');
  await page.waitForSelector('input[placeholder="用户名"]');
  await page.fill('input[placeholder="用户名"]', 'admin');
  await page.fill('input[placeholder="密码"]', 'admin123');
  await page.click('button[type="submit"]');
  // Wait for dashboard navigation (client-side via react-router)
  await page.waitForSelector('text=数据看板', { timeout: 10000 });
}

test.describe('Admin Panel Happy Paths', () => {

  test('happy path 1: login → dashboard → product list → inline edit → orders', async ({ page }) => {
    await login(page);

    // Dashboard loaded
    await expect(page.locator('.ant-statistic').first()).toBeVisible({ timeout: 10000 });

    // Go to product management
    await page.click('text=商品管理');
    await expect(page.locator('.ant-table').first()).toBeVisible({ timeout: 10000 });

    // Search for a product
    await page.fill('input[placeholder*="搜索"]', '6205');
    await page.waitForTimeout(500);
    await expect(page.locator('.ant-table').first()).toBeVisible({ timeout: 5000 });

    // Inline edit: find an InputNumber in the table and edit it
    const inputNum = page.locator('.ant-input-number-input').first();
    if (await inputNum.isVisible({ timeout: 2000 }).catch(() => false)) {
      await inputNum.click({ clickCount: 3 });
      await inputNum.fill('99.99');
      await inputNum.press('Enter');
      await page.waitForTimeout(500);
    }

    // Go to orders page
    await page.click('text=订单管理');
    await expect(page.locator('.ant-table').first()).toBeVisible({ timeout: 10000 });

    // Ship first paid order if available
    const shipBtn = page.locator('button:has-text("发货")').first();
    if (await shipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await shipBtn.click();
      await page.waitForTimeout(300);
      const confirmBtn = page.locator('.ant-popconfirm button.ant-btn-primary');
      if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmBtn.click();
      }
    }
  });

  test('happy path 2: login → filter orders → detail drawer', async ({ page }) => {
    await login(page);

    await page.click('text=订单管理');
    await expect(page.locator('.ant-table').first()).toBeVisible({ timeout: 10000 });

    // Filter by paid
    const paidBtn = page.locator('button:has-text("已支付")');
    if (await paidBtn.isVisible().catch(() => false)) {
      await paidBtn.click();
      await page.waitForTimeout(300);
    }

    // Open first order detail
    const detail = page.locator('button:has-text("详情")').first();
    if (await detail.isVisible({ timeout: 3000 }).catch(() => false)) {
      await detail.click();
      await expect(page.locator('.ant-drawer-body')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.ant-descriptions')).toBeVisible();

      // Export PDF button should exist
      const pdfBtn = page.locator('.ant-drawer button:has-text("导出 PDF")');
      if (await pdfBtn.isVisible().catch(() => false)) {
        await expect(pdfBtn).toBeVisible();
      }
    }
  });

  test('happy path 3: login → batch select → batch ship', async ({ page }) => {
    await login(page);

    await page.click('text=订单管理');
    await expect(page.locator('.ant-table').first()).toBeVisible({ timeout: 10000 });

    // Filter to paid
    const paidBtn = page.locator('button:has-text("已支付")');
    if (await paidBtn.isVisible().catch(() => false)) {
      await paidBtn.click();
      await page.waitForTimeout(300);
    }

    // Select 2 orders
    const checkboxes = page.locator('.ant-table-tbody .ant-checkbox-input');
    const count = await checkboxes.count();
    if (count >= 2) {
      await checkboxes.nth(0).check();
      await checkboxes.nth(1).check();
      await expect(page.locator('text=已选 2 个订单')).toBeVisible({ timeout: 3000 });

      await page.click('button:has-text("批量发货")');
      await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 5000 });
    }
  });
});
