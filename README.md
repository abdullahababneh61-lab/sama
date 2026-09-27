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

The toolbar follows Photoshop's order: selection tools first, then Crop,
then painting, drawing and viewing tools. Tools that are variants of each
other share one button with a small corner triangle (a pop-out group): click
it to use the variant it shows, or **hold it / right-click it** to pick
another variant, which then becomes the button's face. The groups are the
Marquees (Rectangular, Elliptical, Single Row/Column) and the Lassos (Lasso,
Polygonal, Magnetic). Keyboard shortcuts select variants directly.

| Tool | Key | Notes |
| ---- | --- | ----- |
| Selection (Move / Select) | `V` | Click to select (8 resize handles + rotation), drag to move. Corner handles resize proportionally (hold Shift for free resizing); edge handles resize one dimension. Drag on empty space to marquee-select every object it touches; Shift+click adds/removes. Rotation snaps to 15° with Shift. `Ctrl`/`⌘`+click selects inside groups; double-click a group to go inside it. Alt+drag duplicates. Esc deselects, Delete removes. |
| Direct Selection | `A` | Edit anchor points and Bézier handles of paths, lines and polygons. Handles move with their anchor; smooth points keep handles aligned (Alt breaks them). Double-click an anchor to switch corner ↔ smooth. |
| Group Selection | `Shift+V` | First click selects the innermost layer inside a group; each further click on it selects the group one level up. Drag moves the selected item without ungrouping. Esc deselects. |
| Artboard | `Shift+O` | Artboards show with a border and their name. Drag on the empty pasteboard to add "Artboard N"; drag a border or handle to resize; drag inside to move an artboard together with its artwork; double-click the name to rename; Delete removes the artboard and its artwork (asks first). The first artboard is the main one — its name is the document name and it's what PNG export renders. |
| Rectangular Marquee | `Shift+M` | Drag to select an area (animated "marching ants"). Shift = square, Alt = from centre. A new drag replaces the selection; Shift held when starting adds to it. Click or Esc deselects. |
| *Selection actions* (options bar of every marquee/lasso/Quick Selection tool) | `Ctrl+J` / `Ctrl+Shift+J` | **Copy to New Layer** / **Cut to New Layer**: the pixels inside the selection's exact shape go to a new image layer right above the original (transparent elsewhere); Cut also leaves the matching hole in the original. The new layer is selected, the selection cleared, one undo step. Without a selection, `Ctrl+J` still duplicates. **Feather** (radius, default 2 px) softens the selection's edge, **Smooth** rounds off jaggies and specks, **Expand / Contract** (amount) grow or shrink it. Plus Invert and Deselect. (Selection tools never resize the canvas — use the Crop tool for that.) |
| Elliptical Marquee | `Shift+M` again | Same, for an elliptical area (Shift = circle). |
| Single Row/Column Marquee | marquee pop-out or options bar | Click to select one 1-px row across the artboard (or one column down it); pick Row/Column in the marquee options. Shift+click adds. |
| Lasso | `Q` | Drag to draw a freehand selection; it closes when you release. Shift when starting adds. Esc cancels. |
| Polygonal Lasso | `Shift+L` | Click to place points (a live segment follows the pointer; Shift = 45°). Click the first point, double-click or press Enter to close; Backspace removes the last point; Esc cancels. |
| Magnetic Lasso | `Alt+Shift+L` | Click once, then move along an edge: the outline clings to the strongest contrast edge nearby and places anchors automatically (click to add one). Close on the first point, double-click or Enter; Backspace removes an anchor; Esc cancels. |
| Object Selection | `W` | Click a layer to select it; drag a box to select the layers mostly inside it (≥ 50 % of their bounds). Shift adds. Esc deselects. |
| Quick Selection | `Shift+W` | Paint to select: the area under the round brush plus similar colours around it. Alt+paint removes. `[` / `]` resize. Esc deselects. |
| Magic Wand | `Y` | Click a layer to select every layer of a similar colour. Tolerance (0–255, default 32) and Contiguous (only layers touching it, on by default) in the options bar. Shift+click adds. Esc deselects. |
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
| Count | `N` | Click each item to count it: numbered markers (1, 2, 3…) with the running total in the options bar. Drag a marker to move it; Alt+click removes it and renumbers the rest; Esc hides the markers (they're kept); Clear all removes them. |
| Spot Healing Brush | `J` | Paint over a blemish in a photo; on release the area is rebuilt from the pixels around it with a soft edge. Size in the options bar, `[` / `]` to resize. Works on image layers only (see limitations). Esc cancels the stroke. |
| Healing Brush | `Shift+J` | Alt+click an image to set a source point, then paint over the area to fix: texture is copied from the source (offset as you move) and blended into the colour and lighting around the destination. Live preview while painting; shares the Spot Healing Brush's size. Esc clears the source. Image layers only. |
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
| Tools | `V` `A` `B` `E` `P` `T` `M` `L` `\` `C` `H` `Z` | Selection, Direct selection, Brush, Eraser, Pen, Text, Rectangle, Ellipse, Line, Crop, Hand, Zoom |
| | `Shift+V` | Group Selection |
| | `Shift+O` | Artboard |
| | `Shift+M` | Rectangular Marquee (press again: Elliptical Marquee) |
| | `Q` | Lasso |
| | `Shift+L` | Polygonal Lasso |
| | `Alt+Shift+L` | Magnetic Lasso |
| | `W` / `Shift+W` | Object Selection / Quick Selection |
| | `Y` | Magic Wand |
| | `Shift+C` | Perspective Crop |
| | `I` | Eyedropper |
| | `O` | Color Sampler |
| | `N` | Count |
| | `J` | Spot Healing Brush |
| | `Shift+J` | Healing Brush |
| | `R` | Ruler (`Ctrl+R` still toggles the rulers along the canvas edges) |
| | `U` | Cycle shape tools (rectangle → ellipse → line → polygon) |
| | hold `Space` | Temporary hand tool |
| Edit | `Ctrl+Z` / `Ctrl+Shift+Z` or `Ctrl+Y` | Undo / Redo |
| | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / Cut / Paste (images from the system clipboard too) |
| | `Ctrl+J` or `Ctrl+D` | Duplicate (`Ctrl+J` with an area selected: Copy to New Layer) |
| | `Ctrl+Shift+J` | Cut to New Layer (with an area selected) |
| | `Delete` / `Backspace` | Delete |
| | `Ctrl+A` / `Ctrl+Shift+A` or `Esc` | Select all / Deselect (with a marquee or lasso tool, `Ctrl+A` selects the whole artboard area) |
| | Arrows / `Shift`+Arrows | Nudge 1 px / 10 px |
| | `Enter` | Edit selected text, or its anchor points for paths |
| Objects | `Ctrl+G` / `Ctrl+Shift+G` | Group / Ungroup |
| | `Ctrl+]` / `Ctrl+[` | Bring forward / Send backward |
| | `Ctrl+Shift+]` / `Ctrl+Shift+[` | Bring to front / Send to back |
| Painting | `[` / `]` | Smaller / larger brush, eraser, healing or quick-selection brush |
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
- **Spot Healing and the Healing Brush work on image layers only.** Shapes, text, pen paths and
  brush strokes are vectors with no pixels to repair (rasterize-to-image is a
  possible follow-up). The repair is a smooth fill from the surrounding
  colours plus matching grain — good for spots, dust and small objects on
  even backgrounds; it doesn't rebuild detailed patterns the way Photoshop's
  content-aware fill does.
- **Region selections** (marquee, lasso, Quick Selection) are pixel masks with
  soft edges: Feather, Smooth, Expand and Contract refine them; Invert and
  **Cut / Copy to New Layer** use them. Cut/Copy to New
  Layer works on **image layers** only — shapes, text and brush strokes are
  vectors and would need rasterizing first (not built yet). Painting,
  erasing and Delete don't yet act inside a selection (Delete shows a
  notice). Region selections cover the main artboard only, aren't part of
  undo/redo, and aren't saved in the document.
- **Ctrl+Shift+J in Chrome, Edge and Brave (Windows/Linux)** opens the
  browser's developer console, which a web page can't prevent — use the
  "Cut to New Layer" button there. (On macOS the shortcut is ⌘⇧J and works.)
- **Artboards:** PNG export renders the main artboard only (all artboards are
  listed in the JSON export). Rulers, snapping, "fit to screen" and the crop
  tools refer to the main artboard; cropping removes the other artboards along
  with everything outside the crop.
- **Magic Wand and Object Selection work on layers**, not pixels: the wand
  compares each layer's solid fill (or stroke) colour; images, groups, paint
  layers and gradients have no single colour and are never matched.
  "Touching" is judged from bounding boxes. Object Selection doesn't detect
  subjects inside a photo (Photoshop's AI feature).
- **Very large artboards:** Quick Selection and the Magnetic Lasso analyse the
  rendered picture, which takes a moment on huge artboards (≈1 s per stroke at
  4000 × 3000). Above 4096 × 4096 px, region selections are stored at a
  slightly reduced resolution.
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
