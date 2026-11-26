# Headless CSS badge renderer design

## Intent

Replace the SVG-pattern 9-slice renderer with a real headless-browser renderer so badges look exactly like the user's Storybook component: native rough frame, no stretching, width driven by text. The editable source becomes one HTML/CSS template file per style, not a manifest.

## Goals

- Render `GET /api/v1/generate?left=…&right=…&style=hermit-frame&format=png` to a PNG whose appearance matches `http://127.0.0.1:6006/iframe.html?id=github-badge--default&viewMode=story`.
- Keep the two whole-half SVG images and the local Lipstick Rage font; no runtime network fetch.
- Let a person edit all layout values directly in HTML/CSS.
- Preserve the HTTP contract: raw `image/png`, `Cache-Control`, validation, Swagger `/api/docs`, cache key over endpoint + all query params, `CACHE_DISABLED`.
- Add `FRESH_TEMPLATE` (accepts `1`/`true`/`yes`, case-insensitive, startup-read): re-read the template file on every generation and bypass the PNG response cache. For compatibility, `FRESH_MANIFEST` remains accepted as an alias.
- Deterministic PNG bytes on one pinned OS/Node/Chromium/Playwright combination.

## Non-goals

- No per-request arbitrary HTML; only left/right text is injected into a fixed template.
- No WebP/JPEG/AVIF, no icons, no legacy `index.html`.
- No browser UI, no page automation beyond loading a local file and screenshotting an element.
- No download of fonts or textures at runtime.

## Approaches

1. **resvg + SVG `<pattern>` (current)** — rejected. It cannot execute CSS `border-image`, so every attempt to mimic it needed source-window hacks and still stretched or flat-filled the center. It produced seams, squares, and gaps the user rejected.
2. **Serve the Storybook component and screenshot it** — rejected. It couples the backend to a separate dev server and its build pipeline.
3. **Playwright Chromium loading a local template file** — chosen. The browser lays out real CSS `border-image`, `border-image-repeat: repeat`, `fill`, and `padding` natively; the template is a plain file the user can edit.

Playwright Chromium is already cached locally. The executable path is resolved through `playwright-core`'s browser registry, not hardcoded, because `C:\Users\hermit\AppData\Local\ms-playwright` holds several revisions.

## Constraints

- Node 20+, npm, NestJS 11, TypeScript, Jest + ts-jest.
- Add `playwright-core` as the only new runtime dependency. Do not add full `playwright`, do not download browsers at install or runtime.
- Pin the exact `playwright-core` version and record the exact Chromium revision used for the golden PNG in `test/golden/README.md`.
- Keep the endpoint, DTO validation, controller headers, cache key, `CACHE_DISABLED`, and Swagger unchanged.
- Only `png` format; only style `hermit-frame`.
- Keep `assets/templates/hermit-frame/left-half.svg`, `right-half.svg`, `source.svg`, and `assets/fonts/{Lipstick-Rage.ttf,Mansalva-Regular.ttf,OFL.txt}`.
- The user's uncommitted manifest edits are not to be overwritten or committed; their values are not the target. The Storybook CSS is the target.

## Decisions

### Template file

Create `assets/templates/hermit-frame/template.html` as a complete, self-contained document:

- `<style>` with `@font-face` pointing at `../fonts/Lipstick-Rage.ttf`.
- The outer wrapper carries `.github-badge`; the two children carry `.badge-left-part` and `.badge-right-part`. This matches Storybook. `border-image-repeat` is part of the `border-image` shorthand on each half; it is not reset and needs no separate rule.
- Exact CSS supplied by the user is authoritative:
  `.github-badge { font-family: "Lipstick Rage", sans-serif; --panel-face: #808080; }`
  `.badge-left-part { border-image: url("./left-half.svg") 66 10 48 53 fill / 66px 10px 48px 53px repeat; padding: 49px 20px 41px 53px; }`
  `.badge-right-part { border-image: url("./right-half.svg") 66 53 48 25 fill / 66px 53px 48px 25px repeat; padding: 49px 68px 41px 35px; }`
- The wrapper also sets `display: flex; width: fit-content; box-sizing: border-box;` and the page body inherits Storybook's `#e8e6df` text colour and `line-height: 1.625`; these reproduce Storybook's computed values without changing the supplied badge CSS.
- Text nodes `{{LEFT}}` and `{{RIGHT}}` as injection points.
- No manifest, no numeric style registry, no SVG-pattern composer, no text shaper, no resvg renderer. Remove or replace those modules; do not leave dead code.
- Paths are relative to the template file; the browser loads it from `file://`, so no HTTP server is needed. Chromium is launched with `--allow-file-access-from-files` so the relative `@font-face` and SVG URLs load; the golden test asserts `document.fonts.check('50px "Lipstick Rage"')` so a silent fallback to sans-serif cannot pass.

### Rendering pipeline

- A `TemplateRenderer` service loads and caches the template string at startup unless `FRESH_TEMPLATE` is set.
- Per request: replace `{{LEFT}}`/`{{RIGHT}}` with HTML-escaped query text, write a temporary HTML file beside the template (file name includes a random id), open it with Chromium, wait for `document.fonts.ready`, locate `.github-badge`, screenshot that element at device scale factor 1 with transparent background, delete the temp file, return the PNG `Buffer`.
- Launch one Chromium instance per process and reuse it; close it on `module destroy`/`process` shutdown.
- Any render failure returns a 500 and is logged; invalid user input is still rejected by the existing DTO before rendering.
- `GenerationService` keeps its cache-key logic and skips cache get/set when `FRESH_TEMPLATE` is set.

### Determinism

- Golden PNG is regenerated from the running app with `left=Hello&right=World` and compared byte-for-byte.
- `test/golden/README.md` records OS build, Node version, `playwright-core` version, Chromium revision, output size, and SHA-256.
- Tests that must render real PNGs are marked as golden/integration tests so a missing browser produces a clear skip or failure, not a silent fallback to resvg.

### Assets build

The old `scripts/build-assets.mjs` and `scripts/check-assets.mjs` exist for generated manifest/slices. With a single editable HTML/CSS template they no longer describe the source of truth. Either remove them or repurpose them to verify that the template and its referenced assets exist; the plan decides and records the choice. `npm run assets:build` must not overwrite the user's template.

## What is left to the builder

- Choose and pin the `playwright-core` version matching a cached Chromium revision; resolve the executable path through the library API.
- Choose the exact temp-file lifecycle and concurrency-safe naming.
- Decide whether `assets:build` is removed or becomes a template/asset existence check.
- Decide which old modules are deleted versus left behind unused (default: delete).
- Update README, golden provenance, unit tests, and e2e tests to the new renderer.
