# Sama design document format (`sama.design-document`, version 1)

Every export (and `SamaWorkspaceHandle.getDocument()`) produces one JSON
object. It is designed for two audiences:

1. **The workspace itself** — `fabric` holds the exact scene so a document can
   be reopened with nothing lost (`loadDocument()`).
2. **Anything that needs to understand the design without Fabric** — most
   importantly the later AI evaluation step. `layers` and `analysis` describe
   the design in plain terms: what each layer is, where it is, its colours,
   text, fonts and geometry.

All coordinates are **artboard pixels**: `(0, 0)` is the top-left corner of the
artboard, `x` grows to the right, `y` grows downwards.

## Top level

| Field        | Type                          | Meaning |
| ------------ | ----------------------------- | ------- |
| `format`     | `"sama.design-document"`      | Identifies the file type. |
| `version`    | `1`                           | Format version. Newer workspaces refuse to open files with a higher version. |
| `generator`  | string                        | e.g. `"sama-workspace@0.1.0"`. |
| `exportedAt` | ISO 8601 string               | When the document was produced. |
| `document`   | `{ name, width, height, background, units }` | Artboard. `background` is a CSS colour or `null` (transparent). `units` is always `"px"`. |
| `guides`     | `{ vertical: number[], horizontal: number[] }` | Guide positions (view aids). |
| `layers`     | `SemanticLayer[]`             | Layer tree, **top-most layer first** (same order as the Layers panel). |
| `analysis`   | `DocumentAnalysis`            | Pre-computed summary (see below). |
| `assets`     | `{ [assetId]: { mimeType, fileName, width, height, dataUrl } }` | Imported images, embedded once each. |
| `fabric`     | `{ version, objects }`        | Exact Fabric.js scene (bottom-most object first). Internal; may change between versions. |

## `SemanticLayer`

| Field             | Present for      | Meaning |
| ----------------- | ---------------- | ------- |
| `id`              | all              | Stable id; survives undo and reload. |
| `name`            | all              | Layer name as shown to the learner. Text layers are named after their content unless renamed. |
| `type`            | all              | `rect` · `ellipse` · `line` · `polygon` · `path` · `text` · `image` · `paint` · `group`. |
| `visible`, `locked` | all            | Layer state. Hidden layers are **not** in the PNG. |
| `opacity`         | all              | 0–1. |
| `blendMode`       | all              | Canvas composite operation (`source-over` = Normal, `multiply`, `screen`, …). |
| `bounds`          | all              | `{ x, y, width, height }` — axis-aligned box in artboard pixels (includes rotation and stroke). |
| `transform`       | all              | `{ width, height, rotation, flipX, flipY }` — unrotated size and rotation in degrees (clockwise). |
| `visibleFraction` | all              | Share of the layer's bounding box inside the artboard (0–1). |
| `erased`          | all              | `true` if part of the layer was removed with the eraser. |
| `style`           | shapes, paths, text | `{ fill, stroke, strokeWidth }`. Colours are CSS strings or `null` (none). |
| `shape`           | rect, polygon    | `{ cornerRadius }` / `{ sides }`. |
| `path`            | path, line, polygon | `{ d, closed, anchorCount }` — SVG path data **in artboard coordinates**. |
| `text`            | text             | `{ content, fontFamily, fontSize, fontWeight, fontStyle, textAlign, direction, lineHeight, letterSpacing, color, wrapped }`. `direction` is `ltr` or `rtl`; `wrapped` is `true` for paragraph boxes. `letterSpacing` is in 1/1000 em. |
| `image`           | image            | `{ assetId, fileName, naturalWidth, naturalHeight }`. |
| `paint`           | paint            | `{ strokeCount, colors, brushSizes, strokes[] }`; each stroke is `{ d, color, size, opacity, hardness, erased }` with `d` in artboard coordinates — the learner's actual gestures. |
| `children`        | group            | Nested layers, top-most first. |

## `DocumentAnalysis`

| Field                   | Meaning |
| ----------------------- | ------- |
| `layerCount`            | Total layers including nested ones. |
| `layerCountByType`      | e.g. `{ "text": 2, "rect": 1 }`. |
| `colors`                | Distinct colours used by fills, strokes, text and paint, most used first: `[{ color, uses }]`. |
| `fonts`                 | `[{ family, weights }]`. |
| `layersOutsideArtboard` | Ids of layers that extend past the artboard edges (partly or fully cropped in the PNG). |
| `hiddenLayers`          | Ids of hidden layers. |
| `textContent`           | All text strings, top-most first. |

## Example (abridged)

```json
{
  "format": "sama.design-document",
  "version": 1,
  "generator": "sama-workspace@0.1.0",
  "exportedAt": "2026-09-26T00:30:00.000Z",
  "document": { "name": "Poster", "width": 1080, "height": 1080, "background": "#ffffff", "units": "px" },
  "guides": { "vertical": [], "horizontal": [540] },
  "layers": [
    {
      "id": "l_…", "name": "سما للتصميم", "type": "text",
      "visible": true, "locked": false, "opacity": 1, "blendMode": "source-over",
      "bounds": { "x": 212.9, "y": 560, "width": 685.9, "height": 124.3 },
      "transform": { "width": 685.9, "height": 124.3, "rotation": 0, "flipX": false, "flipY": false },
      "visibleFraction": 1, "erased": false,
      "style": { "fill": "#ffffff", "stroke": null, "strokeWidth": 0 },
      "text": { "content": "سما للتصميم", "fontFamily": "Cairo", "fontSize": 110, "fontWeight": 900,
                "fontStyle": "normal", "textAlign": "right", "direction": "rtl",
                "lineHeight": 1.2, "letterSpacing": 0, "color": "#ffffff", "wrapped": false }
    },
    {
      "id": "l_…", "name": "Rectangle 1", "type": "rect",
      "bounds": { "x": 80, "y": 80, "width": 920, "height": 920 },
      "style": { "fill": "#0d3b66", "stroke": null, "strokeWidth": 0 },
      "shape": { "cornerRadius": 40 }
    }
  ],
  "analysis": {
    "layerCount": 2,
    "layerCountByType": { "text": 1, "rect": 1 },
    "colors": [{ "color": "#0d3b66", "uses": 1 }, { "color": "#ffffff", "uses": 1 }],
    "fonts": [{ "family": "Cairo", "weights": [900] }],
    "layersOutsideArtboard": [],
    "hiddenLayers": [],
    "textContent": ["سما للتصميم"]
  },
  "assets": {},
  "fabric": { "version": "7.4.0", "objects": ["…"] }
}
```

## Compatibility promise

- Fields in `document`, `layers` and `analysis` will only be **added**, never
  renamed or removed, within `version: 1`.
- `fabric` is an internal representation and may change with Fabric upgrades;
  consumers other than the workspace should not depend on it.
