<!-- DOCGEN:START -->
# ST-script---framework

## Папки

- [src](src/)

## Файлы

- [.npmrc](.npmrc.md)

<!-- DOCGEN:END -->

## Документация

Документация по каждому классу лежит рядом с его исходником — в
[`src/<модуль>/index.js.md`](src/). Сборка и способы подключения (npm / CDN,
ESM / IIFE) описаны в корневом [`README.md`](../README.md) репозитория.

## Подключение (кратко)

Пакет: **`@cat-of-summer/st-script`**. Сборка кладёт в `dist/` две версии каждого
модуля — ESM (`*.esm.min.js`) и IIFE/глобал (`*.min.js`).

```html
<!-- CDN, обычный скрипт (глобал window.st_modal) -->
<script defer src="https://cdn.jsdelivr.net/npm/@cat-of-summer/st-script@0.1.0/dist/st_modal.min.js"></script>

<!-- CDN, ES-модуль -->
<script type="module">
  import st_modal from 'https://cdn.jsdelivr.net/npm/@cat-of-summer/st-script@0.1.0/dist/st_modal.esm.min.js';
</script>
```

```js
// npm
import st_modal from '@cat-of-summer/st-script/st_modal';
```

Полный список модулей и примеры — в корневом `README.md` и в `docs/src/`.
