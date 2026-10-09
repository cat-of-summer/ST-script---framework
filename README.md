# ST-script

Standalone JavaScript classes / components, authored as ES modules and shipped in
two flavours per module:

- **ESM** (`*.esm.min.js`) — for `import` (npm bundlers, `<script type="module">`).
- **IIFE / global** (`*.min.js`) — for a plain CDN `<script defer>` (exposes a
  global named after the module).

| Module                | Global / element    | Notes                                            |
| --------------------- | ------------------- | ------------------------------------------------ |
| `modal`               | `window.Modal`      | Modal windows.                                   |
| `typograf`            | `window.Typograf`   | Неразрывные пробелы: предлоги, частицы, числа, последнее слово. |
| `cookie`              | `window.Cookie`     | Cookie helpers (JSON for non-strings).           |
| `core`                | `window.Core`       | Utilities (`merge`, `getRandomChars`, `uuid`, `plural`, `escape`, `copy`, `download`, `fetch`). |
| `observer`            | `window.Observer`   | Scroll animations: `[state]`, `--progress`, stagger, cross. |
| `toggle`              | `window.Toggle`     | State toggler (accordions, switches, hover-menus).|
| `select`              | `window.Select`     | Custom `<select>` dropdown (hooks, multiple, hover).|
| `mask`                | `window.Mask`       | Input masks (телефон, дата, карта, ИНН, …).       |
| `uploader`            | `window.Uploader`   | File uploader.                                   |
| `validator`           | `window.Validator`  | Field validation (`[state]`, `setCustomValidity`, hooks).|
| `st_button_widget`    | `window.st_button_widget`| Floating button widget.                     |
| `st_links_widget`     | `window.st_links_widget`| Links widget.                                |
| `loader`              | `window.Loader`     | Ajax list loader (cards: подгрузка/фильтр/сортировка) via `Core.fetch`. |
| `app`                 | `window.App`, `<st-app>` | **Web Component** — registers `<st-app>` on load. |
| `route`               | `window.Route`      | URL reactions; SPA mode (`history` / `hash`).    |
| `app/form`            | `window.Form`       | Form app **config object** — register with `App.create(form)`; `app` is not bundled. |

Документация по каждому модулю — `docs/src/<module>/index.js.md`, например
[`docs/src/app/index.js.md`](docs/src/app/index.js.md): директивы шаблона, `watch()` (в том
числе `watch(() => выражение, cb)` для вычисляемого состояния), `nextTick()`, передача данных
через `:attr`, вложенные компоненты и подводные камни.


## Development

```bash
npm install      # installs esbuild, builds dist/ via the prepare script
npm run build    # compile src/ → dist/*.min.js (ESM + IIFE)
node scripts/build.mjs --watch   # rebuild on change
```

Source layout — **every `src/**/index.js` is a bundle**; its folder path becomes
the output name:

```
src/
  index.js                 # aggregate barrel (source only, not built into dist/)
  modal/index.js           # → dist/modal.esm.min.js + dist/modal.min.js
  app/index.js             # → dist/app.{esm.min,min}.js
  app/form/index.js        # → dist/app/form.{esm.min,min}.js
  …
```

**Conventions** (`scripts/build.mjs` relies on these — no script edits to extend):

- A folder with an `index.js` is a *bundle*; drop `src/<name>/index.js` and it is
  built automatically into `dist/<name>.esm.min.js` (ESM) and `dist/<name>.min.js`
  (IIFE global, default export exposed as `window.<ClassName>`, e.g. `window.Modal`).
- A file or folder whose name starts with `_` is shared content (a partial),
  imported via `import` and never built on its own.

`dist/` is generated and git-ignored. It is built on `npm install` (`prepare`),
on `npm publish` (`prepack`), and in CI to attach release artifacts.

Every bundle ships with a source map (`*.min.js.map`, sources embedded). ESM builds
link it via `//# sourceMappingURL`, so DevTools pick it up automatically. IIFE builds
carry no link comment: they are often concatenated into a site-wide bundle, where a
relative link would 404 — attach the `.map` in DevTools by hand when debugging.
The unminified ESM sources are also published as
is: `import Modal from '@cat-of-summer/st-script/src/modal/index.js'`.

## A. Use via npm

Пакет опубликован в публичном npm, токен не нужен:

```bash
npm install @cat-of-summer/st-script
```

Модули импортируются по одному — подключается только нужное:

```js
import Modal from '@cat-of-summer/st-script/modal';
import Cookie from '@cat-of-summer/st-script/cookie';
import Typograf from '@cat-of-summer/st-script/typograf';

const modal = new Modal({ content: '#promo', overlay: true });
```

Общего barrel-входа в `dist/` нет. Весь набор разом доступен только из исходников:
`import { Modal, Cookie, App } from '@cat-of-summer/st-script/src/index.js'`.

Web Component регистрирует себя при импорте:

```js
import App from '@cat-of-summer/st-script/app';
import formConfig from '@cat-of-summer/st-script/app/form';
App.create(formConfig);   // теперь работает <st-app app="form">
```

## B. Use via CDN

```html
<script defer src="https://cdn.jsdelivr.net/npm/@cat-of-summer/st-script/dist/modal.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/@cat-of-summer/st-script/dist/app.min.js"></script>
```

## Releasing

Релиз запускается **тегом** `vX.Y.Z`, а не обычным пушем:

```bash
git tag v1.1.0
git push origin v1.1.0
```

Версия пакета берётся из тега при публикации. Поле `version` в `package.json` служебное и с
номером в npm не совпадает. Актуальная версия — `npm view @cat-of-summer/st-script version`.
Сборку и публикацию выполняет `.github/workflows/ci-cd.yml` (общий workflow из
`cat-of-summer/git_toolkit`).

## Tests

```bash
node tests/core.test.mjs      # и остальные tests/*.test.mjs без DOM
npm run build                 # браузерным тестам нужен dist/
node tests/browser.test.mjs   # App, Modal, Uploader, Core, Cookie, Route — нужен Playwright с Chromium
```

Браузерные тесты удобно гонять в контейнере с Playwright, не ставя его на машину:

```bash
docker run --rm -v "$PWD:/repo" -e PLAYWRIGHT_FROM=/path/to/node_modules/     --entrypoint node <playwright-image> /repo/tests/browser.test.mjs
```

`PLAYWRIGHT_FROM` — каталог, из которого резолвится пакет `playwright`, если он стоит не в этом
репозитории.

## Examples

See `examples/` for runnable HTML pages. `examples/cdn-demo.html` exercises both
the ESM and the IIFE/global builds from `dist/`.
