# Select Template Variable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `select` template variable with `{ value, label }` options to manifests, backend validation/API, and the generator UI.

**Architecture:** Backend manifest parsing validates select options and defaults; query resolution restricts values to option values; controller exposes options; HTML substitution escapes select values. Frontend types, field renderer, and default-value fallback consume the new metadata. A demo manifest exercises the feature end-to-end.

**Tech Stack:** NestJS 11 + TypeScript (backend), Next.js 16.4.6 + React 19 + Radix Select + Vitest (frontend), pnpm/nx monorepo.

**Spec:** `docs/superpowers/specs/2026-11-27-select-template-variable-design.md`

## Global Constraints

- `type` union gains exactly `'select'`; option shape is exactly `{ value: string; label: string }`.
- `default` for select is an option **value**, never a label.
- Required select variables must not declare `default`; optional select variables must.
- `options` required for select, rejected on other types; values non-empty strings and unique; labels non-empty strings.
- Manifest errors stay `Error("Invalid template manifest: ...")`; query errors stay `BadRequestException("<field>: <reason>")`.
- Select values are HTML-escaped on substitution, like `string` variables.
- Do not touch `backend/assets/templates/hermit-frame` or any test that references it; it is deleted in the working tree and its failing tests are out of scope.
- Frontend work follows `frontend/AGENTS.md`: read bundled `dist/docs/` guides before editing (done: `01-app/03-api-reference/01-directives/use-client.md`).

## Review Focus

- Malformed manifest (missing/empty options, duplicate values, bad label/value, default outside options) must fail at load → Task 1 tests.
- Query value outside options must be rejected with 400 → Task 2 test.
- Option value containing HTML must be escaped before substitution → Task 3 test.
- Metadata API must include `options` so the client can render them → Task 3 test.
- Required select without a default must start at the first option value so it never sends an invalid value → Task 5 test.
- UI must show `label` and emit `value` → Task 4 test.

---

### Task 1: Manifest type and option validation

**Files:**
- Modify: `backend/src/templates/template-definition.ts`
- Modify: `backend/src/templates/template-manifest.service.ts`
- Test: `backend/src/templates/template-manifest.service.spec.ts` (new)

**Interfaces:**
- Consumes: existing `parseVariable` logic in `template-manifest.service.ts`.
- Produces: `TemplateVariableType` including `'select'`; `SelectOption { value: string; label: string }`; `TemplateVariable.options?: SelectOption[]`; exported `parseVariable(value: unknown): TemplateVariable`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/templates/template-manifest.service.spec.ts` importing `parseVariable` from `./template-manifest.service`. Add cases:

```ts
const base = { name: 'theme', placeholder: 'THEME', type: 'select', required: true };

it('parses select options', () => {
  expect(parseVariable({ ...base, options: [
    { value: 'dark', label: 'Тёмная' },
    { value: 'light', label: 'Светлая' },
  ] })).toMatchObject({
    type: 'select',
    options: [
      { value: 'dark', label: 'Тёмная' },
      { value: 'light', label: 'Светлая' },
    ],
  });
});

it.each([
  ['missing options', {}],
  ['empty options', { options: [] }],
  ['non-array options', { options: 'dark' }],
  ['duplicate values', { options: [
    { value: 'dark', label: 'A' }, { value: 'dark', label: 'B' },
  ] }],
  ['empty value', { options: [{ value: '', label: 'A' }] }],
  ['empty label', { options: [{ value: 'dark', label: '' }] }],
  ['non-string label', { options: [{ value: 'dark', label: 1 }] }],
])('rejects %s', (_name, extra) => {
  expect(() => parseVariable({ ...base, ...extra })).toThrow(/Invalid template manifest/);
});

it('rejects a default outside options', () => {
  expect(() => parseVariable({ ...base, required: false, default: 'other',
    options: [{ value: 'dark', label: 'A' }] })).toThrow(/default/);
});

it('rejects a numeric default for select', () => {
  expect(() => parseVariable({ ...base, required: false, default: 1,
    options: [{ value: 'dark', label: 'A' }] })).toThrow(/default/);
});

it('accepts a default equal to an option value', () => {
  expect(parseVariable({ ...base, required: false, default: 'dark',
    options: [{ value: 'dark', label: 'A' }] })).toMatchObject({ default: 'dark' });
});

it('rejects options on non-select variables', () => {
  expect(() => parseVariable({ name: 'left', placeholder: 'LEFT', type: 'string',
    required: true, options: [{ value: 'a', label: 'A' }] })).toThrow(/options/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir backend exec jest src/templates/template-manifest.service.spec.ts --runInBand`
Expected: FAIL (`parseVariable` is not exported / select unsupported).

- [ ] **Step 3: Implement the type and parser changes**

In `template-definition.ts`: add `'select'` to `TemplateVariableType`, export `interface SelectOption { value: string; label: string }`, and add `options?: SelectOption[]` to `TemplateVariable`.

In `template-manifest.service.ts`: export `parseVariable`, add `'select'` to `TYPES`, and inside `parseVariable` validate: `raw.options` is a non-empty array for select (and absent for other types); each entry is an object with non-empty string `value` and `label`; values are unique; for select, `defaultValue` (if present) must be a string contained in the values. Use `fail(...)` with messages mentioning `options` or `default`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir backend exec jest src/templates/template-manifest.service.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/templates/template-definition.ts backend/src/templates/template-manifest.service.ts backend/src/templates/template-manifest.service.spec.ts
git commit -m "feat: validate select options in template manifests"
```

### Task 2: Query value resolution for select

**Files:**
- Modify: `backend/src/templates/template-definition.ts`
- Modify: `backend/src/templates/template-params.service.ts`
- Test: `backend/src/templates/template-params.service.spec.ts` (new)

**Interfaces:**
- Consumes: `TemplateVariable`, `invalid` from Task 1.
- Produces: `normalizeSelect(raw: string, variable: TemplateVariable): string` exported from `template-definition.ts`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/templates/template-params.service.spec.ts`:

```ts
import { TemplateDefinition } from './template-definition';
import { TemplateParamsService } from './template-params.service';

const definition = (defaultValue?: string): TemplateDefinition => ({
  id: 'demo', file: '',
  variables: [{
    name: 'theme', placeholder: 'THEME', type: 'select', required: defaultValue === undefined,
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    options: [{ value: 'dark', label: 'Тёмная' }, { value: 'light', label: 'Светлая' }],
  }],
});

it('accepts a declared option value', () => {
  expect(new TemplateParamsService().resolve(definition(), { theme: 'light' }))
    .toEqual({ theme: 'light' });
});

it('rejects a value outside options', () => {
  expect(() => new TemplateParamsService().resolve(definition(), { theme: 'neon' }))
    .toThrow('theme: must be one of the allowed options');
});

it('validates defaults too', () => {
  expect(() => new TemplateParamsService().resolve(definition('neon'), {}))
    .toThrow('theme: must be one of the allowed options');
});

it('rejects a non-string value', () => {
  expect(() => new TemplateParamsService().resolve(definition(), { theme: 1 }))
    .toThrow('theme: must be a string');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir backend exec jest src/templates/template-params.service.spec.ts --runInBand`
Expected: FAIL (`select` not handled, unknown option accepted).

- [ ] **Step 3: Implement `normalizeSelect` and the switch case**

In `template-definition.ts`, export `normalizeSelect(raw: string, variable: TemplateVariable): string`: throw `invalid(variable.name, 'must be one of the allowed options')` unless `variable.options?.some((option) => option.value === raw)`; otherwise return `raw`.

In `template-params.service.ts`, import `normalizeSelect` and add `case 'select': values[variable.name] = normalizeSelect(supplied, variable); break;`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir backend exec jest src/templates/template-params.service.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/templates/template-definition.ts backend/src/templates/template-params.service.ts backend/src/templates/template-params.service.spec.ts
git commit -m "feat: validate select query values"
```

### Task 3: Escaping and metadata API

**Files:**
- Modify: `backend/src/rendering/template.service.ts`
- Modify: `backend/src/templates/templates.controller.ts`
- Test: `backend/src/rendering/template-select.spec.ts` (new)
- Test: `backend/src/templates/templates.controller.spec.ts` (new)

**Interfaces:**
- Consumes: `TemplateDefinition`, `TemplateVariable`, `TemplateManifestService` shape from Tasks 1–2.
- Produces: `TemplatesController.getParameters(id)` returns select `options` as `{ value, label }[]`.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/rendering/template-select.spec.ts`. Build a temp HTML file containing `<p>{{THEME}}</p>` and a `TemplateDefinition` with a select variable `theme` / placeholder `THEME` whose single option value is `<b>x</b>`. Call `new TemplateService().prepare(definition, { theme: '<b>x</b>' })`, read the temp file, assert it contains `&lt;b&gt;x&lt;/b&gt;` and not `<b>`. Clean up both temp files in `finally`.

Create `backend/src/templates/templates.controller.spec.ts`:

```ts
import { TemplatesController } from './templates.controller';

const variable = {
  name: 'theme', placeholder: 'THEME', type: 'select', required: false,
  default: 'dark',
  options: [{ value: 'dark', label: 'Тёмная' }, { value: 'light', label: 'Светлая' }],
} as const;

it('exposes select options in metadata', () => {
  const controller = new TemplatesController({ get: () => ({
    id: 'demo', file: '', variables: [variable],
  }) } as never);
  expect((controller.getParameters('demo') as { parameters: unknown[] }).parameters[0])
    .toMatchObject({ type: 'select', default: 'dark', options: [
      { value: 'dark', label: 'Тёмная' }, { value: 'light', label: 'Светлая' },
    ] });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir backend exec jest src/rendering/template-select.spec.ts src/templates/templates.controller.spec.ts --runInBand`
Expected: FAIL (raw HTML present, `options` undefined).

- [ ] **Step 3: Implement escaping and metadata**

In `template.service.ts`, change `stringVariables` filter to include `variable.type === 'select'`.

In `templates.controller.ts`, add after the `max` line:

```ts
...(variable.options !== undefined ? { options: variable.options } : {}),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir backend exec jest src/rendering/template-select.spec.ts src/templates/templates.controller.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/rendering/template.service.ts backend/src/templates/templates.controller.ts backend/src/rendering/template-select.spec.ts backend/src/templates/templates.controller.spec.ts
git commit -m "feat: escape select values and expose options in API"
```

### Task 4: Frontend select field

**Files:**
- Modify: `frontend/src/types/template.ts`
- Modify: `frontend/src/components/parameter-field.tsx`
- Test: `frontend/src/components/parameter-field.test.tsx` (new)

**Interfaces:**
- Consumes: `TemplateParameter` shape; Radix wrappers in `frontend/src/components/ui/select.tsx`.
- Produces: `ParameterType` including `"select"`; `TemplateParameter.options?: { value: string; label: string }[]`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/parameter-field.test.tsx`. In `beforeAll`, polyfill for jsdom: `Element.prototype.scrollIntoView = vi.fn()`, `Element.prototype.hasPointerCapture = vi.fn(() => false)`, `Element.prototype.setPointerCapture = vi.fn()`, `Element.prototype.releasePointerCapture = vi.fn()`, and a no-op `globalThis.ResizeObserver` class with `observe`/`unobserve`/`disconnect`. Render `<ParameterField parameter={{ name: 'theme', placeholder: 'THEME', type: 'select', required: true, options: [{ value: 'dark', label: 'Тёмная' }, { value: 'light', label: 'Светлая' }] }} value="dark" onChange={onChange} />`. Assert `screen.getByLabelText('theme')` is in the document and `screen.getByText('Тёмная')` is visible. Then `fireEvent.keyDown(trigger, { key: 'Enter' })`, `await screen.findByRole('option', { name: 'Светлая' })`, `fireEvent.click(option)`, and assert `onChange` called with `"light"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend exec vitest run src/components/parameter-field.test.tsx`
Expected: FAIL (`"select"` not assignable to `ParameterType`; no combobox).

- [ ] **Step 3: Implement the field**

In `frontend/src/types/template.ts`: add `"select"` to `ParameterType` and `options?: { value: string; label: string }[]` to `TemplateParameter`.

In `frontend/src/components/parameter-field.tsx`: import `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`. Add a `parameter.type === "select"` branch before the color/Input branch:

```tsx
<Select value={value} onValueChange={onChange}>
  <SelectTrigger id={inputId} className="w-full">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {(parameter.options ?? []).map((option) => (
      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

Keep existing `Label htmlFor={parameter.type === "color" ? undefined : inputId}` so select is associated with the trigger.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend exec vitest run src/components/parameter-field.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/template.ts frontend/src/components/parameter-field.tsx frontend/src/components/parameter-field.test.tsx
git commit -m "feat: render select template parameters"
```

### Task 5: Frontend default values for select

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/lib/api.test.ts`

**Interfaces:**
- Consumes: `TemplateMetadata` with select parameters from Task 4.
- Produces: `defaultValues(meta)` returns a valid option value for select parameters.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/lib/api.test.ts` a `selectMeta: TemplateMetadata` with two parameters: required `theme` (no default, options `dark`/`light`) and optional `density` (default `compact`, options `compact`/`roomy`). Add:

```ts
it("uses the first option for required selects and the default for optional ones", () => {
  expect(defaultValues(selectMeta)).toEqual({ theme: "dark", density: "compact" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend exec vitest run src/lib/api.test.ts`
Expected: FAIL (`theme` is the placeholder `"THEME"`).

- [ ] **Step 3: Implement the fallback**

In `frontend/src/lib/api.ts` inside `defaultValues`, before the existing `default` check:

```ts
if (parameter.type === "select") {
  values[parameter.name] =
    parameter.default ?? parameter.options?.[0]?.value ?? "";
  continue;
}
```

Leave all other branches unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend exec vitest run src/lib/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/api.test.ts
git commit -m "fix: use valid select defaults in generator"
```

### Task 6: Demo manifest and documentation

**Files:**
- Modify: `backend/assets/templates/garrison-cat-badge/manifest.json`
- Modify: `backend/assets/templates/garrison-cat-badge/template.html`
- Modify: `backend/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: manifest validation from Task 1 and metadata from Task 3.
- Produces: a live select parameter for manual verification.

- [ ] **Step 1: Add the demo select variable**

In `backend/assets/templates/garrison-cat-badge/manifest.json`, append to `variables`:

```json
{
  "name": "textStyle",
  "placeholder": "TEXT_STYLE",
  "type": "select",
  "required": false,
  "default": "normal",
  "description": "Badge text weight",
  "options": [
    { "value": "normal", "label": "Обычный" },
    { "value": "bold", "label": "Жирный" }
  ]
}
```

In `backend/assets/templates/garrison-cat-badge/template.html`, add `font-weight: {{TEXT_STYLE}};` to the `body` rule (line 14 area).

- [ ] **Step 2: Verify manifest loads**

Run: `pnpm --dir backend exec jest src/templates/template-manifest.service.spec.ts src/templates/template-params.service.spec.ts src/templates/templates.controller.spec.ts --runInBand`
Expected: PASS. Then run:

```bash
curl -s "http://localhost:3000/api/v1/templates/garrison-cat-badge"
```

Expected (with backend running): `textStyle` parameter includes `options` with `normal`/`bold`. Skipping curl is acceptable if no backend is running; report it as unverified.

- [ ] **Step 3: Update documentation**

In `backend/README.md`, change the `type` bullet (line 49) to list `string`, `color`, `integer`, or `select`, and append after it:

```md
- `select` requires `options`: a non-empty array of `{ "value": "...", "label": "..." }`. The query value must equal a `value`; `label` is shown in clients. `default` is a `value`.
```

In `README.md`, change line 31 to include `select` and add one sentence: "`select` parameters expose `options` with `value` and `label`; the value is submitted, the label is displayed."

- [ ] **Step 4: Run full suites**

Run: `pnpm backend:test` and `pnpm frontend:test`.
Expected: new tests PASS. Pre-existing failures that reference the deleted `hermit-frame` template must be reported, not fixed.

- [ ] **Step 5: Commit**

```bash
git add backend/assets/templates/garrison-cat-badge/manifest.json backend/assets/templates/garrison-cat-badge/template.html backend/README.md README.md
git commit -m "docs: demonstrate select template variable"
```
