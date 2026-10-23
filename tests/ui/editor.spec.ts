import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 820 },
  { width: 800, height: 550 },
]) {
  test(`file explorer and editor at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    // Browser UI exercises the real editor with explicit in-memory filesystem fixtures.
    // Actual disk reads/writes are covered by Rust tests, not this preview.
    await page.route('**/src/lib/tauriIpc.ts*', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          (await response.text()) +
          `
      window.editorFixture = { saved: null };
      tauriIpc.selectDirectory = async () => 'C:/Projects/terminal_manager';
      tauriIpc.listDirectory = async (_root, path) => ({
        entries: path === 'src' ? [
          { name: 'App.tsx', path: 'src/App.tsx', is_dir: false },
          { name: 'index.css', path: 'src/index.css', is_dir: false },
        ] : [
          { name: 'src', path: 'src', is_dir: true },
          { name: 'README.md', path: 'README.md', is_dir: false },
          { name: 'package.json', path: 'package.json', is_dir: false },
        ],
        truncated: false,
      });
      tauriIpc.readTextFile = async (_root, path) => ({
        content: path.endsWith('App.tsx') ? "import React from 'react';\\n\\nexport function App() {\\n  return <main>Welcome to Vela</main>;\\n}\\n" : '# Vela\\n\\nYour development workspace.\\n',
        revision: 'v1', line_ending: 'LF', has_bom: false,
      });
      tauriIpc.saveTextFile = async (_root, _path, content) => {
        window.editorFixture.saved = content;
        return { content, revision: 'v2', line_ending: 'LF', has_bom: false };
      };
      `,
      });
    });
    await page.goto('/');
    await expect(page.getByText('No Active Terminals', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open Files', exact: true }).click();
    await page.getByRole('treeitem', { name: 'src', exact: true }).click();
    const file = page.getByRole('treeitem', { name: 'App.tsx', exact: true });
    await file.click();
    await expect(page.getByRole('tab', { name: 'App.tsx' })).toHaveCount(0);
    await file.dblclick();
    const editor = page.getByRole('textbox', { name: 'Edit src/App.tsx' });
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('// edited in Vela');
    await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(await page.evaluate('window.editorFixture.saved')).toContain('// edited in Vela');
    await page.keyboard.press('Control+z');
    await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
    await page.keyboard.press('Control+y');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Git', exact: true }).click();
    await expect(page.getByText('Git Worktrees', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await expect(file).toBeVisible();
    await page.getByRole('button', { name: 'Terminal', exact: true }).click();
    await expect(page.getByText('No Active Terminals', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Editor/ }).click();
    await expect(editor).toContainText('// edited in Vela');
    await page.screenshot({ path: info.outputPath('editor.png'), fullPage: true });
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' unsaved');
    await page.keyboard.press('Control+w');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editor).toContainText('unsaved');
    await page.getByLabel('Close src/App.tsx', { exact: true }).click();
    await page.getByRole('button', { name: "Don't Save", exact: true }).click();
    await expect(page.getByRole('tab', { name: 'App.tsx' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
