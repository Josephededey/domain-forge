import { test, expect } from '@playwright/test';

test('visitor sees the demo disclaimer and simulated results', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('note')).toContainText('Results are simulated');
  await page.getByLabel('Domain name').fill('  MyShop ');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('myshop.com')).toBeVisible();
  await expect(page.getByText('Simulated').first()).toBeVisible();
  await expect(page.getByText('Not verified').first()).toBeVisible();
});

test('invalid input gives accessible, specific feedback', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Domain name').fill('-bad-');
  await page.getByRole('button', { name: 'Search' }).click();
  const input = page.getByLabel('Domain name');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#q-error')).toContainText('hyphen');
});

test('layout does not overflow horizontally', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Domain name').fill('example');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('example.com')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
