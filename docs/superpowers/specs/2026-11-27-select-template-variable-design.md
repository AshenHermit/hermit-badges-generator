# Design: `select` template variable

Date: 2026-11-27. Size: small change.

## Intent

Template manifests (`backend/assets/templates/<id>/manifest.json`) currently support
`string`, `color` and `integer` variables. Authors need a fourth type that offers a
fixed list of choices in the generator UI, with human-readable labels and stable
values that are substituted into `{{PLACEHOLDER}}` tokens.

## Goals

- Manifest syntax: `"type": "select"` plus `"options": [{ "value": "...", "label": "..." }]`.
- `default` is an option **value** (not a label); optional variables still must have
  a default, required variables must not.
- Backend validates manifest and query values; frontend renders Radix `Select`
  showing labels and sending values.
- API `GET /api/v1/templates/:id` exposes `options` so the client can render them.

## Non-goals / anti-goals

- No multi-select, free-text fallback, remote/dynamic options, or i18n of labels.
- No change to existing manifests' semantics or to the `string`/`color`/`integer`
  validation rules.
- `hermit-frame` was deleted from the working tree but backend tests still reference
  it; that pre-existing breakage is out of scope.

## Constraints

- Manifest parse errors are plain `Error("Invalid template manifest: ...")`; query
  errors are `BadRequestException("<field>: <reason>")`. Keep those conventions.
- Values reaching HTML must be restricted to manifest options, so unknown query
  input cannot inject arbitrary markup.
- Frontend follows the local `frontend/AGENTS.md` Next.js note: read the bundled
  docs in `node_modules/next/dist/docs/` before touching frontend code.

## Approaches considered

1. **Array of `{ value, label }` objects — chosen.** Self-documenting, preserves
   order, allows arbitrary labels including duplicates, validates cleanly.
2. Object map `{ "<label>": "<value>" }`. Compact but label-as-key forbids duplicate
   labels and makes validation awkward.
3. Array of `[value, label]` pairs. Compact but hard to read in hand-edited JSON.

## Decisions

- `TemplateVariableType` gains `'select'`; `SelectOption = { value: string; label: string }`;
  `TemplateVariable.options?: SelectOption[]`.
- Manifest parser: `options` required for `select`, must be a non-empty array of
  objects with non-empty string `value`/`label`; `value`s must be unique; `default`
  (if present) must equal one of the values. `options` on non-`select` variables is
  rejected as a manifest error.
- `TemplateParamsService`: `case 'select'` accepts only a string exactly matching an
  option value, otherwise `invalid(name, 'must be one of the allowed options')`.
- `TemplateService`: `select` values go through `escapeHtml` like `string`, so
  option values containing markup cannot break the HTML template. Ordinary values
  (`#ff0000`, `solid`) are unaffected.
- `TemplatesController`: returns `options` only for select variables.
- Frontend `TemplateParameter` gains `"select"` and `options?: { value: string; label: string }[]`.
  `ParameterField` renders Radix `Select` (already used for format in
  `generator-panel.tsx`) with `SelectTrigger id={inputId}` and label `htmlFor`.
- `defaultValues(meta)`: for `select`, ignore `SAMPLE_VALUES`/`placeholder` and use
  `parameter.default ?? parameter.options[0]?.value ?? ""` so required selects
  always start with a valid value.
- Documentation: update root `README.md` and `backend/README.md` type lists with a
  short manifest example.
- Tests: backend parser/params/controller coverage for valid and invalid options,
  frontend `ParameterField` select test and `defaultValues` test. A demo manifest
  may gain one select variable to exercise end-to-end rendering.

## What is left to the builder

All implementation details are settled; follow the file list above and existing
project conventions. Verify with backend and frontend unit tests, plus a real
generate request for a template using `select`.
