import { test, expect } from '@playwright/test';

// Uses the fictional account created by `npm run seed -w server` (run automatically by the e2e web server).
const SEED = { email: 'demo.user@example.test', password: 'demo-password-123' };

async function signIn(page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(SEED.email);
  await page.getByLabel('Password').fill(SEED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('a new account sees an empty state with a way back to search', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Email').fill(`e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'No domains yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Search for a domain' })).toBeVisible();
});

test('signed-in user sees their demo record and can edit its demo settings', async ({ page }, testInfo) => {
  await signIn(page);
  await expect(page.getByRole('note').first()).toContainText('demo records');
  await page.getByRole('link', { name: 'sample-bakery.com' }).click();
  await expect(page.getByRole('heading', { name: 'sample-bakery.com' })).toBeVisible();

  const label = `E2E ${testInfo.project.name} ${Date.now()}`;
  await page.getByLabel('Label').fill(label);
  await page.getByLabel(/Auto-renew/).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Saved');

  await page.reload();
  await expect(page.getByLabel('Label')).toHaveValue(label);
  await expect(page.getByLabel(/Auto-renew/)).toBeChecked();
});

test('an unknown record id shows a not-found message', async ({ page }) => {
  await signIn(page);
  await page.goto('/domains/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'Record not found' })).toBeVisible();
});
