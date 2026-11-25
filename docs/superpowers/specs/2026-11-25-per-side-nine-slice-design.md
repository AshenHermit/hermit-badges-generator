# Per-side nine-slice settings and fresh manifest

## Intent

The current manifest describes the frame with one symmetric `corner: {width, height}` and one number `padding: 12`. That forces all four sides to use the same size. The user wants each side configured independently, mirroring CSS `border-image` / `padding` syntax: four values for top, right, bottom, left — separately for the source slice, the rendered border width, and the text padding. They also want `FRESH_MANIFEST` to force the manifest to be read on every generation instead of only at startup.

## Goals

- Manifest fields with explicit `{top, right, bottom, left}` objects for:
  - `border.slice` — native window sizes inside the source half SVG;
  - `border.width` — rendered border thickness in output pixels;
  - `padding` — text inset from the rendered border.
- Default values `40` for every border side and `12` for every padding side, so the current badge and committed golden PNG stay byte-identical.
- `FRESH_MANIFEST=1|true|yes` (case-insensitive, read at startup) makes `StyleRegistry.get()` re-read the manifest on every generation and makes `GenerationService.generate()` bypass the response cache in both directions.
- Keep PNG-only output, resvg 2.6.2, no headless browser, no new runtime dependencies.

## Non-goals / anti-goals

- No CSS-like strings such as `"40 40 40 40 fill / 40px ..."` in the manifest: the user chose explicit objects.
- No per-half asymmetric settings: `border` and `padding` live on the style and apply to both halves. `halves.left/right` keep only `origin`, `width`, and `file`.
- No reloading of SVG fragment file contents: `fragmentCache` stays keyed by file path. `FRESH_MANIFEST` concerns the manifest only.
- No new output formats, no changes to HTTP headers, cache key, Swagger, or the `CACHE_DISABLED` flag.

## Constraints

- Node 20+, npm, TypeScript, NestJS 11, Jest + ts-jest.
- `@resvg/resvg-js` pinned exactly to `2.6.2`; byte determinism and golden comparison must hold.
- Native half geometry: `width 309`, `height 181`, left viewBox `251 30 309 181`, right viewBox `560 30 309 181`.
- `minHalfWidth: 309`, font `Mansalva-Regular.ttf`, size `50`.
- Existing verification gate: `npm run assets:build`, `node scripts/check-assets.mjs`, `npm run build`, `npm test`, `npm run test:e2e`.
- Any manifest shape change must be mirrored in `scripts/build-assets.mjs` so `npm run assets:build` regenerates the same file.

## Approaches

1. **Explicit side objects (chosen).** `border.slice`, `border.width`, `padding` each hold `{top, right, bottom, left}`. Reads directly, validates cleanly, maps 1:1 to the CSS properties the user cited. Cost: slightly longer manifest.
2. **CSS-like strings.** One `"borderImage"` string and one `"padding"` string parsed at runtime. Closer to the example text but needs a token parser, gives worse validation errors, and adds failure modes for no benefit. Rejected.
3. **Keep `corner`, add asymmetric padding only.** Smaller diff but leaves two sources of truth for border geometry; a future edit could set `corner` and `border.width` to conflicting values. Rejected.

## Decisions

### Manifest and types

`assets/templates/hermit-frame/manifest.json` gains:

```json
"border": {
  "slice": { "top": 40, "right": 40, "bottom": 40, "left": 40 },
  "width": { "top": 40, "right": 40, "bottom": 40, "left": 40 }
},
"padding": { "top": 12, "right": 12, "bottom": 12, "left": 12 }
```

`HalfDefinition` drops `corner`. `StyleDefinition` gains `border: { slice: Sides; width: Sides }` and changes `padding: number` to `padding: Sides`, where `Sides = { top: number; right: number; bottom: number; left: number }`. `StyleRegistry` validates that all four keys are present and are finite positive numbers.

### Composer geometry

For each half, with `slice` from `border.slice`, `width` from `border.width`, and `H = style.height`:

- Native windows (positions inside the source half image):
  - top-left `(0, 0, slice.left, slice.top)`; top-right `(half.width - slice.right, 0, slice.right, slice.top)`;
  - bottom-left `(0, H - slice.bottom, slice.left, slice.bottom)`; bottom-right `(half.width - slice.right, H - slice.bottom, slice.right, slice.bottom)`;
  - top `(slice.left, 0, half.width - slice.left - slice.right, slice.top)`;
  - bottom `(slice.left, H - slice.bottom, half.width - slice.left - slice.right, slice.bottom)`;
  - left `(0, slice.top, slice.left, H - slice.top - slice.bottom)`;
  - right `(half.width - slice.right, slice.top, slice.right, H - slice.top - slice.bottom)`;
  - center `(slice.left, slice.top, half.width - slice.left - slice.right, H - slice.top - slice.bottom)`.
- Rendered half width: `max(style.minHalfWidth, width.left + width.right + textWidth + padding.left + padding.right)`.
- Rendered rects: corners are `width.left × width.top` (left) and `width.right × width.top` (right), etc.; right-side rects start at `halfOffsetX + halfWidthPx - width.right`; bottom-side rects start at `H - width.bottom`; top/bottom bands span from `halfOffsetX + width.left` to `halfOffsetX + halfWidthPx - width.right`; left/right bands span vertically from `width.top` to `H - width.bottom`; center spans the remaining rectangle.
- Text x for the left half: `halfOffsetX + width.left + padding.left + (spanW - padding.left - padding.right - layout.width) / 2`, where `spanW = halfWidthPx - width.left - width.right`. Baseline y uses `width.top` and `width.bottom` for vertical centering.

All nine regions still emit one `<pattern>` plus one `<rect>` per half; no `<scale>` stretching. The pattern tile stays the native window; the rect uses the rendered side sizes.

### Fresh manifest

- `FRESH_MANIFEST` is parsed once when `StyleRegistry` is constructed, using the same accepted values as `CACHE_DISABLED`: `1`, `true`, `yes`, case-insensitive after trimming.
- With the flag off, current behavior stays: manifests are loaded once in the constructor.
- With the flag on, `StyleRegistry.get(id)` re-reads `assets/templates/<id>/manifest.json`, validates it, and returns a fresh `StyleDefinition`; a bad file throws as it does today at startup.
- `GenerationService.generate()` computes the same cache key as today, but when the flag is on it skips both `badgeCache.get(key)` and `badgeCache.set(key, png)`. It obtains the fresh style from `StyleRegistry`, then composes and renders as before.
- `README.md` documents `FRESH_MANIFEST` with accepted values, startup-read/restart-required note, and the fact that it disables cached responses so manifest edits are visible immediately.

### Tests and docs

- `style.registry.spec.ts`: per-side parsing and validation; fresh reload after editing the manifest on disk with the flag on.
- `badge-composer.spec.ts`: asymmetric side values pin native window coordinates and rendered rect coordinates; half width uses asymmetric `width` and `padding`.
- `generation.service.spec.ts` / e2e: with the flag on, a second identical request produces a newly generated PNG and no cache write.
- Golden stays unchanged because defaults reproduce current output exactly.
- `scripts/build-assets.mjs` constants are updated to emit the new fields; its stale header comment is corrected to name `source.svg`.
