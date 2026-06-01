# st_cookie.js

## Описание

Статический утилитарный класс для управления cookie через `document.cookie`. Поддерживает автоматическую сериализацию/десериализацию JSON, колбэки при первой установке и готовый баннер согласия на обработку данных.

## Публичные методы

### `st_cookie.set(name, value, params?)`

Устанавливает cookie.

| Параметр | По умолчанию | Описание |
|---|---|---|
| `params.expires` | `3600` | Время жизни в секундах, строка даты или объект `Date` |
| `params.path` | `'/'` | Путь |
| `params.domain` | — | Домен |
| `params.secure` | — | Флаг `Secure` |
| `params.sameSite` | — | `'Strict'` / `'Lax'` / `'None'` |

### `st_cookie.get(name)`

Возвращает значение cookie (автоматический `JSON.parse`) или `null`.

### `st_cookie.delete(name, params?)`

Удаляет cookie (устанавливает `expires: 0`).

### `st_cookie.callback(name, callback, params?)`

Если cookie с именем `name` отсутствует — устанавливает её и вызывает `callback(name)` с задержкой `params.delay` секунд. При `params.interval > 0` проверяет повторно.

| Параметр | По умолчанию | Описание |
|---|---|---|
| `params.interval` | `0` | Интервал повторной проверки (сек), `0` = однократно |
| `params.delay` | `0` | Задержка вызова callback (сек) |
| `params.value` | `true` | Значение устанавливаемой cookie |

### `st_cookie.consent(params?)`

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
st_cookie.set('user', { id: 42, name: 'Иван' }, { expires: 86400 });

// Чтение
const user = st_cookie.get('user'); // { id: 42, name: 'Иван' }

// Удаление
st_cookie.delete('user');

// callback при первом посещении
st_cookie.callback('welcome', () => {
    showWelcomePopup();
}, { delay: 2 });

// Баннер согласия
st_cookie.consent({
    location: 'bottom',
    name: 'gdpr_consent'
});
```
