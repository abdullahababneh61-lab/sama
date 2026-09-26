import { expect, type Page } from '@playwright/test';

/** Opens the workspace and waits for the editor to be ready. */
export async function openWorkspace(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => !!(window as any).samaEditor);
  await page.waitForTimeout(200);
  return errors;
}

/** Converts artboard coordinates to page coordinates. */
export async function toPage(page: Page, x: number, y: number) {
  return page.evaluate(
    ([x, y]) => {
      const ed = (window as any).samaEditor;
      const r = ed.canvas.upperCanvasEl.getBoundingClientRect();
      const v = ed.canvas.viewportTransform;
      return { x: r.left + x * v[0] + v[4], y: r.top + y * v[3] + v[5] };
    },
    [x, y],
  );
}

export async function drag(page: Page, from: [number, number], to: [number, number], steps = 8) {
  const a = await toPage(page, ...from);
  const b = await toPage(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
  await page.mouse.up();
  await page.waitForTimeout(100);
}

export async function clickAt(page: Page, x: number, y: number, modifiers: string[] = []) {
  const p = await toPage(page, x, y);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.click(p.x, p.y);
  for (const m of modifiers) await page.keyboard.up(m);
  await page.waitForTimeout(100);
}

export async function workspaceState(page: Page) {
  return page.evaluate(() => {
    const s = (window as any).samaEditor.store.getState();
    return {
      tool: s.activeTool as string,
      layers: s.layers as { id: string; name: string; kind: string; visible: boolean; locked: boolean; children?: any[] }[],
      selectedIds: s.selectedIds as string[],
      selection: s.selection,
      history: s.history as { labels: string[]; position: number },
    };
  });
}

/** Waits for pending async undo/redo restores to finish. */
export async function settle(page: Page) {
  await page.evaluate(() => (window as any).samaEditor.restoreQueue);
  await page.waitForTimeout(50);
}

export function expectNoErrors(errors: string[]) {
  expect(errors, errors.join('\n')).toEqual([]);
}
