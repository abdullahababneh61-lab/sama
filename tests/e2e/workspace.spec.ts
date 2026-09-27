import { expect, test } from '@playwright/test';
import { clickAt, drag, expectNoErrors, openWorkspace, settle, toPage, workspaceState } from './helpers';

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
    // The exact scene must come back identical…
    expect(again.fabric.objects).toEqual(result.doc.fabric.objects);
    // …and the derived, rounded layer description may differ only by rounding
    // (e.g. 599.48 vs 599.49 when a value sits on a rounding boundary).
    const close = (a: unknown, b: unknown): boolean =>
      typeof a === 'number' && typeof b === 'number'
        ? Math.abs(a - b) <= 0.011
        : Array.isArray(a) && Array.isArray(b)
          ? a.length === b.length && a.every((v, i) => close(v, b[i]))
          : a && b && typeof a === 'object' && typeof b === 'object'
            ? Object.keys(a).length === Object.keys(b).length &&
              Object.keys(a).every((k) => close((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
            : a === b;
    expect(close(again.layers, result.doc.layers)).toBe(true);
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

test.describe('crop tool', () => {
  test('C activates it; Escape cancels; Enter trims layers and resizes the artboard', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('m');
    await drag(page, [300, 300], [500, 500]); // inside the crop
    await drag(page, [550, 550], [900, 700]); // crosses its edge
    await page.keyboard.press('l');
    await drag(page, [900, 50], [1050, 200]); // entirely outside
    await page.keyboard.press('c');
    expect((await workspaceState(page)).tool).toBe('crop');

    const cropRect = () => page.evaluate(() => (window as any).samaEditor.getTool('crop').rect);
    await drag(page, [200, 200], [700, 650]);
    expect(await cropRect()).not.toBeNull();
    await page.keyboard.press('Escape');
    expect(await cropRect()).toBeNull();
    expect(await page.evaluate(() => (window as any).samaEditor.doc.width)).toBe(1080);
    expect((await workspaceState(page)).layers).toHaveLength(3);

    await drag(page, [200, 200], [700, 650]);
    await page.keyboard.press('Enter');
    const doc = await page.evaluate(() => (window as any).samaEditor.doc);
    expect(Math.abs(doc.width - 500)).toBeLessThanOrEqual(3);
    expect(Math.abs(doc.height - 450)).toBeLessThanOrEqual(3);
    const s = await workspaceState(page);
    expect(s.layers.map((l) => l.name)).toEqual(['Rectangle 2', 'Rectangle 1']); // ellipse removed
    expect(s.history.labels.at(-1)).toBe('Crop');
    const clipped = await page.evaluate(() => (window as any).samaEditor.canvas.getObjects().map((o: any) => !!o.clipPath));
    expect(clipped).toEqual([false, true]); // only the layer crossing the edge is trimmed

    await page.keyboard.press('Control+z');
    await settle(page);
    expect(await page.evaluate(() => (window as any).samaEditor.doc.width)).toBe(1080);
    expect((await workspaceState(page)).layers).toHaveLength(3);
    expectNoErrors(errors);
  });
});

test.describe('perspective crop tool', () => {
  test('Shift+C; corners move independently; Enter straightens the quad; Escape cancels', async ({ page }) => {
    const errors = await openWorkspace(page);
    // A red "poster seen at an angle" and a layer outside it.
    const Q: [number, number][] = [
      [300, 250],
      [760, 300],
      [820, 820],
      [250, 760],
    ];
    await page.evaluate(() => (window as any).samaEditor.updateToolOptions('pen', { fill: '#e5484d', stroke: null }));
    await page.keyboard.press('p');
    for (const [x, y] of Q) await clickAt(page, x, y);
    await clickAt(page, ...Q[0]);
    await page.keyboard.press('m');
    await drag(page, [900, 50], [1050, 150]);
    await page.keyboard.press('Escape');

    await page.keyboard.press('Shift+C');
    expect((await workspaceState(page)).tool).toBe('perspectiveCrop');
    const corners = () => page.evaluate(() => (window as any).samaEditor.getTool('perspectiveCrop').corners);
    const start: [number, number][] = [
      [300, 300],
      [700, 300],
      [700, 700],
      [300, 700],
    ];
    await drag(page, start[0], start[2]);
    for (let i = 0; i < 4; i++) await drag(page, start[i], Q[i]);
    const c = await corners();
    expect(Math.abs(c[1].y - 300)).toBeLessThan(3); // top-right moved on its own
    expect(Math.abs(c[0].y - 250)).toBeLessThan(3);

    await page.keyboard.press('Escape');
    expect(await corners()).toBeNull();
    expect(await page.evaluate(() => (window as any).samaEditor.doc.width)).toBe(1080);

    await drag(page, start[0], start[2]);
    for (let i = 0; i < 4; i++) await drag(page, start[i], Q[i]);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await workspaceState(page)).history.labels.at(-1)).toBe('Perspective crop');
    const result = await page.evaluate(async () => {
      const ed = (window as any).samaEditor;
      const png: Blob = await ed.exportPng();
      const bmp = await createImageBitmap(png);
      const cv = document.createElement('canvas');
      cv.width = bmp.width;
      cv.height = bmp.height;
      const x = cv.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(bmp, 0, 0);
      const px = (u: number, v: number) => [...x.getImageData(Math.round(u * (bmp.width - 1)), Math.round(v * (bmp.height - 1)), 1, 1).data];
      const doc = await ed.getDocument();
      return { w: bmp.width, h: bmp.height, samples: [px(0.03, 0.03), px(0.97, 0.03), px(0.97, 0.97), px(0.03, 0.97), px(0.5, 0.5)], layers: doc.layers };
    });
    expect(Math.abs(result.w - 574)).toBeLessThanOrEqual(3);
    expect(Math.abs(result.h - 525)).toBeLessThanOrEqual(3);
    for (const p of result.samples) expect(p).toEqual([229, 72, 77, 255]); // straightened poster fills the artboard
    expect(result.layers).toHaveLength(1); // the rectangle outside was removed
    expect(result.layers[0].type).toBe('image');
    expect(result.layers[0].image.perspectiveCorrected.originalType).toBe('path');

    await page.keyboard.press('Control+z');
    await settle(page);
    expect(await page.evaluate(() => (window as any).samaEditor.doc.width)).toBe(1080);
    expect((await workspaceState(page)).layers.map((l) => l.kind)).toEqual(['rect', 'path']);
    expectNoErrors(errors);
  });
});

test.describe('eyedropper tool', () => {
  test('I picks fill, Alt picks stroke, returns to the previous tool; Escape cancels', async ({ page }) => {
    const errors = await openWorkspace(page);
    const options = () =>
      page.evaluate(() => {
        const o = (window as any).samaEditor.toolOptions;
        return { shapeFill: o.shape.fill, shapeStroke: o.shape.stroke, penFill: o.pen.fill, textFill: o.text.fill, brush: o.brush.color };
      });
    await page.keyboard.press('m');
    await drag(page, [100, 100], [500, 500]);
    await page.evaluate(() => (window as any).samaEditor.updateSelection({ fill: '#e5484d' }));
    await drag(page, [300, 300], [700, 700]);
    await page.evaluate(() => (window as any).samaEditor.updateSelection({ fill: '#0000ff', opacity: 0.5 }));
    await page.evaluate(() => (window as any).samaEditor.addGuide('horizontal', 150)); // guides must not be picked

    await page.keyboard.press('i');
    expect((await workspaceState(page)).tool).toBe('eyedropper');
    await clickAt(page, 150, 150);
    expect((await workspaceState(page)).tool).toBe('rect'); // back to the previous tool
    expect(await options()).toMatchObject({ shapeFill: '#e5484d', penFill: '#e5484d', textFill: '#e5484d', brush: '#e5484d' });

    await page.keyboard.press('i');
    await clickAt(page, 400, 400, ['Alt']); // 50% blue over red
    const o = await options();
    expect(o.shapeStroke).toBe('#7224a6');
    expect(o.shapeFill).toBe('#e5484d'); // fill untouched

    await page.keyboard.press('i');
    const before = await options();
    await page.keyboard.press('Escape');
    expect((await workspaceState(page)).tool).toBe('rect');
    expect(await options()).toEqual(before);
    expectNoErrors(errors);
  });
});

test.describe('color sampler tool', () => {
  test('O places up to 4 live sample points; drag, Alt+click and Escape', async ({ page }) => {
    const errors = await openWorkspace(page);
    const samples = () =>
      page.evaluate(() => (window as any).samaEditor.store.getState().colorSamples.map((s: any) => `${s.id}:${s.color}`));
    const optionsBefore = await page.evaluate(() => JSON.stringify((window as any).samaEditor.toolOptions));
    await page.keyboard.press('m');
    await drag(page, [100, 100], [500, 500]);
    await page.evaluate(() => (window as any).samaEditor.updateSelection({ fill: '#e5484d' }));

    await page.keyboard.press('o');
    expect((await workspaceState(page)).tool).toBe('colorSampler');
    await clickAt(page, 150, 150);
    await clickAt(page, 700, 700);
    await clickAt(page, 800, 800);
    await clickAt(page, 900, 900);
    expect(await samples()).toEqual(['1:#e5484d', '2:#ffffff', '3:#ffffff', '4:#ffffff']);
    await clickAt(page, 950, 150); // a fifth point is ignored
    expect(await samples()).toHaveLength(4);
    await expect(page.getByTestId('color-sampler-panel').locator('li')).toHaveCount(4);
    await expect(page.getByTestId('color-sample-1')).toContainText('#E5484D');

    await drag(page, [700, 700], [300, 300]); // move point 2 onto the red square
    expect((await samples())[1]).toBe('2:#e5484d');
    await clickAt(page, 800, 800, ['Alt']); // remove point 3
    expect(await samples()).toEqual(['1:#e5484d', '2:#e5484d', '4:#ffffff']);

    // Readings follow artwork changes.
    await page.evaluate(() => {
      const ed = (window as any).samaEditor;
      ed.selectByIds([ed.store.getState().layers[0].id]);
      return ed.updateSelection({ fill: '#46a758' });
    });
    await expect.poll(samples).toEqual(['1:#46a758', '2:#46a758', '4:#ffffff']);

    await page.keyboard.press('Escape'); // hides, keeps the points
    await expect(page.getByTestId('color-sampler-panel')).toHaveCount(0);
    expect(await samples()).toHaveLength(3);
    await page.keyboard.press('v');
    await page.keyboard.press('o'); // coming back shows them again
    await expect(page.getByTestId('color-sampler-panel').locator('li')).toHaveCount(3);
    expect(await page.evaluate(() => JSON.stringify((window as any).samaEditor.toolOptions))).toBe(optionsBefore);
    expectNoErrors(errors);
  });
});

test.describe('ruler tool', () => {
  test('R measures length and angle; Shift snaps to 45°; ends are draggable; Escape clears', async ({ page }) => {
    const errors = await openWorkspace(page);
    const m = () => page.evaluate(() => (window as any).samaEditor.getTool('ruler').measurement);
    await page.keyboard.press('r');
    expect((await workspaceState(page)).tool).toBe('ruler');

    await drag(page, [100, 500], [400, 100]); // dx 300, dy -400 → 500 px at 53.13°
    let r = await m();
    expect(r.length).toBeGreaterThan(495);
    expect(r.length).toBeLessThan(505);
    expect(r.angle).toBeCloseTo(53.13, 0);

    // Shift snaps to the nearest 45° step.
    await page.keyboard.down('Shift');
    await drag(page, [100, 800], [500, 720]);
    await page.keyboard.up('Shift');
    r = await m();
    expect(Math.abs(r.angle)).toBeLessThan(0.01);

    // Drag the end point: length updates, start stays.
    const startBefore = r.start;
    await drag(page, [r.end.x, r.end.y], [r.end.x, r.end.y - 300]);
    r = await m();
    expect(r.start).toEqual(startBefore);
    expect(r.angle).toBeGreaterThan(30);

    // Not a layer, not an undo step.
    const s = await workspaceState(page);
    expect(s.layers).toHaveLength(0);
    expect(s.history.labels).toEqual(['New document']);

    await page.keyboard.press('Escape');
    expect(await m()).toBeNull();
    expectNoErrors(errors);
  });
});

test.describe('count tool', () => {
  test('N counts clicks; drag keeps numbers; Alt+click removes and renumbers; Escape keeps markers', async ({ page }) => {
    const errors = await openWorkspace(page);
    const markers = () =>
      page.evaluate(() => (window as any).samaEditor.store.getState().countMarkers.map((m: any) => [Math.round(m.x), Math.round(m.y)]));
    await page.keyboard.press('n');
    expect((await workspaceState(page)).tool).toBe('count');
    const pts: [number, number][] = [
      [100, 100],
      [300, 100],
      [500, 100],
      [700, 100],
      [900, 100],
    ];
    for (const [x, y] of pts) await clickAt(page, x, y);
    await expect(page.getByTestId('count-total')).toHaveText('5');

    // Drag marker 2 down: it stays number 2.
    await drag(page, [300, 100], [300, 400]);
    let m = await markers();
    expect(m).toHaveLength(5);
    expect(Math.abs(m[1][1] - 400)).toBeLessThan(3);

    // Alt+click marker 3 (at 500,100): 4 and 5 move up to 3 and 4.
    await clickAt(page, 500, 100, ['Alt']);
    m = await markers();
    expect(m).toHaveLength(4);
    expect(Math.abs(m[2][0] - 700)).toBeLessThan(3); // old #4 is now #3
    expect(Math.abs(m[3][0] - 900)).toBeLessThan(3);
    await expect(page.getByTestId('count-total')).toHaveText('4');

    // Escape hides but keeps them; nothing is added to layers or undo.
    await page.keyboard.press('Escape');
    expect(await markers()).toHaveLength(4);
    const s = await workspaceState(page);
    expect(s.layers).toHaveLength(0);
    expect(s.history.labels).toEqual(['New document']);
    await page.keyboard.press('v');
    await page.keyboard.press('n');
    await expect(page.getByTestId('count-total')).toHaveText('4');
    expectNoErrors(errors);
  });
});

test.describe('spot healing brush', () => {
  test('J heals a blemish on an image layer; Escape cancels; vectors show a notice; undo restores', async ({ page }) => {
    const errors = await openWorkspace(page);
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 300;
      const x = c.getContext('2d')!;
      x.fillStyle = '#e0b090';
      x.fillRect(0, 0, 400, 300);
      x.fillStyle = '#301810';
      x.beginPath();
      x.arc(200, 150, 12, 0, Math.PI * 2);
      x.fill();
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.setInputFiles('[data-testid=image-input]', { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForTimeout(500);
    const centre = () =>
      page.evaluate(() => {
        const img = (window as any).samaEditor.canvas.getObjects()[0];
        const el = img.getElement();
        const c = document.createElement('canvas');
        c.width = el.naturalWidth;
        c.height = el.naturalHeight;
        const x = c.getContext('2d', { willReadFrequently: true })!;
        x.drawImage(el, 0, 0);
        return [...x.getImageData(200, 150, 1, 1).data];
      });
    expect(await centre()).toEqual([48, 24, 16, 255]);

    await page.keyboard.press('Escape');
    await page.keyboard.press('j');
    expect((await workspaceState(page)).tool).toBe('spotHealingBrush');
    // The image (400×300) is centred on the 1080 artboard: blemish at (540, 540).
    await page.evaluate(() => (window as any).samaEditor.updateToolOptions('spotHealingBrush', { size: 40 }));
    await drag(page, [530, 540], [550, 540], 5);
    await expect.poll(async () => (await workspaceState(page)).history.labels.at(-1)).toBe('Spot healing');
    const healed = await centre();
    expect(Math.abs(healed[0] - 0xe0)).toBeLessThan(4);
    expect(Math.abs(healed[1] - 0xb0)).toBeLessThan(4);
    expect(Math.abs(healed[2] - 0x90)).toBeLessThan(4);

    await page.keyboard.press('Control+z');
    await settle(page);
    expect(await centre()).toEqual([48, 24, 16, 255]);

    // Vector content can't be healed.
    await page.keyboard.press('m');
    await drag(page, [100, 100], [250, 250]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('j');
    await drag(page, [150, 150], [200, 200]);
    expect(await page.evaluate(() => (window as any).samaEditor.store.getState().toast?.message)).toBe('toast.spotHealNoImage');
    expectNoErrors(errors);
  });
});

test.describe('healing brush', () => {
  test('Shift+J; needs an Alt+click source; heals with the destination tone; Escape clears the source', async ({ page }) => {
    const errors = await openWorkspace(page);
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 300;
      const x = c.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, 400, 0);
      g.addColorStop(0, '#5a3a28');
      g.addColorStop(1, '#f0c8a0');
      x.fillStyle = g;
      x.fillRect(0, 0, 400, 300);
      x.fillStyle = '#200000';
      x.beginPath();
      x.arc(320, 150, 12, 0, Math.PI * 2);
      x.fill();
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.setInputFiles('[data-testid=image-input]', { name: 'face.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForTimeout(500);
    const pix = (x: number, y: number) =>
      page.evaluate(
        ([x, y]) => {
          const img = (window as any).samaEditor.canvas.getObjects()[0];
          const el = img.getElement();
          const c = document.createElement('canvas');
          c.width = el.naturalWidth;
          c.height = el.naturalHeight;
          const k = c.getContext('2d', { willReadFrequently: true })!;
          k.drawImage(el, 0, 0);
          return [...k.getImageData(x, y, 1, 1).data];
        },
        [x, y],
      );
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+J');
    expect((await workspaceState(page)).tool).toBe('healingBrush');
    const tool = () => page.evaluate(() => (window as any).samaEditor.getTool('healingBrush').sourcePoint);

    // Image (400×300) centred on the artboard: image pixel (px,py) = artboard (340+px, 390+py).
    await drag(page, [650, 540], [670, 540]);
    expect(await page.evaluate(() => (window as any).samaEditor.store.getState().toast?.message)).toBe('toast.healingNeedsSource');
    expect((await workspaceState(page)).history.labels.at(-1)).toBe('Import image');

    await clickAt(page, 400, 540, ['Alt']); // source on the dark side
    expect(await tool()).not.toBeNull();
    await page.evaluate(() => (window as any).samaEditor.updateToolOptions('spotHealingBrush', { size: 40 }));
    await drag(page, [650, 540], [672, 540], 5);
    await expect.poll(async () => (await workspaceState(page)).history.labels.at(-1)).toBe('Healing brush');
    const healed = await pix(320, 150);
    // Bright like its surroundings — not the dark source tone, not the blemish.
    expect(healed[0]).toBeGreaterThan(180);
    expect(healed[1]).toBeGreaterThan(140);

    await page.keyboard.press('Escape');
    expect(await tool()).toBeNull();
    await page.keyboard.press('Control+z');
    await settle(page);
    expect(await pix(320, 150)).toEqual([32, 0, 0, 255]);
    expectNoErrors(errors);
  });
});

// ---------------------------------------------------------------------------
// Selection tools

const region = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).samaEditor.store.getState().pixelSelection as null | { x: number; y: number; width: number; height: number });
const regionPixels = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).samaEditor.pixelSelection.pixelCount as number);
const regionHas = (page: import('@playwright/test').Page, x: number, y: number) =>
  page.evaluate(([x, y]) => (window as any).samaEditor.pixelSelection.contains(x, y) as boolean, [x, y]);
const selectedNames = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).samaEditor.getSelectedObjects().map((o: any) => o.samaName) as string[]);
async function addRect(page: import('@playwright/test').Page, fill: string, from: [number, number], to: [number, number]) {
  await page.evaluate((f) => (window as any).samaEditor.updateToolOptions('shape', { fill: f, stroke: null }), fill);
  await page.keyboard.press('m');
  await drag(page, from, to);
}
/** Drags a selection handle of the active object (page coordinates from Fabric's control coords). */
async function dragHandle(page: import('@playwright/test').Page, handle: string, dx: number, dy: number, modifiers: string[] = []) {
  const p = await page.evaluate((h) => {
    const ed = (window as any).samaEditor;
    const o = ed.canvas.getActiveObject();
    o.setCoords();
    const r = ed.canvas.upperCanvasEl.getBoundingClientRect();
    return { x: r.left + o.oCoords[h].x, y: r.top + o.oCoords[h].y };
  }, handle);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.move(p.x + dx / 2, p.y + dy / 2);
  await page.mouse.move(p.x + dx, p.y + dy);
  await page.mouse.up();
  for (const m of modifiers) await page.keyboard.up(m);
  await page.waitForTimeout(100);
}
const activeSize = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const o = (window as any).samaEditor.canvas.getActiveObject();
    return { w: o.getScaledWidth(), h: o.getScaledHeight() };
  });

test.describe('selection tool', () => {
  test('V: 8 handles, proportional corners, one-axis edges, marquee, Shift toggle, Esc, Delete', async ({ page }) => {
    const errors = await openWorkspace(page);
    await addRect(page, '#e5484d', [100, 100], [300, 200]);
    await addRect(page, '#3e63dd', [500, 100], [600, 300]);
    await page.keyboard.press('v');
    expect((await workspaceState(page)).tool).toBe('select');
    await expect(page.locator('.sw-options__tool')).toHaveText('Selection');
    await clickAt(page, 150, 150);
    expect(await selectedNames(page)).toEqual(['Rectangle 1']);
    const handles = await page.evaluate(() =>
      Object.keys((window as any).samaEditor.canvas.getActiveObject().oCoords).filter((k) => k !== 'mtr'),
    );
    expect(handles.sort()).toEqual(['bl', 'br', 'mb', 'ml', 'mr', 'mt', 'tl', 'tr']);
    // Corner: proportional.
    let s0 = await activeSize(page);
    await dragHandle(page, 'br', 60, 10);
    let s1 = await activeSize(page);
    expect(s1.w / s1.h).toBeCloseTo(s0.w / s0.h, 1);
    // Corner with Shift: free.
    s0 = s1;
    await dragHandle(page, 'br', 40, -30, ['Shift']);
    s1 = await activeSize(page);
    expect(Math.abs(s1.w / s1.h - s0.w / s0.h)).toBeGreaterThan(0.2);
    // Edge: one dimension only.
    s0 = s1;
    await dragHandle(page, 'mr', 50, 0);
    s1 = await activeSize(page);
    expect(s1.w).toBeGreaterThan(s0.w + 20);
    expect(s1.h).toBeCloseTo(s0.h, 3);
    // Drag to move.
    const before = await page.evaluate(() => (window as any).samaEditor.canvas.getActiveObject().left);
    await drag(page, [150, 150], [150, 350]);
    expect(await page.evaluate(() => (window as any).samaEditor.canvas.getActiveObject().left)).toBeCloseTo(before, 0);
    expect(await page.evaluate(() => (window as any).samaEditor.canvas.getActiveObject().top)).toBeGreaterThan(300);
    // Marquee on empty space selects every intersecting object.
    await drag(page, [1000, 20], [250, 400]);
    expect((await selectedNames(page)).sort()).toEqual(['Rectangle 1', 'Rectangle 2']);
    // Shift+click toggles.
    await clickAt(page, 550, 150, ['Shift']);
    expect(await selectedNames(page)).toEqual(['Rectangle 1']);
    await clickAt(page, 550, 150, ['Shift']);
    expect((await selectedNames(page)).sort()).toEqual(['Rectangle 1', 'Rectangle 2']);
    await page.keyboard.press('Escape');
    expect(await selectedNames(page)).toEqual([]);
    await clickAt(page, 550, 150);
    await page.keyboard.press('Delete');
    expect((await workspaceState(page)).layers.map((l) => l.name)).toEqual(['Rectangle 1']);
    expectNoErrors(errors);
  });
});

test.describe('artboard tool', () => {
  test('Shift+O: create, move with artwork, resize, rename, delete with confirm, undo', async ({ page }) => {
    const errors = await openWorkspace(page);
    const doc = () => page.evaluate(() => (window as any).samaEditor.store.getState().doc);
    await addRect(page, '#12a594', [100, 100], [300, 300]);
    await page.evaluate(() => (window as any).samaEditor.zoomTo(0.35));
    await page.keyboard.press('Shift+O');
    expect((await workspaceState(page)).tool).toBe('artboard');
    // Create beside the main artboard.
    await drag(page, [1200, 0], [1800, 600]);
    let boards = (await doc()).artboards;
    expect(boards).toHaveLength(1);
    expect(boards[0].name).toBe('Artboard 2');
    expect(Math.abs(boards[0].width - 600)).toBeLessThanOrEqual(3);
    // Artwork on it moves with it.
    await addRect(page, '#e5484d', [1300, 100], [1400, 200]);
    await page.keyboard.press('Shift+O');
    const x0 = boards[0].x;
    await drag(page, [1500, 400], [1600, 450]);
    boards = (await doc()).artboards;
    expect(Math.abs(boards[0].x - x0 - 100)).toBeLessThanOrEqual(3);
    const lefts = await page.evaluate(() => (window as any).samaEditor.canvas.getObjects().map((o: any) => Math.round(o.left)));
    expect(Math.abs(lefts[0] - 200)).toBeLessThanOrEqual(1); // main artboard's rectangle stays
    expect(Math.abs(lefts[1] - 1450)).toBeLessThanOrEqual(4);
    // Resize by the right border (artwork stays).
    const right = boards[0].x + boards[0].width;
    await drag(page, [right, 300], [right + 100, 300]);
    boards = (await doc()).artboards;
    expect(Math.abs(boards[0].width - 700)).toBeLessThanOrEqual(4);
    expect((await workspaceState(page)).history.labels.slice(-3)).toEqual(['Rectangle', 'Move artboard', 'Resize artboard']);
    // Rename by double-clicking the label.
    const lbl = await page.evaluate((a) => {
      const ed = (window as any).samaEditor;
      const b = ed.artboardLabelBox(a);
      const r = ed.canvas.upperCanvasEl.getBoundingClientRect();
      return { x: r.left + b.x + 5, y: r.top + b.y + b.h / 2 };
    }, boards[0]);
    await page.mouse.dblclick(lbl.x, lbl.y);
    const input = page.getByTestId('artboard-rename');
    await expect(input).toBeFocused();
    await input.fill('Story');
    await input.press('Enter');
    expect((await doc()).artboards[0].name).toBe('Story');
    // Delete asks first because there is artwork on it.
    let asked = '';
    page.once('dialog', async (d) => {
      asked = d.message();
      await d.accept();
    });
    await clickAt(page, boards[0].x + 400, boards[0].y + 500);
    await page.keyboard.press('Delete');
    expect(asked).toContain('Story');
    expect((await doc()).artboards).toBeUndefined();
    expect((await workspaceState(page)).layers).toHaveLength(1);
    await page.keyboard.press('Control+z');
    await settle(page);
    expect((await doc()).artboards[0].name).toBe('Story');
    expect((await workspaceState(page)).layers).toHaveLength(2);
    // Exported with the document.
    const exported = await page.evaluate(async () => (await (window as any).samaEditor.getDocument()).document.artboards);
    expect(exported[0].name).toBe('Story');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => (window as any).samaEditor.store.getState().selectedArtboardId)).toBeNull();
    expectNoErrors(errors);
  });
});

test.describe('marquee tools', () => {
  test('Shift+M rectangular: drag, Shift square, Alt from centre, Shift-start adds, click and Esc clear', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('Shift+M');
    expect((await workspaceState(page)).tool).toBe('rectMarquee');
    await drag(page, [100, 100], [300, 250]);
    let r = (await region(page))!;
    expect(Math.abs(r.width - 200)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.height - 150)).toBeLessThanOrEqual(2);
    await expect(page.getByTestId('region-size')).toContainText('×');
    // A new drag replaces…
    await drag(page, [500, 500], [600, 600]);
    expect(await regionHas(page, 150, 150)).toBe(false);
    // …unless Shift is held at the start.
    await page.keyboard.down('Shift');
    await drag(page, [100, 100], [200, 180]);
    await page.keyboard.up('Shift');
    expect(await regionHas(page, 150, 150)).toBe(true);
    expect(await regionHas(page, 550, 550)).toBe(true);
    // Shift during the drag: square.
    await page.keyboard.press('Escape');
    expect(await region(page)).toBeNull();
    const a = await toPage(page, 100, 100);
    const b = await toPage(page, 400, 200);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 20, a.y + 20);
    await page.keyboard.down('Shift');
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    r = (await region(page))!;
    expect(r.width).toBe(r.height);
    // Alt: from the centre.
    const c = await toPage(page, 540, 540);
    const d = await toPage(page, 600, 580);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.keyboard.down('Alt');
    await page.mouse.move(d.x, d.y, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    r = (await region(page))!;
    expect(Math.abs(r.x + r.width / 2 - 540)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.width - 120)).toBeLessThanOrEqual(3);
    // A plain click deselects.
    await clickAt(page, 900, 900);
    expect(await region(page)).toBeNull();
    // Marching ants are drawn on their own layer.
    await drag(page, [100, 100], [300, 250]);
    const antPixels = await page.evaluate(() => {
      const c = document.querySelector('[data-testid=selection-ants]') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
      return n;
    });
    expect(antPixels).toBeGreaterThan(400);
    expectNoErrors(errors);
  });

  test('elliptical marquee (Shift+M again) and the options shape switch', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('Shift+M');
    await page.keyboard.press('Shift+M');
    expect((await workspaceState(page)).tool).toBe('ellipseMarquee');
    await drag(page, [100, 100], [300, 200]);
    const px = await regionPixels(page);
    expect(Math.abs(px - Math.PI * 100 * 50) / (Math.PI * 100 * 50)).toBeLessThan(0.05);
    expect(await regionHas(page, 105, 105)).toBe(false); // corner outside the ellipse
    expect(await regionHas(page, 200, 150)).toBe(true);
    await page.keyboard.press('Shift+M');
    expect((await workspaceState(page)).tool).toBe('rectMarquee');
    await page.locator('[data-marquee=ellipseMarquee]').click();
    expect((await workspaceState(page)).tool).toBe('ellipseMarquee');
    expectNoErrors(errors);
  });

  test('single row/column marquee: 1px across the artboard, Shift adds, Esc clears', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('Shift+M');
    await page.locator('.sw-options [aria-label="Single Row"]').click();
    expect((await workspaceState(page)).tool).toBe('singleRowColumnMarquee');
    await clickAt(page, 400, 321.5);
    let r = (await region(page))!;
    expect(r).toMatchObject({ x: 0, width: 1080, height: 1 });
    await page.locator('.sw-options [aria-label="Single Column"]').click();
    await clickAt(page, 250.5, 400, ['Shift']);
    r = (await region(page))!;
    expect(r).toMatchObject({ x: 0, y: 0, width: 1080, height: 1080 });
    expect(await regionPixels(page)).toBe(1080 + 1080 - 1);
    await page.keyboard.press('Escape');
    expect(await region(page)).toBeNull();
    expectNoErrors(errors);
  });

  test('region selections: Delete shows a notice, Invert, persist across tools; no canvas cropping here', async ({ page }) => {
    const errors = await openWorkspace(page);
    await addRect(page, '#e5484d', [100, 100], [300, 300]);
    await page.keyboard.press('Shift+M');
    await drag(page, [50, 50], [450, 350]);
    await page.keyboard.press('Delete');
    expect(await page.evaluate(() => (window as any).samaEditor.store.getState().toast?.message)).toBe('toast.regionDeleteUnsupported');
    expect((await workspaceState(page)).layers).toHaveLength(1);
    await page.keyboard.press('b');
    expect(await region(page)).not.toBeNull();
    await page.keyboard.press('Shift+M');
    await page.getByRole('button', { name: 'Invert' }).click();
    expect(await regionHas(page, 10, 10)).toBe(true);
    await page.getByRole('button', { name: 'Invert' }).click();
    expect(await regionHas(page, 10, 10)).toBe(false);
    // Selection tools don't resize the canvas: that's the Crop tool's job.
    await expect(page.locator('.sw-options').getByRole('button', { name: /crop/i })).toHaveCount(0);
    await page.getByRole('button', { name: 'Deselect' }).click();
    expect(await region(page)).toBeNull();
    expectNoErrors(errors);
  });
});

test.describe('lasso tools', () => {
  test('Q lasso: freehand, auto-closes, Shift adds, Esc cancels mid-drag', async ({ page }) => {
    const errors = await openWorkspace(page);
    const trace = async (pts: [number, number][], shift = false) => {
      const P = [];
      for (const p of pts) P.push(await toPage(page, ...p));
      if (shift) await page.keyboard.down('Shift');
      await page.mouse.move(P[0].x, P[0].y);
      await page.mouse.down();
      if (shift) await page.keyboard.up('Shift');
      for (let i = 1; i < P.length; i++) await page.mouse.move(P[i].x, P[i].y, { steps: 10 });
      return async () => {
        await page.mouse.up();
        await page.waitForTimeout(80);
      };
    };
    await page.keyboard.press('q');
    expect((await workspaceState(page)).tool).toBe('lasso');
    await (await trace([[100, 100], [400, 100], [400, 400], [100, 400]]))();
    expect(await regionHas(page, 250, 250)).toBe(true);
    expect(await regionHas(page, 500, 500)).toBe(false);
    await (await trace([[600, 600], [800, 600], [800, 800]], true))();
    expect(await regionHas(page, 250, 250)).toBe(true);
    expect(await regionHas(page, 760, 640)).toBe(true);
    const release = await trace([[100, 700], [300, 700], [300, 900]]);
    await page.keyboard.press('Escape');
    await release();
    expect(await regionHas(page, 250, 250)).toBe(true); // unchanged
    expect(await regionHas(page, 280, 750)).toBe(false);
    expectNoErrors(errors);
  });

  test('Shift+L polygonal lasso: points, Backspace, close on first point, Enter, Esc', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.keyboard.press('Shift+L');
    expect((await workspaceState(page)).tool).toBe('polygonalLasso');
    await clickAt(page, 100, 100);
    await clickAt(page, 400, 100);
    await clickAt(page, 400, 400);
    await clickAt(page, 700, 700); // mistake
    await page.keyboard.press('Backspace');
    await clickAt(page, 100, 400);
    expect(await region(page)).toBeNull(); // still open
    await clickAt(page, 101, 101); // first point closes
    expect(await regionHas(page, 250, 250)).toBe(true);
    expect(await regionHas(page, 600, 600)).toBe(false);
    await clickAt(page, 600, 100);
    await clickAt(page, 900, 100);
    await clickAt(page, 750, 300);
    await page.keyboard.press('Enter');
    expect(await regionHas(page, 750, 150)).toBe(true);
    expect(await regionHas(page, 250, 250)).toBe(false); // replaced
    await clickAt(page, 100, 700);
    await clickAt(page, 300, 700);
    await page.keyboard.press('Escape');
    expect(await regionHas(page, 750, 150)).toBe(true); // cancelled, old selection kept
    expectNoErrors(errors);
  });

  test('Alt+Shift+L magnetic lasso snaps to the edges of the artwork', async ({ page }) => {
    const errors = await openWorkspace(page);
    await addRect(page, '#1f1f24', [200, 200], [500, 500]);
    await page.keyboard.press('Alt+Shift+L');
    expect((await workspaceState(page)).tool).toBe('magneticLasso');
    await clickAt(page, 205, 195);
    // Wobble around the square, never exactly on its edge.
    for (const p of [[350, 190], [506, 206], [510, 350], [494, 506], [350, 510], [194, 494], [190, 350], [200, 230]] as [number, number][]) {
      const q = await toPage(page, ...p);
      await page.mouse.move(q.x, q.y, { steps: 12 });
      await page.waitForTimeout(40);
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const r = (await region(page))!;
    expect(Math.abs(r.x - 200)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.y - 200)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.width - 300)).toBeLessThanOrEqual(3);
    expect(Math.abs((await regionPixels(page)) - 90000)).toBeLessThan(2500);
    // Backspace removes anchors; Esc cancels.
    await clickAt(page, 700, 700);
    const q = await toPage(page, 800, 700);
    await page.mouse.move(q.x, q.y, { steps: 5 });
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    expect(Math.abs((await regionPixels(page)) - 90000)).toBeLessThan(2500);
    expectNoErrors(errors);
  });
});

test.describe('object-based selection tools', () => {
  test('W object selection: click, box (mostly inside), Shift adds, Esc', async ({ page }) => {
    const errors = await openWorkspace(page);
    await addRect(page, '#e5484d', [100, 100], [200, 200]);
    await addRect(page, '#e5484d', [200, 100], [300, 200]);
    await addRect(page, '#3e63dd', [600, 100], [700, 200]);
    await page.keyboard.press('w');
    expect((await workspaceState(page)).tool).toBe('objectSelection');
    await clickAt(page, 150, 150);
    expect(await selectedNames(page)).toEqual(['Rectangle 1']);
    await clickAt(page, 650, 150, ['Shift']);
    expect(await selectedNames(page)).toEqual(['Rectangle 1', 'Rectangle 3']);
    // Box covers all of 1, 60% of 2 and none of 3.
    await drag(page, [80, 80], [260, 220]);
    expect(await selectedNames(page)).toEqual(['Rectangle 1', 'Rectangle 2']);
    // 20% of 2 isn't enough.
    await drag(page, [80, 80], [220, 220]);
    expect(await selectedNames(page)).toEqual(['Rectangle 1']);
    await page.keyboard.press('Escape');
    expect(await selectedNames(page)).toEqual([]);
    expectNoErrors(errors);
  });

  test('Shift+W quick selection paints similar colours; Alt removes; Esc clears', async ({ page }) => {
    const errors = await openWorkspace(page);
    await addRect(page, '#e5484d', [200, 200], [500, 500]);
    await page.keyboard.press('Shift+W');
    expect((await workspaceState(page)).tool).toBe('quickSelection');
    await drag(page, [300, 300], [330, 310]);
    const r = (await region(page))!;
    // Grew from the brush to the whole red square, and stopped at its edge.
    expect(Math.abs(r.x - 200)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.width - 300)).toBeLessThanOrEqual(3);
    // Painting on the white background adds it too.
    await drag(page, [700, 700], [705, 705]);
    expect(await regionHas(page, 50, 50)).toBe(true);
    // Alt+paint on the square removes it.
    await page.keyboard.down('Alt');
    await drag(page, [350, 350], [352, 352]);
    await page.keyboard.up('Alt');
    expect(await regionHas(page, 350, 350)).toBe(false);
    expect(await regionHas(page, 50, 50)).toBe(true);
    await page.keyboard.press(']');
    expect(await page.evaluate(() => (window as any).samaEditor.store.getState().toolOptions.quickSelection.size)).toBe(29);
    await page.keyboard.press('Escape');
    expect(await region(page)).toBeNull();
    expectNoErrors(errors);
  });

  test('Y magic wand: tolerance, contiguous toggle, Shift adds, Esc', async ({ page }) => {
    const errors = await openWorkspace(page);
    await addRect(page, '#ff0000', [100, 100], [200, 200]); // 1
    await addRect(page, '#ff1010', [200, 100], [300, 200]); // 2 touches 1, similar
    await addRect(page, '#f01818', [600, 100], [700, 200]); // 3 far, similar
    await addRect(page, '#0000ff', [100, 400], [200, 500]); // 4 blue
    await page.keyboard.press('y');
    expect((await workspaceState(page)).tool).toBe('magicWand');
    const opts = await page.evaluate(() => (window as any).samaEditor.store.getState().toolOptions.magicWand);
    expect(opts).toEqual({ tolerance: 32, contiguous: true });
    await clickAt(page, 150, 150);
    expect(await selectedNames(page)).toEqual(['Rectangle 1', 'Rectangle 2']);
    await page.getByTestId('magic-wand-contiguous').uncheck();
    await clickAt(page, 150, 150);
    expect(await selectedNames(page)).toEqual(['Rectangle 1', 'Rectangle 2', 'Rectangle 3']);
    await page.evaluate(() => (window as any).samaEditor.updateToolOptions('magicWand', { tolerance: 0 }));
    await clickAt(page, 150, 150);
    expect(await selectedNames(page)).toEqual(['Rectangle 1']);
    await clickAt(page, 150, 450, ['Shift']);
    expect(await selectedNames(page)).toEqual(['Rectangle 1', 'Rectangle 4']);
    await page.keyboard.press('Escape');
    expect(await selectedNames(page)).toEqual([]);
    expectNoErrors(errors);
  });

  test('Shift+V group selection climbs the group hierarchy; drag moves the item', async ({ page }) => {
    const errors = await openWorkspace(page);
    await addRect(page, '#e5484d', [100, 100], [200, 200]);
    await addRect(page, '#3e63dd', [200, 100], [300, 200]);
    await addRect(page, '#12a594', [100, 300], [200, 400]);
    await page.evaluate(() => {
      const ed = (window as any).samaEditor;
      const ids = (names: string[]) => ed.store.getState().layers.filter((l: any) => names.includes(l.name)).map((l: any) => l.id);
      ed.selectByIds(ids(['Rectangle 1', 'Rectangle 2']));
      ed.groupSelection();
      ed.selectByIds(ids(['Group 1', 'Rectangle 3']));
      ed.groupSelection();
      ed.clearSelection();
    });
    await page.keyboard.press('Shift+V');
    expect((await workspaceState(page)).tool).toBe('groupSelection');
    await clickAt(page, 150, 150);
    expect(await selectedNames(page)).toEqual(['Rectangle 1']);
    await clickAt(page, 150, 150);
    expect(await selectedNames(page)).toEqual(['Group 1']);
    await clickAt(page, 150, 150);
    expect(await selectedNames(page)).toEqual(['Group 2']);
    await clickAt(page, 150, 150);
    expect(await selectedNames(page)).toEqual(['Group 2']);
    await clickAt(page, 250, 150);
    expect(await selectedNames(page)).toEqual(['Group 2']); // still inside the selected group
    await page.keyboard.press('Escape');
    await clickAt(page, 250, 150);
    expect(await selectedNames(page)).toEqual(['Rectangle 2']);
    await drag(page, [250, 150], [250, 650]);
    const moved = await page.evaluate(() => {
      const o = (window as any).samaEditor.getSelectedObjects()[0];
      o.setCoords();
      return { name: o.samaName, top: o.getBoundingRect().top, parent: o.parent?.samaName };
    });
    expect(moved.name).toBe('Rectangle 2');
    expect(moved.parent).toBe('Group 1');
    expect(moved.top).toBeGreaterThan(550);
    expect((await workspaceState(page)).history.labels.at(-1)).toBe('Move');
    await page.keyboard.press('Escape');
    expect(await selectedNames(page)).toEqual([]);
    expectNoErrors(errors);
  });
});

test.describe('toolbar layout', () => {
  test('Crop follows the selection tools; marquee and lasso pop-out groups; shortcuts unchanged', async ({ page }) => {
    const errors = await openWorkspace(page);
    const groups = await page.evaluate(() =>
      [...document.querySelectorAll('.sw-toolbar__group')].map((g) =>
        [...g.querySelectorAll('button[data-tool]')].map((b) => (b as HTMLElement).dataset.toolGroup ?? (b as HTMLElement).dataset.tool),
      ),
    );
    expect(groups.slice(0, 3)).toEqual([
      ['select', 'direct', 'groupSelection', 'artboard'],
      ['marquee', 'lasso', 'objectSelection', 'quickSelection', 'magicWand'],
      ['crop', 'perspectiveCrop'],
    ]);
    // Variants are not separate buttons any more.
    for (const id of ['ellipseMarquee', 'singleRowColumnMarquee', 'polygonalLasso', 'magneticLasso']) {
      await expect(page.locator(`.sw-toolbar [data-tool=${id}]`)).toHaveCount(0);
    }
    const tool = async () => (await workspaceState(page)).tool;
    const marquee = page.locator('.sw-toolbar [data-tool-group=marquee]');
    const lasso = page.locator('.sw-toolbar [data-tool-group=lasso]');
    // Click selects the face; holding opens the list without selecting.
    await marquee.click();
    expect(await tool()).toBe('rectMarquee');
    await page.keyboard.press('v');
    const box = (await marquee.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();
    await expect(page.getByTestId('tool-flyout-marquee')).toBeVisible();
    expect(await tool()).toBe('select');
    await page.getByTestId('tool-flyout-marquee').locator('[data-tool=ellipseMarquee]').click();
    expect(await tool()).toBe('ellipseMarquee');
    await expect(marquee).toHaveAttribute('data-tool', 'ellipseMarquee');
    await expect(page.getByTestId('tool-flyout-marquee')).toBeHidden();
    // Right-click opens it too; Escape closes it.
    await lasso.click({ button: 'right' });
    await expect(page.getByTestId('tool-flyout-lasso')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tool-flyout-lasso')).toBeHidden();
    // Shortcuts work as before and update the button faces.
    await page.keyboard.press('Shift+M');
    expect(await tool()).toBe('rectMarquee');
    await page.keyboard.press('Shift+M');
    expect(await tool()).toBe('ellipseMarquee');
    await page.keyboard.press('Shift+L');
    expect(await tool()).toBe('polygonalLasso');
    await expect(lasso).toHaveAttribute('data-tool', 'polygonalLasso');
    await page.keyboard.press('Alt+Shift+L');
    expect(await tool()).toBe('magneticLasso');
    await page.keyboard.press('q');
    expect(await tool()).toBe('lasso');
    await page.keyboard.press('c');
    expect(await tool()).toBe('crop');
    // The Crop button works from its new place.
    await page.keyboard.press('v');
    await page.locator('.sw-toolbar [data-tool=crop]').click();
    expect(await tool()).toBe('crop');
    expectNoErrors(errors);
  });
});

// ---------------------------------------------------------------------------
// Cut / Copy to New Layer and selection refinement

async function horseWithBodySelected(page: import('@playwright/test').Page) {
  await page.evaluate(() => (window as any).samaEditor.newDocument({ width: 900, height: 900, background: null }));
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 900;
    const x = c.getContext('2d')!;
    x.fillStyle = '#5f8f3a';
    x.fillRect(0, 0, 900, 900);
    x.fillStyle = '#8b5a2b';
    x.beginPath();
    x.ellipse(450, 480, 250, 100, 0, 0, Math.PI * 2);
    x.fill();
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.setInputFiles('[data-testid=image-input]', { name: 'horse.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  await page.waitForTimeout(500);
  await page.evaluate(() => (window as any).samaEditor.clearSelection());
  const T = await page.evaluate(() => {
    const o = (window as any).samaEditor.canvas.getObjects()[0];
    o.setCoords();
    const r = o.getBoundingRect();
    return { x: r.left, y: r.top, s: r.width / 900 };
  });
  await page.keyboard.press('Shift+W');
  await drag(page, [T.x + 350 * T.s, T.y + 480 * T.s], [T.x + 550 * T.s, T.y + 480 * T.s]);
  await page.evaluate(() => ((window as any).__mask = (window as any).samaEditor.pixelSelection.getMask()));
  return T;
}

/** Per layer: its own pixels inside/outside the selection that existed before the operation. */
const layerStats = (page: import('@playwright/test').Page, T: { x: number; y: number; s: number }) =>
  page.evaluate((T) => {
    const w = window as any;
    return w.samaEditor.canvas.getObjects().map((img: any) => {
      const el = img.getElement();
      const c = document.createElement('canvas');
      c.width = el.naturalWidth || el.width;
      c.height = el.naturalHeight || el.height;
      const k = c.getContext('2d')!;
      k.drawImage(el, 0, 0);
      const d = k.getImageData(0, 0, c.width, c.height).data;
      const r = { name: img.samaName, inOpaque: 0, inClear: 0, outOpaque: 0, outClear: 0 };
      for (let y = 0; y < 900; y++)
        for (let x = 0; x < 900; x++) {
          const a = d[(y * 900 + x) * 4 + 3];
          const inside = w.__mask[Math.floor(T.y + (y + 0.5) * T.s) * 900 + Math.floor(T.x + (x + 0.5) * T.s)] >= 128;
          if (inside) a ? r.inOpaque++ : r.inClear++;
          else a ? r.outOpaque++ : r.outClear++;
        }
      return r;
    });
  }, T);

test.describe('cut / copy to new layer', () => {
  test('Ctrl+J copies the exact selected pixels to a new layer above; original intact; one undo', async ({ page }) => {
    const errors = await openWorkspace(page);
    const T = await horseWithBodySelected(page);
    await page.keyboard.press('Control+j');
    await expect.poll(async () => (await workspaceState(page)).history.labels.at(-1)).toBe('Copy to new layer');
    const [orig, copy] = await layerStats(page, T);
    expect(orig.name).toBe('horse');
    expect(copy.name).toBe('horse (copy)');
    expect(orig.inClear + orig.outClear).toBe(0); // untouched
    expect(copy.inOpaque).toBeGreaterThan(70000);
    expect(copy.inClear).toBe(0); // everything inside the selection
    expect(copy.outOpaque).toBe(0); // nothing outside it
    expect(await selectedNames(page)).toEqual(['horse (copy)']);
    expect(await region(page)).toBeNull();
    await page.keyboard.press('Control+z');
    await settle(page);
    expect((await workspaceState(page)).layers.map((l) => l.name)).toEqual(['horse']);
    expectNoErrors(errors);
  });

  test('Cut to New Layer (button) leaves an exact hole in the original; one undo restores it', async ({ page }) => {
    const errors = await openWorkspace(page);
    const T = await horseWithBodySelected(page);
    await page.getByRole('button', { name: 'Cut to New Layer' }).click();
    await expect.poll(async () => (await workspaceState(page)).history.labels.at(-1)).toBe('Cut to new layer');
    const [orig, cut] = await layerStats(page, T);
    expect(cut.name).toBe('horse (cut)');
    expect(orig.inOpaque).toBe(0); // the hole matches the selection exactly…
    expect(orig.outClear).toBe(0); // …and nothing else was removed
    expect(cut.inOpaque).toBe(orig.inClear);
    expect(cut.outOpaque).toBe(0);
    expect(await selectedNames(page)).toEqual(['horse (cut)']);
    const doc = await page.evaluate(() => (window as any).samaEditor.store.getState().doc);
    expect([doc.width, doc.height]).toEqual([900, 900]);
    await page.keyboard.press('Control+z');
    await settle(page);
    await page.waitForTimeout(300);
    const [restored] = await layerStats(page, T);
    expect((await workspaceState(page)).layers).toHaveLength(1);
    expect(restored.inClear + restored.outClear).toBe(0);
    expectNoErrors(errors);
  });

  test('vector layer selected: a notice, nothing created; Ctrl+J without a selection still duplicates', async ({ page }) => {
    const errors = await openWorkspace(page);
    await addRect(page, '#e5484d', [100, 100], [400, 400]);
    await page.keyboard.press('Shift+M');
    await drag(page, [150, 150], [300, 300]);
    await page.keyboard.press('Control+j');
    await expect.poll(() => page.evaluate(() => (window as any).samaEditor.store.getState().toast?.message)).toBe('toast.layerViaNeedsImage');
    expect((await workspaceState(page)).layers).toHaveLength(1);
    await page.keyboard.press('Escape'); // clear the area selection
    await page.keyboard.press('v');
    await clickAt(page, 200, 200);
    await page.keyboard.press('Control+j');
    await expect.poll(async () => (await workspaceState(page)).layers.length).toBe(2);
    expectNoErrors(errors);
  });
});

test.describe('selection refinement', () => {
  test('Expand, Contract, Smooth and Feather rewrite the shared selection (readout and bounds follow)', async ({ page }) => {
    const errors = await openWorkspace(page);
    await page.evaluate(() => {
      const ed = (window as any).samaEditor;
      ed.setTool('rectMarquee');
      ed.selectRegion({ type: 'rect', x: 100, y: 100, w: 300, h: 200 }, 'replace');
      ed.updateToolOptions('selectionRefine', { amount: 10, feather: 2 });
    });
    const bounds = () => page.evaluate(() => (window as any).samaEditor.pixelSelection.bounds());
    await page.getByRole('button', { name: 'Expand' }).click();
    expect(await bounds()).toEqual({ x: 90, y: 90, width: 320, height: 220 });
    await expect(page.getByTestId('region-size')).toHaveText('Selection: 320 × 220 px');
    await page.getByRole('button', { name: 'Contract' }).click();
    await page.getByRole('button', { name: 'Contract' }).click();
    expect(await bounds()).toEqual({ x: 110, y: 110, width: 280, height: 180 });
    await page.getByRole('button', { name: 'Smooth' }).click();
    expect(await bounds()).toEqual({ x: 110, y: 110, width: 280, height: 180 });
    await page.getByRole('button', { name: 'Feather' }).click();
    const soft = await page.evaluate(() => {
      const s = (window as any).samaEditor.pixelSelection;
      return Array.from(s.getMask() as Uint8Array).filter((v) => v > 0 && v < 255).length;
    });
    expect(soft).toBeGreaterThan(1000);
    // The bounds include the feathered edge, a little beyond the 50 % line.
    const feathered = (await bounds())!;
    expect(feathered.width).toBeGreaterThan(280);
    expect(feathered.width).toBeLessThan(295);
    expectNoErrors(errors);
  });
});
