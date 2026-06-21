# hasInstanceSymbol.js

## Описание

Внутренний разделяемый модуль («трейт»). Папка `_traits/` имеет префикс `_`, поэтому сборщик не делает из неё отдельный бандл — содержимое инлайнится в каждый модуль, который его импортирует (см. `scripts/build.mjs`). Классы импортируют только нужные им функции:

```js
import { element, find, own } from '../_traits/hasInstanceSymbol.js';
```

Модуль решает две задачи:

1. **Разрешение элементов** — превратить `Element` / CSS-селектор / коллекцию в узел (`element`) или массив узлов (`elements`), с которым работает класс.
2. **Реестр экземпляров** — пометить DOM-элемент приватным `Symbol`, ссылающимся на владеющий им экземпляр, и затем найти этот экземпляр по элементу.

`instance` — единственный `Symbol` уровня модуля, поэтому реестр общий для всех импортирующих модулей. Это корректно, так как DOM-узел принадлежит ровно одному компоненту.

## Экспорты

| Экспорт | Сигнатура | Описание |
|---|---|---|
| `element` | `(param) => Element \| undefined` | `Element` возвращается как есть; селектор разрешается через `querySelector`. При ошибке/промахе — `undefined`. |
| `elements` | `(param) => Element[]` | Множество существующих элементов: `Element`, `NodeList`, `HTMLCollection`, массив (рекурсивно) или селектор → массив. Без побочных эффектов: `null`/промах/ошибка → `[]`. |
| `find` | `(param) => instance \| undefined` | Возвращает экземпляр, которому принадлежит элемент (или селектор), если он был помечен через `own`. |
| `own` | `(el, inst) => el` | Помечает `el` владельцем `inst` и возвращает `el` (можно вызывать по цепочке). |

## Использование

Регистрация и обратный поиск (`Modal`, `Uploader`):

```js
import { find, own } from '../_traits/hasInstanceSymbol.js';

class Modal {
    static find = find;            // публичный Modal.find(...)

    constructor() {
        this.modal = own(document.createElement('modal'), this);
        // ...
    }
}

// Где-нибудь в обработчике:
const modal = Modal.find(e.target.closest('modal'));
```

Только разрешение элементов (`st_typograf`):

```js
import { element } from '../_traits/hasInstanceSymbol.js';
const root = element(entity);          // Element | undefined

import { elements } from '../_traits/hasInstanceSymbol.js';
elements(params.target).forEach(node => { /* ... */ });
```
