# datepicker.js

## Обзор

`datepicker` - календарь на `st_app` без сторонних библиотек: поле с маской `ДД.ММ.ГГГГ` и
всплывающая сетка месяца, диапазон дат, границы `min`/`max`, режим `inline` с кнопками
"Сбросить" и "Выбрать". Как и `form`, это конфиг: регистрируется через `App.create(datepicker)`,
а `App` в его бандл не входит. `Mask` входит.

- Дату можно набрать с клавиатуры (маска как у `input type=date`: группы `ДД`, `ММ`, `ГГГГ`) или выбрать в сетке.
- В форму уходит ISO `YYYY-MM-DD` из скрытых полей. Видимые поля без `name` не отправляются.
- Проверка - через `setCustomValidity` на видимых полях. Несуществующая дата (`31.02`), выход за `min`/`max`,
  конец диапазона раньше начала, пустое обязательное поле видны форме и `reportValidity()`.
- Календарное ядро (`_calendar.js`) - чистые функции без DOM. Им пользуются обёртки в других
  фреймворках, чтобы не дублировать логику (`@cat-of-summer/st-script/src/app/datepicker/_calendar.js`).

Подключение:

```js
// ESM / npm
import App from '@cat-of-summer/st-script/app';
import datepicker from '@cat-of-summer/st-script/app/datepicker';
App.create(datepicker);
```

```html
<!-- CDN / IIFE: App и глобальный Datepicker (конфиг) -->
<script defer src="dist/app.min.js"></script>
<script defer src="dist/app/datepicker.min.js"></script>
<script>document.addEventListener('DOMContentLoaded', () => App.create(Datepicker));</script>
```

---

## Разметка

Разметку строит шаблон конфига, если `<st-app>` пустой; разметка внутри `<st-app>` заменяет его (см. "Свой шаблон"). Данные передаются атрибутами `:prop`:

```html
<label for="delivery-date">Дата доставки</label>
<st-app app="datepicker" :name="date" :input-id="delivery-date" :min="2026-01-01" :required="true"></st-app>

<st-app app="datepicker" :name="period" :range="true" :value="2026-10-12/2026-10-15"></st-app>

<st-app app="datepicker" :inline="true" :range="true"></st-app>
```

| Свойство (`:атрибут`) | По умолчанию | Описание |
|---|---|---|
| `name` | `''` | имя поля формы. Одиночная дата уходит как `name`, диапазон - как `name_from` и `name_to`. Пусто - ничего не отправляется |
| `range` | `false` | диапазон: два поля, в сетке выбираются начало и конец |
| `inline` | `false` | без полей, сетка всегда открыта, кнопки "Сбросить" и "Выбрать". Выбор становится значением только по "Выбрать" |
| `required` | `false` | пустое поле - ошибка проверки |
| `value` | `''` | ISO `YYYY-MM-DD`; диапазон - `YYYY-MM-DD/YYYY-MM-DD` (интервал ISO 8601). Меняется при выборе; запись из кода или в `:value` перерисовывает календарь |
| `min`, `max` | `''` | границы, ISO. Дни вне границ в сетке выключены, набранная дата вне границ - ошибка проверки |
| `inputId` (`:input-id`) | `''` | `id` первого поля - для `<label for>` |
| `messages` | см. ниже | тексты ошибок проверки |

> [!warning] Пустой `:prop` при монтировании берёт значение из конфига
> `:range=""` - это `false` из конфига, а не "включено". Булевы свойства пишите явно: `:range="true"`.

Сообщения по умолчанию (`{date}` - граница в `ДД.ММ.ГГГГ`):

```js
messages: {
    required:   'Заполните поле',
    incomplete: 'Введите дату полностью',
    invalid:    'Такой даты нет',
    min:        'Дата не раньше {date}',
    max:        'Дата не позже {date}',
    order:      'Конец периода раньше начала',
}
```

Свои тексты задаются через `App.extend('datepicker', { messages: {…} })` до монтирования.

### Свой шаблон

Разметка внутри `<st-app app="datepicker">` заменяет встроенный шаблон - как у любого `st_app`.
Так проект держит вёрстку календаря у себя (обёртка `default/Datepicker` в шаблонах ST-forge),
а логика остаётся в конфиге. За основу берите `template` из `src/app/datepicker/index.js` и
сохраните маркеры `datepicker-from`, `datepicker-to` и `datepicker-value="from|to"`: по ним конфиг
находит поля. Имена скрытых полей и `id` в своём шаблоне можно писать сразу, без `{{ }}`.

---

## Классы шаблона

Конфиг не несёт CSS: внешний вид и тема - на стороне проекта. Классы статичные, целыми именами,
поэтому очистка неиспользуемого CSS их видит.

| Класс | Элемент |
|---|---|
| `[app="datepicker"]` | корень - сам `<st-app>`; от него и пишутся стили |
| `.datepicker__field` | строка полей с кнопкой; `--invalid` - ошибка после ухода из поля или попытки отправки |
| `.datepicker__input` | видимое поле (`[datepicker-from]`, `[datepicker-to]`) |
| `.datepicker__dash` | тире между полями диапазона |
| `.datepicker__toggle` | кнопка календаря; открыт - `aria-expanded="true"` |
| `.datepicker__popup` | сетка с навигацией; закрытая - атрибут `hidden`; `--inline` - режим `inline` |
| `.datepicker__nav`, `.datepicker__prev`, `.datepicker__next`, `.datepicker__caption` | навигация по месяцам и заголовок "Октябрь 2026" |
| `.datepicker__grid` | сетка 7 колонок: 7 `.datepicker__weekday` и 42 `.datepicker__day` |
| `.datepicker__day` | день; модификаторы `--other` (соседний месяц), `--today`, `--selected`, `--in-range`, `--range-from`, `--range-to`; вне границ - `disabled` |
| `.datepicker__buttons`, `.datepicker__reset`, `.datepicker__apply` | кнопки режима `inline` |

Тему удобно держать в переменных с фолбэком в месте использования (`var(--datepicker-accent, #4f46e5)`):
тогда тёмная секция переопределяет их на себе, а не правилами на каждый класс. Готовый набор - в
`examples/datepicker.html`.

---

## События

Все всплывают, `cancelable`.

| Событие | `detail` | Когда |
|---|---|---|
| `datepicker:change` | `{ from, to, value }` (ISO или `null`) | значение сменилось: выбор в сетке, набор с клавиатуры, "Выбрать", "Сбросить" |
| `datepicker:open` | `null` | открылась сетка |
| `datepicker:close` | `null` | закрылась сетка |

При смене значения скрытые поля получают всплывающие `input` и `change`: внутри `<st-app app="form">`
это `field:input` с `name` и ISO.

---

## Методы

- `open()`, `close()`, `toggle()` - сетка (кроме `inline`). Закрывают её также `Escape`, после которого фокус
  возвращается на кнопку, и клик мимо календаря.
- `go(delta)` - листать месяцы: `go(-1)`, `go(12)`.
- `pick(iso)` - выбрать день, как кликом.
- `apply()` - текущий выбор сделать значением (кнопка "Выбрать").
- `clear()` - очистить значение (кнопка "Сбросить").
- `refresh()` - перечитать значение из скрытых полей. Нужен после `form.fill()`: он пишет `.value`
  без событий.

`reset` формы возвращает начальное значение (`:value` на момент монтирования).

---

## Пример

```js
App.create(datepicker);

document.addEventListener('datepicker:change', e => {
    if (e.target.id == 'events-filter') loadEvents(e.detail.from, e.detail.to);
});
```

```html
<st-app app="datepicker" id="events-filter" :inline="true" :range="true" :min="2026-01-01"></st-app>
```
