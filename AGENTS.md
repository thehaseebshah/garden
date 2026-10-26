# AGENTS.md — Digital Garden (Eleventy)

This file is instructions for agentic coding assistants working in this repo.

## What this repo is
- Static site built with **Eleventy (11ty)** + **Sass**.
- Content (notes) lives under `src/site/notes/`.
- Build output goes to `dist/`.
- Markdown rendering is heavily customized in `.eleventy.js` via `markdown-it` plugins.

## Quickstart (local)
### Install
- `npm install`

### Run locally (dev)
- `npm start`
  - Runs `get-theme`, compiles Sass, and starts Eleventy dev server.
  - Access the site at `http://localhost:8080/` (Eleventy default).
  - If `8080` is busy, Eleventy prints the actual port in the terminal.

### Build (prod)
- `npm run build`
  - Cleans `dist/`, fetches the theme CSS (if configured), builds Eleventy, and compiles Sass.
  - Open `dist/index.html` (or serve `dist/` with any static server) to validate output.

### Where to “see my pages”
- Notes are generated under `/notes/...` routes.
- Example: a note at `src/site/notes/Foo/Bar.md` becomes something like
  - `http://localhost:8080/notes/foo/bar/` (slugified; see `.eleventy.js`).
- If a note has frontmatter `permalink`, that permalink wins.
- Notes tagged `gardenEntry` are treated as home and typically map to `/`.

## Commands (canonical)
These are derived from `package.json` scripts and CI.

### Development
- `npm start`
  - Runs: `npm-run-all get-theme build:sass --parallel watch:*`
  - Watches:
    - Sass: `sass --watch src/site/styles:dist/styles`
    - Eleventy: `cross-env ELEVENTY_ENV=dev eleventy --serve`

### Build
- `npm run build`
  - Runs: `rimraf dist` then `npm-run-all get-theme build:*`
  - Eleventy: `cross-env ELEVENTY_ENV=prod NODE_OPTIONS=--max-old-space-size=4096 eleventy`
  - Sass: `sass src/site/styles:dist/styles --style compressed`

### CI check
- GitHub Actions runs:
  - `npm ci` (falls back to `npm install`)
  - `npm run build`
  - `npx playwright install --with-deps chromium` and `npm run qa`

## Linting / formatting
- No dedicated linter/formatter is configured (no ESLint/Prettier found).
- Guidance for agents:
  - Make minimal diffs.
  - Match the style of the file you edit.
  - Avoid drive-by formatting.

## Tests
- Browser QA lives in `tests/qa.js` (Playwright + axe-core).
  - `npm run build` then `npm run qa` (about 4–5 minutes).
  - Serves `dist/` like GitHub Pages and checks every sitemap page at desktop and phone
    widths (errors, failed requests, sideways scrolling, meta tags, alt text, links,
    accessibility), plus search, light/dark theme, backlinks, graphs, callouts and contents.
  - `npm run qa -- --screens <dir>` also saves screenshots of key pages in both themes.
  - CI runs it after the build; a failing check blocks the deploy.
- The feature checks use a few real notes as samples (constants at the top of
  `tests/qa.js`); update them if those notes are renamed or unpublished.

## Comments (Giscus)
- Config: `src/site/_data/giscus.json` (`repo`, `repoId`, `category`, `categoryId` from https://giscus.app).
  The section in `components/comments.njk` renders only when all four are set; `comments: false`
  in a note's front matter hides it for that note.
- Kept out of `.env` on purpose: the Obsidian Digital Garden plugin rewrites `.env`.
- The widget is a vendored bundle (`src/site/scripts/vendor/giscus.js`); rebuild it with
  `npm run vendor:giscus` after changing the `giscus`/`lit` versions in `package.json`.

## Troubleshooting local runs
- Theme fetching:
  - `npm start` / `npm run build` runs `node src/site/get-theme.js`.
  - This script reads `process.env.THEME` and downloads theme CSS.
  - If theme download fails, the build may still succeed but theming may differ.
- Environment:
  - This repo uses `.env` via `dotenv` in multiple files.
  - Do not commit secrets; avoid committing `.env` changes unless explicitly requested.

## Project layout (important paths)
- Eleventy config: `.eleventy.js`
- Notes (content): `src/site/notes/`
- Templates (Nunjucks): `src/site/_includes/`
  - Layouts: `src/site/_includes/layouts/`
  - Components: `src/site/_includes/components/`
- Data files: `src/site/_data/`
- Helpers (Node/CommonJS): `src/helpers/`
- Sass entrypoints/styles:
  - `src/site/styles/style.scss`
  - `src/site/styles/custom-style.scss`
- Build output: `dist/`

## “Customization points” (prefer these)
- If adding user-specific behavior, prefer editing:
  - `src/helpers/userSetup.js` (hooks for markdown/eleventy setup)
  - `src/site/styles/custom-style.scss` (custom CSS)
- Avoid large edits to `.eleventy.js` unless necessary; it’s core infrastructure.

## Code style (repository conventions)
### JavaScript module system
- Use **CommonJS** (`require`, `module.exports`) to match the codebase.
- Prefer `const` for imports and values; use `let` only when reassigned.

### Formatting
- Indentation is generally 2 spaces in larger files (e.g. `.eleventy.js`).
- Some helper files use 4 spaces; follow the file’s existing indentation.
- Use trailing commas where the surrounding code does.
- Keep lines readable; avoid introducing very long inline expressions.

### Imports
- Group requires in this order:
  1) Node built-ins (`fs`, `path`, `crypto`)
  2) External deps (`markdown-it`, `gray-matter`, etc.)
  3) Local modules (`./src/helpers/...`)
- Keep destructuring spacing consistent with the file:
  - Existing code uses both `{ globSync }` and `{globSync}`; don’t churn.

### Naming
- Functions: `camelCase` (`getAnchorAttributes`, `transformImage`).
- Constants: `SCREAMING_SNAKE_CASE` only for true constants/exports (see `constants.js`).
- Files/dirs: keep existing naming; avoid renames unless explicitly requested.

### Types
- Plain JavaScript (no TypeScript in this repo).
- Prefer defensive runtime checks where needed (null/undefined checks) rather than complex type emulation.

### Error handling
- Prefer explicit handling over empty catch blocks.
- If you must catch-and-ignore (rare), document the reason in the code nearby.
- Use early returns for invalid inputs; keep happy-path left-aligned.

### Equality and truthiness
- Prefer strict equality (`===`, `!==`).
- Existing code sometimes uses `!= -1`; if modifying nearby logic, consider normalizing locally but avoid sweeping refactors.

### Data structures
- Use `Set` for deduping (pattern exists in `src/helpers/linkUtils.js`).
- Convert to arrays only at API boundaries (e.g., for JSON output).

### Security / safety
- Treat note content as untrusted input; be careful when injecting into HTML.
- Prefer escaping or safe templating patterns; avoid introducing new raw HTML concatenation unless required.

## Content editing guidance
- `src/site/notes/**` is user content.
  - Do not rewrite/format notes unless asked.
  - When debugging, reproduce issues using `npm start` and the specific note URL.

## External agent rule files
- Cursor rules: none found (no `.cursor/rules/` or `.cursorrules`).
- Copilot rules: none found (no `.github/copilot-instructions.md`).
- Gemini guidance: `GEMINI.md` exists and primarily documents build/run conventions; this file incorporates it.
