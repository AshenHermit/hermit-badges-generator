# Badge generator frontend — design

Date: 2026-11-26
Branch: current

## Intent and why

Give the existing NestJS badge-generator an actual UI. One page where a user
picks a template from the live API, tweaks its parameters, sees a live badge
preview, and copies a ready generation URL. Visual direction comes from the
Wired frontend homepage: dark photographic background, glass panels with
`backdrop-blur`, calm minimal controls. The user wants the background parallax
to follow the mouse (not scroll, as in Wired).

## Goals

- Add `frontend/` as an Nx + pnpm workspace project next to `backend/`, with
  root scripts `frontend:dev`, `frontend:build`, `frontend:serve`.
- Next.js 16 (App Router) + React 19 + TypeScript, Tailwind v4, shadcn/ui,
  animate-ui, and the ReUI `@reui/c-color-picker-2` color picker.
- Exactly one page, split into two glass panels:
  - left: template list from `GET /api/v1/templates`, each row with a small
    live preview and a play/select control;
  - right: active template title, large live preview, generated URL field with
    copy, and an editable parameter form.
- Parameter form built dynamically from `GET /api/v1/templates/:id`
  (`parameters[]`), plus fixed controls for `format` (`png` / `webp`) and
  `height` (integer 1–1000, default 60).
- Preview and generated URL always reflect the current form values (debounced).
- Background image with mouse-driven parallax; panels use `backdrop-blur`.
- No backend changes.

## Non-goals

- No new endpoints, no backend code changes, no hardcoded template catalog.
- No auth, i18n, routing beyond `/`, or persistent server state.
- No SSR of API data — data fetching happens in the browser.
- No image upload, no custom templates.
- No frontend deployment work: Dockerfile, compose, and CI stay as-is.
- No Playwright/Chromium work in the frontend; rendering stays server-side.

## Anti-goals (failure even if it technically works)

- Blank page or crash when the API is unreachable; must show an error state.
- Generated link that diverges from the parameters shown in the form.
- Parallax that shifts layout, jitters, or ignores reduced-motion preference.
- A template list that silently diverges from `GET /api/v1/templates`.

## Constraints (discovered, not chosen)

- `pnpm-workspace.yaml` already lists `frontend`; the directory does not exist
  yet. Root uses Nx 24 with `defaultBase: master` and cached `build`/`test`.
- API (see `backend/assets/templates/hermit-frame/manifest.json` and README):
  - `GET /api/v1/templates` → sorted string ids.
  - `GET /api/v1/templates/:id` → `{ id, parameters: [{ name, placeholder,
    type, required, default?, maxLength?, pattern?, description }] }`.
  - `GET /api/v1/generate?template=...&format=png|webp&height=...` → image
    bytes. Fixed params: `template`, `format`, `height`. Everything else comes
    from the manifest.
  - Colors accept `#RGB`, `#RRGGBB`, or `rgb(r, g, b)`; named colors are
    rejected. Unknown params and invalid values return 400.
  - Local base is `http://localhost:3000`. Production site address from `.env`
    is `api.badges.ashen-hermit.space` behind plain HTTP + external TLS.
- Wired reference: `ImageBackground.tsx` uses a fixed `div` with
  `background-image` and lerped `background-position` (scroll-driven); glass
  utility is `backdrop-blur-lg bg-black/20`. `components.json` there uses
  `new-york` / neutral / lucide and an `@animate-ui` registry.
- ReUI docs: `@reui` items resolve via
  `https://reui.io/r/{style}/{name}.json`; the CLI expects style `base-nova`
  for `@reui/*`. Free `c-*` items need no license key.

## Approaches (considered before this doc)

1. **`frontend/` as an Nx project in this monorepo (chosen).** Matches the
   already-declared workspace slot, shares pnpm/Nx tooling, adds root scripts.
   Cost: a few config files at scaffold time.
2. **Standalone Next.js app with its own `package.json`.** Faster to start,
   but duplicates tooling and contradicts the workspace declaration.
3. **Hardcoded/static mock UI.** Rejected: the user chose the live API.

## Decisions made here (builder can treat these as settled)

- Stack details: Next 16 App Router, React 19, TS strict, Tailwind v4 with CSS
  variables, `components.json` aliases `@/components`, `@/components/ui`,
  `@/lib/utils`, `@/hooks`, icon library lucide. `@animate-ui` registry added.
- ReUI: register `@reui` in `components.json`. Install `@reui/c-color-picker-2`
  with the exact command the user gave; if the CLI rejects the namespace with
  the project style, fall back to the full registry URL
  (`https://reui.io/r/base-nova/c-color-picker-2.json`) so the requested
  component still lands in the project.
- API base: `NEXT_PUBLIC_API_BASE_URL`, default `http://localhost:3000`.
  The backend has no CORS, so Next `rewrites` proxy `/api/:path*` to that base;
  browser code calls the relative `/api/...` path. The copied link stays an
  absolute URL built from the same base (no proxy rewriting for that string).
  No backend changes.
- `height` is an editable field in the main parameter panel (default 60,
  clamp 1–1000) and is always present in the query string. Template-row
  thumbnails use a separate small `height=40`.
- The main preview and the copied link are built from the **same** URL object:
  preview `<img src>` and the readonly link input both consume the debounced
  full generate URL, so the preview shows exactly what the link returns.
- UI components: animate-ui Card/Button for subtle motion; shadcn Input,
  Select, Label, Separator; ReUI color picker for `type: "color"` fields.
  Parameter mapping: `string` → Input (respect `maxLength`), `color` → color
  picker, `integer` → numeric Input. Fixed `format` → Select, fixed `height` →
  numeric Input.
- State: plain React state in one client page component; no Zustand/React
  Query. A small `useDebouncedValue` hook throttles preview/link updates
  (~250 ms).
- Previews: template row preview uses
  `/api/v1/generate?template=<id>&format=png&height=40` plus each manifest's
  required params filled from defaults or placeholder text. Main preview uses
  the exact same absolute URL as the generated link, with all current form
  values including `height`; both are plain `<img src>` / readonly input
  values — no manual body reading.
- Generated link: absolute `<base>/api/v1/generate?<sorted params>` including
  the current `height`, shown in a readonly input with a copy button using
  `navigator.clipboard`. Preview and link are derived from one debounced URL.
- Background: copy one `bg_*.jpg` from Wired's `frontend/public/bg/` into
  `frontend/public/`. Mouse parallax: `pointermove` → normalized target, rAF
  lerp toward it, `translate3d` on a slightly oversized fixed background div;
  disabled under `prefers-reduced-motion`.
- Layout: centered max-width container, two-column grid on desktop stacking to
  one column on mobile; glass surface `bg-black/25 backdrop-blur-xl border
  border-white/10 rounded-2xl`.
- Errors: API failures render a message plus Retry in each affected panel; the
  rest of the page stays usable.

## What is left to the builder

- Exact scaffold commands and file layout under `frontend/`.
- Exact animate-ui component imports available after install.
- Minor styling values (spacing, radii, blur strength) to match the screenshot.
- Whether to keep a dev-only `.env.local` example for `NEXT_PUBLIC_API_BASE_URL`.
