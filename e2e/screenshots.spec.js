import { test, expect } from '@playwright/test';

const SEED = { email: 'demo.user@example.test', password: 'demo-password-123' };

test('capture README screenshots', async ({ page }, testInfo) => {
  const shot = (name) => page.screenshot({ path: `docs/screenshots/${name}-${testInfo.project.name}.png`, fullPage: true });

  await page.goto('/');
  await page.getByLabel('Domain name').fill('sample-bakery');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('sample-bakery.com')).toBeVisible();
  await shot('01-search');

  await page.goto('/login');
  await shot('02-sign-in');
  await page.getByLabel('Email').fill(SEED.email);
  await page.getByLabel('Password').fill(SEED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'sample-bakery.com' })).toBeVisible();
  await shot('03-dashboard');

  await page.getByRole('link', { name: 'sample-bakery.com' }).click();
  await expect(page.getByRole('heading', { name: 'sample-bakery.com' })).toBeVisible();
  await shot('04-domain');

  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'DF-DEMO-0001' }).click();
  await expect(page.getByRole('heading', { name: /^Order DF-DEMO-0001/ })).toBeVisible();
  await shot('05-order');
});
