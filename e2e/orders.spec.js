import { test, expect } from '@playwright/test';

test('search, start a demo order, confirm it, and see it on the dashboard', async ({ page }) => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const name = `e2eshop${stamp}`;

  await page.goto('/register');
  await page.getByLabel('Email').fill(`e2e-${stamp}@example.test`);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole('link', { name: 'Search', exact: true }).click();
  await page.getByLabel('Domain name').fill(name);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: `Start demo order for ${name}.com` }).click();

  await expect(page.getByRole('heading', { name: /^Order DF-/ })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('No payment is taken');
  await expect(page.getByText('Demo: awaiting confirmation')).toBeVisible();

  await page.getByRole('button', { name: 'Confirm demo order' }).click();
  await expect(page.getByText('Demo: completed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm demo order' })).toHaveCount(0);

  await page.getByRole('link', { name: 'dashboard', exact: true }).click();
  await expect(page.getByRole('link', { name: `${name}.com` })).toBeVisible();
  await expect(page.getByText('Demo: active')).toBeVisible();
});

test('anonymous visitors are sent to sign in instead of ordering', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Domain name').fill('anonshop');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('link', { name: 'Sign in to start a demo order' }).first()).toBeVisible();
});
