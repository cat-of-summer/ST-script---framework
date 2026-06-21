# select.js

## Описание

Заменяет нативный `<select>` кастомным дропдауном, сохраняя сам `<select>` рабочим
держателем значения (валидно для форм, диспатчит `change`). Один инстанс оборачивает все
подходящие `<select>` (модель как у `Toggle`). Открытие/закрытие идёт через атрибут `state`
(`closed → opening → open → closing → closed`) — внешний вид и анимацию задаёт CSS потребителя
по `[state]`. Поддерживает `<select multiple>`.

На каждый `<select>` создаётся структура:

```
<select-container state="closed">
    <select-trigger>текущий выбор</select-trigger>
    <select>…</select>            <!-- визуально скрыт, держит значение -->
    <select-options>
        <select-option [selected] [disabled]>…</select-option>
        …
    </select-options>
</select-container>
```

## Конструктор

```js
new Select(params)
```

| Параметр | По умолчанию | Описание |
|---|---|---|
| `target` | `'select'` | Селектор / Element / NodeList нативных `<select>` |
| `location` | `'bottom center'` | Позиция панели: `top` / `bottom` / `left` / `right` / `center` |
| `action` | `'click'` | Как открывать: `'click'` (или иное событие) либо `'hover'` |
| `duration` | `0` | Длительность перехода, сек (для `transition` и тайминга `state`) |
| `allow_interrupt` | `false` | Прерывать незавершённый переход обратным действием |
| `close_on_select` | `true` | Закрывать после выбора (для одиночного; для `multiple` игнорируется) |
| `close_on_outside` | `true` | Закрывать по клику вне контейнера |

### Хуки

Передаются в `params`, привязываются к инстансу.

| Хук | Аргументы | Описание |
|---|---|---|
| `before_open` / `on_open` | `(container)` | До / после открытия панели |
| `before_close` / `on_close` | `(container)` | До / после закрытия панели |
| `before_change` | `(option, select)` | Перед выбором опции; `return false` отменяет выбор |
| `on_change` | `(option, select)` | После выбора и синхронизации значения |
| `before_init` / `on_init` | `(params)` | В начале / конце инициализации |

## Методы и геттеры

| Член | Описание |
|---|---|
| `open(el)` / `close(el)` / `toggle(el)` | Управление панелью; `el` — контейнер, `<select>` или вложенный элемент |
| `clone(params)` | Новый инстанс с объединёнными параметрами и `parent: this` |
| `get params()` | Текущая конфигурация (без функций) |
| `get value()` | Массив значений по управляемым `<select>` (для `multiple` — массив массивов) |
| `Select.find(el)` | Инстанс, владеющий элементом (через `own`/`find`) |

## Пример

```html
<form>
    <select id="color" name="color">
        <option value="red">Красный</option>
        <option value="green">Зелёный</option>
        <option value="blue">Синий</option>
    </select>
    <button type="submit">Отправить</button>
</form>

<script type="module">
    import Select from '../dist/select.esm.min.js';

    new Select({
        target: '#color',
        location: 'bottom center',
        action: 'click',
        duration: 0.2,
        before_change: (option) => option.value !== 'blue', // запретить «Синий»
    });
</script>
```

```css
/* Внешний вид и анимация — на CSS по атрибуту [state]. */
select-trigger { display: inline-block; padding: 8px 12px; border: 1px solid #ddd; }

select-options {
    min-width: 100%; background: #fff; border: 1px solid #ddd;
    opacity: 0; transform: translateY(-6px); pointer-events: none; transition: all .2s;
}
select-container[state="open"]    select-options,
select-container[state="opening"] select-options {
    opacity: 1; transform: translateY(0); pointer-events: auto;
}

select-option { display: block; padding: 8px 12px; cursor: pointer; }
select-option:hover { background: #f3f3f3; }
select-option[selected] { font-weight: 700; }
select-option[disabled] { opacity: .4; cursor: default; }
```

## Замечания

- Нативный `<select>` остаётся в DOM визуально скрытым — значение уходит в форму, событие
  `change` диспатчится при каждом выборе.
- Для `<select multiple>` выбор накапливается, панель не закрывается (`close_on_select`
  игнорируется).
- Подключение: ESM — `import Select from '../dist/select.esm.min.js'`; глобал для CDN —
  `<script defer src="../dist/select.min.js">`, класс доступен как `window.select`.
