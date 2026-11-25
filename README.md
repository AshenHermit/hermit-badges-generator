# badge-generator

NestJS service that renders frame-based badges to PNG. `assets/templates/hermit-frame/template.html` is the editable source of truth: HTML/CSS places the left and right text into a native CSS `border-image` frame. Rendering uses headless Chromium through `playwright-core`, which loads the template locally via `file://` and screenshots the badge element. No network fetch is performed.

## Requirements

- Node.js 20+
- npm
- Playwright Chromium installed locally (`playwright-core@1.65.1` resolves it at runtime via `chromium.executablePath()`; the path is not hardcoded)

## Install

```bash
npm install
```

## Template

`assets/templates/hermit-frame/template.html` is the editable source. The service replaces the single `{{LEFT}}` and `{{RIGHT}}` placeholders with HTML-escaped query text. Its CSS is:

```css
@font-face {
  font-family: "Lipstick Rage";
  src: url("../../fonts/Lipstick-Rage.ttf") format("truetype");
}

body {
  margin: 0;
  color: #e8e6df;
  line-height:1.625;
  font-size: 50px;
}

.github-badge { font-family: "Lipstick Rage", sans-serif; --panel-face: #808080; }

.github-badge { display:flex; width:fit-content; box-sizing:border-box; }

.badge-left-part { border-image: url("./left-half.svg") 66 10 48 53 fill / 66px 10px 48px 53px repeat; padding: 49px 20px 41px 53px; }

.badge-right-part { border-image: url("./right-half.svg") 66 53 48 25 fill / 66px 53px 48px 25px repeat; padding: 49px 68px 41px 35px; }
```

The font and both half-frame SVGs are local files under `assets/`. Chromium is launched with `--allow-file-access-from-files` so the template can load them from `file://`. There is no manifest to edit; change the CSS in `template.html` directly.

## Check assets

Verify the template CSS, placeholders, and local font/SVG assets before starting the app:

```bash
npm run assets:build
node scripts/check-assets.mjs
```

`npm run assets:build` runs the same checker (`scripts/check-assets.mjs`); it does not generate or rewrite assets.

## Start

```bash
npm run build
npm run start
```

The server listens on port `3000` by default. Override it with the `PORT` environment variable.

Set `CACHE_DISABLED=true` to disable caching: no result is stored and every request is rendered again. Accepted values are `1`, `true`, and `yes` (case-insensitive). The variable is read at startup, so restart the app after changing it.

Set `FRESH_TEMPLATE=true` to re-read `assets/templates/hermit-frame/template.html` on every generation and bypass cached PNGs, so CSS edits take effect without restarting or clearing the cache. `FRESH_MANIFEST` remains accepted as an alias for `FRESH_TEMPLATE`. Accepted values are `1`, `true`, and `yes` (case-insensitive). The variable is read at startup, so restart the app after changing it.

## Generate a badge

```bash
curl -o badge.png 'http://localhost:3000/api/v1/generate?left=Hello&right=World'
```

`GET /api/v1/generate` query parameters:

| Parameter | Required | Default        | Notes                          |
| --------- | -------- | -------------- | ------------------------------ |
| `left`    | yes      | —              | 1–32 printable characters      |
| `right`   | yes      | —              | 1–32 printable characters      |
| `style`   | no       | `hermit-frame` | Only `hermit-frame` in MVP     |
| `format`  | no       | `png`          | Only `png` in MVP              |

Response: `200` with `Content-Type: image/png` and `Cache-Control: public, max-age=3600`. Invalid parameters return `400`. Identical requests are byte-identical and served from an in-memory SHA-256 keyed cache (1 hour TTL, 1000 entries), unless `CACHE_DISABLED=true` or `FRESH_TEMPLATE=true` (or its alias `FRESH_MANIFEST=true`) is set.

## Swagger

Interactive API docs: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

OpenAPI JSON: `http://localhost:3000/api/docs/json`

## Tests

```bash
npm test -- --runInBand
npm run test:e2e
```

Use `--runInBand` for the full unit suite: `template.service.spec.ts` temporarily rewrites `template.html` and restores the original bytes in `finally`.

## Future work

`sharp` is planned for additional output formats (for example WebP and JPEG). It is not installed or used in this MVP; only PNG is supported.
