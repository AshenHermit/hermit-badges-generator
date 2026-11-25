# Per-side nine-slice settings and fresh manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the symmetric corner/padding fields with independent per-side slice, width and padding settings, and let `FRESH_MANIFEST` re-read the manifest and bypass the PNG cache on every generation.

**Architecture:** The manifest becomes the single source of geometry: `border.slice` pins native windows inside the two whole-half SVG images, `border.width` pins rendered border thickness, and `padding` pins text inset. `BadgeComposer` maps those four-sided values onto the existing nine `<pattern>`/`<rect>` pairs per half. `StyleRegistry` and `GenerationService` gain a startup-read `FRESH_MANIFEST` flag that re-reads the manifest and skips both sides of the response cache.

**Tech Stack:** NestJS 11, TypeScript 5, Jest/ts-jest, `@resvg/resvg-js` 2.6.2, Node 20+.

**Spec:** `docs/superpowers/specs/2026-11-25-per-side-nine-slice-design.md`

## Global Constraints

- Node 20+, npm, TypeScript, NestJS 11, Jest + ts-jest.
- `@resvg/resvg-js` pinned exactly to `2.6.2`; byte determinism and golden comparison must hold.
- Native half geometry: `width 309`, `height 181`, left viewBox `251 30 309 181`, right viewBox `560 30 309 181`; `minHalfWidth 309`; font `Mansalva-Regular.ttf`, size `50`.
- Default sides: `border.slice` and `border.width` all `40`; `padding` all `12`. Defaults must reproduce current PNG bytes, so `test/golden/hermit-frame.png` stays unchanged.
- `Sides` is exactly `{ top: number; right: number; bottom: number; left: number }`; all four keys required, finite and positive.
- No new runtime dependencies, no headless browser, no new output formats, no HTTP/header/Swagger/cache-key changes.
- `FRESH_MANIFEST` accepts `1`, `true`, `yes`, case-insensitive after trimming, read at startup like `CACHE_DISABLED`.
- Verification gate: `npm run assets:build`, `node scripts/check-assets.mjs`, `npm run build`, `npm test`, `npm run test:e2e`.

## Review Focus

- A side object missing a key or holding `0`, a negative number or `NaN`: reject with a named validation error, not an undefined-size rect — Task 1, `style.registry.spec.ts` test `rejects invalid side values with the field name in the error`.
- Asymmetric rendered widths on the right half: right-side rects anchor at `halfOffsetX + halfWidthPx - width.right`, using `width.right`, not `slice.right` — Task 2, `badge-composer.spec.ts` test `anchors asymmetric right rects with width.right`.
- Text inset with asymmetric padding: text x starts after `width.left + padding.left`, never the old symmetric `corner.width + padding` — Task 2, `badge-composer.spec.ts` test `places text using asymmetric width and padding`.
- `FRESH_MANIFEST` with a warm cache: the second identical request still composes and renders, with no cache get or set — Task 3, `generation.service.spec.ts` test `bypasses the response cache when FRESH_MANIFEST is set`.
- Default manifest changed accidentally: golden byte comparison must stay green — Task 3 verification step runs `npm test` including `golden.spec.ts` and compares the exact user URL output size/shape to the current baseline.

---

### Task 1: Manifest and style types carry four-sided values

**Files:**
- Modify: `src/styles/style-definition.ts`
- Modify: `src/styles/style.registry.ts`
- Modify: `src/styles/style.registry.spec.ts`
- Modify: `scripts/build-assets.mjs`
- Modify: `scripts/check-assets.mjs`
- Regenerate: `assets/templates/hermit-frame/manifest.json`

**Interfaces:**
- Consumes: existing manifest at `assets/templates/hermit-frame/manifest.json`.
- Produces: `export interface Sides { top: number; right: number; bottom: number; left: number }`; `StyleDefinition.border: { slice: Sides; width: Sides }`; `StyleDefinition.padding: Sides`; `HalfDefinition` has `origin`, `width`, `file` and no `corner`. `StyleRegistry.get(id: string): StyleDefinition` signature unchanged.

- [ ] **Step 1: Write the failing test**

In `src/styles/style.registry.spec.ts`, add:

```ts
it('exposes four-sided border and padding settings with no symmetric corner', () => {
  const style = registry.get('hermit-frame');
  expect(style.border.slice).toEqual({ top: 40, right: 40, bottom: 40, left: 40 });
  expect(style.border.width).toEqual({ top: 40, right: 40, bottom: 40, left: 40 });
  expect(style.padding).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
  expect(style.halves.left).not.toHaveProperty('corner');
});
```

Also add the Review Focus validation test:

```ts
it('rejects invalid side values with the field name in the error', () => {
  const original = fs.readFileSync(MANIFEST_PATH, 'utf8');
  try {
    fs.writeFileSync(
      MANIFEST_PATH,
      original.replace('"top": 40', '"top": 0'),
    );
    expect(() => new StyleRegistry()).toThrow(/border\.slice\.top/);
  } finally {
    fs.writeFileSync(MANIFEST_PATH, original);
  }
});
```

`MANIFEST_PATH` is `path.resolve(process.cwd(), 'assets/templates/hermit-frame/manifest.json')`; import `fs` and `path` in the spec.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand src/styles/style.registry.spec.ts`
Expected: FAIL — TypeScript errors for the missing `border` property and the old `padding: number` type are a valid RED for this task.

- [ ] **Step 3: Define the types in `src/styles/style-definition.ts`**

Add `export interface Sides`; remove `corner` from `HalfDefinition`; replace `padding: number` with `padding: Sides`; add `border: { slice: Sides; width: Sides }`.

- [ ] **Step 4: Emit the new manifest from `scripts/build-assets.mjs`**

Replace `CORNER`/`PADDING` constants with `BORDER_SIDES = { top:40, right:40, bottom:40, left:40 }` and `PADDING_SIDES = { top:12, right:12, bottom:12, left:12 }`; emit `border: { slice: {...BORDER_SIDES}, width: {...BORDER_SIDES} }` and `padding: {...PADDING_SIDES}`; drop `corner` from each half; correct the header comment to name `source.svg`, not `badge_frame.svg`.

- [ ] **Step 5: Pin the shape in `scripts/check-assets.mjs`**

Replace `manifest.padding !== 12` with a four-sided equality check for `manifest.border.slice`, `manifest.border.width` and `manifest.padding` against the same default objects; additionally fail if any half has `corner`.

- [ ] **Step 6: Validate sides in `src/styles/style.registry.ts`**

Keep the constructor's one-time load. Add a local helper `readSides(raw: unknown, label: string): Sides` that requires all four keys to be finite numbers greater than zero and throws `Invalid ${label}.<side>: expected a positive finite number` otherwise. Apply it to `border.slice`, `border.width` and `padding` before storing the definition.

- [ ] **Step 7: Regenerate assets and verify the focused gate**

Run: `npm run assets:build && node scripts/check-assets.mjs && npm test -- --runInBand src/styles/style.registry.spec.ts`
Expected: asset check prints `ok: hermit-frame asset check passed`; all style registry tests pass. Full `npm run build` is expected to stay red until Task 2 migrates `BadgeComposer` to the new types.

- [ ] **Step 8: Commit**

```bash
git add src/styles/style-definition.ts src/styles/style.registry.ts src/styles/style.registry.spec.ts scripts/build-assets.mjs scripts/check-assets.mjs assets/templates/hermit-frame/manifest.json
git commit -m "feat: describe nine-slice sides independently in the manifest"
```

### Task 2: Compose from asymmetric sides

**Files:**
- Modify: `src/composer/badge-composer.ts`
- Modify: `src/composer/badge-composer.spec.ts`

**Interfaces:**
- Consumes: `StyleDefinition` with `border.slice`, `border.width`, `padding: Sides` from Task 1.
- Produces: `BadgeComposer.compose(style: StyleDefinition, left: string, right: string): string` — signature unchanged; output still nine `<pattern>` plus nine `<rect>` per half, no `<scale>`.

- [ ] **Step 1: Write the failing tests**

In `src/composer/badge-composer.spec.ts`, clone the registry style with asymmetric values:

```ts
const asymmetric: StyleDefinition = {
  ...style,
  border: {
    slice: { top: 10, right: 20, bottom: 30, left: 40 },
    width: { top: 5, right: 6, bottom: 7, left: 8 },
  },
  padding: { top: 1, right: 2, bottom: 3, left: 4 },
};
```

Add three tests from the Review Focus section:

```ts
it('anchors asymmetric right rects with width.right', () => {
  const rects = parseRects(BadgeComposer.compose(asymmetric, '', ''));
  expect(rects[1]).toEqual([303, 0, 6, 5]);       // left half top-right
  expect(rects[17]).toEqual([612, 5, 6, 169]);    // right half right band
});

it('places text using asymmetric width and padding', () => {
  const svg = BadgeComposer.compose(asymmetric, 'A', 'B');
  const paths = [...svg.matchAll(/transform="translate\(([^,]+),/g)].map((m) => Number(m[1]));
  expect(paths[0]).toBeGreaterThan(8 + 4);
  expect(paths[1]).toBeGreaterThan(309 + 6 + 2);
});

it('derives native windows from slice sides', () => {
  const svg = BadgeComposer.compose(asymmetric, '', '');
  const patterns = parsePatterns(svg);
  expect(patterns[0]).toContain('width="40" height="10"');
  expect(patterns[1]).toContain('width="20" height="10"');
  expect(patterns[0]).toContain('x="-0" y="-0"');
  expect(patterns[1]).toContain('x="-269" y="-0"');
});
```

`parseRects` and `parsePatterns` are local helpers in the spec that regex-match the emitted `<rect>` and `<pattern>` tags into string arrays; `rects[i]` is the ordered list of `x,y,width,height` strings from the `REGION_ORDER` emission.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand src/composer/badge-composer.spec.ts`
Expected: FAIL — current composer still reads `half.corner` and `style.padding` as a number.

- [ ] **Step 3: Rewrite the geometry helpers in `src/composer/badge-composer.ts`**

`halfWidthOf`: `Math.max(style.minHalfWidth, slice.left + slice.right + textWidth + padding.left + padding.right)`. `windowsOf`: native windows from `border.slice` and half geometry as enumerated in the spec's "Composer geometry"; rendered rects from `border.width`, with right-side rects at `halfOffsetX + halfWidthPx - width.right`, bottom-side rects at `style.height - width.bottom`, top/bottom spans from `halfOffsetX + width.left` to `halfOffsetX + halfWidthPx - width.right`, left/right spans from `width.top` to `style.height - width.bottom`. `renderText`: use `width.left + padding.left` and `width.right + padding.right` in place of the symmetric values.

- [ ] **Step 4: Run verification**

Run: `npm run build && npm test -- --runInBand src/composer/badge-composer.spec.ts && npm test`
Expected: build clean; composer spec passes; full unit suite green including `golden.spec.ts` (defaults keep identical bytes).

- [ ] **Step 5: Commit**

```bash
git add src/composer/badge-composer.ts src/composer/badge-composer.spec.ts
git commit -m "refactor: compose nine-slice from four-sided values"
```

### Task 3: Fresh manifest flag, docs and final verification

**Files:**
- Modify: `src/styles/style.registry.ts`
- Modify: `src/styles/style.registry.spec.ts`
- Modify: `src/generation/generation.service.ts`
- Modify: `src/generation/generation.service.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `StyleRegistry.get(id)` from Task 1 and the unchanged `BadgeCache` interface.
- Produces: no new public signatures. `StyleRegistry` and `GenerationService` each parse `FRESH_MANIFEST` once in their constructor; behavior changes only when the flag is truthy.

- [ ] **Step 1: Write the failing tests**

In `src/generation/generation.service.spec.ts`:

```ts
it('bypasses the response cache when FRESH_MANIFEST is set', async () => {
  const previous = process.env.FRESH_MANIFEST;
  process.env.FRESH_MANIFEST = '1';
  badgeCache.get.mockReturnValue(PNG);
  try {
    const freshService = new GenerationService(
      styleRegistry as unknown as StyleRegistry,
      badgeCache as unknown as BadgeCache,
      rendererRegistry as unknown as RendererRegistry,
    );
    await freshService.generate(queryWith());
    expect(badgeCache.get).not.toHaveBeenCalled();
    expect(styleRegistry.get).toHaveBeenCalledWith('hermit-frame');
    expect(renderer.render).toHaveBeenCalledWith(SVG);
    expect(badgeCache.set).not.toHaveBeenCalled();
  } finally {
    if (previous === undefined) delete process.env.FRESH_MANIFEST;
    else process.env.FRESH_MANIFEST = previous;
  }
});
```

In `src/styles/style.registry.spec.ts`, write a second test that sets `FRESH_MANIFEST='true'`, constructs a new `StyleRegistry`, rewrites the manifest on disk changing only `font.size` from `50` to `51`, calls `get('hermit-frame')` and expects `font.size === 51`; restore the original bytes in `finally`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand src/styles/style.registry.spec.ts src/generation/generation.service.spec.ts`
Expected: FAIL — the cached definitions and warm cache path still return the original values.

- [ ] **Step 3: Implement the fresh-manifest behavior**

In `src/styles/style.registry.ts`, store `private readonly fresh: boolean` parsed from `process.env.FRESH_MANIFEST` with the accepted values `1`, `true`, `yes`, trimmed and lowercased. When `fresh`, `get(id)` re-reads and revalidates `assets/templates/<id>/manifest.json` through the same helper path used by the constructor and returns a new definition; otherwise it returns the cached map entry.

In `src/generation/generation.service.ts`, store `private readonly freshManifest: boolean` with the same parsing. In `generate()`, keep computing `CacheKeyFactory.create(...)` unchanged; when `freshManifest` is true, skip both `this.badgeCache.get(key)` and `this.badgeCache.set(key, png)`.

- [ ] **Step 4: Document the flag**

In `README.md`, add `FRESH_MANIFEST=true` to the environment section: accepted values `1`/`true`/`yes` case-insensitive, read at startup (restart required), manifest re-read on every generation and cached PNGs bypassed so edits show up without clearing the cache.

- [ ] **Step 5: Full verification**

Run: `npm run assets:build && node scripts/check-assets.mjs && npm run build && npm test && npm run test:e2e`
Expected: all green; 7 unit suites and 2 e2e suites pass; golden unchanged.

Then start the app with `$env:FRESH_MANIFEST='1'; npm run start`, request `http://localhost:3000/api/v1/generate?format=png&style=hermit-frame&right=%3E%3D20&left=node.js`, edit `assets/templates/hermit-frame/manifest.json` in place (e.g. change `border.width.right` to `41`), request the same URL again without restarting and confirm the PNG bytes change. Restore the manifest and rebuild assets.

- [ ] **Step 6: Commit**

```bash
git add src/styles/style.registry.ts src/styles/style.registry.spec.ts src/generation/generation.service.ts src/generation/generation.service.spec.ts README.md
git commit -m "feat: re-read manifest and skip cache with FRESH_MANIFEST"
```
