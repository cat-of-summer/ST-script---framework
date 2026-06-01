# st_select.js

## Описание

Заменяет стандартный `<select>` кастомным дропдауном. Опции становятся кликабельными элементами. Стили `options_container` и `option` настраиваются через CSS по селекторам `[type=options_container]` и `option`.

## Конструктор

```js
new st_select(params)
```

| Параметр | По умолчанию | Описание |
|---|---|---|
| `selector` | `'select'` | CSS-селектор элементов `<select>` |
| `position` | `''` | Размещение дропдауна. Слова: `top`, `bottom`, `left`, `right`, `horizontal` |
| `hiding_method` | `'display'` | `'height'` / `'width'` / `'opacity'` / `'visibility'` / `'display'` |
| `hide_on` | `[]` | `'toggle_click'` / `'outside_click'` / `'element_click'` |

## Пример

```html
<select id="my-select" name="color">
    <option value="red">Красный</option>
    <option value="blue">Синий</option>
</select>

<script>
    new st_select({
        selector: '#my-select',
        position: 'bottom',
        hiding_method: 'height',
        hide_on: ['outside_click', 'element_click']
    });
</script>
```

```css
#my-select + div[type="options_container"] {
    transition: 0.3s;
    background: #fff;
    border: 1px solid #ddd;
}
```

## Замечания

- Класс создаёт обёртку `div[type="select_container"]` + `div[type="options_container"]`.
- Выбранная опция отображается внутри самого `<select>` (HTML-значение валидно для форм).
- Отключённые (`disabled`) опции пропускаются при инициальном выборе.
