# st_button_widget.js

## Описание

Создаёт плавающую кнопку-виджет с настраиваемым позиции, условием появления (прокрутка, hover) и действием по клику (scroll-to-top, показ popup, произвольная функция). Содержит встроенные SVG-иконки в `st_button_widget.DEFAULT_ICONS`.

## Статические свойства

| Свойство | Описание |
|---|---|
| `st_button_widget.DEFAULT_ICONS.arrow` | SVG-стрелка вверх |

## Конструктор

```js
new st_button_widget(params)
```

### `settings`

| Параметр | По умолчанию | Описание |
|---|---|---|
| `settings.position` | `"bottom-right"` | `"top-left"` / `"top-right"` / `"bottom-left"` / `"bottom-right"` |

### `condition`

Условие видимости кнопки.

| Параметр | По умолчанию | Описание |
|---|---|---|
| `condition.name` | `"scroll"` | `"hover"` или `"scroll"` |
| `condition.options.hiding_type` | `"opacity"` | `"opacity"` / `"visibility"` / `"display"` |
| `condition.options.transition` | `"0.3s"` | CSS-транзиция |
| `condition.options.margin_top` | `window.innerHeight` | Отступ прокрутки, после которого кнопка видна |
| `condition.options.attribute` | `[]` | Атрибут активного состояния |

### `action`

Действие по клику.

| Параметр | По умолчанию | Описание |
|---|---|---|
| `action.name` | `"scroll"` | `"scroll"` / `"show_popup"` / `"function"` |
| `action.options.top` | `0` | Цель прокрутки |
| `action.options.behavior` | `"smooth"` | Поведение прокрутки |
| `action.options.selector` | — | Селектор popup-элемента для `show_popup` |
| `action.options.hook` | `() => {}` | Функция, привязываемая к клику |

### Оформление

Настройка оболочек через `widget_container`, `widget`, `button_container`, `button` (sx свойства `id`, `class`, `style`).

## Пример

```js
// Кнопка “наверх” с появлением после прокрутки на высоту экрана
new st_button_widget({
    settings: { position: 'bottom-right' },
    condition: {
        name: 'scroll',
        options: { margin_top: 300 }
    },
    action: {
        name: 'scroll',
        options: { top: 0, behavior: 'smooth' }
    }
});
```
