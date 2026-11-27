# badge-generator

NestJS service that renders frame-based badges to PNG or WebP. Each template lives in `assets/templates/<id>/` with a `template.html` (HTML/CSS/JS, inline SVG frame) and a `manifest.json` that declares the query variables the template accepts. Rendering uses headless Chromium through `playwright-core`, which loads the template locally via `file://` and screenshots the badge element. `sharp` then resizes that screenshot to the requested height and encodes PNG or WebP. No network fetch is performed; the font is a local asset.

## Requirements

- Node.js 20.9.0+ (required by the pinned `sharp@0.35.5`)
- npm
- Playwright Chromium installed locally (`playwright-core@1.65.1` resolves it at runtime via `chromium.executablePath()`; the path is not hardcoded)

## Install

```bash
npm install
```

## Templates and manifest

`assets/templates/<id>/template.html` is the editable source. It may contain `{{PLACEHOLDER}}` tokens; each token is backed by a variable declared in the sibling `manifest.json`. A manifest has this shape:

```json
{
  "id": "hermit-frame",
  "template": "template.html",
  "variables": [
    {
      "name": "left",
      "placeholder": "LEFT",
      "type": "string",
      "required": true,
      "maxLength": 32,
      "pattern": "^[^\\p{Cc}\\p{Cf}]+$"
    },
    {
      "name": "borderColor",
      "placeholder": "BORDER_COLOR",
      "type": "color",
      "required": false,
      "default": "rgb(41, 39, 45)"
    }
  ]
}
```

Rules:

- `name` is the query parameter name (`/^[a-z][A-Za-z0-9]*$/`); `template`, `format`, and `height` are reserved.
- `placeholder` is the `{{TOKEN}}` name (`/^[A-Z][A-Z0-9_]*$/`). String values are HTML-escaped before substitution; color and integer values are inserted after validation.
- `type` is `string`, `color`, `integer`, or `select`. Colors accept `#RGB`, `#RRGGBB`, or `rgb(r, g, b)` and are normalized to `rgb(r, g, b)`; integers are validated against `min`/`max`.
- `select` requires `options`: a non-empty array of `{ "value": "...", "label": "..." }`. The query value must equal a `value`; `label` is shown in clients. `default` is a `value`.
- `required: true` has no `default`; `required: false` must have one. Malformed manifests fail at load time.
- Unknown query parameters are rejected with `400`.

The `hermit-frame` manifest declares `left`, `right` (required strings), plus `borderColor`, `leftBgColor`, `rightBgColor`, and `textColor` (optional colors). The template's inline script recolors the embedded SVG using the `colors` map whose values are the `{{BORDER_COLOR}}`, `{{LEFT_BG_COLOR}}`, and `{{RIGHT_BG_COLOR}}` placeholders; `{{TEXT_COLOR}}` sets the text color.

Clients can discover the parameters at runtime:

```bash
curl 'http://localhost:3000/api/v1/templates'
curl 'http://localhost:3000/api/v1/templates/hermit-frame'
```

## Start

```bash
npm run build
npm run start
```

The server listens on port `3000` by default. Override it with the `PORT` environment variable.

Set `CACHE_DISABLED=true` to disable caching: no result is stored and every request is rendered again. Accepted values are `1`, `true`, and `yes` (case-insensitive). The variable is read at startup, so restart the app after changing it.

Set `FRESH_TEMPLATE=true` to re-read the template and its manifest on every generation and bypass cached images, so edits take effect without restarting or clearing the cache. `FRESH_MANIFEST` remains accepted as an alias. Accepted values are `1`, `true`, and `yes` (case-insensitive). The variable is read at startup, so restart the app after changing it.

## Generate a badge

```bash
curl -o badge.png 'http://localhost:3000/api/v1/generate?left=Hello&right=World'

# Custom frame and text colors
curl -o badge.png 'http://localhost:3000/api/v1/generate?left=Hello&right=World&borderColor=%23ff0000&textColor=%2300ff00'
```

`GET /api/v1/generate` fixed query parameters:

| Parameter | Required | Default        | Notes                                       |
| --------- | -------- | -------------- | ------------------------------------------- |
| `template`| no       | `hermit-frame` | Template id; must have a `manifest.json`    |
| `format`  | no       | `png`          | `png` or `webp`                             |
| `height`  | no       | `60`           | Integer 1–1000, output pixels               |

All other parameters come from the template manifest. For `hermit-frame`:

| Name           | Required | Default              | Notes                                  |
| -------------- | -------- | -------------------- | -------------------------------------- |
| `left`         | yes      | —                    | 1–32 printable characters              |
| `right`        | yes      | —                    | 1–32 printable characters              |
| `borderColor`  | no       | `rgb(41, 39, 45)`    | Frame border color                     |
| `leftBgColor`  | no       | `rgb(53, 52, 62)`    | Left frame fill                        |
| `rightBgColor` | no       | `rgb(140, 48, 101)`  | Right frame fill                       |
| `textColor`    | no       | `rgb(232, 230, 223)` | Text color (`#e8e6df`)                 |

Both formats are resized by `height` from the native-size render, preserving aspect ratio. Response: `200` with `Content-Type: image/png` or `image/webp` (per `format`) and `Cache-Control: public, max-age=3600`. Invalid parameters return `400`. Identical requests are byte-identical and served from an in-memory SHA-256 keyed cache (1 hour TTL, 1000 entries), unless `CACHE_DISABLED=true` or `FRESH_TEMPLATE=true` (or its alias `FRESH_MANIFEST=true`) is set.

## Swagger

Interactive API docs: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

OpenAPI JSON: `http://localhost:3000/api/docs/json`

## Tests

```bash
npm test -- --runInBand
npm run test:e2e
```

Run e2e with `CACHE_DISABLED=false` and `FRESH_MANIFEST=false` in the environment so the cache-separation assertions are exercised.

Use `--runInBand` for the full unit suite: `template.service.spec.ts` temporarily rewrites `template.html` and restores the original bytes in `finally`.

Golden PNG regeneration is env-gated (no HTTP download needed). Provenance is recorded in `test/golden/README.md`.

```powershell
npm run build
$env:REGENERATE_GOLDEN = '1'
npx jest --runInBand -t 'matches the committed hermit-frame'
Remove-Item Env:REGENERATE_GOLDEN
npm test -- --runInBand
```
