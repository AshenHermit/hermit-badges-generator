# Headless CSS Badge Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SVG-pattern composer with a real CSS `border-image` renderer driven by an editable HTML/CSS template in Playwright Chromium.

**Architecture:** `template.html` holds the authoritative HTML/CSS and is loaded from `file://` with local font/SVG assets. A `TemplateService` fills `{{LEFT}}`/`{{RIGHT}}` into a temp HTML file; `BrowserRenderer` screenshots `.github-badge` and returns a PNG Buffer. `GenerationService` keeps the existing HTTP/cache/Swagger surface but drops style registry and composer.

**Tech Stack:** Node 20+, NestJS 11, Jest/ts-jest, `playwright-core@1.65.1`, Chromium at `C:\Users\hermit\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe`.

**Spec:** `docs/superpowers/specs/2026-11-26-headless-css-badge-design.md` (approved; authority over this plan).

## Global Constraints

- PNG only; no icons; ignore legacy `index.html`; no new output formats.
- Single editable `assets/templates/hermit-frame/template.html` is the only style source. No manifest, no JSON style definition.
- CSS exact (user's authoritative snippet), verbatim:
  - `.github-badge { font-family: "Lipstick Rage", sans-serif; --panel-face: #808080; }`
  - left: `border-image: url("./left-half.svg") 66 10 48 53 fill / 66px 10px 48px 53px repeat; padding: 49px 20px 41px 53px;`
  - right: `border-image: url("./right-half.svg") 66 53 48 25 fill / 66px 53px 48px 25px repeat; padding: 49px 68px 41px 35px;`
  - wrapper `display:flex; width:fit-content; box-sizing:border-box`; body text `#e8e6df`; `line-height:1.625`; font size `50px`.
- Keep local assets: `left-half.svg`, `right-half.svg`, `source.svg`, `Lipstick-Rage.ttf`, `Mansalva-Regular.ttf`, `OFL.txt`. No runtime network fetch.
- `playwright-core@1.65.1` pinned exactly; resolve Chromium via `chromium.executablePath()`; launch with `--allow-file-access-from-files`.
- HTTP surface unchanged: `GET /api/v1/generate`, raw `image/png`, `Cache-Control: public, max-age=3600`, Swagger `/api/docs`; cache key = hash of endpoint + all query params; `CACHE_DISABLED` (`1`/`true`/`yes`, startup read) unchanged.
- `FRESH_TEMPLATE` (alias `FRESH_MANIFEST`) `1`/`true`/`yes`, case-insensitive after trim, startup read: re-read template every request and bypass PNG cache get/set.
- Golden `test/golden/hermit-frame.png` regenerated from `left=Hello&right=World`; provenance records exact Chromium/Playwright versions.
- User explicitly authorized deleting `assets/templates/hermit-frame/manifest.json`, including their uncommitted edits. Do not touch any other user work.

## Review Focus

1. Font fallback silently changes output — pin with `document.fonts.check('50px "Lipstick Rage"')` asserted true before screenshot in `browser-renderer.spec.ts` (Task 2).
2. Query text containing `<`, `&`, quotes breaks the template — pin with a test that such text is HTML-escaped before substitution in `template.service.spec.ts` (Task 2).
3. `file://` cannot load local SVG/font — pin with asset checker asserting all referenced files exist and renderer's font check test (Tasks 1 and 2).
4. Fresh flag must bypass both template cache and PNG cache — pin with `generation.service.spec.ts` test using `FRESH_TEMPLATE=1` (Task 2).
5. Golden bytes drift with a different Chromium revision — pin with `playwright-core` exact version in `package.json` and exact provenance in `test/golden/README.md` (Task 3).

---

### Task 1: Editable template and asset checker

**Files:**
- Create: `assets/templates/hermit-frame/template.html`
- Modify: `scripts/check-assets.mjs`
- Delete: `scripts/build-assets.mjs`, `assets/templates/hermit-frame/manifest.json`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: user's approved CSS values from the spec (verbatim).
- Produces: `assets/templates/hermit-frame/template.html` with exactly two placeholders `{{LEFT}}` and `{{RIGHT}}`; `npm run assets:build` aliases `node scripts/check-assets.mjs` and never rewrites the template.

- [ ] **Step 1: Write the failing test**

Rewrite `scripts/check-assets.mjs` first so it asserts: template file exists and contains `{{LEFT}}` and `{{RIGHT}}` exactly once each; contains the four verbatim CSS declarations listed in Global Constraints; `left-half.svg`, `right-half.svg`, `Lipstick-Rage.ttf` all exist and are non-empty. Run `node scripts/check-assets.mjs`; expect FAIL because template does not exist.

- [ ] **Step 2: Create the template**

Write `assets/templates/hermit-frame/template.html` with `<!doctype html>`, `<meta charset="utf-8">`, inline `<style>` carrying the verbatim CSS, `<body><div class="github-badge"><div class="badge-left-part">{{LEFT}}</div><div class="badge-right-part">{{RIGHT}}</div></div></body>`. Remove `scripts/build-assets.mjs` and `git rm -f assets/templates/hermit-frame/manifest.json` (explicitly authorized). Change `package.json` script `assets:build` to `node scripts/check-assets.mjs`. Add `playwright-core@1.65.1` as an exact dependency and remove `resvg`/`opentype.js`; run `npm install` to update the lockfile.

- [ ] **Step 3: Verify the gate**

Run `node scripts/check-assets.mjs`; expect `ok`. Run `npm run build`; expect clean TypeScript build (old code still compiles at this point).

- [ ] **Step 4: Commit**

```bash
git add -A assets/templates/hermit-frame scripts package.json package-lock.json
git commit -m "feat: add editable CSS badge template and drop manifest"
```

---

### Task 2: Browser renderer and generation wiring

**Files:**
- Create: `src/rendering/template.service.ts`, `src/rendering/template.service.spec.ts`, `src/rendering/browser-renderer.ts`, `src/rendering/browser-renderer.spec.ts`
- Modify: `src/rendering/renderer.ts`, `src/rendering/renderer.registry.ts`, `src/rendering/rendering.module.ts`, `src/generation/generation.service.ts`, `src/generation/generation.service.spec.ts`, `src/generation/golden.spec.ts`
- Delete: `src/composer/`, `src/styles/`, `src/rendering/png.renderer.ts`, `src/rendering/png.renderer.spec.ts`

**Interfaces:**
- Consumes: `assets/templates/hermit-frame/template.html` (Task 1).
- Produces: `TemplateService.prepare(left: string, right: string): string` returning the temp HTML file path; `BrowserRenderer.render(input: { left: string; right: string }): Promise<Buffer>`; `Renderer` interface becomes `render(input: { left: string; right: string }): Promise<Buffer>`; `RendererRegistry.get(format: string): Renderer`.

- [ ] **Step 1: Write failing tests**

`template.service.spec.ts`: escaping test — `prepare('<b>&"', "x'y")` produces a temp file whose contents contain `&lt;b&gt;&amp;&quot;` and no raw `<b>`; fresh test — with `FRESH_TEMPLATE=1`, editing the template then calling `prepare` reflects the new bytes.

`browser-renderer.spec.ts`: inject a fake browser whose page returns a fixed PNG Buffer; assert `chromium.launch` received `executablePath()` and `--allow-file-access-from-files`, `page.goto` used a `file://` URL, `page.screenshot` was called with selector `.github-badge` and `omitBackground: true`, and the returned Buffer is the fixed PNG. Add a real-Chromium smoke test that loads the committed template with `left=Hello&right=World`, asserts `document.fonts.check('50px "Lipstick Rage"') === true`, and returns a PNG with signature `89504E470D0A1A0A` and width > 0.

`generation.service.spec.ts`: `FRESH_TEMPLATE=1` test asserts `badgeCache.get` and `badgeCache.set` are not called and `TemplateService.prepare` is called once per request.

- [ ] **Step 2: Run tests to verify RED**

Run `npm test -- --runInBand src/rendering src/generation/generation.service.spec.ts`; expect FAIL (missing modules/signatures).

- [ ] **Step 3: Implement the renderer**

Implement `TemplateService` with a module-level cached template string unless fresh flag is set, HTML-escaping `& < > " '`, writing a temp `.html` file in the template directory with `fs.writeFileSync`, returning its path. Implement `BrowserRenderer` with an injectable browser-like object, `chromium.launch({ executablePath: chromium.executablePath(), args: ['--allow-file-access-from-files'], headless: true })`, a new page per render, `page.goto('file://' + tempPath)`, `await page.evaluate(() => document.fonts.ready)`, font check, then `page.screenshot({ path: undefined, type: 'png', omitBackground: true })` on the `.github-badge` element handle, and closing the page in `finally`. Delete old composer/styles/png renderer files and update registry/module/service signatures.

- [ ] **Step 4: Run tests to verify GREEN**

Run `npm test -- --runInBand src/rendering src/generation/generation.service.spec.ts`; expect PASS. Then `npm run build`; expect clean.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "refactor: render badges with Playwright CSS border-image"
```

---

### Task 3: Golden, docs, and full verification

**Files:**
- Modify: `test/golden/hermit-frame.png`, `test/golden/README.md`, `README.md`
- Verify: full test suite, e2e, exact user URL

**Interfaces:**
- Consumes: `BrowserRenderer.render({ left, right })` from Task 2.

- [ ] **Step 1: Update golden spec expectation**

`golden.spec.ts` currently calls the old pipeline via `GenerationService.generate` with `{left:'Hello',right:'World',style:'hermit-frame',format:'png'}`. Keep that call — the HTTP-facing behavior is what the golden pins — and only update imports if Task 2 changed them. Run `npm test -- --runInBand src/generation/golden.spec.ts`; expect FAIL against the stale golden bytes.

- [ ] **Step 2: Regenerate golden**

Start the app with `npm run build && npm run start`, then run:

```powershell
Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/generate?left=Hello&right=World' -OutFile test/golden/hermit-frame.png -UseBasicParsing
```

Stop the server. Update `test/golden/README.md` with actual size, SHA-256, `playwright-core@1.65.1`, Chromium `chromium-1248` path, Node `v24.11.0`, Windows 11, and the exact regeneration command including `-UseBasicParsing`.

- [ ] **Step 3: Update README**

Document `template.html` as the editable source, the exact CSS it contains, `FRESH_TEMPLATE`/`FRESH_MANIFEST`, `CACHE_DISABLED`, and that rendering now uses Playwright Chromium. Remove instructions about `build-slices.mjs`/manifest.

- [ ] **Step 4: Full verification**

Run `npm run assets:build`, `node scripts/check-assets.mjs`, `npm run build`, `npm test -- --runInBand`, `npm run test:e2e`. All must pass. Start the app and download `http://localhost:3000/api/v1/generate?format=png&style=hermit-frame&right=%3E%3D20&left=node.js`, visually confirm the badge matches the user's reference (native rough frame, no stretch, text-adaptive width), then stop the server.

- [ ] **Step 5: Commit**

```bash
git add -A test README.md
git commit -m "chore: refresh golden and docs for CSS rendering"
```
