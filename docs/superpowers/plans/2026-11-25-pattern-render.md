# Pattern Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 18 duplicated SVG slice files with two half-frame images repeated via SVG `<pattern>` while keeping the existing PNG API and deterministic output.

**Architecture:** `build-assets.mjs` derives `left-half.svg` and `right-half.svg` from `source.svg` and writes a geometry-only manifest. `BadgeComposer` embeds both halves as stable base64 data URIs, emits nine `<pattern>` defs per half with native source windows, and grows only the target `<rect>` dimensions. `resvg` keeps rasterizing; text stays a local-font path.

**Tech Stack:** NestJS 11, TypeScript 5, `@resvg/resvg-js` 2.6.2 (pinned), `opentype.js`, Jest + supertest, Node 20+ on Windows.

**Spec:** `docs/superpowers/specs/2026-11-25-pattern-render-design.md`

## Global Constraints

- No runtime dependency changes; no headless browser; PNG only.
- resvg pinned exactly to `2.6.2`; output SVG must embed images as `data:image/svg+xml;base64,…`.
- Native source half width `309`, height `181`, corner `40×40`, padding `12`, `minHalfWidth 309`, font size `50`.
- Half viewBoxes: left `251 30 309 181`, right `560 30 309 181`.
- Pattern ids deterministic and unique: `p0…p17`.
- Native windows: corners `(0,0,40,40)`, `(269,0,40,40)`, `(0,141,40,40)`, `(269,141,40,40)`; top/bottom `(40,0,229,40)`, `(40,141,229,40)`; left/right `(0,40,40,101)`, `(269,40,40,101)`; center `(40,40,229,101)`.
- HTTP contract, cache key, `CACHE_DISABLED` and Swagger are unchanged.

## Review Focus

- Right half wider than 309px: right-side patterns must sample native source x=269 while their rects move to `hw-40`; otherwise right edge goes blank. Test in Task 2 step 5.
- Empty text at minimum width: span is exactly 229; 18 rects, no negative or zero dimensions. Test in Task 2 step 1.
- Unequal left/right widths: right half offset must use the measured left half width, never the constant 309. Test in Task 2 step 7.
- Repeated asset builds must be idempotent and leave no `left/`/`right/` slice directories. Test in Task 1 step 4.
- Visual/deterministic regression at the exact user URL and at the golden query. Tests in Task 3 steps 1 and 4.

---

### Task 1: Two-half asset build and asset checker

**Files:**
- Create: `scripts/build-assets.mjs`
- Modify: `scripts/check-assets.mjs`
- Modify: `package.json` (`assets:build` script)
- Modify: `assets/templates/hermit-frame/manifest.json` (generated)
- Create: `assets/templates/hermit-frame/left-half.svg` (generated)
- Create: `assets/templates/hermit-frame/right-half.svg` (generated)
- Delete: `assets/templates/hermit-frame/left/*.svg`, `assets/templates/hermit-frame/right/*.svg`
- Delete: `scripts/build-slices.mjs`

**Interfaces:**
- Consumes: `assets/templates/hermit-frame/source.svg` (full frame, viewBox `251 30 618 181`).
- Produces: manifest with keys `id`, `height`, `padding`, `minHalfWidth`, `font`, `halves.{left,right}.{origin,width,corner,file}`; each `file` names a half SVG with viewBox `251 30 309 181` / `560 30 309 181`.

- [ ] **Step 1: Write the failing asset check**

Rewrite `scripts/check-assets.mjs` to assert: manifest `id === 'hermit-frame'`, `height === 181`, `padding === 12`, `minHalfWidth === 309`, `font.size === 50`; `halves.left.file === 'left-half.svg'` and `halves.right.file === 'right-half.svg'`; no `halves.*.regions` key; each referenced file exists, non-empty, is a single-root `<svg` with exactly one `<svg` occurrence, has viewBox `251 30 309 181` for left and `560 30 309 181` for right, and contains no nested `<svg`; old directories `left` and `right` do not exist. Keep exit code 0/1 and the `ok: hermit-frame asset check passed` success line.

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/check-assets.mjs`
Expected: non-zero exit, failures for missing `left-half.svg` / `right-half.svg`, stale `regions`, and existing slice directories.

- [ ] **Step 3: Implement `scripts/build-assets.mjs`**

Use the same `stripToFragment` regex chain as the old script. Write each half file as `<svg xmlns="http://www.w3.org/2000/svg" width="309" height="181" viewBox="${origin.x} 30 309 181">${fragment}</svg>` with a trailing newline. Write the manifest exactly as the Interfaces block describes, using `JSON.stringify(manifest, null, 2) + '\n'`. Remove `left/` and `right/` directories with `fs.rmSync(dir, { recursive: true, force: true })`. Point `package.json` `assets:build` at the new script; delete `scripts/build-slices.mjs`.

- [ ] **Step 4: Run asset build and check twice**

Run: `npm run assets:build && node scripts/check-assets.mjs && git diff --exit-code -- assets/templates/hermit-frame/manifest.json assets/templates/hermit-frame/left-half.svg assets/templates/hermit-frame/right-half.svg`
Expected: success lines from both scripts, no diff on the second build (idempotent), slice directories gone.

- [ ] **Step 5: Commit**

```bash
git add -A scripts assets/templates/hermit-frame package.json
git commit -m "refactor: build two half images instead of nine slices"
```

### Task 2: Pattern composer and unit tests

**Files:**
- Modify: `src/styles/style-definition.ts`
- Modify: `src/composer/badge-composer.ts`
- Modify: `src/composer/badge-composer.spec.ts`
- Delete: `src/composer/nine-slice.ts`

**Interfaces:**
- Consumes: `StyleDefinition` from Task 1 manifest shape; `TextShaper.layout(text, font): TextLayout` with `width`, `path`, `ascenderPx`, `descenderPx`.
- Produces: `BadgeComposer.compose(style: StyleDefinition, left: string, right: string): string`, emitting `<svg xmlns=… width=W height=181 viewBox="0 0 W 181"><defs>…</defs>18 rects…text paths…</svg>`. Helper functions are module-private.

- [ ] **Step 1: Write failing tests for native geometry and minimum width**

Replace `src/composer/badge-composer.spec.ts` with pattern-based tests. Keep helper `halfWidth = Math.max(style.minHalfWidth, 2*corner.width + TextShaper.layout(text, font).width + 2*style.padding)`. Assert: output starts with `<svg`; contains `width="618" height="181"` for `('', '')`; exactly 18 `<pattern` and 18 `<rect`; every pattern has `width` in `{40,229,101}` and `height` in `{40,101}`; every `<image` has `x` in `{0,-40,-269}` and `y` in `{0,-40,-141}`; all pattern ids are `p0…p17` exactly once. Run `npm test -- --runInBand src/composer/badge-composer.spec.ts` and expect FAIL.

- [ ] **Step 2: Update `StyleDefinition`**

In `src/styles/style-definition.ts`: delete `RegionName`, `SliceRegion`, `StyleDefinition.viewBox`, and `HalfDefinition.regions`; add `file: string` to `HalfDefinition`. Do not change `StyleRegistry`.

- [ ] **Step 3: Implement pattern composition with native windows**

In `src/composer/badge-composer.ts`: read `style.halves.left.file` / `right.file` from `assets/templates/hermit-frame` once per process into a `Map<string,string>` cache; build data URI `data:image/svg+xml;base64,${Buffer.from(raw).toString('base64')}`. Derive native windows from `half.width` and `corner`, not hardcoded numbers: native right x = `half.width - corner.width`, bottom y = `style.height - corner.height`, horizontal span = `half.width - 2*corner.width`, vertical span = `style.height - 2*corner.height`. For each half emit nine `<pattern patternUnits="userSpaceOnUse" x="rectX" y="rectY" width="nativeW" height="nativeH"><image href="URI" x="-nativeX" y="-nativeY" width="309" height="181"/></pattern>` plus `<rect x="rectX" y="rectY" width="rectW" height="rectH" fill="url(#pN)"/>`. Dynamic rects: corners `(0,0)`, `(hw-40,0)`, `(0,141)`, `(hw-40,141)` at 40×40; bands start at `x=40` with `width=hw-80`; right-side patterns x from native 269 while rect x is `hw-40`. Keep `halfWidthOf` and `renderText` math unchanged. Delete `src/composer/nine-slice.ts`.

- [ ] **Step 4: Run composer tests**

Run: `npm test -- --runInBand src/composer/badge-composer.spec.ts`
Expected: PASS for the Step 1 tests.

- [ ] **Step 5: Add failing pin tests for half offsets and repetition**

In the same spec assert for `('', '')`: rect x values exactly `[0,269,0,269,40,40,0,269,40,309,578,309,578,349,349,309,578,349]` paired with y `[0,0,141,141,0,141,40,40,40,0,0,141,141,0,141,40,40,40]` (regions in the order topLeft, topRight, bottomLeft, bottomRight, top, bottom, left, right, center per half); right right-edge rect x is `578`; no rect extends past `618`. For long left text assert the top-band rect width equals the grown `spanW > 229` while its pattern width stays `229`, and `output` contains no `scale(`. For long right text assert the right top-right pattern still has `width="40"` and its image still has `x="-269"`, while its rect x is `rightOffset + rightHalfWidth - 40`; assert no pattern width/height exceeds `309`/`181`. Run the focused spec and expect FAIL.

- [ ] **Step 6: Make the pin tests pass**

Adjust only the rect emit order/geometry in `src/composer/badge-composer.ts` until Step 5 passes; do not change native window values.

- [ ] **Step 7: Add failing unequal-width test**

Assert for `('Hello', 'World')` that the right half's top-left rect x equals the measured left half width (not 309), and the right right-edge rect x equals `leftHalfWidth + rightHalfWidth - 40`. Run focused spec, expect FAIL, then fix by using the computed `leftHalfWidth` as `halfOffsetX` for the right half.

- [ ] **Step 8: Keep determinism and text tests**

Assert repeated `compose(style, 'left', 'right')` calls are string-identical and that at least two `<path` elements are emitted. Run focused spec; expect PASS.

- [ ] **Step 9: Commit**

```bash
git add src/styles/style-definition.ts src/composer
git commit -m "refactor: repeat half frames with SVG patterns"
```

### Task 3: Golden fixture, docs, and full verification

**Files:**
- Modify: `test/golden/hermit-frame.png`
- Modify: `test/golden/README.md`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-11-25-badge-generator.md`
- Modify: `docs/superpowers/plans/2026-11-25-pattern-render.md` (check off completed steps)

**Interfaces:**
- Consumes: `BadgeComposer.compose` and the running app from Task 2.
- Produces: regenerated golden PNG and updated provenance; docs that no longer mention nine slice files.

- [ ] **Step 1: Regenerate golden**

Run: `npm run build`, start the app with `npm run start`, then
`Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/generate?left=Hello&right=World' -OutFile test/golden/hermit-frame.png`.
Expected: HTTP 200 and a new PNG at `test/golden/hermit-frame.png`.

- [ ] **Step 2: Update golden provenance**

Record the new byte size and `Get-FileHash … -Algorithm SHA256` value in `test/golden/README.md`; keep the existing OS/Node/resvg version lines and regeneration command.

- [ ] **Step 3: Update docs**

In `README.md`, replace any description of nine slice files with two half-frame images repeated through SVG patterns. In `docs/superpowers/plans/2026-11-25-badge-generator.md`, add a top line stating it is superseded by `2026-11-25-pattern-render.md`. Check off all completed checkboxes in this plan.

- [ ] **Step 4: Full verification gate**

Run: `npm run assets:build`, `node scripts/check-assets.mjs`, `npm run build`, `npm test`, `npm run test:e2e`.
Expected: all succeed with 7 unit suites / 33 tests and 2 e2e suites / 11 tests (or greater).

- [ ] **Step 5: Visual check of exact user URL**

Download `http://localhost:3000/api/v1/generate?format=png&style=hermit-frame&right=%3E%3D20&left=node.js` and inspect it: continuous frame, native-size corners, repeated middle, no blank right edge, ~50px text.

- [ ] **Step 6: Commit**

```bash
git add test/golden README.md docs/superpowers/plans
git commit -m "chore: refresh golden and docs for pattern rendering"
```
