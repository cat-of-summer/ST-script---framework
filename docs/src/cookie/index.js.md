# cookie

## Описание

Статический утилитарный класс для управления cookie через `document.cookie`. Поддерживает автоматическую сериализацию/десериализацию JSON, колбэки при первой установке и готовый баннер согласия на обработку данных.

## Публичные методы

### `Cookie.set(name, value, params?)`

Устанавливает cookie. Значения, которые не являются строкой (объекты, массивы, числа, `true`/`false`, `null`), записываются через `JSON.stringify`, поэтому `get` возвращает их в исходном виде. Строки записываются как есть, чтобы сервер мог читать их без разбора JSON.

> [!warning] Строки, похожие на JSON
> `get` пробует разобрать любое значение как JSON. Строка `'123'` прочитается числом `123`, строка `'true'` — значением `true`. Если важен именно строковый тип, приводите результат `get` сами.

| Параметр | По умолчанию | Описание |
|---|---|---|
| `params.expires` | `3600` | Время жизни в секундах, строка даты или объект `Date`. `Infinity` — «бессрочно»: 400 дней, это максимум, который сохраняет Chrome. |
| `params.path` | `'/'` | Путь |
| `params.domain` | — | Домен |
| `params.secure` | — | Флаг `Secure` |
| `params.sameSite` | — | `'Strict'` / `'Lax'` / `'None'` |

### `Cookie.get(name)`

Возвращает значение cookie (автоматический `JSON.parse`) или `null`.

### `Cookie.delete(name, params?)`

Удаляет cookie (устанавливает `expires: 0`).

### `Cookie.callback(name, callback, params?)`

Если cookie с именем `name` отсутствует — устанавливает её и вызывает `callback(name)` с задержкой `params.delay` секунд. При `params.interval > 0` проверяет повторно.

| Параметр | По умолчанию | Описание |
|---|---|---|
| `params.interval` | `0` | Интервал повторной проверки (сек), `0` = однократно |
| `params.delay` | `0` | Задержка вызова callback (сек) |
| `params.value` | `true` | Значение устанавливаемой cookie |

### `Cookie.consent(params?)`

Отображает баннер согласия с cookie. Показывается один раз — при отсутствии cookie `params.name`. Кнопки с атрибутом `action="accept"` / `action="decline"` управляют закрытием и записывают результат в cookie.

| Параметр | По умолчанию | Описание |
|---|---|---|
| `params.content` | HTML строка | HTML баннера или CSS-селектор существующего элемента |
| `params.container` | `'body'` | Контейнер для вставки (`'body'` — позиционируется абсолютно) |
| `params.location` | `'bottom'` | Позиция: `'top'`, `'bottom'`, `'center'`, `'left'`, `'right'` |
| `params.zIndex` | `1000` | z-index |
| `params.name` | `'cookie_consent'` | Имя cookie |
| `params.interval` | `5` | Интервал проверки (сек) |

## Примеры

```js
// Установка на 1 день
Cookie.set('user', { id: 42, name: 'Иван' }, { expires: 86400 });

// «Бессрочно» (400 дней)
Cookie.set('theme', 'dark', { expires: Infinity });

// Чтение
const user = Cookie.get('user'); // { id: 42, name: 'Иван' }

// Удаление
Cookie.delete('user');

// callback при первом посещении
Cookie.callback('welcome', () => {
    showWelcomePopup();
}, { delay: 2 });

// Баннер согласия
Cookie.consent({
    location: 'bottom',
    name: 'gdpr_consent'
});
```
