# HTML IFrame Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend HTML endpoint that returns the badge template with substituted parameters and working relative assets, then show it in an IFrame tab next to the existing Render preview.

**Architecture:** Reuse `parseGenerateParams` for validation; extract the existing placeholder substitution from `TemplateService.prepare` into a string-returning method and add a `<base>` tag only for the HTML response. Serve `backend/assets` through a guarded static route so the template's relative font/script/image URLs resolve. In the frontend, derive an iframe URL from the same applied query as the PNG preview and wrap both previews in animate-ui tabs.

**Tech Stack:** NestJS 11, TypeScript, Jest/Supertest, Next.js 16, React 19, `@animate-ui/react` 2.4.6 (radix-ui tabs), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-27-html-iframe-design.md`

## Global Constraints

- Do not change PNG rendering, `TemplateService.prepare`'s temp-file behavior, or `DEFAULT_TEMPLATE`; the golden PNG test must remain valid.
- HTML uses the same query validation as `/api/v1/generate`, including `template`, `format`, `height`, and template variables; `format`/`height` are accepted but irrelevant to HTML.
- `<base href="/api/v1/assets/templates/<id>/">` is injected only into the HTML response, never into the temp file used by Playwright.
- Baseline note: this branch has no `hermit-frame` template, so several pre-existing backend specs fail at load with `BadRequestException: template: unknown template "hermit-frame"`. New tests must use `garrison-cat-badge` (or `mglaroute-badge`) instead. Do not "fix" those unrelated specs.
- Backend test command from repo root: `pnpm --dir backend exec jest <path> --runInBand`. Frontend: `pnpm --dir frontend exec vitest run <path>`.

## Review Focus

- Unknown template / invalid color / unknown parameter on the HTML endpoint must give 400, never raw HTML — Task 3 e2e asserts 400 for `template=nope` and an invalid color.
- Path traversal in the asset route (`../`, encoded `..`) must not expose files outside `backend/assets` — Task 2 unit test asserts rejection.
- Relative asset URLs inside the iframe (`../../fonts/...`, `../../lib/...`, `./...`) must resolve — Tasks 1 and 3 assert the injected `<base href="/api/v1/assets/templates/<id>/">` and a 200 for a font URL.
- User text must be HTML-escaped in the response — Task 1 asserts `<script>` input becomes `&lt;script&gt;` and no raw tag survives.
- IFrame must track applied parameters, not draft input — Task 4 asserts `iframeUrl` stays unchanged until `apply()`; Task 5 asserts the iframe `src` uses it.

---

### Task 1: Reusable HTML substitution and `<base>` injection

**Files:**
- Modify: `backend/src/rendering/template.service.ts`
- Test: `backend/src/rendering/html-template.spec.ts` (new)

**Interfaces:**
- Consumes: `TemplateDefinition`, `ResolvedValues` (existing types).
- Produces: `TemplateService.renderHtml(template: TemplateDefinition, values: ResolvedValues): string` (substitution only, no temp file) and `TemplateService.withBase(html: string, templateId: string): string` (injects `<base href="/api/v1/assets/templates/<id>/">` immediately after `<head>`; if no `<head>`, prepends it). `prepare()` keeps its current signature and calls `renderHtml()` before writing the temp file.

- [ ] **Step 1: Write the failing test**

Create `backend/src/rendering/html-template.spec.ts`. Use `new TemplateManifestService().get('garrison-cat-badge')` and `new TemplateParamsService().resolve(definition, { left, right, ... })`. Required assertions:
  - `renderHtml` returns a string containing `<!doctype html>`, the substituted `Hello`/`World`, no `{{LEFT}}`, and no `template-*.html` path.
  - `renderHtml` with `left: '<script>alert(1)</script>'` contains `&lt;script&gt;` and does not contain `<script>alert(1)</script>`.
  - `withBase(html, 'garrison-cat-badge')` contains `<base href="/api/v1/assets/templates/garrison-cat-badge/">` and the tag appears before the original `<style>` tag.
  - `withBase('<html></html>', 'x')` still contains the `<base>` tag.
  - Spy on `fs.writeFileSync` and assert `renderHtml` + `withBase` never call it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir backend exec jest src/rendering/html-template.spec.ts --runInBand`
Expected: FAIL — `renderHtml is not a function`.

- [ ] **Step 3: Implement the two methods**

In `template.service.ts`, move the placeholder-building and `html.replace(...)` block of `prepare()` into `renderHtml()` (same escaping rules: `string` and `select` placeholders escaped, others raw). `prepare()` becomes `fs.writeFileSync(tempPath, this.renderHtml(template, values), 'utf8')`. Add `withBase()` as a plain string insertion after `<head>` (case-insensitive), falling back to prepending when absent.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir backend exec jest src/rendering/html-template.spec.ts --runInBand`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/rendering/template.service.ts backend/src/rendering/html-template.spec.ts
git commit -m "feat: expose prepared badge HTML with asset base tag"
```

---

### Task 2: Guarded static asset route

**Files:**
- Create: `backend/src/templates/assets.controller.ts`
- Modify: `backend/src/templates/templates.module.ts`
- Test: `backend/src/templates/assets.controller.spec.ts` (new)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `AssetsController.get(path: string, res: FileResponse): void`, where `FileResponse = { setHeader(name: string, value: string): unknown; send(body: Buffer): unknown }`. Route: `GET /api/v1/assets/*path`, root directory `path.resolve(process.cwd(), 'assets')`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/templates/assets.controller.spec.ts` with a fake `res` object (`setHeader: jest.fn()`, `send: jest.fn()`) and `new AssetsController()`. Assertions:
  - `get('fonts/Lipstick-Rage.ttf', res)` calls `setHeader('Content-Type', 'font/ttf')` and `send` with a Buffer whose first 4 bytes equal the file on disk.
  - `get('templates/garrison-cat-badge/garrison-cat-badge-frame.png', res)` sets `image/png` and sends the real PNG bytes.
  - `get('../package.json', res)` throws `NotFoundException`.
  - `get('templates/garrison-cat-badge', res)` (a directory) throws `NotFoundException`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir backend exec jest src/templates/assets.controller.spec.ts --runInBand`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AssetsController`**

`@Controller('v1/assets')` with `@Get('*path')` and `@Param('path')`. Resolve `path.resolve(root, rawPath)`, reject when the result is not inside `root` (`target !== root && !target.startsWith(root + path.sep)`), reject non-files, then `setHeader` with extension map `.png → image/png`, `.otf → font/otf`, `.ttf → font/ttf`, `.js → text/javascript`, default `application/octet-stream`, and `send(fs.readFileSync(target))`. Add `Cache-Control: public, max-age=3600`. Register the controller in `TemplatesModule.controllers`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir backend exec jest src/templates/assets.controller.spec.ts --runInBand`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/templates/assets.controller.ts backend/src/templates/templates.module.ts backend/src/templates/assets.controller.spec.ts
git commit -m "feat: serve badge template assets with traversal guard"
```

---

### Task 3: HTML generation endpoint

**Files:**
- Modify: `backend/src/generation/generation.service.ts`
- Modify: `backend/src/generation/generation.controller.ts`
- Modify: `backend/src/rendering/rendering.module.ts`
- Modify: `backend/src/generation/generation.service.spec.ts` (constructor call only; this spec already fails at load on this branch)
- Test: `backend/src/generation/html-generation.spec.ts` (new)
- Test: `backend/test/html.e2e-spec.ts` (new)

**Interfaces:**
- Consumes: `GenerationService.parse(rawQuery)` (existing), `TemplateService.renderHtml`/`withBase` from Task 1, `AssetsController` route from Task 2.
- Produces: `GenerationService.generateHtml(rawQuery: Record<string, unknown>): string`; `GET /api/v1/generate/html` returning `text/html; charset=utf-8`.

- [ ] **Step 1: Write the failing tests**

`backend/src/generation/html-generation.spec.ts`: build `GenerationService` directly with minimal mocks (badgeCache, rendererRegistry, imageTransformer, `new TemplateManifestService()`, `new TemplateParamsService()`, `new TemplateService()`) and use `garrison-cat-badge`. Assertions:
  - `generateHtml({ template: 'garrison-cat-badge', left: 'Hello', right: 'World' })` returns HTML containing `Hello`, `World`, and the `<base>` tag from Task 1.
  - It does not call `rendererRegistry.get`, `badgeCache.get`, `badgeCache.set`, or `imageTransformer.transform`.
  - Invalid query (`template: 'nope'`, invalid `color`, unknown param) rejects.

`backend/test/html.e2e-spec.ts` using `createApp()` from `./helpers/create-app` and Supertest:
  - `GET /api/v1/generate/html?template=garrison-cat-badge&left=Hello&right=World` → 200, `content-type` contains `text/html`, body contains `<base href="/api/v1/assets/templates/garrison-cat-badge/">`, `Hello`, `World`, and not `{{LEFT}}`.
  - `GET /api/v1/generate/html?template=garrison-cat-badge&left=%3Cscript%3E&right=World` → body contains `&lt;script&gt;`.
  - `GET /api/v1/generate/html?template=nope` → 400.
  - `GET /api/v1/assets/fonts/Lipstick-Rage.ttf` → 200 with `content-type` containing `font/ttf`; `GET /api/v1/assets/../package.json` → 4xx.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm --dir backend exec jest src/generation/html-generation.spec.ts --runInBand
pnpm --dir backend exec jest --config test/jest-e2e.json --runInBand test/html.e2e-spec.ts
```
Expected: FAIL — `generateHtml is not a function`, HTML route 404.

- [ ] **Step 3: Implement service and controller**

In `GenerationService`, add `generateHtml(rawQuery)`: `const query = this.parse(rawQuery)`, `const definition = this.manifests.get(query.templateId)`, return `this.templates.withBase(this.templates.renderHtml(definition, query.variables), definition.id)`. Inject `TemplateService` as a new final constructor parameter. Add `TemplateService` to `RenderingModule.exports`. Update the `makeService()` helper in the existing `generation.service.spec.ts` to pass its `templateService` as the new final argument so the spec stays consistent. Do not touch `generate()`.

In `GenerationController`, add `@Get('html')` **before** `@Get()` with `@Header('Content-Type', 'text/html; charset=utf-8')`, `@Header('Cache-Control', 'public, max-age=3600')`, Swagger operation/produces/query docs matching `generate` (omit `format` and `height` docs; they stay accepted), returning `this.generationService.generateHtml(query)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: same two commands as Step 2.
Expected: PASS (3 unit tests, 4 e2e tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/generation/generation.service.ts backend/src/generation/generation.controller.ts backend/src/generation/html-generation.spec.ts backend/test/html.e2e-spec.ts
git commit -m "feat: add badge HTML endpoint for iframe embedding"
```

---

### Task 4: Frontend URL builder and hook state

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/use-generator.ts`
- Test: `frontend/src/lib/api.test.ts`
- Test: `frontend/src/hooks/use-generator.test.tsx`

**Interfaces:**
- Consumes: `buildGenerateSearch` (existing).
- Produces: `buildAbsoluteHtmlUrl(search: string): string` → `${API_BASE_URL}/api/v1/generate/html?${search}`; `GeneratorApi.iframeUrl: string` derived from `appliedSearch`, empty string when it is empty.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/lib/api.test.ts`: `buildAbsoluteHtmlUrl('left=Hello')` equals `${API_BASE_URL}/api/v1/generate/html?left=Hello`.

In `frontend/src/hooks/use-generator.test.tsx`: render hook with a template; assert `iframeUrl` starts with `/api/v1/generate/html?` (or the mocked API base), equals the URL built from applied defaults, stays unchanged after `setParam`, and changes after `apply()`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run src/lib/api.test.ts src/hooks/use-generator.test.tsx`
Expected: FAIL — `buildAbsoluteHtmlUrl is not a function`, `iframeUrl` undefined.

- [ ] **Step 3: Implement**

Add `buildAbsoluteHtmlUrl` next to `buildAbsoluteGenerateUrl` in `api.ts`. In `use-generator.ts`, add `iframeUrl` to `GeneratorApi` and return `iframeUrl: appliedSearch ? buildAbsoluteHtmlUrl(appliedSearch) : ""`.

- [ ] **Step 4: Run tests to verify they pass**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/use-generator.ts frontend/src/lib/api.test.ts frontend/src/hooks/use-generator.test.tsx
git commit -m "feat: derive iframe URL from applied generator params"
```

---

### Task 5: Render / IFrame tabs in the generator panel

**Files:**
- Modify: `frontend/src/components/generator-panel.tsx`
- Modify: `frontend/src/components/generator-panel.test.tsx`

**Interfaces:**
- Consumes: `generator.previewUrl`, `generator.iframeUrl` (Task 4), `GeneratorPanelProps` (existing).
- Produces: panel with two tabs — `Render` (existing `<img>`) and `IFrame` (`<iframe src={generator.iframeUrl}>`).

- [ ] **Step 1: Write the failing test**

In `frontend/src/components/generator-panel.test.tsx`, render `GeneratorPanel` with a stub generator (`previewUrl: 'http://localhost:3000/api/v1/generate?...'`, `iframeUrl: 'http://localhost:3000/api/v1/generate/html?...'`). Assert:
  - `screen.getByRole('tab', { name: 'Render' })` and `screen.getByRole('tab', { name: 'IFrame' })` exist, Render selected by default.
  - `screen.getByRole('img', { name: 'Badge preview' })` has the `previewUrl` src.
  - After `fireEvent.click(screen.getByRole('tab', { name: 'IFrame' }))`, `screen.getByTitle('Badge HTML preview')` is an iframe with `src === iframeUrl`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend exec vitest run src/components/generator-panel.test.tsx`
Expected: FAIL — no tabs found.

- [ ] **Step 3: Implement the tabs**

Import `{ Tabs, TabsContent, TabsList, TabsTrigger }` from `@animate-ui/react/primitives/radix-ui/tabs`. Wrap the existing preview `div` in `<Tabs defaultValue="render">`; add `<TabsList>` with `<TabsTrigger value="render">Render</TabsTrigger>` and `<TabsTrigger value="iframe">IFrame</TabsTrigger>`; put the existing `<img>`/empty state into `<TabsContent value="render">` and an `<iframe title="Badge HTML preview" src={generator.iframeUrl} className="min-h-48 w-full" />` into `<TabsContent value="iframe">`. Give the shared preview container a fixed `min-h-48` and `w-full` so both panes have the same size. Keep the rest of the panel unchanged.

- [ ] **Step 4: Run tests and type check**

Run:
```bash
pnpm --dir frontend exec vitest run src/components/generator-panel.test.tsx
pnpm nx run frontend:check-types
```
Expected: PASS, no type errors.

- [ ] **Step 5: Commit and verify whole frontend**

```bash
git add frontend/src/components/generator-panel.tsx frontend/src/components/generator-panel.test.tsx
git commit -m "feat: add Render and IFrame preview tabs"
pnpm nx run frontend:test
```
Expected: full frontend suite PASS.

---

## Final verification

- `pnpm nx run frontend:test` and `pnpm nx run frontend:check-types` — green.
- `pnpm --dir backend exec jest src/rendering/html-template.spec.ts src/templates/assets.controller.spec.ts src/generation/html-generation.spec.ts --runInBand` — green.
- `pnpm --dir backend exec jest --config test/jest-e2e.json --runInBand test/html.e2e-spec.ts` — green.
- Backend full suite still has the pre-existing `hermit-frame` fixture failures listed in Global Constraints; confirm no new failures appear.
- Manual: start backend and frontend, select a template, open IFrame tab, confirm frame/font render and Apply swaps both previews.
