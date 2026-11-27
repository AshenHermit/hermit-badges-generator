# HTML-эндпоинт и вкладка IFrame

## Intent

Дать пользователю тот же бейдж, что рендерится в PNG, но в виде готовой HTML-страницы с подставленными значениями параметров, чтобы встроить её в iframe. В правой панели generator'а вместо одного превью появляются вкладки Render (текущий `<img>`) и IFrame.

## Goals

- `GET /api/v1/generate/html` принимает те же query-параметры, что `/api/v1/generate`, и возвращает подготовленный HTML шаблона.
- HTML в iframe выглядит так же, как при рендере в PNG: работают шрифты, `color.global.js` и картинки шаблона.
- Вкладки Render и IFrame показывают один и тот же «применённый» набор параметров (обновляются по Apply, не на каждом вводе).

## Non-goals

- Редактор исходника HTML, копирование кода, замена PNG-эндпоинта.
- Кеширование HTML и изменение формата PNG-рендера.

## Constraints

- Существующий PNG-рендер должен остаться байт-в-байт прежним (golden-тест). Подстановку `<base>` делать только для HTML-эндпоинта.
- Параметры валидируются тем же `parseGenerateParams`, что и `generate` (template/format/height и переменные шаблона). `format`/`height` для HTML смысла не имеют, но принимаются и валидируются для единообразия.
- Фронт и бэк разнесены по origin'ам (3001 / 3000); `<base>` может быть относительным, т.к. iframe грузит страницу прямо с бэкенда.

## Approaches

1. **IFrame через `src` на эндпоинт (выбран).** Бэкент отдаёт HTML, браузер сам его загружает: нет fetch/CORS и дублирования состояния; URL шарится. Минус — исходник не показывается как текст.
2. **Fetch HTML + `srcDoc`.** Даёт доступ к тексту страницы, но требует абсолютного `base`, обработки ошибок загрузки и лишнего запроса. Отклонён: задача — превью, а не редактор.

## Decisions

### Backend

- `TemplateService.prepareHtml(template, values): string` — вынесенная из `prepare()` подстановка `{{...}}` без записи временного файла; `prepare()` остаётся обёрткой и пишет файл как раньше.
- `GenerationService.generateHtml(rawQuery): string` — `parse()` → `manifests.get()` → `prepareHtml()`. Без Playwright, без кеша.
- `GenerationController`: `GET v1/generate/html`, `Content-Type: text/html; charset=utf-8`, Swagger-описание с теми же query-параметрами.
- Перед отдачей в HTML вставляется `<base href="/api/v1/assets/templates/<id>/">` сразу после `<head>`. Тогда `../../fonts/...`, `../../lib/...` и `./<file>` из шаблона разрешаются в ассеты бэкенда. PNG-рендер этот `<base>` не получает.
- Новый `AssetsController`: `GET /api/v1/assets/*path` раздаёт файлы из `backend/assets` с проверкой, что пути резолвятся внутри корня (защита от `..`), и Content-Type по расширению (png/otf/ttf/js). Регистрируется в `TemplatesModule`.

### Frontend

- `api.ts`: `buildAbsoluteHtmlUrl(search)` → `${API_BASE_URL}/api/v1/generate/html?${search}`.
- `useGenerator`: `iframeUrl`, собранный из `appliedSearch` (как `previewUrl`/`linkUrl`).
- `generator-panel.tsx`: animate-ui tabs (`@animate-ui/react/primitives/radix-ui/tabs`) с `TabsList`/`TabsTrigger` «Render» и «IFrame», `TabsContent` с текущим `<img>` и `<iframe src={generator.iframeUrl}>`; блок превью получает фиксированную минимальную высоту под iframe.

## Tests

- Backend unit: `TemplateService.prepareHtml` подставляет значения и добавляет `<base>`; `GenerationService.generateHtml` валидирует параметры и не вызывает рендер; `AssetsController` отдаёт файл и отвергает выход за корень.
- Backend e2e: `GET /api/v1/generate/html` возвращает 200 с HTML, подставленными значениями и `<base>`; `GET /api/v1/assets/...` отдаёт шрифт/картинку.
- Frontend unit: `buildAbsoluteHtmlUrl`; `useGenerator` отдаёт `iframeUrl` из applied-параметров; панель рендерит две вкладки и iframe с нужным src.
- Existing PNG golden test must still pass.
