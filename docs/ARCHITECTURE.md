# Sama Design Workspace — Architecture

This document explains how the workspace is put together and why, in plain
language first, with technical detail after each explanation.

---

## 1. The big picture

Think of the workspace as three layers stacked on top of each other:

```
┌──────────────────────────────────────────────────────────────┐
│  React interface  (src/ui, src/workspace)                    │
│  Toolbar · Options bar · Properties · Layers · History · Menus│
│        │ reads state                    ▲ calls commands      │
│        ▼                                │                     │
│  Workspace store  (src/store)  ◄──── publishes ────┐          │
│  "What should the screen show right now?"          │          │
│                                                    │          │
│  Editor core  (src/editor)  ───────────────────────┘          │
│  "The drawing and everything you can do to it"               │
│  Tools · Layers · Undo/redo · Import/export · Zoom/pan        │
│        │ owns                                                 │
│        ▼                                                      │
│  Fabric.js canvas  — draws the pixels and handles the mouse   │
└──────────────────────────────────────────────────────────────┘
```

- **The Editor core** is the "engine". It owns the Fabric.js canvas and knows
  how to do every operation: draw a shape, group layers, undo, export. It has
  no idea React exists. That makes it testable on its own and reusable (for
  example, the platform could later use it on a server to re-render a
  learner's submission).
- **The store** is a small, fast notice board. After every change the Editor
  pins up a fresh summary: which tool is active, the list of layers, what is
  selected, whether undo is possible. It holds *copies for display*, never the
  drawing itself.
- **The React interface** reads from the notice board and, when you click a
  button, calls a command on the Editor (e.g. `editor.groupSelection()`).

This one-way loop (UI → Editor → canvas → store → UI) is what keeps a
canvas-heavy app predictable: there is exactly one place where the drawing
lives (the Fabric canvas) and exactly one place that changes it (the Editor).

## 2. Key decisions

### Canvas engine: Fabric.js 7 (kept, as recommended by the brief)

Fabric already handles selection handles, rotation, grouping, text editing
(including right-to-left text), free drawing and serialization to JSON. The
things it lacks we built on top of it:

| Gap in Fabric                       | What we built                                   |
| ----------------------------------- | ----------------------------------------------- |
| Pen tool (click/drag Bézier anchors)| `tools/PenTool.ts`                              |
| Illustrator-like anchor editing     | `pathEditing.ts` (handles move with anchors, smooth/corner toggle, closed paths stay closed) |
| Soft brushes ("hardness")           | `objects/BrushStroke.ts` (vector stroke + blur) |
| Photoshop-style paint layers        | `objects/PaintLayer.ts`                         |
| Non-destructive eraser              | `@erase2d/fabric` (written by a Fabric maintainer) |
| Artboard, rulers, guides, snapping  | `SamaCanvas.ts`, `ui/Rulers.tsx`, `snapping.ts` |

We did not find a limitation that would justify switching to Konva. Konva's
strengths (a scene graph with layers of separate `<canvas>` elements, good
performance for many animated nodes) matter less here than Fabric's built-in
editing features — we would have had to re-implement selection handles, text
editing and SVG-style path handling on Konva.

We use **Fabric 7** (the current major version). Its default object origin is
the centre; all our geometry code works through Fabric's own helpers
(`getBoundingRect`, `setPositionByOrigin`) so this is transparent.

### State management: Zustand for the UI + the Fabric canvas as the source of truth

- The drawing itself lives in Fabric objects, not in React state. Copying a
  whole drawing into React on every mouse move would be slow and would create
  two sources of truth that can disagree.
- The UI state lives in a **Zustand** store. Components subscribe to small
  slices (`useWorkspace(s => s.activeTool)`), so dragging an object only
  re-renders the X/Y fields, not the whole interface. Zustand was preferred over
  React Context + reducers because Context re-renders every consumer on every
  change, which becomes noticeable at 60 updates per second.
- **One store per workspace** (no global singleton): two workspaces can live on
  one page, and the platform can mount/unmount the component freely.

### Undo/redo: snapshots with structural sharing

After each user action ("commit") the Editor records the serialized form of
every top-level layer. Layers that did not change reuse the exact same string
from the previous step, so 100 steps of editing one small shape in a document
with a large image cost almost nothing extra. Images are stored as short
`blob:` URLs, never as pixel data.

Undo restores a snapshot by **reconciling**: layers whose serialized form is
unchanged are kept as-is; only changed layers are re-created. This keeps undo
fast even for documents with many images.

We chose snapshots over a "command" pattern (recording the inverse of each
operation) because it is far less error-prone: every operation, including
ones added later, is automatically undoable as long as it calls `commit()`.
The history holds up to 100 steps (`DEFAULT_HISTORY_LIMIT`).

### Layers model

- Every top-level object is a layer (like Figma/Photoshop). Groups are layers
  that contain layers, shown as a tree.
- Brush strokes are collected into **paint layers**: painting while a paint
  layer is selected adds to it, otherwise a new one is created above the
  current selection — the Photoshop mental model. Each stroke stays an
  individual vector path inside, which preserves what the learner actually
  drew for the later AI evaluation.
- Metadata stored on each object (`samaId`, `samaName`, `samaKind`,
  `samaLocked`, …) survives undo, export and reload.

### Eraser

Follows Illustrator's rule: erase the selected layers if any are selected,
otherwise every visible, unlocked layer under the cursor. Erasing is
non-destructive (a clip mask on the layer), so it is undoable and exported
accurately. Text layers are not erasable, matching Photoshop's rule for type
layers (they would stop being editable text).

### Selections: objects vs. regions

Two kinds of selection coexist, as in Photoshop:

- **Object selection** — which *layers* are selected (Fabric's active
  object). Used by the Selection, Direct Selection, Group Selection, Object
  Selection and Magic Wand tools, the layers panel and every layer command.
- **Region selection** — an *area* of the main artboard, made by the marquee
  and lasso tools and Quick Selection (`Tool.selectsRegion`). It lives in
  `Editor.pixelSelection` (`pixelSelection.ts`): a one-byte-per-pixel mask,
  so shapes combine exactly (add/subtract/invert) and the outline is traced
  from the mask into closed contours. The animated marching ants are drawn on
  their own small canvas (`SelectionAnts.ts`) so animating them never
  re-renders the artwork. Quick Selection and the Magnetic Lasso analyse a
  clean render of the artboard (`scenePixels.ts`); the lasso's edge-following
  path is a Dijkstra "live wire" over a Sobel edge map (`edgeTrace.ts`).

### Artboards

The document's main artboard sits at scene `(0,0)` and is described by
`DocumentSettings` (`name`, `width`, `height`). Extra artboards made with
the Artboard tool are stored in `DocumentSettings.artboards` (positions
relative to the main one), so undo/redo and the JSON export cover them with
no extra machinery. A layer belongs to the artboard containing its centre.
If the main artboard is moved or its left/top edge dragged,
`Editor.applyArtboards` shifts the rest of the scene the other way and pans
the view, so it stays at the origin and nothing jumps on screen.

### Coordinates

The main artboard is the scene's origin: `(0,0)`–`(width,height)` in document
pixels. Zoom and pan are Fabric's `viewportTransform`. Everything the
properties panel and the export show is in artboard pixels.

### Styling

Plain CSS with design tokens (CSS custom properties), all scoped under
`.sw-root` with an `sw-` prefix so nothing leaks into the host platform. No CSS
framework: a design tool's dense, pixel-precise UI is easier to control by
hand, and it avoids a styling dependency the platform might not share.

### Right-to-left and Arabic

- Interface: English or Arabic via the `locale` prop. Arabic flips the whole
  layout (toolbar on the right, panels on the left) using CSS logical
  properties; the canvas and rulers stay left-to-right because they are a
  coordinate space.
- Text on canvas: each text layer has an explicit direction (LTR/RTL). In the
  Arabic interface new text defaults to RTL/right-aligned.
- Shortcuts use the **physical key** (`KeyboardEvent.code`), so `V`, `B`, `P`…
  work even when an Arabic keyboard layout is active.
- Arabic-capable fonts (Cairo, Tajawal, IBM Plex Sans Arabic, Noto Kufi Arabic,
  Amiri) are bundled locally so every learner sees identical rendering.

## 3. Source map

```
src/
  index.ts                    Public API for the platform (component + types)
  main.tsx                    Development page (full-screen workspace)
  workspace/
    SamaWorkspace.tsx         The embeddable component: creates Editor + store,
                              keyboard/paste handling, file actions, dialogs
    context.ts                React hooks: useWorkspace(), useEditor()
  store/workspaceStore.ts     Zustand store: UI state + defaults
  editor/                     Framework-free editor core
    Editor.ts                 The engine (sections: tools, events, viewport,
                              rendering, selection, layers, clipboard, text,
                              document, history, serialization, keyboard)
    SamaCanvas.ts             Fabric canvas subclass (artboard, overlays, hooks)
    history.ts                Undo/redo stack (pure, unit-tested)
    serialization.ts          Structured JSON document + PNG rendering
    pathEditing.ts            Anchor/handle editing behaviour
    meta.ts                   Layer metadata, tree walking, lock state
    assets.ts                 Imported images (blobs ↔ data URLs)
    fonts.ts                  Bundled fonts + font loading
    snapping.ts, geometry.ts  Maths helpers (pure, unit-tested)
    pixelSelection.ts         Region selection mask, rasterizers, contours, flood fill
    edgeTrace.ts              Edge map + live-wire paths (Magnetic Lasso)
    artboards.ts              Artboard list helpers (main + extra artboards)
    scenePixels.ts            Clean render of the artboard to RGBA pixels
    SelectionAnts.ts          Marching-ants overlay canvas
    objects/                  BrushStroke, PaintLayer (custom Fabric classes)
    tools/                    One class per tool (Tool.ts is the base)
  ui/                         React components (toolbar, panels, dialogs, controls)
  i18n/                       English + Arabic strings
  styles/workspace.css        All workspace styles (design tokens at the top)
tests/
  unit/                       Vitest: history, snapping, colours, pen maths…
  e2e/                        Playwright: drives the real app in Chromium
```

## 4. How a tool works (example: rectangle)

1. Pressing `M` → `Editor.handleKeyDown` → `setTool('rect')`.
2. `applyToolMode()` configures Fabric for that tool (no click-selection,
   crosshair cursor, selection handles hidden).
3. Mouse down/move/up on the canvas → the Editor forwards the events to
   `ShapeTool`, which creates a `Rect`, resizes it while dragging (Shift =
   square, Alt = from centre) and on release calls `editor.commit('Rectangle')`.
4. `commit` records an undo step, rebuilds the layers tree and selection
   summary in the store, and fires the host's `onChange`.
5. React components subscribed to those slices re-render.

Adding a new tool means writing one class in `src/editor/tools`, registering
it in `Editor`'s constructor, and adding a toolbar entry in `ui/toolDefs.ts`.

## 5. Embedding in the Sama platform later

```tsx
import { SamaWorkspace, type SamaWorkspaceHandle } from './src';

const ref = useRef<SamaWorkspaceHandle>(null);

<SamaWorkspace
  ref={ref}
  locale="ar"
  documentSettings={{ name: 'Exercise 3 — Poster', width: 1080, height: 1350 }}
  initialDocument={savedDocumentOrUndefined}   // resume previous work
  onChange={() => scheduleAutosave()}           // e.g. save to Supabase
  onExport={async ({ png, document }) => {      // replace downloads with uploads
    await uploadSubmission(png, document);
    return false;                               // false = don't download
  }}
  topBarActions={<SubmitButton onClick={async () => {
    const doc = await ref.current!.getDocument();   // structured data for AI
    const png = await ref.current!.exportPng();     // flat image
    submitForEvaluation(doc, png);
  }} />}
/>
```

Nothing in the workspace talks to a network. Persistence, auth and AI
evaluation plug in through `onChange`, `onExport`, `getDocument()` and
`loadDocument()`.
