# validator.js

## Описание

Валидирует поля (и любые элементы) по набору правил на заданных событиях. Один инстанс
обслуживает все подходящие элементы (модель как у `Select` и `Mask`). Результат проверки
отдаётся тремя путями:

- атрибут `state="valid" | "invalid"` на самом элементе — внешний вид задаёт CSS потребителя;
- `setCustomValidity` — нативная валидация формы (`:invalid`, `reportValidity`, блокировка submit);
- хуки `on_valid` / `on_invalid` / `on_check`.

Порядок проверки: встроенные ограничения браузера (`required`, `type`, `pattern`, …, только при
`native: true`) → наличие `attribute` → правила `test` по очереди до первого провала.

## Конструктор

```js
new Validator(params)
```

| Параметр | По умолчанию | Описание |
|---|---|---|
| `target` | `'[validate]'` | Селектор / Element / NodeList / Array валидируемых элементов |
| `events` | `['input', 'blur']` | События, запускающие проверку |
| `test` | `null` | Правило или массив правил (все должны пройти): `RegExp`, строка-regexp или `fn(el)` |
| `property` | `null` | Свойство элемента, к которому применяются regexp-правила (`innerHTML`, `textContent`, …) |
| `attribute` | `null` | Атрибут обязан присутствовать; без `property` regexp-правила проверяют его значение |
| `message` | `'Некорректное значение'` | Сообщение об ошибке: строка или `fn(el)` |
| `native` | `true` | Учитывать встроенные ограничения и вызывать `setCustomValidity` (если он есть у элемента) |
| `check_on_init` | `false` | Сразу проверить все элементы с проставлением `state` и вызовом хуков |

Источник строки для regexp-правил: `property` → значение `attribute` → `el.value`.

Функция-правило возвращает `true`/`false` или строку — строка означает «невалидно» с этим
сообщением вместо `message`.

### Хуки

Передаются в `params`, привязываются к инстансу.

| Хук | Аргументы | Описание |
|---|---|---|
| `before_check` | `(el)` | Перед проверкой; `return false` отменяет её |
| `on_valid` | `(el)` | Элемент прошёл проверку |
| `on_invalid` | `(el, message)` | Элемент не прошёл проверку |
| `on_check` | `(el, valid, message)` | После каждой проверки |
| `before_init` / `on_init` | `(params)` | В начале / конце инициализации |

## Методы и геттеры

| Член | Описание |
|---|---|
| `check(target?)` | Проверить элементы (по умолчанию — все свои): `state`, `setCustomValidity`, хуки. Возвращает `true`, если все валидны |
| `reset(target?)` | Снять `state`; `setCustomValidity` пересчитывается без хуков, чтобы submit оставался заблокированным |
| `clone(params)` | Новый инстанс с объединёнными параметрами и `parent: this` |
| `get params()` | Текущая конфигурация (без хуков) |
| `get valid()` | Массив `boolean` по привязанным элементам — без `state` и хуков |
| `Validator.find(el)` | Инстанс, владеющий элементом |

На самом элементе публикуются `el.check()` и `el.reset()`.

## Поведение

- При инициализации каждый элемент проверяется «тихо»: только `setCustomValidity`, без
  `state` и хуков. Нативный submit блокируется сразу, хотя поле ещё не трогали.
- Попытка отправить форму вызывает у невалидных полей событие `invalid` — валидатор
  ловит его и делает полную проверку, так что поля получают `state="invalid"`.
- Сброс формы (`reset`) снимает `state` с её полей.
- На элемент можно привязать только один валидатор — повторная привязка бросает исключение.
  Несколько правил задаются массивом в `test`.

## Пример

```html
<form>
    <label>
        E-mail
        <input type="text" name="email" required>
    </label>
    <button type="submit">Отправить</button>
</form>

<script type="module">
    import Validator from '../dist/validator.esm.min.js';

    new Validator({
        target: 'input[name=email]',
        test: [
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            el => !el.value.endsWith('.ru') || 'Домены .ru не принимаются',
        ],
        message: 'Введите e-mail',
        on_invalid: (el, message) => console.log(message),
    });
</script>
```

```css
/* Внешний вид — на CSS по атрибуту [state]. */
[state="valid"]   { border-color: green; }
[state="invalid"] { border-color: red; }
label:has([state="invalid"]) { color: red; }
```

## Замечания

- Для элементов без `setCustomValidity` (`div` и т. п.) работают только `state` и хуки.
- С `native: false` встроенные ограничения браузера не учитываются, а `setCustomValidity`
  не вызывается — валидатор судит только по `attribute` и `test`.
- Подключение: ESM — `import Validator from '../dist/validator.esm.min.js'`; глобал для CDN —
  `<script defer src="../dist/validator.min.js">`, класс доступен как `window.Validator`.
