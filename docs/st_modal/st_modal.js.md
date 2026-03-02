# st_modal.js

## Описание

Класс модальных окон. Создаёт `<modal>` / `<overlay>` / `<container>` / `content` как custom HTML-теги в DOM. Анимация осуществляется через CSS по атрибуту `state` на `<modal>`. Кнопка с `action="close"` внутри content закрывает модал.

## Конструктор

```js
new st_modal(params)
```

### Основные параметры

| Параметр | По умолчанию | Описание |
|---|---|---|
| `content` | `'<div></div>'` | HTML-строка, CSS-селектор или `Element` |
| `container` | `'body'` | Куда вставить `<modal>` |
| `location` | `'center center'` | Позиция: `top`, `bottom`, `left`, `right`, `center` через пробел |
| `duration` | `0` | Длительность анимации в секундах |
| `zIndex` | `1000` | z-index модального окна |
| `overlay` | `true` | Показывать оверлей |
| `overlay_shading` | `0.5` | Прозрачность затемнения (0–1) |
| `overlay_blur` | `'5px'` | `backdrop-filter: blur()` |
| `overlay_scroll_lock` | `true` | Блокировать прокрутку страницы при открытой модалке |
| `close_by_overlay` | `true` | Закрывать по клику на оверлей |
| `close_by_esc` | `true` | Закрывать по Escape |
| `auto_close` | `-1` | Автозакрытие через N секунд (`-1` = выкл.) |
| `trigger` | `null` | CSS-селектор кнопок, открывающих модал по клику |
| `allow_interrupt` | `false` | Прерывать ожидающую анимацию |

### Хуки жизненного цикла

`before_init`, `on_init`, `before_show`, `on_show`, `before_hide`, `on_hide` — все принимают один аргумент `data` и привязаны к экземпляру.

## Публичные свойства / методы

| Имя | Описание |
|---|---|
| `modal` | DOM-элемент `<modal>` |
| `overlay` | DOM-элемент `<overlay>` |
| `container` | DOM-элемент `<container>` |
| `content` | DOM-элемент контента |
| `state` (getter) | `'hidden'` / `'showing'` / `'shown'` / `'hiding'` |
| `params` (getter) | Объект с параметрами |
| `show(data?)` | Открыть модал |
| `hide(data?)` | Закрыть модал |
| `clone(params)` | Создать копию модального окна |

## Статические методы

| Метод | Описание |
|---|---|
| `st_modal.find(element)` | Получить экземпляр `st_modal` по DOM-элементу или CSS-селектору |

## Анимация через CSS

У `<modal>` есть атрибут `state` со значениями `hidden`, `showing`, `shown`, `hiding`. Ему наследует транзиция через `duration`. Пример CSS для fade:

```css
[state="hidden"], [state="hiding"] { opacity: 0 }
[state="showing"], [state="shown"]  { opacity: 1 }
```

## Пример

```js
const modal = new st_modal({
    content: `<div class="fade">
        <button action="close">×</button>
        <p>Привет!</p>
    </div>`,
    duration: 0.4,
    auto_close: 10,
    on_hide: () => console.log('закрыто')
});

modal.show();
```
