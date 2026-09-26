import { expect, test } from '@playwright/test';
import { clickAt, drag, expectNoErrors, openWorkspace, settle, workspaceState } from './helpers';

test.describe('canvas shell', () => {
  test('renders, zooms and pans', async ({ page }) => {
    const errors = await openWorkspace(page);
    await expect(page.getByTestId('sama-workspace')).toBeVisible();
    const zoom0 = await page.evaluate(() => (window as any).samaEditor.canvas.getZoom());
    await page.keyboard.press('Control+=');
    const zoom1 = await page.evaluate(() => (window as any).samaEditor.canvas.getZoom());
    expect(zoom1).toBeGreaterThan(zoom0);
    await page.keyboard.press('Control+1');
    expect(await page.evaluate(() => (window as any).samaEditor.canvas.getZoom())).toBe(1);
    const vpt0 = await page.evaluate(() => [...(window as any).samaEditor.canvas.viewportTransform]);
    await page.keyboard.press('h');
    await drag(page, [500, 500], [400, 450]);
    const vpt1 = await page.evaluate(() => [...(window as any).samaEditor.canvas.viewportTransform]);
    expect(vpt1[4]).not.toBe(vpt0[4]);
    await page.keyboard.press('Control+0');
    expectNoErrors(errors);
  });
});

test.describe('drawing tools', () => {
  test('shape tools create layers; select tool moves them', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('m');
    await drag(page, [100, 100], [300, 250]);
    await page.keyboard.press('l');
    await drag(page, [400, 100], [600, 300]);
    await page.keyboard.press('\\');
    await drag(page, [100, 400], [500, 400]);
    await page.keyboard.press('u'); // line → polygon
    await clickAt(page, 800, 800);
    let s = await workspaceState(page);
    expect(s.layers.map((l) => l.kind)).toEqual(['polygon', 'line', 'ellipse', 'rect']);
    await page.keyboard.press('v');
    await clickAt(page, 200, 170);
    s = await workspaceState(page);
    expect(s.selection.kind).toBe('rect');
    const x0 = s.selection.x;
    await drag(page, [200, 170], [300, 170]);
    s = await workspaceState(page);
    expect(s.selection.x).toBeGreaterThan(x0 + 80);
    expect(s.history.labels.at(-1)).toBe('Move');
    expectNoErrors(errors);
  });

  test('brush strokes collect into one paint layer; eraser clips them', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('b');
    await drag(page, [100, 100], [500, 300], 15);
    await drag(page, [100, 300], [500, 100], 15);
    let s = await workspaceState(page);
    expect(s.layers).toHaveLength(1);
    expect(s.layers[0].kind).toBe('paint');
    const count = await page.evaluate(() => (window as any).samaEditor.canvas.getObjects()[0].getObjects().length);
    expect(count).toBe(2);
    await page.keyboard.press('e');
    await drag(page, [300, 50], [300, 350], 15);
    await page.waitForTimeout(300);
    s = await workspaceState(page);
    expect(s.history.labels.at(-1)).toBe('Erase');
    const clipped = await page.evaluate(() =>
      (window as any).samaEditor.canvas.getObjects()[0].getObjects().every((o: any) => !!o.clipPath),
    );
    expect(clipped).toBe(true);
    // Undo removes the erase.
    await page.keyboard.press('Control+z');
    await settle(page);
    const clippedAfterUndo = await page.evaluate(() =>
      (window as any).samaEditor.canvas.getObjects()[0].getObjects().some((o: any) => !!o.clipPath),
    );
    expect(clippedAfterUndo).toBe(false);
    expectNoErrors(errors);
  });

  test('pen tool draws a closed Bézier path that can be edited', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('p');
    await clickAt(page, 300, 300);
    await drag(page, [600, 300], [700, 400]); // smooth anchor
    await clickAt(page, 450, 600);
    await clickAt(page, 300, 300); // close
    let s = await workspaceState(page);
    expect(s.layers[0].kind).toBe('path');
    const d = await page.evaluate(() => (window as any).samaEditor.canvas.getActiveObject().path.map((c: any) => c[0]).join(''));
    expect(d).toBe('MCCCZ');
    await page.keyboard.press('a');
    s = await workspaceState(page);
    expect(s.tool).toBe('direct');
    const before = await page.evaluate(() => JSON.stringify((window as any).samaEditor.canvas.getActiveObject().path));
    await drag(page, [450, 600], [450, 700]);
    const after = await page.evaluate(() => JSON.stringify((window as any).samaEditor.canvas.getActiveObject().path));
    expect(after).not.toBe(before);
    s = await workspaceState(page);
    expect(s.history.labels.at(-1)).toBe('Edit anchors');
    expectNoErrors(errors);
  });

  test('text tool creates editable text, including Arabic RTL', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('t');
    await clickAt(page, 100, 100);
    await page.keyboard.type('Hello');
    await page.keyboard.press('Escape');
    let s = await workspaceState(page);
    expect(s.layers[0].kind).toBe('text');
    await page.evaluate(() => (window as any).samaEditor.updateToolOptions('text', { direction: 'rtl', textAlign: 'right' }));
    await drag(page, [300, 400], [900, 450]);
    await page.keyboard.type('مرحبا');
    await page.keyboard.press('Escape');
    s = await workspaceState(page);
    expect(s.layers).toHaveLength(2);
    expect(s.selection.text.direction).toBe('rtl');
    const texts = await page.evaluate(() => (window as any).samaEditor.canvas.getObjects().map((o: any) => o.text));
    expect(texts).toEqual(['Hello', 'مرحبا']);
    // Empty text boxes are discarded.
    await clickAt(page, 100, 800);
    await page.keyboard.press('Escape');
    s = await workspaceState(page);
    expect(s.layers).toHaveLength(2);
    expectNoErrors(errors);
  });

  test('images import from the file picker', async ({ page }) => {
    const errors = await openWorkspace(page);
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 300;
      c.height = 200;
      c.getContext('2d')!.fillRect(0, 0, 300, 200);
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.setInputFiles('[data-testid=image-input]', { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForTimeout(500);
    const s = await workspaceState(page);
    expect(s.layers[0]).toMatchObject({ kind: 'image', name: 'photo' });
    expect(s.selection.width).toBe(300);
    expectNoErrors(errors);
  });
});

test.describe('layers', () => {
  test('group, ungroup, hide, lock, rename, duplicate and reorder', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('m');
    await drag(page, [100, 100], [300, 300]);
    await page.keyboard.press('l');
    await drag(page, [500, 500], [700, 700]);
    await page.keyboard.press('v');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+g');
    let s = await workspaceState(page);
    expect(s.layers).toHaveLength(1);
    expect(s.layers[0].kind).toBe('group');
    expect(s.layers[0].children).toHaveLength(2);

    // Deep select a child with Ctrl+click
    await page.keyboard.press('Escape');
    await clickAt(page, 600, 600, ['Control']);
    s = await workspaceState(page);
    expect(s.selection.kind).toBe('ellipse');

    // Visibility and lock from the panel
    const groupRow = page.locator('[data-row-id]').first();
    await groupRow.hover();
    await groupRow.getByRole('button', { name: 'Hide layer' }).click();
    s = await workspaceState(page);
    expect(s.layers[0].visible).toBe(false);
    await groupRow.getByRole('button', { name: 'Show layer' }).click();
    await groupRow.getByRole('button', { name: 'Lock layer' }).click();
    s = await workspaceState(page);
    expect(s.layers[0].locked).toBe(true);
    await clickAt(page, 200, 200);
    s = await workspaceState(page);
    expect(s.selectedIds).toEqual([]); // locked layers can't be clicked on canvas
    await groupRow.getByRole('button', { name: 'Unlock layer' }).click();

    // Ungroup
    await groupRow.click();
    await page.keyboard.press('Control+Shift+g');
    s = await workspaceState(page);
    expect(s.layers.map((l) => l.kind)).toEqual(['ellipse', 'rect']);

    // Rename by double-click
    await page.locator('.sw-layer__name', { hasText: 'Rectangle 1' }).dblclick();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Card background');
    await page.keyboard.press('Enter');
    s = await workspaceState(page);
    expect(s.layers[1].name).toBe('Card background');

    // Duplicate
    await page.locator('[data-row-id]', { hasText: 'Card background' }).click();
    await page.keyboard.press('Control+j');
    await page.waitForTimeout(200);
    s = await workspaceState(page);
    expect(s.layers.map((l) => l.name)).toEqual(['Ellipse 1', 'Card background copy', 'Card background']);

    // Drag "Card background" to the top
    const src = await page.locator('[data-row-id]', { hasText: /^Card background$/ }).boundingBox();
    const dst = await page.locator('[data-row-id]', { hasText: 'Ellipse 1' }).boundingBox();
    await page.mouse.move(src!.x + 60, src!.y + src!.height / 2);
    await page.mouse.down();
    await page.mouse.move(src!.x + 60, dst!.y + 4, { steps: 8 });
    await page.mouse.up();
    s = await workspaceState(page);
    expect(s.layers.map((l) => l.name)).toEqual(['Card background', 'Ellipse 1', 'Card background copy']);
    expectNoErrors(errors);
  });

  test('layer opacity and blend mode from the panel', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('m');
    await drag(page, [100, 100], [300, 300]);
    await page.getByTestId('layers-panel').locator('select').selectOption('multiply');
    const op = await page.evaluate(() => (window as any).samaEditor.canvas.getObjects()[0].globalCompositeOperation);
    expect(op).toBe('multiply');
    expectNoErrors(errors);
  });
});

test.describe('history', () => {
  test('multi-step undo/redo restores every state', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('m');
    for (let i = 0; i < 4; i++) await drag(page, [100 + i * 150, 100], [200 + i * 150, 200]);
    let s = await workspaceState(page);
    expect(s.layers).toHaveLength(4);
    for (let i = 3; i >= 0; i--) {
      await page.keyboard.press('Control+z');
      await settle(page);
      s = await workspaceState(page);
      expect(s.layers).toHaveLength(i);
    }
    for (let i = 1; i <= 4; i++) {
      await page.keyboard.press('Control+Shift+z');
      await settle(page);
      s = await workspaceState(page);
      expect(s.layers).toHaveLength(i);
    }
    expectNoErrors(errors);
  });
});

test.describe('export', () => {
  test('PNG and structured JSON; JSON round-trips losslessly', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('m');
    await drag(page, [100, 100], [500, 400]);
    await page.keyboard.press('t');
    await clickAt(page, 100, 600);
    await page.keyboard.type('Title');
    await page.keyboard.press('Escape');
    const result = await page.evaluate(async () => {
      const ed = (window as any).samaEditor;
      const png: Blob = await ed.exportPng({ scale: 2 });
      const bmp = await createImageBitmap(png);
      const doc = await ed.getDocument();
      return { type: png.type, w: bmp.width, h: bmp.height, doc };
    });
    expect(result.type).toBe('image/png');
    expect([result.w, result.h]).toEqual([2160, 2160]);
    expect(result.doc.format).toBe('sama.design-document');
    expect(result.doc.layers.map((l: any) => l.type)).toEqual(['text', 'rect']);
    expect(result.doc.layers[0].text.content).toBe('Title');
    expect(result.doc.analysis.layerCount).toBe(2);

    await page.evaluate(() => (window as any).samaEditor.newDocument());
    expect((await workspaceState(page)).layers).toHaveLength(0);
    await page.evaluate((doc) => (window as any).samaEditor.loadDocument(doc), result.doc);
    const again = await page.evaluate(() => (window as any).samaEditor.getDocument());
    expect(again.fabric.objects).toEqual(result.doc.fabric.objects);
    expect(again.layers).toEqual(result.doc.layers);
    expectNoErrors(errors);
  });

  test('export dialog downloads PNG and JSON', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('m');
    await drag(page, [100, 100], [500, 400]);
    await page.getByTestId('export-button').click();
    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    await page.getByTestId('export-confirm').click();
    await expect.poll(() => downloads.length).toBe(2);
    expect(downloads.sort()).toEqual(['Untitled design.png', 'Untitled design.sama.json']);
    expectNoErrors(errors);
  });
});

test.describe('localization', () => {
  test('Arabic interface is right-to-left', async ({ page }) => {
    const errors = await openWorkspace(page, '?lang=ar');
    await expect(page.getByTestId('sama-workspace')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('button', { name: 'تصدير' })).toBeVisible();
    expectNoErrors(errors);
  });
});

test.describe('image drag and drop', () => {
  test('dropping an image file onto the canvas imports it at the drop point', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 100;
      c.height = 100;
      c.getContext('2d')!.fillRect(0, 0, 100, 100);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'dropped.png', { type: 'image/png' }));
      const ed = (window as any).samaEditor;
      const r = ed.canvas.upperCanvasEl.getBoundingClientRect();
      const v = ed.canvas.viewportTransform;
      const clientX = r.left + 300 * v[0] + v[4];
      const clientY = r.top + 400 * v[3] + v[5];
      const target = document.querySelector('.sw-canvas-area')!;
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, clientX, clientY, bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(500);
    const s = await workspaceState(page);
    expect(s.layers[0]).toMatchObject({ kind: 'image', name: 'dropped' });
    // Centred on the drop point.
    expect(Math.round(s.selection.x + s.selection.width / 2)).toBeGreaterThan(295);
    expect(Math.round(s.selection.x + s.selection.width / 2)).toBeLessThan(305);
    expectNoErrors(errors);
  });
});

test.describe('keyboard', () => {
  test('tool shortcuts work regardless of keyboard layout', async ({ page }) => {
    const errors = await openWorkspace(page);
    // Arabic layout: the physical P key types "ح".
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ح', code: 'KeyP', bubbles: true })));
    expect((await workspaceState(page)).tool).toBe('pen');
    await page.keyboard.press('t');
    expect((await workspaceState(page)).tool).toBe('text');
    await page.keyboard.press('Shift+/');
    await expect(page.locator('.sw-modal')).toBeVisible();
    expectNoErrors(errors);
  });
});
