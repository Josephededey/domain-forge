import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SEED = { email: 'demo.user@example.test', password: 'demo-password-123' };

async function expectNoViolations(page, label) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}, e.g. ${v.nodes[0].target.join(' ')}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

async function signIn(page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(SEED.email);
  await page.getByLabel('Password').fill(SEED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('accessibility scans (WCAG 2.2 AA rules)', () => {
  for (const scheme of ['light', 'dark']) {
    test(`public pages, ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ['/', '/login', '/register']) {
        await page.goto(path);
        await expect(page.getByRole('main')).toBeVisible();
        await expectNoViolations(page, `${path} (${scheme})`);
      }
    });
  }

  test('search results and error state', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Domain name').fill('a11yshop');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('a11yshop.com')).toBeVisible();
    await expectNoViolations(page, 'search results');

    await page.getByLabel('Domain name').fill('-bad-');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('#q-error')).toBeVisible();
    await expectNoViolations(page, 'search validation error');
  });

  test('signed-in pages', async ({ page }) => {
    await signIn(page);
    await expectNoViolations(page, 'dashboard');

    await page.getByRole('link', { name: 'sample-bakery.com' }).click();
    await expect(page.getByRole('heading', { name: 'sample-bakery.com' })).toBeVisible();
    await expectNoViolations(page, 'domain detail');

    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'DF-DEMO-0001' }).click();
    await expect(page.getByRole('heading', { name: /^Order DF-DEMO-0001/ })).toBeVisible();
    await expectNoViolations(page, 'order detail');
  });
});

test.describe('keyboard and small screens', () => {
  test('search works with the keyboard alone', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();

    await page.getByLabel('Domain name').focus();
    await page.keyboard.type('keyboardshop');
    await page.keyboard.press('Enter');
    await expect(page.getByText('keyboardshop.com')).toBeVisible();
  });

  test('pages fit a 320px-wide screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of ['/', '/login', '/register']) {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      expect(await noHorizontalScroll(page), `${path} overflows`).toBe(true);
    }
    await signIn(page);
    expect(await noHorizontalScroll(page), 'dashboard overflows').toBe(true);
  });
});
