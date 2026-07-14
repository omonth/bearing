import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.getByTestId('admin-login-username').fill('e2e-admin');
  await page.getByTestId('admin-login-password').fill('e2e-admin-password-123');
  await page.getByTestId('admin-login-submit').click();
  await expect(page.getByTestId('admin-dashboard')).toBeVisible();
}

test.describe('Admin panel smoke flows', () => {
  test('authenticates the seeded administrator and opens the dashboard', async ({ page }) => {
    await login(page);
    await expect(page.getByTestId('admin-dashboard-stats')).toBeVisible();
  });

  test('navigates to product management and filters catalog results', async ({ page }) => {
    await login(page);
    await page.getByTestId('admin-nav-products').click();
    await expect(page.getByTestId('admin-products-table')).toBeVisible();

    const filteredProducts = page.waitForResponse((response) =>
      response.url().includes('/api/search') && response.url().includes('q=6205')
    );
    await page.getByTestId('admin-products-search').fill('6205');
    await filteredProducts;
    await expect(page.getByTestId('admin-products-table')).toContainText('6205');
  });

  test('navigates to order management and exposes stable filtering controls', async ({ page }) => {
    await login(page);
    await page.getByTestId('admin-nav-orders').click();
    await expect(page.getByTestId('admin-orders-table')).toBeVisible();

    await page.getByTestId('admin-orders-status-paid').click();
    await expect(page.getByTestId('admin-orders-search')).toBeVisible();
  });
});
