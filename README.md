# ST-script

Standalone JavaScript classes / components, authored as ES modules and shipped in
two flavours per module:

- **ESM** (`*.esm.min.js`) — for `import` (npm bundlers, `<script type="module">`).
- **IIFE / global** (`*.min.js`) — for a plain CDN `<script defer>` (exposes a
  global named after the module).

| Module                | Global / element    | Notes                                            |
| --------------------- | ------------------- | ------------------------------------------------ |
| `st_modal`            | `window.st_modal`   | Modal windows.                                   |
| `st_typograf`         | `window.st_typograf`| Typography fixer.                                |
| `st_cookie`           | `window.st_cookie`  | Cookie helpers.                                  |
| `st_system`           | `window.st_system`  | Utilities (`object_merge`, `generate_*`).        |
| `st_observer`         | `window.st_observer`| IntersectionObserver wrapper.                    |
| `st_accordion`        | `window.st_accordion`| Accordion.                                      |
| `st_select`           | `window.st_select`  | Custom `<select>`.                               |
| `st_mask`             | `window.st_mask`    | Input masks.                                      |
| `st_uploader`         | `window.st_uploader`| File uploader.                                   |
| `st_validator`        | `window.st_validator`| Form/field validation.                          |
| `st_button_widget`    | `window.st_button_widget`| Floating button widget.                     |
| `st_links_widget`     | `window.st_links_widget`| Links widget.                                |
| `AjaxCardsLoaderXHR`  | `window.AjaxCardsLoaderXHR`| XHR cards loader.                         |
| `st_app`              | `<st-app>` element  | **Web Component** — `<script defer>` only (self-registers). |
| `st_app/form`         | `window.form`       | Form app **config object** — register with `App.create(form)`; no `st_app` bundled. |

> `st_widget` / `st_widget/button` are work-in-progress stubs (no output yet).

## Development

```bash
npm install      # installs esbuild, builds dist/ via the prepare script
npm run build    # compile src/ → dist/*.min.js (ESM + IIFE)
npm run watch    # rebuild on change
```

Source layout — **every `src/**/index.js` is a bundle**; its folder path becomes
the output name:

```
src/
  index.js                 # aggregate barrel → re-exports every module
  st_modal/index.js        # → dist/st_modal.esm.min.js + dist/st_modal.min.js
  st_app/index.js          # → dist/st_app.{esm.min,min}.js
  st_app/form/index.js      # → dist/st_app/form.{esm.min,min}.js
  …
```

**Conventions** (`scripts/build.mjs` relies on these — no script edits to extend):

- A folder with an `index.js` is a *bundle*; drop `src/<name>/index.js` and it is
  built automatically into `dist/<name>.esm.min.js` (ESM) and `dist/<name>.min.js`
  (IIFE global, default export unwrapped onto `window.<name>`).
- A file or folder whose name starts with `_` is shared content (a partial),
  imported via `import` and never built on its own.

`dist/` is generated and git-ignored. It is built on `npm install` (`prepare`),
on `npm publish` (`prepack`), and in CI to attach release artifacts.

## A. Use via npm (ESM)

```bash
npm install @cat-of-summer/st-script
```

Per-module (recommended — only what you use):

```js
import st_modal from '@cat-of-summer/st-script/st_modal';
import st_typograf from '@cat-of-summer/st-script/st_typograf';

const modal = new st_modal({ content: '#promo', overlay: true });
```

Or everything from the aggregate barrel:

```js
import { st_modal, st_cookie, App } from '@cat-of-summer/st-script';
```

The Web Component registers itself on import — `import '@cat-of-summer/st-script/st_app'`
then use `<st-app>` in markup. Optional app configs are plain objects you register
yourself (so `st_app` loads once, never duplicated per app):

```js
import App from '@cat-of-summer/st-script/st_app';
import formConfig from '@cat-of-summer/st-script/st_app/form';
App.create(formConfig);   // now <st-app app="form"> works
```

## B. CDN — ES module

```html
<script type="module">
  import st_modal from 'https://cdn.jsdelivr.net/npm/@cat-of-summer/st-script@0.1.0/dist/st_modal.esm.min.js';
  new st_modal({ content: '#promo' });
</script>
```

## C. CDN — plain script (non-module)

```html
<!-- exposes window.st_modal -->
<script defer src="https://cdn.jsdelivr.net/npm/@cat-of-summer/st-script@0.1.0/dist/st_modal.min.js"></script>

<!-- st_app: Web Component, registers <st-app> -->
<script defer src="https://cdn.jsdelivr.net/npm/@cat-of-summer/st-script@0.1.0/dist/st_app.min.js"></script>
```

```html
<st-app app="form">…</st-app>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    new st_modal({ content: '#promo' });
  });
</script>
```

## D. Install from the git repository (by tag)

If the package is not (yet) on public npm, install straight from git — the
`prepare` script compiles `dist/` automatically:

```bash
npm install "git+https://github.com/cat-of-summer/js_classes.git#v0.1.0"
```

For a private repo, authenticate with a fine-grained read-only PAT:

```bash
git config --global url."https://x:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
npm install
```

> `npm ci --ignore-scripts` skips `prepare`, so `dist/` won't be built. In such
> pipelines add `esbuild` and run `npm run build` yourself.

## Releasing

Releases are triggered by **pushing a tag** (not by ordinary pushes):

```bash
# bump "version" in package.json, commit, then:
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` builds `dist/` and creates a GitHub Release with
the configured artifacts. Ordinary pushes run `ci.yml`, which validates the build.
Both are driven by repository **environment variables** (Settings → Environments
→ your branch):

- `BUILD_COMMAND` = `npm ci && npm run build`
- `RELEASE_FILES` = `dist/*` (files attached to the release)
- `CI_COMMAND` (optional) — extra checks/tests in CI.

Once published to public npm (`npm publish` — `prepack` compiles `dist/`), the
jsDelivr/unpkg CDN URLs above work with no further changes.

## Examples

See `examples/` for runnable HTML pages. `examples/cdn-demo.html` exercises both
the ESM and the IIFE/global builds from `dist/`.
