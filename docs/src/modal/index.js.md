# modal.js

## Содержание

1. [Описание](#1-описание)
2. [DOM-структура](#2-dom-структура)
3. [Машина состояний](#3-машина-состояний)
4. [Параметры конструктора](#4-параметры-конструктора)
5. [Хуки жизненного цикла](#5-хуки-жизненного-цикла)
6. [Публичные свойства и методы](#6-публичные-свойства-и-методы)
7. [Статические методы](#7-статические-методы)
8. [action="close"](#8-actionclose)
9. [CSS-анимация через атрибут state](#9-css-анимация-через-атрибут-state)
10. [Блокировка прокрутки страницы](#10-блокировка-прокрутки-страницы)
11. [Примеры](#11-примеры)
12. [Известные особенности и ограничения](#12-известные-особенности-и-ограничения)

---

## 1. Описание

`Modal` — класс для создания модальных окон. Каждый экземпляр порождает дерево
нестандартных HTML-элементов (`<modal>`, `<overlay>`, `<container>`) и вставляет
их в указанный контейнер (по умолчанию — `<body>`).

**Ключевые принципы:**

- **Анимация — только CSS.** Открытие/закрытие управляется атрибутом `state` на
  элементе `<modal>`. Разработчик сам определяет CSS-правила для каждого значения
  этого атрибута.
- **Нет зависимостей.** Чистый ES6-класс, экспортируется как ES-модуль.
- **Гибкий контент.** Принимает HTML-строку, CSS-селектор существующего элемента
  или готовый `Element`.
- **Закрытие без JS.** Любой элемент с атрибутом `action="close"` внутри контента
  автоматически закрывает модал по клику.

---

## 2. DOM-структура

После вызова `new Modal(params)` в DOM появляется следующее дерево:

```
<modal state="hidden">          ← фиксированный слой на весь экран
  <overlay>                     ← (опционально) затемнение/размытие фона
  <container>                   ← позиционируемая обёртка контента
    {content}                   ← пользовательский элемент
```

### Inline-стили, проставляемые автоматически

| Элемент | Ключевые стили |
|---|---|
| `<modal>` | `position: fixed; top/left/right/bottom: 0; display: none; overflow-y: auto; pointer-events: none; z-index: zIndex` |
| `<overlay>` | `position: absolute; top/left/right/bottom: 0; background-color: rgba(0,0,0,overlay_shading); backdrop-filter: blur(overlay_blur); pointer-events: all; z-index: zIndex+1` |
| `<container>` | `position: relative; width/height: max-content; max-width: 100vw; pointer-events: all; z-index: zIndex+2; margin-* управляется через location` |
| `content` | `transition: inherit` |

> **z-index:** значение `zIndex` из параметров последовательно инкрементируется —
> сначала для `<overlay>` (`zIndex + 1`), затем для `<container>` (`zIndex + 2`).
> При нескольких модалках на одной странице используйте разные базовые `zIndex`.

### Связь DOM-элементов с экземпляром

Каждый из четырёх элементов (`modal`, `overlay`, `container`, `content`) хранит
ссылку на экземпляр `Modal` через приватный Symbol. Получить экземпляр по
элементу или CSS-селектору можно через `Modal.find()`.

---

## 3. Машина состояний

У каждого экземпляра есть внутреннее состояние, доступное через getter `state`.

### Диаграмма переходов

```
         show()                     on_show()
hidden ──────────► showing ──────────────────► shown
  ▲                                              │
  │    on_hide()              hide()             │
  ◄──────────── hiding ◄──────────────────────── ┘
```

| Состояние | Описание |
|---|---|
| `hidden` | Модал скрыт, `<modal>` имеет `display: none` |
| `showing` | Идёт анимация открытия, прошёл один `requestAnimationFrame` |
| `shown` | Анимация завершена, модал полностью открыт |
| `hiding` | Идёт анимация закрытия |

### Как происходит переход (внутренняя механика)

1. `show()` / `hide()` вызывают внутреннюю функцию `toggle()`.
2. `toggle()` вызывает хук `before_show` / `before_hide`, затем устанавливает
   `display: flex` на `<modal>`.
3. Первый `requestAnimationFrame` устанавливает промежуточное состояние
   (`showing` / `hiding`) — это запускает CSS-переход.
4. Второй `requestAnimationFrame` запускает `setTimeout(duration * 1000)`.
5. По окончании таймаута устанавливается финальное состояние (`shown` / `hidden`),
   вызывается хук `on_show` / `on_hide`, и при `hidden` — `display: none`.

Двойной `requestAnimationFrame` гарантирует, что браузер успеет применить
промежуточное состояние перед началом анимации.

### allow_interrupt

По умолчанию (`allow_interrupt: false`) вызов `show()` во время анимации закрытия
(`hiding`) и вызов `hide()` во время анимации открытия (`showing`) игнорируются.

При `allow_interrupt: true` эти вызовы отменяют текущую анимацию и стартуют
обратную, что позволяет реализовать плавный реверс.

---

## 4. Параметры конструктора

```js
new Modal(params)
```

Все параметры необязательны — конструктор содержит дефолтные значения для каждого.

### Контент и контейнер

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `content` | `string \| Element` | `'<div></div>'` | HTML-строка, CSS-селектор или готовый `Element`. Если передан селектор — элемент **физически перемещается** в `<container>`. Если HTML-строка — парсится через `DOMParser`, берётся первый дочерний элемент `<body>`. |
| `container` | `string \| Element` | `'body'` | Куда вставить `<modal>`. Принимает CSS-селектор или `Element`. |

### Позиционирование

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `location` | `string` | `'center center'` | Позиция `<container>` внутри `<modal>`. Задаётся двумя словами через пробел (порядок не важен): вертикаль (`top` / `bottom` / `center`) и горизонталь (`left` / `right` / `center`). Реализуется через `margin: auto` / `margin: 0` на соответствующих сторонах. |

**Примеры значений `location`:**

| Значение | Результат |
|---|---|
| `'center center'` | По центру экрана (по умолчанию) |
| `'top center'` | Сверху по центру |
| `'bottom left'` | Снизу слева |
| `'top right'` | Сверху справа |
| `'bottom center'` | Снизу по центру — удобно для cookie-баннеров |

### Анимация

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `duration` | `number` | `0` | Длительность CSS-перехода в секундах. Применяется как `transition: all {duration}s` на `<modal>`, и наследуется дочерними элементами. |
| `zIndex` | `number` | `1000` | Базовый z-index. `<overlay>` получает `zIndex+1`, `<container>` — `zIndex+2`. |
| `allow_interrupt` | `boolean` | `false` | Разрешить отмену текущей анимации при вызове обратного действия. |

### Оверлей

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `overlay` | `boolean` | `true` | Создавать элемент `<overlay>`. При `false` — `<overlay>` отсутствует в DOM. |
| `overlay_shading` | `number` | `0.5` | Непрозрачность затемнения от `0` (прозрачный) до `1` (полностью чёрный). Используется как `rgba(0, 0, 0, N)`. |
| `overlay_blur` | `string` | `'5px'` | Размытие фона через `backdrop-filter: blur(N)`. Передаётся любое валидное CSS-значение, например `'0px'`, `'10px'`. |
| `overlay_scroll_lock` | `boolean` | `true` | Блокировать прокрутку страницы, пока модал открыт. Работает только при `overlay: true`. Подробнее — в разделе [10](#10-блокировка-прокрутки-страницы). |

### Закрытие

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `close_by_overlay` | `boolean` | `true` | Закрывать модал по клику на `<overlay>`. |
| `close_by_esc` | `boolean` | `true` | Закрывать модал по нажатию клавиши `Escape`. Вешает обработчик на `document`. |
| `auto_close` | `number` | `-1` | Автоматически закрыть модал через N секунд после открытия. `-1` — выключено. |

### Триггеры

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `trigger` | `string \| null` | `null` | CSS-селектор элементов, которые будут открывать модал по клику. Привязка происходит один раз при создании (`querySelectorAll`). Динамически добавленные элементы не отслеживаются. |

### Хуки жизненного цикла

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `before_init` | `function` | `() => {}` | Вызывается **до** создания DOM-элементов. Получает объект `params`. |
| `on_init` | `function` | `() => {}` | Вызывается **после** создания DOM и навешивания всех обработчиков. Получает объект `params`. |
| `before_show` | `function` | `() => {}` | Вызывается **до** старта анимации открытия. Получает `data` из `show(data)`. |
| `on_show` | `function` | `() => {}` | Вызывается **после** завершения анимации открытия. Получает `data` из `show(data)`. |
| `before_hide` | `function` | `() => {}` | Вызывается **до** старта анимации закрытия. Получает `data` из источника закрытия (кнопка, оверлей, ESC, `auto_close` или явный вызов `hide(data)`). |
| `on_hide` | `function` | `() => {}` | Вызывается **после** завершения анимации закрытия. Получает `data` аналогично `before_hide`. |

---

## 5. Хуки жизненного цикла

### Порядок вызова при открытии

```
show(data)
  → before_show(data)          ← немедленно
  → [requestAnimationFrame x2 + setTimeout(duration)]
  → on_show(data)              ← после завершения анимации
```

### Порядок вызова при закрытии

```
hide(data)
  → before_hide(data)          ← немедленно
  → [requestAnimationFrame x2 + setTimeout(duration)]
  → on_hide(data)              ← после завершения анимации, display: none уже установлен
```

### Инициализация

```
new Modal(params)
  → before_init(params)        ← до создания DOM
  → [создание modal, overlay, container, content, обработчиков]
  → on_init(params)            ← после полной инициализации
```

### Привязка контекста

Все хуки автоматически привязываются к экземпляру через `.bind(this)`. Внутри хука
`this` указывает на экземпляр `Modal`, что позволяет обращаться к его свойствам:

```js
const modal = new Modal({
    content: `<div><p id="msg"></p><button action="close">Закрыть</button></div>`,
    before_show(data) {
        // this — экземпляр Modal
        this.content.querySelector('#msg').textContent = `Открыто с данными: ${data}`;
    },
    on_hide() {
        console.log('Текущее состояние после скрытия:', this.state); // 'hidden'
    }
});
```

### Параметр data

`data` — произвольное значение, которое передаётся в `show(data)` или `hide(data)`.
По умолчанию `null`.

При закрытии через встроенные механизмы значение `data`:
- **`action="close"` кнопка** — `null` (вызов без аргумента)
- **Клик по overlay** — DOM-элемент `<overlay>`
- **Клавиша ESC** — объект события `KeyboardEvent`
- **`auto_close`** — `null`

---

## 6. Публичные свойства и методы

### Свойства (DOM-элементы)

| Свойство | Тип | Описание |
|---|---|---|
| `modal` | `HTMLElement` | Элемент `<modal>` — корневой контейнер |
| `overlay` | `HTMLElement \| undefined` | Элемент `<overlay>`. `undefined`, если `overlay: false` |
| `container` | `HTMLElement` | Элемент `<container>` — обёртка, управляющая позицией |
| `content` | `HTMLElement` | Пользовательский элемент контента |

### Геттеры

| Геттер | Возвращает | Описание |
|---|---|---|
| `state` | `string` | Текущее состояние: `'hidden'` / `'showing'` / `'shown'` / `'hiding'` |
| `params` | `object` | Объект с параметрами экземпляра (без методов) |

### Методы

#### `show(data?)`

Открывает модал. Запускает машину состояний `hidden → showing → shown`.

- Игнорируется, если текущее состояние не `'hidden'` (а при `allow_interrupt: false` — и не `'hiding'`).
- Если `overlay_scroll_lock: true` и `overlay` присутствует — блокирует прокрутку.
- Если `auto_close > 0` — запускает таймер автозакрытия.

```js
modal.show();          // data = null
modal.show('some data');
modal.show({ userId: 42 });
```

#### `hide(data?)`

Закрывает модал. Запускает машину состояний `shown → hiding → hidden`.

- Игнорируется, если текущее состояние не `'shown'` (а при `allow_interrupt: false` — и не `'showing'`).
- После завершения анимации восстанавливает прокрутку страницы.

```js
modal.hide();
modal.hide(someElement);   // элемент попадёт в before_hide/on_hide как data
```

#### `clone(params)`

Создаёт новый экземпляр `Modal` на основе текущего.

- Клонирует DOM-элемент `content` (через `cloneNode(true)`, со всеми дочерними элементами).
- Параметры и методы текущего экземпляра используются как основа; переданный `params` их переопределяет.
- Новый экземпляр получает ссылку на оригинал через параметр `parent`.

**Управление `id` клона:**

| Что передано | Результат |
|---|---|
| `params.id: 'my_id'` | `id` будет `'my_id'` |
| `params.suffix: '_2'` | `id` строится как `{оригинальный id}_2` (суффикс заменяет символы `#` в конце) |
| Ничего | `id` строится как `{оригинальный id}_copy` |

```js
const original = new Modal({
    content: `<div id="alert">Сообщение</div>`,
    duration: 0.3
});

// Клон с другой позицией
const copy = original.clone({
    location: 'top right',
    suffix: '_top'
    // content.id станет 'alert_top'
});

copy.show();
```

---

## 7. Статические методы

### `Modal.find(element | selector)`

Возвращает экземпляр `Modal`, связанный с переданным DOM-элементом или CSS-селектором.

Работает для любого из четырёх элементов: `modal`, `overlay`, `container`, `content`.

```js
// Получить экземпляр по элементу <modal>
const instance = Modal.find(document.querySelector('modal'));
instance.hide();

// Получить экземпляр по <container>
const instance2 = Modal.find(someModal.container);

// Получить по CSS-селектору (ищет первый совпавший элемент)
const instance3 = Modal.find('modal');
```

> **Совет:** `Modal.find()` полезен в ситуациях, когда прямой ссылки на
> экземпляр нет — например, внутри обработчиков событий или при делегировании.

---

## 8. action="close"

Любой элемент с атрибутом `action="close"`, находящийся **внутри `content`** на
момент инициализации, автоматически получает обработчик `click → hide()`.

```html
<div>
    <h2>Заголовок</h2>
    <p>Текст модала</p>
    <button action="close">Закрыть</button>
    <!-- или иконка -->
    <span action="close">✕</span>
</div>
```

> **Важно:** привязка происходит один раз при вызове конструктора
> (`querySelectorAll('[action="close"]')`). Элементы, добавленные в `content`
> динамически после инициализации, не получат этот обработчик автоматически.

---

## 9. CSS-анимация через атрибут state

Единственный механизм анимации — CSS. Никаких встроенных переходов нет.

### Атрибут `[state]`

`<modal>` имеет атрибут `state`, который меняется по мере прохождения машины
состояний. CSS-правила, привязанные к этому атрибуту — единственный способ
задать визуальное поведение модала.

Доступные значения: `hidden`, `showing`, `shown`, `hiding`.

`transition` задаётся через параметр `duration` и наследуется всеми дочерними
элементами (`transition: inherit`).

### Основной принцип

Стили для `showing` и `shown` — «конечная точка» анимации (видимое состояние).
Стили для `hidden` и `hiding` — «стартовая / конечная точка» (скрытое состояние).

Если нужно разное визуальное поведение при открытии и закрытии, `showing` и
`hiding` можно оформить по-разному.

### Паттерн: Fade (простое появление)

```css
[state="hidden"],
[state="hiding"]  { opacity: 0 }

[state="showing"],
[state="shown"]   { opacity: 1 }
```

### Паттерн: Grow (масштабирование контента)

```css
/* Прозрачность на <modal> */
[state="hidden"],  [state="hiding"]  { opacity: 0 }

/* Масштаб на элементе класса .grow внутри content */
[state="hidden"]  .grow { transform: scale(0) }
[state="showing"] .grow { transform: scale(1.3) }
[state="shown"]   .grow { transform: scale(1) }
[state="hiding"]  .grow { transform: scale(3) }
```

```html
<div class="grow">
    <button action="close">✕</button>
    <p>Контент</p>
</div>
```

### Паттерн: Vertical slide (выезд сверху)

```css
[state="hidden"]  .slide-v { transform: translateY(-100%) }
[state="shown"]   .slide-v { transform: translateY(0) }
[state="hiding"]  .slide-v { transform: translateY(-100%) }
/* showing намеренно пропущен — начальная позиция = hidden */
```

```js
new Modal({
    content: `<div class="slide-v">...</div>`,
    location: 'top right',
    overlay: false,
    duration: 0.4
})
```

### Паттерн: Line slide (горизонтальный выезд)

```css
[state="hidden"]  .slide-h { transform: translateX(-100vw) }
[state="shown"]   .slide-h { transform: translateX(0) }
[state="hiding"]  .slide-h { transform: translateX(100vw) }
```

```js
new Modal({
    content: `<div class="slide-h">...</div>`,
    location: 'bottom center',
    overlay: false,
    duration: 1
})
```

> **Совет:** Можно задавать состояния как на самом `<modal>` (например,
> `opacity`), так и на дочерних элементах через CSS-комбинаторы
> `[state="..."] .class-name`. Это позволяет иметь разные анимации для разных
> частей модала.

---

## 10. Блокировка прокрутки страницы

При `overlay_scroll_lock: true` (по умолчанию) и наличии `<overlay>` при открытии
модала прокрутка страницы блокируется через следующий механизм:

**При открытии (`show()`):**
1. Сохраняются текущие `scrollY`, `scrollX` и inline-стили `body`.
2. `document.documentElement.style.scrollBehavior` устанавливается в `'unset'`.
3. На `<body>` устанавливаются:
   ```css
   position: fixed;
   width: 100vw;
   top: -{scrollY}px;
   left: -{scrollX}px;
   ```

**При закрытии (`hide()`):**
1. Inline-стили `body` восстанавливаются до исходных значений.
2. Страница прокручивается обратно к сохранённой позиции через `window.scrollTo()`.
3. `scrollBehavior` восстанавливается.

Этот подход позволяет правильно обрабатывать страницы с прокруткой: пользователь
не «прыгает» наверх при открытии/закрытии модала.

---

## 11. Примеры

### Базовый модал

```js
import Modal from './modal.js';

const modal = new Modal({
    content: `
        <div style="padding: 24px; background: white; border-radius: 8px;">
            <h2>Заголовок</h2>
            <p>Текст</p>
            <button action="close">Закрыть</button>
        </div>
    `,
    duration: 0.3
});

modal.show();
```

```css
[state="hidden"], [state="hiding"] { opacity: 0 }
[state="showing"], [state="shown"]  { opacity: 1 }
```

---

### Cookie-баннер (снизу, без overlay, с анимацией)

```js
const cookie_modal = new Modal({
    content: `
        <div class="cookie-bar">
            <p>Мы используем файлы cookie.</p>
            <button action="close">Принять</button>
            <a href="/policy/" target="_blank">Подробнее</a>
        </div>
    `,
    overlay: false,
    location: 'bottom center',
    duration: 0.5
});

// Растянуть контейнер на всю ширину
cookie_modal.container.style.width = '100vw';
cookie_modal.show();
```

```css
[state="hidden"]  .cookie-bar { transform: translateX(-100vw) }
[state="shown"]   .cookie-bar { transform: translateX(0) }
[state="hiding"]  .cookie-bar { transform: translateX(100vw) }
```

---

### Авто-закрывающееся уведомление

```js
const notify = new Modal({
    content: `<div class="toast">Файл сохранён!</div>`,
    overlay: false,
    location: 'top right',
    duration: 0.3,
    auto_close: 4,         // автоматически скроется через 4 секунды
    on_hide() {
        console.log('уведомление скрыто');
    }
});

notify.show();
```

---

### Открытие по кнопке через параметр trigger

```html
<button class="open-btn">Открыть модал</button>
```

```js
const modal = new Modal({
    content: `<div class="dialog"><button action="close">✕</button><p>Привет!</p></div>`,
    trigger: '.open-btn',   // найдёт все .open-btn при инициализации
    duration: 0.3
});
// Обработчик клика добавлен автоматически, явный addEventListener не нужен
```

---

### Модал с контентом из существующего DOM-элемента

```html
<div id="my-form" style="display:none">
    <form>...</form>
    <button action="close">Отмена</button>
</div>
```

```js
const modal = new Modal({
    content: '#my-form',    // элемент перемещается в <container>
    duration: 0.4
});

modal.show();
```

> **Внимание:** элемент физически перемещается в DOM. После закрытия он остаётся
> внутри `<container>`, а не возвращается на исходное место.

---

### Клонирование модала

```js
const base = new Modal({
    content: `<div class="popup" id="popup">
        <p class="message"></p>
        <button action="close">OK</button>
    </div>`,
    duration: 0.3,
    on_init() {
        this._msg = this.content.querySelector('.message');
    }
});

function showPopup(text) {
    const copy = base.clone({ suffix: '_instance' });
    copy.content.querySelector('.message').textContent = text;
    copy.show();
}

showPopup('Операция выполнена успешно');
showPopup('Ошибка: файл не найден');
```

---

### Modal.find() — получение экземпляра из DOM

```js
// Где-то в коде создаётся модал
const modal = new Modal({ content: `<div id="my-modal">...</div>` });

// В другом месте, без прямой ссылки на переменную modal:
document.addEventListener('click', e => {
    if (e.target.closest('#my-modal')) {
        const instance = Modal.find(e.target.closest('#my-modal'));
        instance.hide();
    }
});

// Или по элементу <modal>:
const instance = Modal.find(document.querySelector('modal'));
instance.show();
```

---

### Хуки: наполнение контента перед открытием

```js
const confirm_modal = new Modal({
    content: `<div class="confirm">
        <p class="confirm__text"></p>
        <button class="confirm__ok">Да</button>
        <button action="close">Нет</button>
    </div>`,
    duration: 0.3,
    before_show(data) {
        // data — объект, переданный в show(data)
        this.content.querySelector('.confirm__text').textContent = data.message;
        this.content.querySelector('.confirm__ok').onclick = () => {
            data.onConfirm?.();
            this.hide();
        };
    }
});

confirm_modal.show({
    message: 'Удалить этот элемент?',
    onConfirm: () => deleteItem(42)
});
```

---

## 12. Известные особенности и ограничения

### content как CSS-селектор перемещает элемент

При передаче CSS-селектора в `content` целевой элемент **физически перемещается**
из своего исходного места в DOM в `<container>`. Он не клонируется. После
закрытия модала элемент остаётся внутри `<container>`.

### before_init вызывается до создания DOM

В хуке `before_init` элементы `modal`, `overlay`, `container`, `content` ещё не
существуют — обращение к `this.modal` и другим свойствам вернёт `undefined`.
Используйте этот хук только для изменения параметров инициализации.

### trigger привязывается один раз, статически

`querySelectorAll(trigger)` выполняется один раз при вызове конструктора.
Элементы, добавленные в DOM динамически после создания экземпляра, не получают
обработчик автоматически. Решение — добавлять обработчики вручную или
использовать делегирование событий.

### close_by_esc слушает document — закроет все модалки

При `close_by_esc: true` обработчик `keydown` вешается на `document`. Если
открыть несколько модалов одновременно, нажатие `Escape` вызовет `hide()` у
каждого из них. При необходимости управляйте этим через `close_by_esc: false`
и собственный обработчик.

### action="close" обнаруживается только при инициализации

`querySelectorAll('[action="close"]')` выполняется один раз в конструкторе.
Если добавить кнопку закрытия в `content` позднее, её нужно будет привязать
вручную: `button.addEventListener('click', () => modal.hide())`.

### display: none сбрасывается при каждом show()

Перед запуском анимации `<modal>` получает `display: flex`. После завершения
анимации закрытия — `display: none`. CSS-правила, переопределяющие `display` на
элементе `<modal>`, могут конфликтовать с этим поведением.

### auto_close и duration используют один setTimeout

При `duration > 0` и `auto_close > 0` внутренний таймер `timeout` используется
совместно. Вызов `show()` после завершения `auto_close`, но до окончания
анимации закрытия будет проигнорирован (состояние ещё `'hiding'`). Убедитесь,
что `auto_close > duration`.

