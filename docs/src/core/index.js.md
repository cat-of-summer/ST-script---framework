# index.js

## Описание

`Core` — набор статических утилит: глубокое слияние, случайные строки, UUID, склонение по числу, экранирование HTML, копирование в буфер обмена, скачивание файла и AJAX-обёртка `fetch`. Используется внутри других модулей библиотеки (например, `Loader` грузит данные через `Core.fetch`) и доступен снаружи.

Подключение:

```js
// ESM / npm
import Core from '@cat-of-summer/st-script/core';
```

```html
<!-- CDN / IIFE: объявляет глобальный Core -->
<script defer src="dist/core.min.js"></script>
```

## Публичные статические методы

### `Core.merge(...objects)`

Глубокое слияние. Принимает любое количество аргументов и сливает их слева направо, возвращая новый объект (входы не мутируются).

- Обычные объекты и массивы сливаются рекурсивно; массивы — overlay по индексу (`[1,2,3]` + `[9]` → `[9,2,3]`).
- Если на одном ключе с обеих сторон оказались функции — они компонуются: результат вызывается с теми же аргументами и сам сливается.
- Во всех остальных случаях (скаляры, `null`, несовпадающие типы, экземпляры классов, `Date`) побеждает позднее значение.

### `Core.getRandomChars(params?)`

Случайная строка на `crypto.getRandomValues`.

| Параметр | По умолчанию | Описание |
|---|---|---|
| `params.length` | `16` | Длина строки |
| `params.characters` | `A-Za-z0-9` | Набор символов |

### `Core.uuid(version?)`

UUID в каноническом виде `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.

| `version` | Что выдаёт |
|---|---|
| `7` (по умолчанию) | UUIDv7: первые 48 бит — время `Date.now()` в мс, остальное случайно. Сортируется по времени создания |
| `4` | UUIDv4: полностью случайный |

### `Core.plural(n, one, few, many)`

Форма слова по числу, правила русского языка:

```js
Core.plural(1, 'файл', 'файла', 'файлов');   // 'файл'
Core.plural(3, 'файл', 'файла', 'файлов');   // 'файла'
Core.plural(11, 'файл', 'файла', 'файлов');  // 'файлов'
```

### `Core.escape(text)`

Экранирует `& < > " '` для вставки строки в HTML (`innerHTML`, `#html` в App). `null` и `undefined` дают пустую строку.

### `Core.copy(text)`

Копирует строку в буфер обмена, возвращает `Promise<boolean>`. Вне защищённого контекста (сайт по http не на localhost) Clipboard API недоступен — тогда копирование идёт через скрытое поле и `document.execCommand('copy')`, а фокус возвращается туда, где был. Вызывать из обработчика действия пользователя: без него браузер копирование запрещает.

### `Core.download(content, filename, type?)`

Отдаёт строку или `Blob` файлом через временную ссылку `<a download>`. `type` — MIME-тип для строки, по умолчанию `text/plain`.

```js
Core.download(key, 'access.key');
Core.download(JSON.stringify(data), 'export.json', 'application/json');
```

### `Core.fetch(params)`

Обёртка над `XMLHttpRequest`. Возвращает thenable-объект с управлением запросом и событиями. Сам запрос уходит в микрозадаче (`queueMicrotask`), поэтому обработчики событий можно навешивать цепочкой сразу после вызова.

Аргументом можно передать как объект параметров, так и `HTMLFormElement` — тогда `url`, `method` и `data` берутся из атрибутов формы (`action`, `method`) и её полей, включая скрытые.

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

**Разбор ответа** — одинаковый для успеха и ошибки: `data` в `on_success`/`on_complete` и `response` в `on_failed` получаются одним и тем же способом.

- Задан `response_type` — берётся `request.response` (для `'json'` это уже объект или `null`).
- Иначе по заголовку `Content-Type`: `*/json` → `JSON.parse` (тело, которое не разобралось, остаётся строкой), `*/xml` → `Document` (XML), `*/html` → `Document` (HTML), иначе — текст.

**Колбэки** можно задать как в `params`, так и навесить методами возвращаемого объекта:

| Параметр `params` | Метод | Когда вызывается | Payload |
|---|---|---|---|
| `before_send` | `.beforeSend(cb)` | Перед отправкой | `params` |
| `on_send` | `.onSend(cb)` | Сразу после `send()` | `{ detail: params }` |
| `on_success` | `.onSuccess(cb)` | Статус 2xx | `{ data, request }`, `data` — разобранное тело |
| `on_complete` | `.onComplete(cb)` | Запрос завершён (`readyState` 4) — при любом статусе, включая сетевую ошибку | `{ data, request }`, `data` — разобранное тело |
| `on_failed` | `.onFailed(cb)` | Не-2xx, сетевая ошибка, таймаут, исключение при подготовке | `{ status, status_text, response, request }` |

Поля payload `on_failed`:

- `response` — разобранное тело ответа (см. выше): сервер ответил на 422 JSON-ом — придёт объект, текстом — строка.
- `status` — HTTP-статус; `0` при сетевой ошибке и таймауте (тело тогда пустое); `undefined`, если исключение случилось до отправки — в этом случае `response` содержит само исключение, а `request` отсутствует.

**Возвращаемый объект (`api`):**

- `.then(onFulfilled, onRejected)`, `.catch(onRejected)`, `.finally(fn)` — объект является thenable, успех резолвит `{ data, request }`, ошибка реджектит payload `on_failed`.
- `.abort()` — прерывает запрос.
- `.beforeSend / .onSend / .onSuccess / .onComplete / .onFailed` — регистрируют дополнительные обработчики, возвращают `api` (можно чейнить).

## Примеры

```js
// Глубокое слияние
const defaults = { a: 1, b: { c: 10, d: 20 } };
const overrides = { b: { c: 99 }, e: 5 };
const result = Core.merge(defaults, overrides);
// { a: 1, b: { c: 99, d: 20 }, e: 5 }

// Случайная строка и UUID
const id = Core.getRandomChars({ length: 8 }); // 'aB3xKpQm'
const key = Core.uuid();                       // '019a…-…' (v7)

// Запрос с колбэками в параметрах
Core.fetch({
    url: '/api/users',
    method: 'POST',
    data: { name: 'Alex' },
    on_success: ({ data }) => console.log(data),
    // сервер отвечает на 422 JSON-ом { errors: {...} } — response уже объект
    on_failed:  ({ status, response }) => status == 422 && show_errors(response.errors),
});

// Цепочка и Promise-интерфейс
Core.fetch({ url: '/api/users', response_type: 'json' })
    .onSuccess(({ data }) => render(data))
    .catch(({ status_text }) => console.error(status_text));

// Отправка формы как есть
Core.fetch(document.querySelector('form'))
    .then(({ data }) => console.log(data), ({ response }) => console.error(response));
```
