# Adaptive hybrid nine-slice design

## Intent

The badge must be sized by its text, not by a fixed 618×181 frame. The frame
art must keep native corner and edge size (CSS `border-image-repeat: repeat`
behaviour) and the center must be filled cleanly, without the dark band, white
notches and hard seam visible in the current hybrid mockup.

## Goals

- Output width and height derive from text metrics plus `border.width` plus
  `padding` on all four sides.
- Corners keep their native source size; edges repeat native source tiles;
  no scaling or compression of the frame art.
- Center is a solid fill, not a stretched or repeated source region.
- Two source images remain: `left-half.svg` and `right-half.svg`.
- `FRESH_MANIFEST` and `CACHE_DISABLED` keep working as today.

## Non-goals

- Literal CSS rendering or a headless browser.
- New formats (PNG only), new runtime dependencies, HTTP/header changes.
- Changing `origin` / `width` semantics of the half images.

## Constraints

- Node 20+, npm, TypeScript, NestJS 11, Jest + ts-jest.
- `@resvg/resvg-js` pinned to `2.6.2`; determinism must remain testable.
- Manifest sides are `{top,right,bottom,left}` positive finite numbers.
- Half geometry stays native 309×181; left viewBox `251 30 309 181`, right
  viewBox `560 30 309 181`.
- Current uncommitted user edits (`border.slice`/`border.width`/`padding` = 1,
  `font.size` = 100, `Lipstick-Rage.ttf`) are user work and are not overwritten.

## Approaches

1. **Scaled halves (rejected).** Stretch each whole half to the adaptive box.
   No seams, but the frame art compresses — the user rejected this.
2. **All-tile repeat (rejected).** Repeat the center too. Literal repeat, but
   visible seams and the source center's dark band remain.
3. **Hybrid, stretched center (rejected).** Corners/edges native, center
   stretched like CSS `fill`. The source center window contains a dark band
   and transparent notches, which smear across the badge.
4. **Hybrid, solid center with masked background (chosen).** Corners and edges
   are native-size repeated patterns. A solid background is drawn behind the
   edge bands inside the center span, so transparent notches no longer show
   white. The left and right center fills are blended with a short horizontal
   gradient so the half boundary is not a hard line.

Why 4: it is the closest match to CSS `border-image` with fixed corners and
repeated edges while removing defects that come from the source artwork.

## Decisions

- Box height:
  `H = border.width.top + padding.top + textHeight + padding.bottom + border.width.bottom`.
- Half width:
  `halfW = border.width.left + padding.left + textWidth + padding.right + border.width.right`.
- `minHalfWidth` no longer clamps the box; it stays in the manifest but is
  ignored by geometry. (My call: removing the field would break existing user
  files for no benefit.)
- Native pattern windows still come from `border.slice`, source half `width`
  and `height`. Rendered corner/edge rects come from `border.width`.
- The center rectangle is not rendered from the source. It is filled with a
  per-half color, sampled from the source fills: left `#29272d`, right
  `#8c3065`. Add these as `fill.left` / `fill.right` in the manifest, generated
  by `scripts/build-assets.mjs` so `npm run assets:build` stays authoritative.
- A linear gradient blends the two fills across a 30px window centred on the
  half boundary. This is my call; it removes the straight color seam without
  touching frame art.
- The solid background is drawn before the corner/edge patterns and covers only
  the center span (`y = border.width.top` to `H - border.width.bottom`), so it
  never paints outside the frame.
- Text placement uses `padding` exactly as today, relative to the adaptive box.

## What is left to the builder

- Update `StyleDefinition` and validation for `fill`.
- Update the composer to produce adaptive dimensions and the new layer order.
- Update unit/e2e tests that pin the fixed 618×181 box and the old golden PNG.
- Regenerate `test/golden/hermit-frame.png` from the running app and record
  its new provenance.
- Update README with the adaptive sizing rule and `fill` fields.
