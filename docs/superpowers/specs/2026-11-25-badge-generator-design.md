# Hermit Badges Generator — дизайн

Дата: 2026-11-25
Статус: approved (пользователь подтвердил resvg + opentype.js)

## Intent

Сервис на NestJS, который по query-параметрам генерирует изображение бейджа и кеширует результат. Проект задуман расширяемым: несколько **форматов генерации** и несколько **стилей** — независимые оси, новые добавляются без переписывания контроллера.

MVP: один стиль `hermit-frame` (на основе `badge_frame.svg`), один формат `png`, один endpoint.

## Goals

- `GET /api/v1/generate?left=...&right=...&style=hermit-frame&format=png` → PNG.
- Текст вставляется в левую и правую секции бейджа.
- Ширина растёт по тексту (вариант А): края остаются родными, тянется/повторяется только средняя зона.
- 9-slice: углы фиксированные, **рёбра и центр повторяются (tile/repeat), не растягиваются**. Растяжение запрещено.
- Шрифт Mansalva, локальный TTF в репозитории. Никаких обращений к Google Fonts в рантайме.
- Ключ кеша — `sha256(endpoint + канонический query)`.
- Swagger на `/api/docs`.

## Non-goals

- Веб-UI. `index.html` — устаревший прототип, не эталон и не источник логики; в MVP не используется.
- Иконки (star/check/heart/bug/bolt из прототипа) — не нужны.
- Другие форматы (SVG, WebP и т.д.) и другие стили в MVP.
- Авторизация, rate limiting, распределённый/персистентный кеш.
- Headless-браузер, DOM, `getComputedTextLength`.

## Anti-goals

- Растягивание слайсов — даёт видимые искажения, прямо отвергнуто пользователем.
- Загрузка шрифта по сети во время запроса — ломает детерминизм и кеш.
- Копирование логики из `index.html` — там нет настоящего 9-slice и неверная раскладка.

## Constraints

- Источник `badge_frame.svg`: `viewBox="251 30 618 181"`, hand-drawn неровная рамка, не является тайлинг-совместимой как есть. Нужны **производные заготовки** (tileable assets) — пользователь прямо допустил их создание.
- Окружение разработки: Windows. Избегать нативных бинарников; `@resvg/resvg-js` поставляет WASM-пребилды.
- Результат должен быть байт-детерминированным, иначе хэш-кеш теряет смысл.
- Левая и правая секции рамки имеют разную заливку (тёмная / маджента), поэтому 9-slice делается **двумя независимыми группами** (по одной на секцию), а не одним общим срезом: иначе шов между секциями начнёт повторяться.

## Approaches

1. **resvg + opentype.js (выбран)**. Компонуем SVG из девяти регионов шаблона (углы — как есть, рёбра и центр — `<pattern>`/`use`-тайлинг без масштабирования) и текста, превращённого opentype.js в SVG-`<path>`. `@resvg/resvg-js` рендерит PNG. Метрики и рендер из одного источника — нет риска расхождения. Детерминизм, кросс-платформенность, простой кеш.
2. **node-canvas**. Растр рамки + `drawImage`-слайсы + `measureText`/`fillText`. Метрики и рендер от одного движка, но нативные бинарники и ненадёжная загрузка SVG на Windows. Отвергнут.
3. **Headless Chromium**. Точная браузерная вёрстка ценой тяжёлого рантайма, медленного старта и проблем с конкуренцией. Отвергнут.

Пользователь выбрал вариант 1 и уточнил: рёбра и центр — repeat, не stretch.

### Research findings (omniroute: anysearch-search / context7)

- `@resvg/resvg-js`: пребилды без нативных сборок, в бенчмарке repo быстрее sharp/skr-canvas/svg2img; принимает `font.fontFiles` / `font.fontBuffers` и `loadSystemFonts: false`. Поскольку текст превращается в `<path>`, рендереру шрифт вообще не нужен → `loadSystemFonts: false` даёт дополнительный детерминизм и скорость между машинами.
- resvg имеет поддержку статического SVG 1.1, включая вложенные `<svg>` (по test-suite). Тем не менее тайлинг делается явными повторами `<use>`, а не `<pattern>`: меньше зависимостей от кромочных случаев pattern и проще посчитать число плиток в тесте.
- `opentype.js` понимает TTF/OTF/WOFF, **не понимает WOFF2** → шрифт берём TTF из `google/fonts` (`ofl/mansalva/Mansalva-Regular.ttf` + `OFL.txt`), а не WOFF2 из CSS API Google Fonts.
- Альтернатива `@napi-rs/canvas` (Skia, Rust/NAPI) реально существует и даёт метрики+рендер в одном движке, но выбор сделан в пользу resvg + opentype.js.
- **Swagger**: `setGlobalPrefix()` по умолчанию НЕ применяется к путям Swagger. Для `/api/docs` нужно `SwaggerModule.setup('docs', app, documentFactory, { useGlobalPrefix: true })`. Документ билдить лениво через factory.
- Источники: `github.com/thx/resvg-js`, `context7.com/thx/resvg-js`, `docs.nestjs.com/openapi/introduction`, `github.com/nestjs/swagger/issues/105`, `opentype.js.org`, `linebender.org/resvg-test-suite`.

## Research findings (OmniRoute: context7 + anysearch)

Проверено до фиксации дизайна, чтобы не гадать:

- **resvg-js** — быстрее sharp, skr-canvas и svg2img в бенчмарке репозитория (`resvg-js 12 ops/s`, `sharp 9`, `skr-canvas 7`, `svg2img 6`). Есть Node (napi-rs) и WASM-бэкенды; `font.fontFiles` / `font.fontBuffers` для локальных шрифтов; `loadSystemFonts: false` ускоряет рендер. Есть `renderAsync()` — использовать его, чтобы не блокировать event loop. `asPng()` возвращает `Uint8Array`. Источник: `context7.com/thx/resvg-js`, DeepWiki resvg-js.
- **resvg внутри сам превращает текст в path перед рендером** ( reddit.com/r/rust/comments/c2m8t7, issue RazrFalcon/resvg#159: шрифты только локальные, text → paths). Значит превращение текста в `<path>` на нашей стороне — не костыль, а тот же подход; он дополнительно гарантирует, что измеренная opentype.js ширина совпадёт с отрисованной. Шрифт в resvg можно вообще не грузить.
- **@napi-rs/canvas** — Skia через N-API, без системных зависимостей; `GlobalFonts.registerFromPath`, `measureText`/`fillText`, `Path2D(svgPathString)`, `canvas.encode('png' | 'jpeg' | 'webp' | 'avif')`. Живой кандидат на будущие форматы (WebP/AVIF), но в MVP не нужен; оставить как задел для `RendererRegistry`. Источник: `context7.com/brooooooklyn/canvas`, npm-страница пакета.
- **shields.io / badge-maker** — prior art: ширина текста считается по предвычисленной таблице (`widths.json`) для фиксированного шрифта, без парсинга шрифта в рантайме. Мы берём локальный TTF и меряем opentype.js при старте — точнее для Mansalva и тоже детерминированно. Источник: `github.com/badges/shields/tree/master/badge-maker`.
- **9-slice repeat** — стандартный режим наряду со stretch (GameMaker blog, Aerotwist «Slicing SVG 9 Ways»); пользователь выбрал именно repeat.
- **Шрифт**: `Mansalva-Regular.ttf` и `OFL.txt` доступны в `google/fonts` по пути `ofl/mansalva/`. TTF (не WOFF2) — opentype.js понимает TTF/OTF, но не WOFF2.

Корректировки в архитектуре из этих находок: рендер через `renderAsync()`, `loadSystemFonts: false`, resvg не загружает шрифт вообще (текст уже path).

## Architecture

### Модули

- `AppModule` — сборка, `ConfigModule`, глобальный префикс `api`.
- `GenerationModule` — `GenerationController`, `GenerationService`, DTO, Swagger-декораторы.
- `StylesModule` — `StyleRegistry`: `style id → StyleDefinition` (ассеты, 9-slice-конфиг, зоны текста, шрифт, цвета).
- `RenderingModule` — `RendererRegistry`: `format → Renderer` (пока только `PngRenderer` на resvg).
- `CacheModule` — `BadgeCache` interface + `MemoryCacheService` + `CacheKeyFactory`.
- `Composer` (в GenerationModule) — `BadgeComposer`, `nine-slice.ts`, `text-shaper.ts`.

### Поток запроса

1. `GET /api/v1/generate` → `GenerateQueryDto` прогоняется через глобальный `ValidationPipe` (`whitelist`, `transform`). Поля: `left` (required), `right` (required), `style` (default `hermit-frame`), `format` (default `png`).
2. `CacheKeyFactory` строит ключ из **нормализованных** параметров (дефолты уже подставлены): пары `key=value` сортируются по ключу, values — `encodeURIComponent`, затем `sha256(endpoint + '?' + canonical)`. Порядок параметров в URL не влияет на ключ.
3. Cache hit → сразу Buffer с заголовками `Content-Type: image/png`, `Cache-Control: public, max-age=...`.
4. Cache miss → `StyleRegistry` отдаёт `StyleDefinition` → `BadgeComposer` собирает SVG → `PngRenderer` даёт Buffer → `cache.set` → ответ.

### 9-slice

- `StyleDefinition` содержит две группы срезов: `halves.left` и `halves.right`.
- Каждая группа задаёт 9 регионов в координатах исходного viewBox: 4 угла (`corner`), 4 ребра (`tile-x` / `tile-y`), центр (`tile-xy`).
- Углы вставляются один раз в нативном размере. Рёбра и центр повторяются целыми плитками внутри клип-вьюпорта через явные `<use>`; **масштабирование коэффициентом, отличным от 1, запрещено**. `<pattern>` не используется.
- Ширина половины: `max(minHalfWidth, textWidth + 2 * padding)`. Общая ширина = `leftWidth + rightWidth`. Высота = высота шаблона.
- Текст центрируется в зоне своей половины по X и по Y. Базовая линия считается из метрик шрифта (`ascender`/`descender`).
- Текст → `font.getPath(...)` → `<path d="...">`, подстановка шрифта в рендерере не требуется.

### Ассеты

```
assets/
  fonts/Mansalva-Regular.ttf
  fonts/OFL.txt
  templates/hermit-frame/
    manifest.json          # viewBox, срезы, зоны текста, шрифт, размеры
    left/*.svg             # тайлинг-совместимые заготовки левой секции
    right/*.svg            # тайлинг-совместимые заготовки правой секции
```

`badge_frame.svg` остаётся как исторический источник, но рантайм читает готовые заготовки. Заготовки должны иметь стыкующиеся края — иначе повтор даст видимые швы; это проверяется визуальным golden-тестом.

### Кеш

- Интерфейс `BadgeCache { get(key): Buffer | undefined; set(key, value): void }`.
- `MemoryCacheService`: `Map`, `ttlMs`, `maxEntries`, простая LRU- или FIFO-эвикция. Настройки через env.
- Валидация: `maxLength` для `left`/`right`, запрет control characters.

### Swagger и роутинг

- `app.setGlobalPrefix('api')`, путь контроллера `v1/generate` → `/api/v1/generate`.
- `SwaggerModule.setup('docs', app, documentFactory, { useGlobalPrefix: true })` → `/api/docs`; без `useGlobalPrefix` Swagger уедет на `/docs`. `jsonDocumentUrl: 'docs/json'` → `/api/docs/json`.
- Документ создаётся лениво через `() => SwaggerModule.createDocument(app, config)`.
- DTO с `@ApiProperty`, ответ объявляется как `image/png` binary.

## Future work (по просьбе пользователя, не в MVP)

- **Добавить `sharp`** для поддержки дополнительных форматов вывода (WebP/JPEG/AVIF) поверх PNG, который даёт resvg. Сейчас в MVP только PNG; `RendererRegistry` должен оставить место для второго рендерера на sharp.

## Tests

- Unit: канонизация query (порядок не важен), расчёт ширины по тексту, генерация SVG содержит ожидаемое число плиток и ни одного масштабирования, метрики opentype.
- E2E: `image/png` в ответе, два одинаковых запроса → побайтово равные ответы, разные тексты → разные ответы, `/api/docs` → 200, невалидный query → 400.
- Golden PNG для `hermit-frame` с фиксированным текстом — ловит швы и регрессии вёрстки.

## Decisions made by builder (not user-approved)

- Максимальная длина текста: 32 символа.
- TTL кеша: 1 час; максимум 1000 записей.
- Высота выхода: 181 px (как у `badge_frame.svg`).
- Цвет текста: белый; размер шрифта: из manifest стиля.
- Конкретные координаты срезов подбираются по исходной рамке; правило — углы фикс, рёбра/центр тайл, без растяжения.
- Формат ключа кеша: hex sha256.

## What's left to the builder

- Нарезать `badge_frame.svg` на тайлинг-совместимые заготовки левой/правой секций и записать координаты в `manifest.json`.
- Получить `Mansalva-Regular.ttf` и `OFL.txt` из Google Fonts, положить в `assets/fonts`.
- Реализовать модули и тесты по описанию выше.
- Написать `PLAN.md` — план проекта (после одобрения этого документа).
