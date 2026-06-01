# st_accordion.js

## Описание

Превращает произвольную HTML-структуру в аккордион. Управляющие элементы (caption) и раскрываемый контент (content) обозначаются через HTML-атрибуты с настраиваемым namespace. Поддерживает группировку кнопок с взаимным выключением, анимацию через `transition` и три типа скрытия.

## Конструктор

```js
new st_accordion(params)
```

### Параметры `settings`

| Параметр | По умолчанию | Описание |
|---|---|---|
| `namespace` | `"st_"` | Префикс всех атрибутов аккордиона |
| `caption_attribute` | `"caption"` | Атрибут управляющих кнопок |
| `content_attribute` | `"content"` | Атрибут раскрываемых блоков |
| `target_attribute` | `"target"` | Атрибут кнопки — CSS-селектор целевого блока |
| `group_attribute` | `"group"` | Группирует кнопки для взаимного выключения |

### Параметры `options`

| Параметр | По умолчанию | Описание |
|---|---|---|
| `accordion_selector` | — | **Обязательный.** CSS-селектор корня аккордиона |
| `hiding_type` | `"display"` | `"display"` / `"opacity"` / `"visibility"` |
| `transition` | `undefined` | CSS `transition` для content-элементов |
| `trigger` | `"click"` | Событие: `"click"` или `"hover"` |
| `attribute` | `[]` | Атрибут активного состояния на кнопке |

## Пример

```html
<div id="faq">
    <button st_caption st_target="#answer1" st_group="faq">Вопрос 1</button>
    <div id="answer1" st_content>Ответ 1</div>

    <button st_caption st_target="#answer2" st_group="faq">Вопрос 2</button>
    <div id="answer2" st_content>Ответ 2</div>
</div>

<script>
    new st_accordion({
        options: {
            accordion_selector: '#faq',
            hiding_type: 'display',
            transition: '0.3s',
            attribute: 'active'
        }
    });
</script>
```
