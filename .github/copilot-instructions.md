# AI coding guide for this repo

Project type and scope
- Static web app (no frameworks) plus 2 Vercel serverless functions.
- Purpose: capture product/quantity rows and send them to a Google Apps Script Web App; view recent rows via a proxy.

Key files and where logic lives
- index.html: the main form UI; loads `assets/forms.js` (form presets) and `assets/app.js` (behavior).
- menu.html: access gate (localStorage role), quick settings for Apps Script URL/token, and navigation to forms.
- registros.html: viewer that calls `/api/gs-proxy` to list recent rows from Apps Script.
- assets/forms.js: source of truth for forms and catalogs (window.FORMS). Defines groups, codeMap, undMap, per-form options, and specialized inventories.
- assets/app.js: form runtime. Builds rows, validates, deduplicates, assembles entry payloads, and submits to Sheets (direct or via proxy). Also contains per-form personalization by `cfg.id`.
- api/gs-submit.js: POST proxy to Apps Script doPost for submissions; prefers env GS_TOKEN over client token.
- api/gs-proxy.js: GET proxy to Apps Script doGet for listing recent rows.
- vercel.json: static hosting options and immutable cache headers for /assets.

Data model used across components
- Entry payload: `{ id, at, items, meta }`.
  - `items`: array of `{ product, quantity, [family] }`. For `solicitudes-pedido`, family is per-row.
  - `meta`: `{ sede, responsable, fecha, formId, sheet, tipo, [familia] }`. `tipo` is forced by form variants (e.g., SOLICITUD, MERMA, ENTREGADO).
- In viewer, `/api/gs-proxy` returns `{ head?, rows }`; fallback head columns are in `registros.html`.

Critical flows and conventions
- Submit flow (assets/app.js): validate -> build signature -> dedupe window 20s -> cooldown 4s -> save() -> maybeSendToSheets().
  - CORS strategy: try `/api/gs-submit` first (hides token and reads JSON); fallback to direct `POST text/plain` (no preflight); final fallback is `mode: 'no-cors'` (fire-and-forget).
  - Keep `Content-Type: text/plain;charset=utf-8` for Apps Script to reduce CORS issues.
- Role gate: `localStorage['app_role']` controls access. menu.html accepts 'LATATA10' (worker) or 'TATADEPAN11' (admin). Admin sees settings panel.
- Settings: `localStorage['gs_settings'] = { url, enabled, token }` is read by app and viewer as defaults; server takes GS_TOKEN env as authoritative when present.

Per-form customization patterns (assets/app.js)
- Forms are defined in `assets/forms.js` and selected via `?form=<id>`.
- `cfg.id` recognized branches:
  - `solicitudes` (a.k.a. `tata-libertad`): grouped select via `groups`; QTY label changes; sets badges/colors; tweaks labels.
  - `solicitudes-pedido`: enables per-row Family and loads TSV family sets from `assets/*.tsv` for auto-detection.
  - `merma`: hides metadata; forces `sede` to BELLO CAMPO; `tipo = MERMA`.
  - `registros` (inventory): toggles between Inventario/Devoluciones; switches catalogs (LA TATA vs. PDT) and code/unit maps accordingly.
- Product identity: when using `groups`, the option value is product name; `codeMap[name]` gives the code; `undMap[name]` gives unit.

Serverless APIs and environment
- Configure in Vercel: `GS_WEBAPP_URL` (Apps Script Web App /exec), `GS_TOKEN` (optional shared secret).
- gs-submit: POST body `{ url?, entry }` (adds env token). gs-proxy: GET query `?url|token|sheet|ssid|ssurl&limit=...` and sets `op=list` for Apps Script.

How to extend safely (examples)
- Add a new form: add an object to `window.FORMS` in `assets/forms.js` with `id`, `title`, `sheetTab`, `color`, and either `groups` or `catalog`. If it’s similar to another form, use `inheritFrom`.
- Add product codes/units: update `codeMap`/`undMap` for the target form; app will include `it.code` in CSV and map units.
- Adjust viewer columns: change HEAD_FALLBACK in `registros.html` and/or return `head` from your Apps Script doGet.

Gotchas
- Keep DOM IDs/classes used by app.js: products-form, rows, meta-sede, meta-resp, meta-date, form-extra, form-title, etc. (these are element IDs in index.html)
- TSVs (DONAS.tsv, HOJALDRE.tsv, PANADERIA.tsv) are parsed by column index 3 to derive product names; ensure the expected format.
- Do not remove dedupe keys: `LAST_SUBMIT_KEY`, `DUPLICATE_WINDOW_MS`, `SUBMIT_COOLDOWN_MS` protect against double submissions.

References in repo
- Forms config: `assets/forms.js`
- Form runtime and submit logic: `assets/app.js`
- Viewer: `registros.html`
- Serverless proxies: `api/gs-submit.js`, `api/gs-proxy.js`