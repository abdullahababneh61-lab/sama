# Sama Design Workspace · مساحة تصميم سما

The in-platform design workspace for **Sama**, an Arabic-market interactive
design-training platform. Learners use it to complete design exercises; it
combines the core of a vector editor (Illustrator) and a raster/paint editor
(Photoshop) and exports both a PNG and a structured description of the design
for the later AI evaluation step.

- **Stack:** React 19 · TypeScript · Fabric.js 7 · Zustand · Vite
- **Scope:** desktop/laptop browsers, standalone component (no backend yet)
- **Languages:** English and Arabic (full right-to-left interface)

Documentation:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how it's built and why (plain language)
- [`docs/DOCUMENT_FORMAT.md`](docs/DOCUMENT_FORMAT.md) — the exported JSON, field by field

---

## Running it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev          # opens on http://localhost:5173
```

- Arabic interface: http://localhost:5173/?lang=ar
- Another artboard size: http://localhost:5173/?w=1080&h=1920

Other commands:

| Command              | What it does |
| -------------------- | ------------ |
| `npm run build`      | Type-checks and builds for production into `dist/` |
| `npm test`           | Unit tests (history, snapping, colour maths, pen maths…) |
| `npm run test:e2e`   | End-to-end tests that drive the real workspace in Chromium |
| `npm run typecheck`  | TypeScript check only |

(If Playwright's own browser isn't installed, point the e2e tests at an
existing Chromium: `CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.)

---

## What's included

### Tools

| Tool | Key | Notes |
| ---- | --- | ----- |
| Move / Select | `V` | Move, resize, rotate (Shift snaps rotation to 15°). Marquee-select. `Ctrl`/`⌘`+click selects inside groups. Double-click a group to go inside it. Alt+drag duplicates. |
| Direct Selection | `A` | Edit anchor points and Bézier handles of paths, lines and polygons. Handles move with their anchor; smooth points keep handles aligned (Alt breaks them). Double-click an anchor to switch corner ↔ smooth. |
| Brush | `B` | Size, colour, opacity, **hardness** (soft edges), smoothing. Shift = straight line. `[` / `]` resize. Strokes go into the selected paint layer (or a new one). |
| Eraser | `E` | Erases the selected layers, or everything unlocked under the cursor when nothing is selected. Non-destructive and undoable. |
| Pen | `P` | Click = corner, drag = curve, click first point = close, Enter/Esc = finish, Backspace = remove last point. |
| Text | `T` | Click = single line, drag = paragraph box. Font, weight, size, colour, alignment, italic, line height, letter spacing, LTR/RTL. |
| Rectangle / Ellipse / Line / Polygon | `M` / `L` / `\` / `U` cycles | Shift = square/circle/45°, Alt = from centre. Click without dragging = 100 × 100 px. Corner radius, polygon sides. |
| Crop | `C` | Drag a crop area (Shift = square, Alt = from centre), adjust it with the handles or drag inside to move it; the part to be removed is shaded. Enter crops (layers outside are deleted, layers crossing the edge are trimmed, the artboard takes the new size); Esc cancels. |
| Perspective Crop | `Shift+C` | Drag a starting rectangle, then drag each of the four corners on its own onto the edges of something seen at an angle (a photographed poster, a screen). Enter straightens that shape into a rectangle and crops to it; Esc cancels. Affected layers become image layers (see limitations). |
| Eyedropper | `I` | A swatch next to the pointer previews the colour under it. Click sets the fill colour of the shape tools, pen, text and brush; Alt+click sets the stroke colour of the shape tools and pen. Returns to the previous tool after a pick; Esc cancels. |
| Color Sampler | `O` | Click to place up to 4 numbered sample points; a floating panel shows each point's colour (swatch, hex, RGB) and updates as the artwork changes. Drag a point to move it, Alt+click to remove it, Esc to hide them (they're kept). Doesn't change the active colours. |
| Ruler | `R` | Drag to measure: a label shows the length (px) and angle from horizontal (counter-clockwise positive, as in Photoshop). Shift snaps to 45°; drag either end to adjust; Esc clears. The line is an on-screen measurement, not a layer. |
| Hand | `H` or hold `Space` | Pan. Scroll also pans; `Ctrl`/`⌘`+scroll zooms. |
| Zoom | `Z` | Click zooms in, Alt+click zooms out. |
| Image import | toolbar button, `Ctrl+Shift+I`, drag-and-drop, paste | PNG/JPEG/WebP/GIF/SVG (SVG is imported as an image). |

### Layers panel
Drag to reorder (drop onto the middle of a group to move into it) · show/hide ·
lock · double-click to rename · opacity · blend mode · group / ungroup ·
duplicate · delete · new paint layer · hovering a row outlines it on the
canvas.

### Everything else
- Undo/redo with a full history (100 steps) and a History panel to jump to any step.
- Properties panel: position, size (with ratio lock), rotation, opacity, blend,
  fill, stroke, corner radius, polygon sides, text settings, image size reset,
  convert shape to path, edit anchors. With nothing selected it edits the
  artboard size and background (transparent supported).
- Zoom in/out, fit to screen, 100%, zoom to selection.
- **Rulers, guides and snapping** (the optional item — implemented): drag from
  a ruler to add a guide, drag a guide back onto a ruler to delete it. Objects
  snap to the artboard edges/centre, guides and other layers.
- Align (to artboard for one layer, to each other for several), flip.
- Copy/cut/paste/duplicate, arrow-key nudging (Shift = 10 px).
- Export dialog: PNG at 1×/2×/3×, optional transparent background, plus the
  structured JSON document. `File ▸ Open` reopens a saved JSON with nothing lost.
- Arabic interface (right-to-left) with bundled Arabic fonts: Cairo, Tajawal,
  IBM Plex Sans Arabic, Noto Kufi Arabic, Amiri (plus Inter, Montserrat,
  Playfair Display and system fonts).

### Full keyboard shortcut list

Also available in the app: **Help ▸ Keyboard shortcuts** or press `?`.
(`Ctrl` = `⌘` on macOS. Shortcuts use the physical key, so they also work
with an Arabic keyboard layout.)

| Area | Shortcut | Action |
| ---- | -------- | ------ |
| Tools | `V` `A` `B` `E` `P` `T` `M` `L` `\` `C` `H` `Z` | Select, Direct selection, Brush, Eraser, Pen, Text, Rectangle, Ellipse, Line, Crop, Hand, Zoom |
| | `Shift+C` | Perspective Crop |
| | `I` | Eyedropper |
| | `O` | Color Sampler |
| | `R` | Ruler (`Ctrl+R` still toggles the rulers along the canvas edges) |
| | `U` | Cycle shape tools (rectangle → ellipse → line → polygon) |
| | hold `Space` | Temporary hand tool |
| Edit | `Ctrl+Z` / `Ctrl+Shift+Z` or `Ctrl+Y` | Undo / Redo |
| | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / Cut / Paste (images from the system clipboard too) |
| | `Ctrl+J` or `Ctrl+D` | Duplicate |
| | `Delete` / `Backspace` | Delete |
| | `Ctrl+A` / `Ctrl+Shift+A` or `Esc` | Select all / Deselect |
| | Arrows / `Shift`+Arrows | Nudge 1 px / 10 px |
| | `Enter` | Edit selected text, or its anchor points for paths |
| Objects | `Ctrl+G` / `Ctrl+Shift+G` | Group / Ungroup |
| | `Ctrl+]` / `Ctrl+[` | Bring forward / Send backward |
| | `Ctrl+Shift+]` / `Ctrl+Shift+[` | Bring to front / Send to back |
| Painting | `[` / `]` | Smaller / larger brush or eraser |
| View | `Ctrl+=` / `Ctrl+-` | Zoom in / out |
| | `Ctrl+0` / `Ctrl+1` / `Ctrl+2` | Fit / 100% / Zoom to selection |
| | `Ctrl+R` / `Ctrl+;` | Toggle rulers / guides |
| File | `Ctrl+O` / `Ctrl+S` | Open / Save document (.json) |
| | `Ctrl+Shift+I` / `Ctrl+Shift+E` | Import image / Export |
| Help | `?` | Keyboard shortcuts |

---

## What to test (manual checklist)

1. **Canvas shell** — the artboard fits the window; scroll pans; `Ctrl`+scroll
   zooms around the pointer; `Ctrl+0` fits; resizing the browser keeps the view.
2. **Shapes & selection** — draw each shape (try Shift and Alt); select, move,
   resize from the corners, rotate from the top handle; Shift+drag constrains
   to an axis; objects snap to the artboard centre (pink line).
3. **Brush & eraser** — paint several strokes: they all land in "Paint 1".
   Lower the hardness for a soft brush. Erase across strokes, then undo.
   Select one layer and erase: only that layer is affected.
4. **Pen** — click-click-drag-click the first point; press `A` and drag
   anchors and handles; double-click an anchor to toggle smooth/corner.
5. **Text** — click and type; drag a box and type a paragraph; switch to
   `?lang=ar`, type Arabic; change font/weight/alignment in the right panel.
6. **Images** — drop a photo on the canvas; import via the toolbar button;
   paste a screenshot with `Ctrl+V`.
7. **Layers** — drag rows to reorder, into and out of groups; hide, lock
   (locked layers can't be clicked on the canvas), rename, change opacity and
   blend mode, duplicate, delete.
8. **Undo/redo** — do ten different things, undo them all, redo them all; use
   the History tab to jump.
9. **Export** — Export ▸ both files; open the PNG; `File ▸ New`, then
   `File ▸ Open` the `.sama.json`: the design comes back fully editable.

---

## Embedding in the platform

See [`docs/ARCHITECTURE.md` § 5](docs/ARCHITECTURE.md#5-embedding-in-the-sama-platform-later).
In short: `<SamaWorkspace locale documentSettings initialDocument onChange onExport topBarActions ref />`
and `ref.current.getDocument()` / `exportPng()` / `loadDocument()` / `newDocument()`.

---

## Known limitations (v1)

Flagged deliberately rather than left silent:

- **Text styling is per layer**, not per character (no mixing two colours in one text box).
- **Pen / anchor editing:** you can move anchors and handles and toggle
  smooth/corner, but not yet add or delete points on an existing path, continue
  an existing open path, or select several anchors at once.
- **Eraser and later edits:** the erase mask is stored in the layer's own
  coordinates. Moving, scaling or rotating an erased layer is fine, but
  editing the *anchor points* of an erased path afterwards can make the erased
  area shift. Text layers can't be erased (same rule as Photoshop).
- **Soft brushes** use the canvas blur filter. Browsers without it (older
  Safari) draw soft brushes with a hard edge. No pen-pressure support.
- **Perspective crop turns layers into images.** A perspective correction
  can't be applied to vector shapes or live text, so (as Photoshop does with
  pixels) each layer inside the crop is rendered, straightened and replaced by
  an image layer. Names, groups, visibility, lock, opacity and blend modes are
  kept, and the JSON export records each image's original type and text
  (`image.perspectiveCorrected`) — but those layers are no longer editable as
  text or vectors. Undo restores the originals. Guides are cleared.
- **Multi-selection** is limited to layers in the same group.
- **SVG files** are imported as images, not as editable vectors. Very large
  photos are kept at full resolution (scaled to fit), which uses memory.
- **Right-to-left point text** grows to the left of where you click (as in
  Photoshop). Caret placement inside mixed Arabic/Latin text can be imprecise
  (a Fabric.js limitation).
- **No autosave / persistence** (out of scope for this phase): refreshing the
  page loses unsaved work. The platform should save through `onChange` +
  `getDocument()`.
- Guides are view aids and are not part of undo (like Figma). Opening a
  document starts a new undo history.
- No layer thumbnails (icons show the layer type), no right-click context
  menu, no SVG/PDF export, fixed font list (no custom font upload).
- Tested in Chromium (Chrome/Edge). Firefox and Safari have not been verified yet.
- `src/editor/Editor.ts` is long (one class with clearly marked sections);
  splitting it into modules is a reasonable follow-up refactor.
