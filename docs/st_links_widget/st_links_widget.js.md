# st_links_widget.js

## Описание

Создаёт плавающий блок иконок-ссылок с настраиваемым позицией и условием появления. Содержит встроенные SVG-иконки в `st_links_widget.DEFAULT_ICONS`.

## Статические свойства

| Свойство | Описание |
|---|---|
| `st_links_widget.DEFAULT_ICONS.link` | SVG-иконка ссылки по умолчанию |

## Конструктор

```js
new st_links_widget(params)
```

### `settings` / `condition`

Аналогичны параметрам `st_button_widget`: `settings.position`, `condition.name`, `condition.options`.

### `links`

Объект со ссылками. Ключи — порядковые номера (0, 1, 2, …).

| Параметр | По умолчанию | Описание |
|---|---|---|
| `links[n].href` | `'undefined'` | URL ссылки |
| `links[n].src` | DEFAULT_ICONS.link | SVG или URL иконки |
| `links[n].id` | — | id элемента |
| `links[n].class` | — | CSS-класс |
| `links[n].style` | `{}` | Встроенные стили |

## Пример

```js
new st_links_widget({
    settings: { position: 'bottom-right' },
    condition: { name: 'scroll' },
    links: {
        0: { href: 'https://t.me/example', src: '<svg>...</svg>' },
        1: { href: 'https://wa.me/example', src: '<svg>...</svg>' }
    }
});
```
