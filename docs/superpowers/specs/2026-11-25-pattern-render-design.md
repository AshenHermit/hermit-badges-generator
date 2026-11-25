# Design: 9-slice via SVG patterns with two half images

Date: 2026-11-25
Status: awaiting approval

## Intent and why

The current composer reads **nine SVG fragment files per half (18 files total)** and
builds a nested grid of `<svg>` tiles. `scripts/build-slices.mjs` writes the *same*
full frame fragment into all nine region files, so the files are identical
duplicates, not real slices. The user asked to stop splitting the frame into nine
physical files and to have **two images — one for the left half, one for the right
half** — with the middle repeated like `border-image-repeat: repeat`.

The original ask named CSS `border-image`/`padding`/`border-image-repeat`. That is
not directly available: `resvg` has no CSS `border-image` support, and
`takumi-js` 2.22.1 was checked and does not contain `border-image`,
`border-image-slice`, or `border-image-repeat` at all (its native binary has
`border-radius`, `background-image`, `linear-gradient` but no border-image
strings). The user then approved **resvg + SVG `<pattern>`** after a working
throwaway spike.

## Goals

- Replace 18 fragment files with **two** half-frame image files.
- Preserve the visual result already confirmed by the user: continuous native
  frame, fixed-size corners, repeated middle, ~50px local-font text, width grows
  with text.
- Keep the HTTP contract, cache key, `CACHE_DISABLED`, Swagger, and PNG-only scope
  unchanged.
- Keep byte-for-byte deterministic PNG output and update the golden fixture.

## Non-goals

- No literal CSS `border-image` in the final implementation.
- No headless browser (Chrome/Playwright) in the runtime.
- No new runtime dependencies.
- No WebP/JPEG/AVIF output (deferred to the future `sharp` work).

## Constraints

- Node 20+, TypeScript/NestJS, `@resvg/resvg-js` pinned to 2.6.2.
- Source frame: `badge_frame.svg` → `assets/templates/hermit-frame/source.svg`,
  viewBox `251 30 618 181`, height 181.
- Fixed geometry: corner 40×40, half width 309 (native), padding 12,
  `minHalfWidth` 309, font `Mansalva-Regular.ttf` size 50, local-only.
- `resvg` will not resolve external file references from a generated SVG, so the
  two half images must be **embedded as stable base64 data URIs** in the output.
- Determinism: no timestamps, random ids, or locale-dependent formatting in the
  emitted SVG.
- The invisible attachment marker `@1@` on the request could not be read; no
  separate visual reference was available. Visual target remains the previously
  confirmed native-frame/50px result.

## Approaches considered

1. **resvg + SVG `<pattern>` (chosen).** A throwaway spike rendered both the
   native 618px badge and a 900px wide badge with only two embedded half images;
   the middle repeated seamlessly and corners stayed native size. No new deps,
   existing byte determinism and test harness stay intact.
2. **Takumi + CSS `background-image` layers.** Would need nine CSS layers to
   imitate the nine regions and adds dependencies; `border-image` itself is
   unsupported. Rejected.
3. **Headless Chromium with real `border-image`.** Exact CSS semantics but heavy
   runtime dependency and weaker byte determinism. Rejected by the user.
4. **sharp/pngjs pixel 9-slice.** Two PNG inputs, but new dependency and more
   manual code. Rejected in favour of (1).

## Decisions

- Replace `scripts/build-slices.mjs` with `scripts/build-assets.mjs`; update the
  `assets:build` npm script.
  - Reads `source.svg`, strips XML declaration/DOCTYPE/outer `<svg>`, keeps the
    inner fragment.
  - Writes **two** files: `assets/templates/hermit-frame/left-half.svg`
    (viewBox `251 30 309 181`) and `right-half.svg` (viewBox `560 30 309 181`).
  - Deletes the old `left/` and `right/` nine-file directories.
  - Writes a geometry-only manifest: `id`, `height`, `padding`, `minHalfWidth`,
    `corner {width,height}`, `halves.left/right {origin,width,file}`, `font`.
    No `regions`/`viewBox` keys.
- Rewrite `src/composer/badge-composer.ts`:
  - For each half, emit nine `<pattern patternUnits="userSpaceOnUse">` defs using
    the proven math: pattern `x = halfOffsetX + rx`, `y = ry`, `width = rw`,
    `height = rh`; inner `<image href="data:image/svg+xml;base64,…" x="-rx"
    y="-ry" width="309" height="181"/>`; a `<rect>` with the same geometry and
    `fill="url(#id)"` for each region.
  - Region rectangles (relative to half origin): corners `(0,0)`,
    `(hw-40,0)`, `(0,141)`, `(hw-40,141)` at 40×40; top/bottom `x=40`, `y=0/141`,
    `width=spanW=hw-80`, `height=40`; left/right `x=0/hw-40`, `y=40`, `40×101`;
    center `x=40`, `y=40`, `spanW×101`.
  - Pattern ids are deterministic and unique across halves (`p0…p17`).
  - Half files are read once per process into a module-level cache; data URIs are
    built from those exact bytes.
  - Text shaping/positioning and `halfWidthOf` stay unchanged.
  - Delete `src/composer/nine-slice.ts` if `tileSpan` becomes unused.
- Update `scripts/check-assets.mjs` to assert: manifest geometry, both half files
  exist, each is a single-root SVG with the expected viewBox and no nested
  `<svg`, old slice directories absent.
- Rewrite composer unit tests around patterns: 18 patterns at minimum width,
  pinned region coordinates for both halves, right-half offset at
  `leftHalfWidth`, edge/center repetition for long text, corners within badge,
  no `scale(`, deterministic output, text path present. Keep the no-clipped-tile
  regression intent.
- Regenerate `test/golden/hermit-frame.png` from the running app and update
  `test/golden/README.md` provenance (size/SHA-256).
- Update `README.md` and the implementation plan doc to describe two half images
  and pattern-based repetition.
- Verification gate before claiming done: `npm run assets:build`,
  `node scripts/check-assets.mjs`, `npm run build`, `npm test`, `npm run test:e2e`,
  plus visual inspection of the exact user URL.

## Left to the builder

- Exact test assertion strings and helper names.
- Whether to keep `source.svg` as the canonical input (recommended: keep).
- Commit split and message wording.
