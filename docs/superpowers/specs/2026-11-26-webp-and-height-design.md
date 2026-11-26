# WebP output and height parameter — design

## Intent

Add WebP output encoded with `sharp`, plus a single `height` query parameter that
resizes both PNG and WebP. Default height is 60px regardless of format. Chromium
keeps rendering the badge at its native size from the editable template; resizing
and encoding happen afterwards as one image-processing step.

## Goals

- `format=webp` returns a valid WebP image; `format=png` keeps working.
- `height=<n>` controls output height in pixels; omitted means `60`.
- Aspect ratio preserved; width follows from the native badge proportions.
- Cache key distinguishes format and height; byte-identical requests still hit cache.
- Swagger, DTO validation, DTO defaults, README and golden asset reflect the new surface.

## Non-goals

- No width parameter, quality parameter, JPEG or other formats.
- No changes to `assets/templates/hermit-frame/template.html` or its exact CSS values.
- No change to `CACHE_DISABLED`, `FRESH_TEMPLATE` / `FRESH_MANIFEST`, or the cache key algorithm.
- No network fetch at runtime; sharp and Chromium are local only.

## Constraints

- Node 24, NestJS 11, Jest + ts-jest, `playwright-core@1.65.1`.
- `sharp` is a new native dependency; it must be installed and pinned in `package.json` / `package-lock.json`.
- `ValidationPipe` runs with `transform: true`, `whitelist: true`, `forbidNonWhitelisted: true`, so new DTO fields need `@Type(() => Number)` and proper decorators.
- Exact border-image CSS from the earlier spec remains authoritative. Rendering natively at 60px would require changing those slice values, so it is rejected.

## Approaches

1. **One sharp pass after render (chosen).** `BrowserRenderer` still returns the native-size PNG buffer. A new `ImageTransformer` resizes to `height` and encodes to the requested format. `RendererRegistry` stays PNG-only. Least churn; one resize implementation; CSS untouched. Cost: golden PNG bytes change and must be regenerated.
2. **Format-specific renderers in the registry.** `PngRenderer` and `WebpRenderer` each wrap sharp. Format ownership is cleaner in the registry, but resize/encode logic is duplicated across classes and tests.
3. **Native render at target height.** Pass `height` into CSS and scale font/padding/border-image slices; sharp only converts to WebP. Sharpest small text, but violates the frozen CSS values and needs visual re-verification of the hand-drawn frame.

Approach 1 was picked by the user after the tradeoffs above.

## Decisions (my calls)

- Parameter name: `height`. Integer, `1`–`1000`, default `60`; anything else → 400.
- Resize: `sharp(png).resize({ height })` — width omitted, so aspect ratio is preserved and upscaling is allowed.
- WebP encoding: sharp defaults (`quality: 80`), alpha preserved from `omitBackground: true`.
- Content type is set per request from the validated `format`; Swagger advertises both `image/png` and `image/webp`.
- `GenerationService` includes `height` in the canonical cache key and caches the final encoded bytes.
- Golden PNG is regenerated from `left=Hello&right=World` with the default height; its provenance records the resize step, new size and SHA-256.
- E2E test that currently expects `format=webp` → 400 is replaced with a WebP success case; invalid-format coverage moves to a value that is still unsupported.

## Implementation sketch

- `src/rendering/image-transformer.ts`: `ImageTransformer.transform(png: Buffer, format: 'png' | 'webp', height: number): Promise<Buffer>`.
- `src/generation/dto/generate-query.dto.ts`: add `height` with `@Type(() => Number)`, `@IsInt()`, `@Min(1)`, `@Max(1000)`, `@IsOptional()`, default `60`; widen `format` to `png` / `webp`.
- `src/generation/generation.service.ts`: add `height` to cache key, run transformer after render, before cache set.
- `src/generation/generation.controller.ts`: drop static `@Header('Content-Type')`, set it from `format`, update Swagger metadata and response type.
- `src/rendering/rendering.module.ts`: provide/export `ImageTransformer`.
- Tests: unit tests for transformer (dimensions, both encodings, defaults) and DTO/service key separation; e2e for WebP magic/header, height variants, invalid heights, cache separation; regenerate golden and update `test/golden/README.md`; update README.

## Open questions

None. Height scope (both formats), default (60px) and implementation approach (sharp post-process) were settled with the user.
