import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 820 }, { width: 800, height: 550 }]) {
  test(`workspace and modal recovery at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByText('No Active Terminals', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'New Terminal Tab (Ctrl+T)' }).click();
    await page.getByLabel('Working directory path').fill('C:/one');
    await page.getByRole('button', { name: 'Launch Terminal', exact: true }).click();
    await expect(page.locator('.xterm:visible')).toHaveCount(1);
    await page.keyboard.press('Control+t');
    await page.getByLabel('Working directory path').fill('C:/two');
    await page.getByRole('button', { name: 'Launch Terminal', exact: true }).click();
    await expect(page.getByText('2 sessions', { exact: true })).toBeVisible();
    await expect(page.locator('[title="PowerShell (two)"]')).toHaveClass(/font-medium/);
    await page.getByTitle('Split Vertically', { exact: true }).click();
    await expect(page.locator('.xterm:visible')).toHaveCount(2);
    const terminals = page.locator('.xterm:visible');
    const first = await terminals.nth(0).boundingBox();
    const second = await terminals.nth(1).boundingBox();
    expect(first!.height).toBeGreaterThan(200);
    expect(second!.height).toBeGreaterThan(200);
    expect(Math.abs(first!.width - second!.width)).toBeLessThan(4);
    await terminals.nth(1).click();
    await expect(page.locator('.xterm:visible')).toHaveCount(2);
    await page.keyboard.press('Control+t');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Control+w');
    await expect(page.getByText('2 sessions', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { reason: new Error('Simulated operation failure'), promise: Promise.resolve() })));
    await expect(page.getByRole('alert')).toContainText('Simulated operation failure');
    await expect(page.locator('.xterm:visible')).toHaveCount(2);
    await page.getByRole('button', { name: 'Dismiss error' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('workspace.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
}
