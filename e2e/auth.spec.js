import { test, expect } from '@playwright/test';

const PASSWORD = 'correct horse battery';
const uniqueEmail = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

test('protected page redirects anonymous visitors to sign in', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('register, see dashboard, sign out, and lose access', async ({ page }) => {
  const email = uniqueEmail();
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('main').getByText(email)).toBeVisible();

  await page.reload(); // session survives a reload via the HttpOnly cookie
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('invalid registration shows accessible field errors', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Use at least 12 characters.')).toBeVisible();
});

test('wrong credentials give a generic error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Password').fill('definitely wrong password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');
});
