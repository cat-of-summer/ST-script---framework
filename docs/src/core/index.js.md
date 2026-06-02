# st_system.js

## Описание

Набор статических утилит, используемых внутри других классов библиотеки.

## Публичные статические методы

### `st_system.merge(...objects)`

Глубокое слияние. Принимает любое количество аргументов и сливает их слева направо, возвращая новый объект (входы не мутируются).

- Обычные объекты и массивы сливаются рекурсивно; массивы — overlay по индексу (`[1,2,3]` + `[9]` → `[9,2,3]`).
- Если на одном ключе с обеих сторон оказались функции — они компонуются: результат вызывается с теми же аргументами и сам сливается.
- Во всех остальных случаях (скаляры, `null`, несовпадающие типы, экземпляры классов, `Date`) побеждает позднее значение.

### `st_system.generate_unique_prefix(params?)`

Генерирует случайную строку.

| Параметр | По умолчанию | Описание |
|---|---|---|
| `params.length` | `16` | Длина строки |
| `params.characters` | `A-Za-z0-9` | Набор символов |

### `st_system.fetch(params)`

Обёртка над `XMLHttpRequest`. Возвращает thenable-объект с управлением запросом и событиями. Сам запрос уходит в микрозадаче (`queueMicrotask`), поэтому обработчики событий можно навешивать цепочкой сразу после вызова.

Аргументом можно передать как объект параметров, так и `HTMLFormElement` — тогда `url`, `method` и `data` берутся из атрибутов формы (`action`, `method`) и её полей.

**Параметры (`params`):**

| Параметр | По умолчанию | Описание |
|---|---|---|
| `url` | `window.location.href` | Адрес запроса |
| `method` | `'GET'` | HTTP-метод (приводится к верхнему регистру) |
| `data` | `null` | Тело запроса: объект, `FormData` или `HTMLFormElement` |
| `headers` | `{}` | Заголовки запроса |
| `timeout` | `0` | Таймаут в мс (`0` — без таймаута) |
| `response_type` | `''` | `responseType` для XHR (`'json'`, `'blob'` и т.п.) |

**Обработка тела (`data`):**

- `FormData` — отправляется как есть.
- `HTMLFormElement` — `url`/`method` подхватываются из атрибутов формы, тело собирается в `FormData`.
- Обычный объект при `GET` — сериализуется в query-строку, тело становится `null`.
- Обычный объект при остальных методах — отправляется как JSON; если `Content-Type` не задан, выставляется `application/json`.

**Разбор ответа:** при заданном `response_type` берётся `request.response`. Иначе по заголовку `Content-Type`: `*/json` → `JSON.parse`, `*/xml` → `DOMParser` (XML), `*/html` → `DOMParser` (HTML), иначе — текст.

**Колбэки** можно задать как в `params`, так и навесить методами возвращаемого объекта:

| Параметр `params` | Метод | Когда вызывается | Payload |
|---|---|---|---|
| `before_send` | `.beforeSend(cb)` | Перед отправкой | `params` |
| `on_send` | `.onSend(cb)` | Сразу после `send()` | `{ detail: params }` |
| `on_success` | `.onSuccess(cb)` | Статус 2xx | `{ data, request }` |
| `on_complete` | `.onComplete(cb)` | После завершения (успех или ошибка) | `{ data, request }` |
| `on_failed` | `.onFailed(cb)` | Ошибка сети/таймаут/не-2xx | `{ status, status_text, response, request }` |

**Возвращаемый объект (`api`):**

- `.then(onFulfilled, onRejected)`, `.catch(onRejected)`, `.finally(fn)` — объект является thenable, успех резолвит `{ data, request }`, ошибка реджектит payload `onFailed`.
- `.abort()` — прерывает запрос.
- `.beforeSend / .onSend / .onSuccess / .onComplete / .onFailed` — регистрируют дополнительные обработчики, возвращают `api` (можно чейнить).

## Примеры

```js
// Глубокое слияние
const defaults = { a: 1, b: { c: 10, d: 20 } };
const overrides = { b: { c: 99 }, e: 5 };
const result = st_system.merge(defaults, overrides);
// { a: 1, b: { c: 99, d: 20 }, e: 5 }

// Уникальный префикс
const id = st_system.generate_unique_prefix({ length: 8 }); // 'aB3xKpQm'

// Запрос с колбэками в параметрах
st_system.fetch({
    url: '/api/users',
    method: 'POST',
    data: { name: 'Alex' },
    on_success: ({ data }) => console.log(data),
    on_failed:  ({ status }) => console.error('Ошибка', status),
});

// Цепочка и Promise-интерфейс
st_system.fetch({ url: '/api/users', response_type: 'json' })
    .onSuccess(({ data }) => render(data))
    .catch(({ status_text }) => console.error(status_text));

// Отправка формы как есть
const req = st_system.fetch(document.querySelector('form'));
req.then(({ data }) => console.log(data));
```
