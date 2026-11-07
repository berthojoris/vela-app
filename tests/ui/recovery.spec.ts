import { expect, test } from '@playwright/test';

test('restores terminal layout and live CodeMirror drafts across reload, including disk conflicts', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => void dialog.accept());
  await page.route('**/src/lib/tauriIpc.ts*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `
      tauriIpc.selectDirectory = async () => 'C:/repo';
      tauriIpc.listDirectory = async () => ({ entries: [{ name: 'draft.ts', path: 'draft.ts', is_dir: false }], truncated: false });
      tauriIpc.readTextFile = async () => ({ content: 'disk baseline', revision: localStorage.getItem('fixtureRevision') || 'v1', line_ending: 'LF', has_bom: false });
      tauriIpc.saveTextFile = async (_root, _path, content, revision) => {
        if (revision !== (localStorage.getItem('fixtureRevision') || 'v1')) throw new Error('The file changed on disk.');
        return { content, revision, line_ending: 'LF', has_bom: false };
      };
    `,
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'New Terminal Tab (Ctrl+T)' }).click();
  await page.getByLabel('Working directory path').fill('C:/one');
  await page.getByRole('button', { name: 'Launch Terminal', exact: true }).click();
  await expect(page.locator('.xterm:visible')).toHaveCount(1);
  await page.keyboard.press('Control+t');
  await page.getByLabel('Working directory path').fill('C:/two');
  await page.getByRole('button', { name: 'Launch Terminal', exact: true }).click();
  await page.getByTitle('Split Vertically', { exact: true }).click();
  await expect(page.locator('.xterm:visible')).toHaveCount(2);
  await page.getByRole('button', { name: 'Open Files', exact: true }).click();
  await page.getByRole('treeitem', { name: 'draft.ts', exact: true }).dblclick();
  const editor = page.getByRole('textbox', { name: 'Edit draft.ts' });
  await editor.fill('first draft');
  // A second edit while already dirty must be captured from CodeMirror's rope.
  await editor.fill('latest draft');
  await editor.press('End');
  await page.keyboard.insertText('x'.repeat(2 * 1024 * 1024 + 1));
  await expect(page.getByRole('alert')).toContainText('buffer limit');
  await expect(editor).toHaveText('latest draft');
  await page.getByRole('button', { name: 'Dismiss error' }).click();
  await page.evaluate(
    `(async () => { const recovery = await import('/src/lib/workspaceRecovery.ts'); await recovery.flushWorkspaceRecovery(); })()`
  );
  await page.reload();
  await expect(editor).toContainText('latest draft');
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: /^draft\.ts/ })).toBeVisible();
  await editor.press('End');
  await editor.press('x');
  await editor.press('Control+z');
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(page.locator('.xterm:visible')).toHaveCount(2);
  await expect(page.getByText('2 sessions', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Editor/ }).click();
  await page.evaluate(
    `(async () => { const recovery = await import('/src/lib/workspaceRecovery.ts'); await recovery.flushWorkspaceRecovery(); localStorage.setItem('fixtureRevision', 'v2'); })()`
  );
  await page.reload();
  await expect(editor).toContainText('latest draft');
  await expect(page.getByRole('alert')).toContainText('disk version');
  await editor.press('Control+s');
  await expect(page.getByRole('alert')).toContainText('changed on disk');
  await page.screenshot({ path: info.outputPath('recovered-workspace.png'), fullPage: true });
  await page.getByLabel('Close draft.ts', { exact: true }).click();
  await page.getByRole('button', { name: "Don't Save", exact: true }).click();
  await page.evaluate(
    `(async () => { const recovery = await import('/src/lib/workspaceRecovery.ts'); await recovery.flushWorkspaceRecovery(); })()`
  );
  await page.reload();
  await expect(page.getByText('2 sessions', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'draft.ts' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
