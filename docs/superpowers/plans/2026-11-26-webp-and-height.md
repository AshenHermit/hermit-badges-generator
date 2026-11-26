# WebP and Height Parameter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WebP output via `sharp` and a `height` query parameter (default 60px) that resizes both PNG and WebP while preserving aspect ratio.

**Architecture:** Chromium still renders the badge at native size from the editable template. `GenerationService` passes the resulting PNG plus the validated `format` and `height` to a new `ImageTransformer`, which resizes with sharp and encodes to the requested format. The transformer's output is what gets cached and returned; the renderer registry stays PNG-only.

**Tech Stack:** Node 24, NestJS 11, Jest + ts-jest, `playwright-core@1.65.1`, `sharp` (pinned exactly).

**Spec:** `docs/superpowers/specs/2026-11-26-webp-and-height-design.md` (approved; authority over this plan).

## Global Constraints

- `height`: integer `1`–`1000`, default `60`; invalid values → 400. Applies to PNG and WebP alike.
- `format`: `png` or `webp`; default `png`. No other format, no width/quality parameter.
- Resize preserves aspect ratio (width omitted from sharp options); upscaling allowed.
- Exact CSS in `assets/templates/hermit-frame/template.html` is frozen; do not edit it. Local assets only, no runtime network fetch.
- Cache key = SHA-256 of endpoint + all query params, sorted; must now include `height` and `format`. `Cache-Control: public, max-age=3600` unchanged.
- `CACHE_DISABLED` and `FRESH_TEMPLATE` / `FRESH_MANIFEST` behavior unchanged. Read at startup, values `1`/`true`/`yes` case-insensitive after trim.
- Swagger at `/api/docs` must document both formats and `height`; HTTP validation remains `whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`.
- Golden PNG is regenerated from `left=Hello&right=World` at the default height; `test/golden/README.md` records actual size, SHA-256 and the resize step.
- Local gitignored `.env` has `CACHE_DISABLED=true`, `FRESH_MANIFEST=true`; e2e cache assertions must run with those explicitly set to `false`. Do not edit `.env`.
- `.superpowers/` is scratch; commit only explicit product paths. All subagents use `opencode/hy4-flash-free`.

## Review Focus

- Omitted `height` must yield a 60px-tall image for both formats; Task 2 service test and Task 3 e2e default-vs-explicit byte equality, plus the golden regenerated at 60px, pin it.
- Invalid `height` (`0`, `1001`, `abc`, `60.5`) must return 400 without rendering; Task 2 DTO decorators and Task 3 e2e cases pin it.
- `format=webp` must return RIFF/WEBP bytes with `image/webp`, while PNG output keeps its PNG magic; Task 1 transformer tests and Task 3 e2e pin both.
- Same text at different `height` or `format` must never share a cache entry; Task 2 key assertion and Task 3 cache-size e2e pin it.
- Resize must preserve transparency and aspect ratio, and emoji text must still render; Task 1 metadata tests and Task 3 emoji e2e pin it.

---

### Task 1: sharp dependency and ImageTransformer

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/rendering/image-transformer.ts`, `src/rendering/image-transformer.spec.ts`
- Modify: `src/rendering/rendering.module.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export type ImageFormat = 'png' | 'webp'`; `ImageTransformer.transform(png: Buffer, format: ImageFormat, height: number): Promise<Buffer>`; `ImageTransformer` provided and exported by `RenderingModule`.

- [ ] **Step 1: Install and pin sharp**

Run: `npm install sharp --save-exact`
Expected: `sharp` added to `dependencies` with an exact version; `package-lock.json` updated.

- [ ] **Step 2: Write failing transformer tests**

Create `src/rendering/image-transformer.spec.ts`. Build the source fixture in-test with `sharp({ create: { width: 302, height: 181, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()`. Assert:
- `transform(source, 'png', 60)` → metadata `height === 60`, `hasAlpha === true`, and `Math.abs(width / height - 302 / 181) < 0.02`.
- same call → first eight bytes equal the PNG magic `89 50 4E 47 0D 0A 1A 0A`.
- `transform(source, 'webp', 60)` → bytes `0..3` are `RIFF` and `8..11` are `WEBP`.
- two identical calls produce byte-equal buffers.

- [ ] **Step 3: Run tests to verify RED**

Run: `npm test -- --runInBand src/rendering/image-transformer.spec.ts`
Expected: FAIL — cannot find module `./image-transformer`.

- [ ] **Step 4: Implement ImageTransformer**

In `src/rendering/image-transformer.ts` export `ImageFormat` and `@Injectable() class ImageTransformer` with `transform(png, format, height): Promise<Buffer>` using `sharp(png).resize({ height })`, then `.png().toBuffer()` or `.webp().toBuffer()`. Keep width unspecified so aspect ratio is preserved.

- [ ] **Step 5: Register the provider**

Add `ImageTransformer` to `providers` and `exports` in `src/rendering/rendering.module.ts`. `GenerationModule` already imports `RenderingModule`.

- [ ] **Step 6: Run tests and build to verify GREEN**

Run: `npm test -- --runInBand src/rendering/image-transformer.spec.ts` then `npm run build`
Expected: PASS, TypeScript clean.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/rendering/image-transformer.ts src/rendering/image-transformer.spec.ts src/rendering/rendering.module.ts
git commit -m "feat: add sharp image transformer for resize and WebP"
```

### Task 2: DTO validation, service wiring and dynamic content type

**Files:**
- Modify: `src/generation/dto/generate-query.dto.ts`, `src/generation/generation.service.ts`, `src/generation/generation.service.spec.ts`, `src/generation/generation.controller.ts`

**Interfaces:**
- Consumes: `ImageTransformer.transform`, `ImageFormat`, `DEFAULT_HEIGHT` (defined in this task).
- Produces: `export const DEFAULT_HEIGHT = 60` in the DTO file; `GenerateQueryDto.height: number`; `format` accepts `png` / `webp`; `GenerationService` constructor gains a third argument `ImageTransformer`.

- [ ] **Step 1: Write failing service tests**

In `src/generation/generation.service.spec.ts`: add `transformer: { transform: jest.Mock }` with a mock returning its input buffer, and pass it as the third constructor argument to every `new GenerationService(...)`. Extend `queryWith` to set `height = overrides?.height ?? DEFAULT_HEIGHT` and allow `format: 'webp'`. Add tests:
- `expect(CacheKeyFactory.create).toHaveBeenCalledWith('/api/v1/generate', expect.objectContaining({ format: 'png', height: 60 }))`.
- For `queryWith({ format: 'webp', height: 80 })`: `transformer.transform` called with `(PNG, 'webp', 80)`, `rendererRegistry.get` called with `'png'`, and `badgeCache.set` called with the transformer's returned buffer.
- With `query.height` deleted: `transformer.transform` still called with `60`.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- --runInBand src/generation/generation.service.spec.ts`
Expected: FAIL — constructor signature and `height` assertions not satisfied.

- [ ] **Step 3: Implement DTO changes**

In `src/generation/dto/generate-query.dto.ts`: import `Type` from `class-transformer` and `IsInt`, `Min`, `Max` from `class-validator`; `export const DEFAULT_HEIGHT = 60`; add `height!: number` with `@IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)` and initializer `= DEFAULT_HEIGHT`; change `format` to `@IsIn(['png', 'webp'])`.

- [ ] **Step 4: Implement service wiring**

In `src/generation/generation.service.ts`: inject `ImageTransformer` as third constructor argument; add `height: String(query.height ?? DEFAULT_HEIGHT)` to the cache-key object; replace `rendererRegistry.get(query.format)` with `rendererRegistry.get('png')`; after render call `await this.imageTransformer.transform(png, query.format as ImageFormat, query.height ?? DEFAULT_HEIGHT)`; cache and return that result.

- [ ] **Step 5: Implement dynamic content type and Swagger**

In `src/generation/generation.controller.ts`: rename `PngResponse` to `ImageResponse` and add `setHeader(name: string, value: string): unknown`; remove the static `@Header('Content-Type', ...)`; in `generate()` call `res.setHeader('Content-Type', query.format === 'webp' ? 'image/webp' : 'image/png')` before `res.send`; keep the `Cache-Control` header; set `@ApiProduces('image/png', 'image/webp')`, list both media types in `@ApiResponse`, and add `@ApiQuery({ name: 'height', required: false, description: 'Output height in pixels (1-1000)', schema: { type: 'integer', default: 60 } })` plus the widened format enum.

- [ ] **Step 6: Run focused tests and build**

Run: `npm test -- --runInBand src/generation/generation.service.spec.ts` then `npm run build`
Expected: PASS, TypeScript clean. Full `npm test` is expected to fail only on `golden.spec.ts` until Task 3 regenerates the 60px golden.

- [ ] **Step 7: Commit**

```bash
git add src/generation/dto/generate-query.dto.ts src/generation/generation.service.ts src/generation/generation.service.spec.ts src/generation/generation.controller.ts
git commit -m "feat: validate height and route both formats through sharp"
```

### Task 3: E2E coverage, golden regeneration and documentation

**Files:**
- Modify: `test/generate.e2e-spec.ts`, `test/golden/hermit-frame.png`, `test/golden/README.md`, `README.md`

**Interfaces:**
- Consumes: the complete endpoint from Tasks 1–2.
- Produces: no new code interface; final verified state of the branch.

- [ ] **Step 1: Write failing e2e tests**

In `test/generate.e2e-spec.ts`: replace the `format=webp` → 400 case with a success case asserting `image/webp`, bytes `RIFF` at `0..3` and `WEBP` at `8..11`; use `format=gif` for the invalid-format 400. Add cases:
- no `height` vs `height=60` produces byte-equal PNG bodies;
- `height=80` produces different bytes with PNG magic;
- `height=0`, `height=1001`, `height=abc`, `height=60.5` each return 400;
- record `const before = app.get(MemoryCacheService).size`, make two requests with the same text but different heights, assert different bytes and `size === before + 2` (run with cache flags off).

- [ ] **Step 2: Run e2e to verify RED**

Run: with `CACHE_DISABLED=false` and `FRESH_MANIFEST=false` set in the environment, `npm run test:e2e`
Expected: FAIL on the new WebP and `height` cases; golden unit test also stale.

- [ ] **Step 3: Regenerate and document the golden PNG**

Start the app (`npm run build`, `npm run start`), download `?left=Hello&right=World` (no `height`, so 60px) to `test/golden/hermit-frame.png`, stop the app. Update `test/golden/README.md`: add `sharp` version, note the resize-to-60 step, record new byte size and SHA-256. Keep the existing OS/Node/Chromium provenance unless it changed.

- [ ] **Step 4: Update README**

In `README.md`: widen the `format` row to `png` / `webp`, add a `height` row (`1`–`1000`, default `60`), remove the line saying sharp is only planned, update the golden regeneration command with the default height, and state that both formats are resized by `height`.

- [ ] **Step 5: Run the full gate**

Run (with `CACHE_DISABLED=false`, `FRESH_MANIFEST=false` in the environment for e2e): `npm run assets:build`, `npm run build`, `npm test`, `npm run test:e2e`, `git diff --exit-code -- test/golden/hermit-frame.png`, `git status --short`.
Expected: all green; golden unchanged after regeneration; only intended files modified.

- [ ] **Step 6: Commit**

```bash
git add test/generate.e2e-spec.ts test/golden/hermit-frame.png test/golden/README.md README.md
git commit -m "test: cover WebP and height, refresh golden and docs"
```
