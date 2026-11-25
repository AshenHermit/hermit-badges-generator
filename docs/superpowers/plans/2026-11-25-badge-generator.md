# Hermit Badges Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NestJS service that renders PNG badges from query params via 9-slice repeat of a hand-drawn frame, with deterministic sha256 cache and Swagger at `/api/docs`.

**Architecture:** Fresh NestJS (CommonJS + Jest) app. `StyleRegistry` loads a manifest + sliced SVG fragments; `TextShaper` (opentype.js) measures and converts text to `<path>`; `BadgeComposer` assembles an SVG with fixed corners and explicitly repeated edge/center tiles (no scaling); `PngRenderer` (resvg-js, `renderAsync`, system fonts off) rasterizes to PNG; `GenerationService` wraps it in an in-memory sha256 cache. Controller exposes one GET endpoint, Swagger generated lazily with `useGlobalPrefix`.

**Tech Stack:** Node 20+, TypeScript 5, NestJS 11, `@nestjs/swagger` 11, `@resvg/resvg-js` 2, `opentype.js` 1.3, Jest + supertest, Windows/PowerShell.

**Spec:** `docs/superpowers/specs/2026-11-25-badge-generator-design.md`

## Global Constraints

- MVP format: **PNG only**. Other formats are non-goals; `sharp` recorded as future work in the spec, not installed now.
- 9-slice: corners fixed; **edges and center repeat as whole tiles; scaling by any factor other than 1 is forbidden**. No `<pattern>`.
- Width variant A: badge width grows with text; slice edges stay native; only middle zones repeat.
- Font: local `Mansalva-Regular.ttf` + `OFL.txt`; **no network calls at runtime**. opentype.js cannot read WOFF2 — use TTF.
- Cache key: `sha256(endpoint + канонический query)`; all query params participate; order-independent; hex digest.
- Swagger at `/api/docs` via `SwaggerModule.setup('docs', ..., { useGlobalPrefix: true })` and lazy document factory.
- Builder values: `maxLength=32`, TTL 1 hour, max 1000 entries, output height 181, white text, hex sha256.
- Windows dev: avoid native builds; `@resvg/resvg-js` prebuilt WASM/native addon, `loadSystemFonts: false`.
- Output must be byte-deterministic for identical requests.
- All commands run from repo root in PowerShell. Repo already `git init` on `master`, no commits yet.

## Review Focus

1. **Param order / equivalent query** → same bytes and same cache key. Test in Task 7 (canonical key) and Task 8 (two URL orders hit same entry).
2. **Unknown `style` / `format`** → 400 from validation, never 500 from registry lookup. Test in Task 3 and Task 8.
3. **Control characters in text** → 400; other Unicode (including glyphs Mansalva lacks) → 200 with valid PNG, no throw. Test in Task 4 and Task 8.
4. **Max-length text (32 chars)** → bounded width, still valid PNG; no unbounded tile explosion. Test in Task 5 and Task 8.
5. **Concurrent identical requests** → byte-equal responses, single cache entry. Test in Task 8.

---

### Task 1: Scaffold NestJS app and bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `jest.config.js`, `test/jest-e2e.json`, `.gitignore`, `src/main.ts`, `src/app.setup.ts`, `src/app.module.ts`, `test/helpers/create-app.ts`, `test/smoke.e2e-spec.ts`

**Interfaces:**
- Produces: `configureApp(app: INestApplication): void` in `src/app.setup.ts` — sets global prefix `api`, global `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`, Swagger with `useGlobalPrefix: true`, path `docs`, `jsonDocumentUrl: 'docs/json'`, lazy `documentFactory`. `createApp(): Promise<INestApplication>` in `test/helpers/create-app.ts` builds a `TestingModule` with `AppModule`, calls `configureApp`, then `app.init()`. Both `main.ts` and e2e tests use `configureApp`.

- [ ] **Step 1: Write failing smoke test**

`test/smoke.e2e-spec.ts`: use `createApp()`, then supertest to assert `GET /api/docs` → 200 and `GET /nope` → 404.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- --config test/jest-e2e.json --runInBand`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Create project files**

`package.json` scripts: `build`, `start`, `start:dev`, `assets:build` (`node scripts/build-slices.mjs`), `test` (`jest`), `test:e2e` (`jest --config test/jest-e2e.json --runInBand`). Dependencies exactly: `@nestjs/common@^11`, `@nestjs/core@^11`, `@nestjs/platform-express@^11`, `@nestjs/config@^4`, `@nestjs/swagger@^11`, `reflect-metadata@^0.2`, `rxjs@^7.8`, `@resvg/resvg-js@^2.6`, `opentype.js@^1.3`. Dev: `@nestjs/cli@^11`, `@nestjs/testing@^11`, `@types/jest@^29`, `@types/node@^22`, `@types/opentype.js@^1.3`, `@types/supertest@^6`, `jest@^29`, `ts-jest@^29`, `supertest@^7`, `typescript@^5`. `tsconfig.json`: CommonJS, target ES2022, `experimentalDecorators`, `emitDecoratorMetadata`, `esModuleInterop`, `strict`. `jest.config.js`: `preset: 'ts-jest'`, `testEnvironment: 'node'`, `roots: ['<rootDir>/src']`, `testRegex: '\\.spec\\.ts$'`. `test/jest-e2e.json`: `preset: 'ts-jest'`, `testEnvironment: 'node'`, `rootDir: '..'`, `testRegex: 'test/.*\\.e2e-spec\\.ts$'` (so `test/helpers/create-app.ts` is not treated as a test). `AppModule` imports `ConfigModule.forRoot({ isGlobal: true })` only (other modules added later). `.gitignore` already exists at repo root (do not overwrite).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --config test/jest-e2e.json --runInBand`
Expected: PASS (2 assertions).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: scaffold nestjs app with bootstrap and swagger"
```

---

### Task 2: Source assets and generated slices

**Files:**
- Create: `scripts/build-slices.mjs`, `scripts/check-assets.mjs`, `assets/templates/hermit-frame/source.svg`, `assets/templates/hermit-frame/manifest.json`, `assets/templates/hermit-frame/left/*.svg`, `assets/templates/hermit-frame/right/*.svg`, `assets/fonts/Mansalva-Regular.ttf`, `assets/fonts/OFL.txt`

**Interfaces:**
- Consumes: root `badge_frame.svg` (`viewBox="251 30 618 181"`, outer `<svg>` + `<desc>` + empty `<defs>` + `<path>` elements).
- Produces: `manifest.json` with shape `{ id, viewBox, height, padding, minHalfWidth, font: { file, size, color }, halves: { left, right } }`; each half `{ origin: {x,y}, width, corner: {width,height}, regions: Record<RegionName, { x, y, width, height, file }> }`. `RegionName` = `topLeft|topRight|bottomLeft|bottomRight|top|bottom|left|right|center`. Slice files contain only the inner path elements (no outer `<svg>`), so the composer can wrap them.

- [ ] **Step 1: Write failing asset test**

`scripts/check-assets.mjs`: after `npm run assets:build`, assert manifest `id === 'hermit-frame'`, `halves.left.regions` has exactly 9 keys, each referenced file exists and is non-empty, and no slice file contains `<svg`. Exit non-zero on failure.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run assets:build; node scripts/check-assets.mjs`
Expected: FAIL — script missing.

- [ ] **Step 3: Copy source and download font**

Copy `badge_frame.svg` → `assets/templates/hermit-frame/source.svg`. Download with PowerShell:
`Invoke-WebRequest -Uri https://raw.githubusercontent.com/google/fonts/main/ofl/mansalva/Mansalva-Regular.ttf -OutFile assets/fonts/Mansalva-Regular.ttf`
and the same for `OFL.txt` from `ofl/mansalva/OFL.txt`. Assert both files are non-empty.

- [ ] **Step 4: Implement `scripts/build-slices.mjs`**

Read `source.svg`; strip XML declaration, DOCTYPE, outer `<svg ...>` and `</svg>` with a regex; keep inner content as `fragment`. Write manifest with constants: `viewBox {x:251,y:30,width:618,height:181}`, `height 181`, `padding 12`, `minHalfWidth 120`, `font { file:'Mansalva-Regular.ttf', size:30, color:'#ffffff' }`, each half `origin` = `{251,30}` / `{560,30}`, `width 309`, `corner {width:40,height:40}`. Region coordinates per half: corners at `(origin.x,30)`, `(origin.x+269,30)`, `(origin.x,171)`, `(origin.x+269,171)` each 40×40; edges `top {origin.x+40,30,229,40}`, `bottom {origin.x+40,171,229,40}`, `left {origin.x,70,40,101}`, `right {origin.x+269,70,40,101}`; center `{origin.x+40,70,229,101}`. Write one fragment file per region named `left/top-left.svg` … `right/center.svg`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run assets:build; node scripts/check-assets.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets scripts
git commit -m "feat: add tileable frame slices and Mansalva font"
```

---

### Task 3: StyleRegistry

**Files:**
- Create: `src/styles/style-definition.ts`, `src/styles/style.registry.ts`, `src/styles/styles.module.ts`, `src/styles/style.registry.spec.ts`

**Interfaces:**
- Consumes: `assets/templates/hermit-frame/manifest.json` from Task 2.
- Produces: `StyleDefinition`, `HalfDefinition`, `RegionName`, `SliceRegion` types; `StyleRegistry.get(id: string): StyleDefinition` and `list(): string[]`. Manifest paths resolved relative to `assets/templates` via `path.resolve(process.cwd(), 'assets/templates', id)`.

- [ ] **Step 1: Write failing tests**

`style.registry.spec.ts`: `get('hermit-frame')` returns id, two halves, 9 regions each; `get('unknown')` throws `Error` with message containing `Unknown style`; `get('../etc')` throws the same (id must match `/^[a-z0-9-]+$/` before path resolution).

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- style.registry.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Types mirror the manifest shape exactly. `StyleRegistry` is an injectable singleton that loads manifests synchronously in the constructor for every directory under `assets/templates`. Reject invalid ids before touching the filesystem.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- style.registry.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/styles
git commit -m "feat: add style registry"
```

---

### Task 4: TextShaper (opentype.js)

**Files:**
- Create: `src/composer/text-shaper.ts`, `src/composer/text-shaper.spec.ts`

**Interfaces:**
- Consumes: `FontSpec { file: string; size: number; color: string }` from `StyleDefinition`.
- Produces: `TextLayout { width: number; path: string; ascenderPx: number; descenderPx: number }` and `TextShaper.layout(text: string, font: FontSpec): TextLayout`. `path` is `font.getPath(text, 0, 0, size).toPathData()` — baseline at y=0, caller translates it. Fonts loaded with `opentype.loadSync(path.resolve(process.cwd(), 'assets/fonts', font.file))` and cached by file path; `descenderPx` is negative.

- [ ] **Step 1: Write failing tests**

`text-shaper.spec.ts`: with `{file:'Mansalva-Regular.ttf', size:30, color:'#ffffff'}`, `layout('badge', font).width > 0`; path starts with `M`; two calls with same text produce identical `path`; `layout('', font).width === 0`; a string containing an emoji does not throw and returns a string `path` (possibly empty glyphs).

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- text-shaper.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Load font lazily, cache in a `Map<string, opentype.Font>`. `ascenderPx = font.ascender / font.unitsPerEm * size`, `descenderPx = font.descender / font.unitsPerEm * size`. Do not validate text here (DTO owns that).

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- text-shaper.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/composer
git commit -m "feat: add opentype text shaping"
```

---

### Task 5: BadgeComposer (9-slice repeat)

**Files:**
- Create: `src/composer/nine-slice.ts`, `src/composer/badge-composer.ts`, `src/composer/badge-composer.spec.ts`

**Interfaces:**
- Consumes: `StyleDefinition` (Task 3), `TextShaper.layout` (Task 4).
- Produces: `BadgeComposer.compose(style: StyleDefinition, left: string, right: string): string`. Output: complete `<svg xmlns=... width={W} height={style.height} viewBox="0 0 W H">` string. Helper `nine-slice.ts` exports `tileSpan(span: number, tile: number): number` = `Math.max(1, Math.ceil(span / tile))`.

- [ ] **Step 1: Write failing tests**

`badge-composer.spec.ts` using a real `StyleRegistry.get('hermit-frame')` and real `TextShaper`:
- output starts with `<svg` and has `width="240" height="181"` for empty text at min width;
- count of `viewBox="251 30 40 40"` fragments (top-left corner) is exactly 1;
- for text long enough that `halfWidth > 120`, the top-edge parent viewport contains `tileSpan(spanW, 229)` child tiles and **no** `scale(` substring in the output;
- output contains `<path` for both texts;
- two calls with identical inputs produce identical strings.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- badge-composer.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Per half: `cornerW = half.corner.width`, `cornerH = half.corner.height`, `spanW = halfWidth - 2*cornerW`, `spanH = style.height - 2*cornerH`, `halfWidth = Math.max(style.minHalfWidth, 2*cornerW + textWidth + 2*style.padding)`. Render 4 corners as one nested `<svg x y width height viewBox="srcX srcY w h">fragment</svg>` each. Render each elastic region as a parent nested `<svg x y width=span viewBox="0 0 spanW spanH">` containing exactly `tileSpan(span, tile)` child nested `<svg x={i*tileW} y={j*tileH} width={tileW} height={tileH} viewBox="srcX srcY tileW tileH">fragment</svg>` (one axis for edges, both for center). Destination x = `halfOffsetX + region.x - half.origin.x`, y = `region.y - style.viewBox.y`. Place both halves' backgrounds first, then text paths: `x = cornerW + style.padding + (spanW - 2*style.padding - textWidth)/2 + halfOffsetX`, `baselineY = cornerH + spanH/2 + (ascenderPx + descenderPx)/2`. Text path wrapped in `<path d="..." transform="translate(x, baselineY)" fill="..."/>`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- badge-composer.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/composer
git commit -m "feat: add 9-slice badge composer"
```

---

### Task 6: Renderer registry and PNG renderer

**Files:**
- Create: `src/rendering/renderer.ts`, `src/rendering/png.renderer.ts`, `src/rendering/renderer.registry.ts`, `src/rendering/rendering.module.ts`, `src/rendering/png.renderer.spec.ts`

**Interfaces:**
- Produces: `Renderer { render(svg: string): Promise<Buffer> }`; `PngRenderer.render`; `RendererRegistry.get(format: string): Renderer` throwing `Error('Unsupported format: ...')` for anything but `png`.

- [ ] **Step 1: Write failing tests**

`png.renderer.spec.ts`: render a 2×2 red SVG → result begins with PNG magic (`89 50 4E 47`), two renders are byte-equal, `registry.get('png') instanceof PngRenderer`, `registry.get('webp')` throws `Unsupported format`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- png.renderer.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`new Resvg(svg, { font: { loadSystemFonts: false } })`; `const png = await resvg.renderAsync().asPng()`; return `Buffer.from(png)`. Do not load a font into resvg — text is already a path.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- png.renderer.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rendering
git commit -m "feat: add resvg PNG renderer and registry"
```

---

### Task 7: Cache key and memory cache

**Files:**
- Create: `src/cache/cache-key.factory.ts`, `src/cache/badge-cache.ts`, `src/cache/memory-cache.service.ts`, `src/cache/cache.module.ts`, `src/cache/cache.spec.ts`

**Interfaces:**
- Produces: `CacheKeyFactory.create(endpoint: string, query: Record<string, string>): string` — canonical string = sorted `key=value` pairs with `encodeURIComponent` values, joined by `&`; key = hex `sha256(endpoint + '?' + canonical)`. `BadgeCache { get(key: string): Buffer | undefined; set(key: string, value: Buffer): void }`. `MemoryCacheService` constructor `(ttlMs: number, maxEntries: number)`, LRU eviction via `Map` insertion order, plus `get size(): number` for tests.

- [ ] **Step 1: Write failing tests**

`cache.spec.ts`: `create('/api/v1/generate', {right:'b', left:'a'}) === create('/api/v1/generate', {left:'a', right:'b'})`; result matches `/^[a-f0-9]{64}$/`; differing endpoint or value gives different key; `set`/`get` returns same Buffer; entry expires after `ttlMs` (use `jest.useFakeTimers()`); exceeding `maxEntries` evicts the least-recently-used entry.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- cache.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Use `node:crypto`. `get()` deletes expired entries and refreshes insertion order on hit. Constructor defaults from env `CACHE_TTL_MS=3600000`, `CACHE_MAX_ENTRIES=1000`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- cache.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cache
git commit -m "feat: add deterministic cache key and memory cache"
```

---

### Task 8: Generation endpoint (DTO, service, controller)

**Files:**
- Create: `src/generation/dto/generate-query.dto.ts`, `src/generation/generation.service.ts`, `src/generation/generation.controller.ts`, `src/generation/generation.module.ts`, `src/generation/generation.service.spec.ts`, `test/generate.e2e-spec.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–7.
- Produces: `GenerationService.generate(query: GenerateQueryDto): Promise<Buffer>`. Controller `GET /v1/generate` (prefixed to `/api/v1/generate`) returns `Promise<Buffer>` with `@Header('Content-Type', 'image/png')` and `@Header('Cache-Control', 'public, max-age=3600')`. Query DTO fields `left`, `right` (required, `@MaxLength(32)`, `@Matches(/^[^\p{Cc}\p{Cf}]+$/u)`), `style` (`@IsIn(['hermit-frame'])`, default `hermit-frame`), `format` (`@IsIn(['png'])`, default `png`).

- [ ] **Step 1: Write failing unit test**

`generation.service.spec.ts`: on miss it calls composer + renderer + `cache.set` once; on hit it returns the cached Buffer and does not call the renderer. Use Jest mocks for `BadgeComposer`, `RendererRegistry`, `BadgeCache`, `CacheKeyFactory`.

- [ ] **Step 2: Write failing e2e tests**

`test/generate.e2e-spec.ts` using `createApp()` from `test/helpers/create-app.ts` (Task 1): `GET /api/v1/generate?left=Hello&right=World` → 200, `content-type` contains `image/png`, body has PNG magic; same params in reversed order → byte-equal body; different `right` → different bytes; `left` with exactly 32 chars → 200 with PNG magic, 33 chars → 400; `left=😀` → 200 with PNG magic (no glyph is fine, no crash); `left` containing `\u0000` → 400; `style=nope` → 400; `format=webp` → 400; 20 parallel identical requests → all byte-equal and `app.get(MemoryCacheService).size === 1`.

- [ ] **Step 3: Run to verify both fail**

Run: `npm test -- generation.service.spec.ts; npm test -- --config test/jest-e2e.json --runInBand test/generate.e2e-spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

`GenerationService.generate`: build key from `endpoint = '/api/v1/generate'` and normalized query (defaults already applied by DTO transform) → `cache.get` → on hit return → `styleRegistry.get(query.style)` → `composer.compose(style, query.left, query.right)` → `registry.get(query.format).render(svg)` → `cache.set` → return Buffer. Wire all modules into `AppModule` via imports. Add Swagger decorators `@ApiOperation`, `@ApiProduces('image/png')`, `@ApiResponse({status:200, content:{'image/png':{schema:{type:'string',format:'binary'}}}})`, `@ApiQuery` for all four params.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- generation.service.spec.ts; npm test -- --config test/jest-e2e.json --runInBand test/generate.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src test
git commit -m "feat: add badge generation endpoint with cache and swagger"
```

---

### Task 9: Golden image and full verification

**Files:**
- Create: `test/golden/hermit-frame.png`, `src/generation/golden.spec.ts`, `README.md`

**Interfaces:**
- Consumes: `GET /api/v1/generate` response from Task 8.

- [ ] **Step 1: Write failing golden test**

`golden.spec.ts`: render through `GenerationService` with fixed text `{left:'Hello', right:'World', style:'hermit-frame', format:'png'}`, compare Buffer with `fs.readFileSync('test/golden/hermit-frame.png')` using `Buffer.equals`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- golden.spec.ts`
Expected: FAIL — golden file missing.

- [ ] **Step 3: Generate golden and README**

Start app (`npm run start`), `Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/generate?left=Hello&right=World' -OutFile test/golden/hermit-frame.png`, stop app. `README.md`: install, `npm run assets:build`, start, endpoint example, Swagger link, note that `sharp` is planned for future formats.

- [ ] **Step 4: Run all verification**

Run: `npm run build; npm test; npm run test:e2e`
Expected: all PASS; smoke e2e still gives `/api/docs` → 200.

- [ ] **Step 5: Commit**

```bash
git add test/golden src README.md
git commit -m "test: add golden PNG and verify full suite"
```
