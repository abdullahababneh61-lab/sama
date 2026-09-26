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
