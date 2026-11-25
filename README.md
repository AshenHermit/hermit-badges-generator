# badge-generator

NestJS service that renders frame-based SVG badges to PNG. Text is shaped locally with opentype.js, the frame is composed from two half-frame images repeated through SVG `<pattern>` tiles, and the SVG is rasterized deterministically with resvg.

## Requirements

- Node.js 20+
- npm

## Install

```bash
npm install
```

## Build assets

Generate the two half-frame SVG images (`left-half.svg` and `right-half.svg`) from the source frame before starting the app:

```bash
npm run assets:build
```

## Start

```bash
npm run build
npm run start
```

The server listens on port `3000` by default. Override it with the `PORT` environment variable.

Set `CACHE_DISABLED=true` to disable caching: no result is stored and every request is rendered again. Accepted values are `1`, `true`, and `yes` (case-insensitive). The variable is read at startup, so restart the app after changing it.

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

Response: `200` with `Content-Type: image/png` and `Cache-Control: public, max-age=3600`. Invalid parameters return `400`. Identical requests are byte-identical and served from an in-memory SHA-256 keyed cache (1 hour TTL, 1000 entries), unless `CACHE_DISABLED=true` is set.

## Swagger

Interactive API docs: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

OpenAPI JSON: `http://localhost:3000/api/docs/json`

## Tests

```bash
npm test
npm run test:e2e
```

## Future work

`sharp` is planned for additional output formats (for example WebP and JPEG). It is not installed or used in this MVP; only PNG is supported.
