# st_system.js

## Описание

Набор статических утилиты, используемых внутри других классов библиотеки.

## Публичные статические методы

### `st_system.object_merge(...objects)`

Глубокое слияние объектов. Принимает любое количество аргументов. Поздние аргументы перезаписывают ранние на любом уровне вложенности. Возвращает новый объект.

### `st_system.generate_unique_prefix(params?)`

Генерирует случайную строку.

| Параметр | По умолчанию | Описание |
|---|---|---|
| `params.length` | `16` | Длина строки |
| `params.characters` | `A-Za-z0-9` | Набор символов |

## Примеры

```js
// Глубокое слияние
const defaults = { a: 1, b: { c: 10, d: 20 } };
const overrides = { b: { c: 99 }, e: 5 };
const result = st_system.object_merge(defaults, overrides);
// { a: 1, b: { c: 99, d: 20 }, e: 5 }

// Уникальный префикс
const id = st_system.generate_unique_prefix({ length: 8 }); // 'aB3xKpQm'
```
