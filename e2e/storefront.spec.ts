import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

interface E2eCustomer {
  name: string;
  phone: string;
  password: string;
}

async function authenticateAdministrator(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/auth/login', {
    data: {
      username: 'e2e-admin',
      password: 'e2e-admin-password-123',
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: { token: string } };
  return body.data.token;
}

async function registerAndLogIn(page: Page, customer: E2eCustomer) {
  await page.goto('/login');
  await page.getByTestId('customer-auth-mode-register').click();
  await page.getByTestId('customer-register-name').fill(customer.name);
  await page.getByTestId('customer-auth-phone').fill(customer.phone);
  await page.getByTestId('customer-auth-password').fill(customer.password);
  await page.getByTestId('customer-auth-submit').click();
  await expect(page).toHaveURL(/\/account$/);

  await page.goto('/login');
  await page.getByTestId('customer-auth-phone').fill(customer.phone);
  await page.getByTestId('customer-auth-password').fill(customer.password);
  await page.getByTestId('customer-auth-submit').click();
  await expect(page).toHaveURL(/\/account$/);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).toBeTruthy();
  const profileResponse = await page.request.get('/api/customer/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(profileResponse.ok()).toBeTruthy();
}

test('customer completes a protected storefront purchase flow', async ({ page, request }, testInfo) => {
  const customer: E2eCustomer = {
    name: 'E2E Customer',
    phone: `1390000000${testInfo.retry + 1}`,
    password: 'customer-e2e-password-123',
  };
  await registerAndLogIn(page, customer);

  await page.goto('/');
  await expect(page.getByTestId('storefront-product-card-6205')).toBeVisible();

  await page.getByTestId('storefront-product-search').fill('6205');
  await expect(page.getByTestId('storefront-product-card-6205')).toBeVisible();

  const filteredCatalog = page.waitForResponse((response) =>
    response.url().includes('/api/bearings?category=') && response.ok()
  );
  await page.getByTestId('storefront-category-1').click();
  await filteredCatalog;
  await page.getByTestId('storefront-category-0').click();
  await expect(page.getByTestId('storefront-product-card-6205')).toBeVisible();

  await page.getByTestId('storefront-product-detail-6205').click();
  await expect(page.getByTestId('storefront-detail-add-to-cart')).toBeVisible();
  await page.getByTestId('storefront-detail-add-to-cart').click();
  await expect(page.getByTestId('storefront-cart-item')).toBeVisible();

  await page.getByTestId('storefront-cart-increase').click();
  await page.getByTestId('storefront-cart-remove').click();
  await expect(page.getByTestId('storefront-cart-item')).toHaveCount(0);
  await page.getByTestId('storefront-cart-close').click();

  await page.getByTestId('storefront-detail-add-to-cart').click();
  await expect(page.getByTestId('storefront-cart-item')).toBeVisible();
  await page.getByTestId('storefront-cart-checkout').click();
  await expect(page.getByTestId('checkout-cart-item')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeTruthy();
  await page.getByTestId('checkout-proceed-to-address').click();

  await page.getByTestId('checkout-recipient-name').fill(customer.name);
  await page.getByTestId('checkout-recipient-phone').fill(customer.phone);
  await page.getByTestId('checkout-province').selectOption('\u5317\u4eac\u5e02');
  await page.getByTestId('checkout-city').selectOption('\u4e1c\u57ce\u533a');
  await page.getByTestId('checkout-district').fill('E2E District');
  await page.getByTestId('checkout-address-detail').fill('100 Test Street');
  await page.getByTestId('checkout-save-address').click();

  const savedAddress = page.getByTestId('checkout-saved-address');
  await expect(savedAddress).toBeVisible();
  const savedAddressId = await savedAddress.locator('option').nth(1).getAttribute('value');
  expect(savedAddressId).not.toBeNull();
  await savedAddress.selectOption(savedAddressId!);

  const paymentResponse = page.waitForResponse((response) =>
    response.url().includes('/api/payment/checkout')
    && response.request().method() === 'POST'
    && response.ok()
  );
  await page.getByTestId('checkout-submit-order').click();
  const paymentBody = (await (await paymentResponse).json()) as {
    data: { paymentOrderId: number };
  };
  await expect(page.getByTestId('checkout-payment-step')).toBeVisible();

  const adminToken = await authenticateAdministrator(request);
  const simulatePayment = await request.post(
    `/api/payment/simulate/${paymentBody.data.paymentOrderId}`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  expect(simulatePayment.ok()).toBeTruthy();

  await expect(page.getByTestId('checkout-payment-paid')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('checkout-payment-complete').click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId('account-order')).toBeVisible();
});
