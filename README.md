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
| `st_system`           | `window.st_system`  | Utilities (`merge`, `generate_*`).               |
| `st_observer`         | `window.st_observer`| IntersectionObserver wrapper.                    |
| `toggle`              | `window.toggle`     | State toggler (accordions, switches, hover-menus).|
| `select`              | `window.select`     | Custom `<select>` dropdown (hooks, multiple, hover).|
| `st_mask`             | `window.st_mask`    | Input masks.                                      |
| `uploader`            | `window.uploader`   | File uploader.                                   |
| `st_validator`        | `window.st_validator`| Form/field validation.                          |
| `st_button_widget`    | `window.st_button_widget`| Floating button widget.                     |
| `st_links_widget`     | `window.st_links_widget`| Links widget.                                |
| `loader`              | `window.loader`     | Ajax list loader (cards: подгрузка/фильтр/сортировка) via `Core.fetch`. |
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

## A. Use via npm

Пакет опубликован в GitHub Packages (приватный реестр). Для установки нужен
read-only токен GitHub.

### 1. Получить токен

GitHub → Settings → Developer settings → Fine-grained personal access tokens → Generate new token:

- **Repository access**: `cat-of-summer/ST-script---framework`
- **Permissions**: `read:packages`

### 2. Скопировать `.npmrc` в проект потребителя

Скопируйте файл `.npmrc` из корня этого репозитория к себе в проект — токен уже вписан.

### 3. Установить

```bash
npm install @cat-of-summer/st-script
```

### 4. Использовать

Per-module (рекомендуется — только то, что нужно):

```js
import st_modal from '@cat-of-summer/st-script/st_modal';
import st_typograf from '@cat-of-summer/st-script/st_typograf';

const modal = new st_modal({ content: '#promo', overlay: true });
```

Или весь пакет через barrel-экспорт:

```js
import { st_modal, st_cookie, App } from '@cat-of-summer/st-script';
```

Web Component регистрирует себя при импорте:

```js
import App from '@cat-of-summer/st-script/st_app';
import formConfig from '@cat-of-summer/st-script/st_app/form';
App.create(formConfig);   // теперь работает <st-app app="form">
```

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

## Examples

See `examples/` for runnable HTML pages. `examples/cdn-demo.html` exercises both
the ESM and the IIFE/global builds from `dist/`.
