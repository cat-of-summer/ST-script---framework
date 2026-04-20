# st_app.js

## Обзор

`st_app.js` — минималистичный реактивный фреймворк, основанный на [Custom Elements](https://developer.mozilla.org/ru/docs/Web/API/CustomElementRegistry). Каждый компонент — это нативный HTML-элемент `<st-app>`. Нет сборщиков, нет зависимостей, нет виртуального DOM — просто один файл и тег `<script>`.

**Ключевые возможности:**

- Реактивность через `Proxy` — DOM обновляется автоматически при изменении данных
- Батчировинг обновлений через `Promise.resolve()` — несколько мутаций за один тик сливаются в один проход
- Директивы шаблона: интерполяция `{{ }}`, `#if/#else-if/#else`, `#for`, `#show`, `#model`, `@event`, `:attr`
- Вычисляемые свойства — геттеры с авто-трекингом зависимостей
- Двусторонняя привязка форм через `#model`
- Вложенные компоненты с реактивной передачей данных через `:attr`
- Переключение шаблонов на лету через `applyTemplate()`
- Наблюдатели через `watch()`

---

## Подключение

### Классический `<script>`

Достаточно одного тега. Никакого Node.js, Webpack или npm.

```html
<script src="st_app.js"></script>
```

Класс `App` и тег `<st-app>` становятся глобально доступны.

### ES-модуль (import)

```html
<script type="module">
    import App from './st_app.js';

    App.create({
        app: 'counter',
        count: 0,
        template: `<button @click="count++">{{ count }}</button>`
    });
</script>
```

Или в отдельном `.js`-файле:

```js
import App from './st_app.js';

export function initApp() {
    App.create({ app: 'myApp', /* ... */ });
}
```

> **Важно:** `<st-app>` регистрируется как Custom Element при загрузке класса — это происходит на уровне статического инициализатора (`static { customElements.define('st-app', this) }`). При ES-модульном импорте это отрабатывает автоматически в момент импорта.

> **Внимание при ES-модулях:** `<script type="module">` выполняется **после** парсинга DOM (defer по умолчанию). Если `<st-app>` находится в HTML выше `<script type="module">`, фреймворк дождётся регистрации компонента — элемент будет ждать вызова `App.create()`.

---

## App.create(options) — регистрация компонента

```js
App.create({
    app: 'myApp',         // обязательно — уникальный id
    template: `...`,      // HTML-шаблон
    setup() { ... },      // вызывается после init реактивности
    events: { },          // объект обработчиков событий компонента

    // произвольные реактивные свойства:
    count: 0,
    items: [],
    user: { name: 'Иван' },

    // методы:
    increment() { this.count++; },

    // вычисляемые свойства (геттеры):
    get total() { return this.items.length; }
});
```

| Поле | Тип | Описание |
|---|---|---|
| `app` | `string` | Уникальный идентификатор; совпадает со значением атрибута `::app` на элементе |
| `template` | `string` | HTML-шаблон компонента. Если пустая строка — используется `innerHTML` элемента |
| `setup()` | `function` | Вызывается один раз после инициализации реактивности, до рендеринга. `this` — экземпляр компонента |
| `events` | `object` | Карта `{ eventName: handler }` — навешиваются через `addEventListener` на элемент |
| `...data` | `any` | Произвольные реактивные свойства. Примитивы, объекты и массивы — все становятся реактивными |
| `method()` | `function` | Метод компонента. Доступен в шаблоне и через `this` |
| `get prop()` | `function` | Вычисляемое свойство. Пересчитывается при изменении зависимостей. Доступно в шаблоне |

> **Важно:** `App.create()` бросает ошибку, если приложение с таким `app` уже зарегистрировано.

---

## App.extend(app, options) — расширение компонента

Создаёт новый компонент на основе существующего, переопределяя нужные поля. `events` сливаются, а не заменяются.

```js
App.create({
    app: 'base',
    count: 0,
    label: 'База',
    template: `<p>{{ label }}: {{ count }}</p>`
});

App.extend('base', {
    app: 'extended',
    label: 'Расширенный',
    count: 100
});
```

```html
<st-app ::app="extended"></st-app>
<!-- Выведет: Расширенный: 100 -->
```

---

## Монтирование компонента

```html
<!-- Монтирование по id -->
<st-app ::app="counter"></st-app>

<!-- Компонент без App.create() — только атрибуты + innerHTML как шаблон -->
<st-app :title="Привет" :count="42">
    <h1>{{ title }}</h1>
    <p>Счётчик: {{ count }}</p>
</st-app>
```

### Атрибут `::app`

Связывает HTML-элемент с конфигурацией, зарегистрированной через `App.create()`. Если элемент появляется в DOM раньше вызова `App.create()` — он ждёт регистрации.

---

## Реактивные данные

Все свойства, объявленные в `App.create()`, становятся реактивными автоматически:

- **Примитивы** (`number`, `string`, `boolean`) — отслеживаются по ключу
- **Объекты и массивы** — оборачиваются в `Proxy`. Работает на любой глубине вложенности
- **Функции** — оборачиваются в прокси, который тригерит зависимости после вызова

При изменении данных DOM обновляется асинхронно (батч через `Promise.resolve()`), поэтому несколько синхронных мутаций приводят к одному проходу обновлений.

```js
App.create({
    app: 'reactive',
    user: { profile: { name: 'Иван', age: 25 } },

    incrementAge() {
        this.user.profile.age++; // глубокое изменение — DOM обновится
    },

    template: `
        <div>
            <p>{{ user.profile.name }}, {{ user.profile.age }} лет</p>
            <button @click="incrementAge()">+1 год</button>
        </div>
    `
});
```

### Реактивные массивы

Все мутирующие методы массива (`push`, `pop`, `splice`, `shift`, `unshift`, `sort`, `reverse`) тригерят обновление DOM:

```js
this.items.push('новый элемент');   // ✓ реактивно
this.items.splice(2, 1);            // ✓ реактивно
this.items = [...this.items, 'x'];  // ✓ тоже работает
```

---

## Вычисляемые свойства (геттеры)

Геттеры автоматически отслеживают зависимости и пересчитываются при их изменении:

```js
App.create({
    app: 'form',
    username: '',
    email: '',
    agreed: false,

    get isValid() {
        // зависит от username, email, agreed — пересчитается при изменении любого из них
        return this.username.length >= 3
            && this.email.includes('@')
            && this.agreed;
    },

    template: `
        <div>
            <input #model="username" placeholder="Имя (мин. 3 символа)">
            <input #model="email" placeholder="Email">
            <label><input type="checkbox" #model="agreed"> Согласен</label>
            <button disabled="{{ !isValid }}">Отправить</button>
            <p #show="isValid" style="color:green">Форма валидна!</p>
        </div>
    `
});
```

> **Геттеры — read-only.** Присваивание в геттер не сработает. Для хранения состояния используйте обычное свойство.

---

## Директивы шаблона

### `{{ expr }}` — интерполяция

Вычисляет любое JS-выражение в контексте компонента (`this`). Поддерживается как в текстовых узлах, так и в значениях атрибутов.

```html
<!-- Текстовый узел -->
<p>Привет, {{ user.name }}!</p>
<p>Итого: {{ items.length * price }}</p>
<p>{{ isActive ? 'Включено' : 'Выключено' }}</p>
<p>{{ JSON.stringify(data, null, 2) }}</p>

<!-- В значении атрибута -->
<div class="badge-{{ status }}"></div>
<div style="color: {{ score > 90 ? 'green' : 'red' }}"></div>
<img src="{{ baseUrl + '/images/' + filename }}">
```

Если выражение вернёт `null` или `undefined` — выводится пустая строка.

---

### `@event="statement"` — обработчики событий

Имя директивы — это имя DOM-события без `@`. Значение — JS-выражение (statement), выполняется в контексте компонента. Доступна переменная `$event` — нативный объект события.

```html
<button @click="count++">+1</button>
<button @click="increment()">Метод</button>
<input @keyup="if ($event.key === 'Enter') submit()">
<form @submit="$event.preventDefault(); save()">
<div @mousemove="updatePosition($event)">
```

**В циклах** `$index` и переменная цикла корректно захватываются замыканием:

```html
<li #for="item in items">
    <button @click="removeItem($index)">Удалить {{ item }}</button>
</li>
```

---

### `#if="cond"` / `#else-if="cond"` / `#else` — условный рендеринг

Элемент добавляется в DOM только при выполнении условия. При ложном условии — удаляется, подписки очищаются. `#else-if` и `#else` должны идти на **непосредственном следующем** соседнем элементе.

```html
<div #if="score >= 90">🌟 Отлично!</div>
<div #else-if="score >= 70">👍 Хорошо</div>
<div #else-if="score >= 50">⚠️ Удовлетворительно</div>
<div #else>❌ Плохо</div>
```

```html
<p #if="items.length === 0">Список пуст</p>
<ul #else>
    <li #for="item in items">{{ item }}</li>
</ul>
```

> **Отличие от `#show`:** при `#if` элемент физически удаляется из DOM. При `#show` — остаётся, но скрыт через `display: none`. Используйте `#if` когда нужно уничтожить дочерние компоненты; `#show` — когда нужна быстрая смена видимости.

---

### `#show="cond"` — видимость без удаления из DOM

```html
<div #show="isLoading">⏳ Загрузка...</div>
<p #show="items.length > 0">Найдено {{ items.length }} элементов</p>
<small #show="error">{{ error }}</small>

<!-- Опциональная цепочка работает нормально: -->
<ul #show="availablePages?.length">...</ul>
```

При `cond === false` устанавливает `style.display = 'none'`. При `true` — убирает этот стиль.

---

### `#for="item in collection"` — цикл

Работает с **массивами** и **объектами**.

#### Цикл по массиву

```html
<ul>
    <li #for="item in items">
        {{ $index + 1 }}. {{ item }}
        <button @click="items.splice($index, 1)">✕</button>
    </li>
</ul>
```

| Переменная | Значение |
|---|---|
| `item` | текущий элемент массива |
| `$index` | числовой индекс (0, 1, 2, …) |

#### Цикл по объекту

```html
<ul>
    <li #for="val in settings">{{ $key }}: {{ val }}</li>
</ul>
```

| Переменная | Значение |
|---|---|
| `val` | значение свойства объекта |
| `$key` | строковый ключ свойства |
| `$index` | порядковый номер итерации |

#### Вложенные циклы

```html
<div #for="group in groups">
    <h3>{{ group.name }}</h3>
    <ul>
        <li #for="item in group.items">{{ item }}</li>
    </ul>
</div>
```

> **Переменная цикла изолирована.** После завершения `#for` переменная `item` удаляется. Если у компонента есть одноимённое свойство — оно восстанавливается.

#### Двусторонняя привязка внутри цикла

Работает в рамках реактивного объекта:

```html
<li #for="todo in todos">
    <input type="checkbox" #model="todo.done">
    <span style="{{ todo.done ? 'text-decoration:line-through' : '' }}">{{ todo.text }}</span>
</li>
```

---

### `#model="prop"` — двусторонняя привязка

Синхронизирует поле формы с реактивным свойством. Тип преобразования зависит от типа элемента:

| Элемент / тип | Событие | Значение |
|---|---|---|
| `<input>` (text, email, …) | `input` | `string` |
| `<input type="number">`, `<input type="range">` | `input` | `number` (через `valueAsNumber`) |
| `<input type="checkbox">` | `input` | `boolean` (`checked`) |
| `<input type="radio">` | `input` | `string` (`value` выбранного) |
| `<select>` | `change` | `string` (текущий `value`) |
| `<textarea>` | `input` | `string` |

```html
<!-- text -->
<input type="text" #model="username">

<!-- число — автоматически парсится в Number -->
<input type="number" #model="age">
<input type="range" #model="volume" min="0" max="100">

<!-- checkbox — boolean -->
<input type="checkbox" #model="agreed">

<!-- select -->
<select #model="country">
    <option value="ru">Россия</option>
    <option value="us">США</option>
</select>

<!-- поле вложенного объекта -->
<input type="text" #model="user.profile.name">
```

---

### `:attr="value"` — атрибуты с привязкой

Атрибуты, начинающиеся с `:`, используются для передачи данных в компонент. Значение парсится:

| Значение атрибута | Результирующий тип |
|---|---|
| `"true"` / `"false"` | `boolean` |
| `"42"`, `"3.14"` | `number` |
| `'строка'` (JS-строка) | `string` |
| `"[1,2,3]"`, `'{"a":1}'` | `object` / `array` (JSON.parse) |
| любая другая строка | `string` |

```html
<!-- Передача примитивов -->
<st-app ::app="counter" :initial-count="100" :step="5" :label="'Мой счётчик'"></st-app>

<!-- Kebab-case имён атрибутов → camelCase свойств -->
<!-- :initial-count → initialCount, :my-data → myData -->
```

#### `:attr` без значения — значение из прототипа

Если атрибут `:prop` указан **без значения**, фреймворк берёт значение свойства `prop` из конфигурации `App.create()`. Объекты при этом сериализуются в JSON и синхронизируются двусторонне:

```html
<!-- :options без значения — значение берётся из конфига App.create() -->
<st-app ::app="myApp" :options></st-app>
```

```js
App.create({
    app: 'myApp',
    options: { theme: 'dark', limit: 10 },  // ← этот объект будет подставлен
    template: `
        <input #model="options.theme">
        <p>Атрибут :options синхронизирован: {{ JSON.stringify(options) }}</p>
    `
});
```

#### Реактивная передача данных от родителя к ребёнку

Самый важный паттерн для вложенных компонентов. Значение атрибута интерполируется через `{{ }}`:

```html
<!-- В шаблоне родительского компонента -->
<st-app ::app="child" :count="{{ sharedCount }}" :name="{{ userName }}"></st-app>
```

При изменении `sharedCount` в родителе атрибут `:count` на дочернем элементе обновляется автоматически, дочерний компонент получает новое значение.

---

### Boolean-атрибуты

Следующие атрибуты обрабатываются как булевы: при falsy-значении атрибут **удаляется** из DOM, при truthy — **добавляется** (со значением `""`):

```
disabled, checked, readonly, required, selected, hidden, open, autofocus
```

```html
<!-- если isValid === false → атрибут disabled удалится из кнопки -->
<button disabled="{{ !isValid }}">Отправить</button>

<!-- если isRequired === true → добавится required="" -->
<input type="text" required="{{ isRequired }}">
```

---

### `#once` — одноразовая обработка

Элемент обрабатывается единожды при первом рендеринге. Атрибут снимается, реактивных эффектов не создаётся:

```html
<p #once>Этот текст никогда не обновится: {{ initialValue }}</p>
```

---

### `#pre` — пропуск поддерева

Элемент и всё его содержимое пропускаются при обработке директив. Используется для встраивания `{{ }}` как буквального текста (например, в примерах кода):

```html
<pre #pre>
    Здесь {{ это }} не будет обработано как выражение
</pre>
```

---

## Жизненный цикл компонента

```
1. <st-app> добавлен в DOM  (connectedCallback)
      ↓
2. #boot() — копирование конфига, оборачивание данных в Proxy
      ↓
3. Применение атрибутов `:attr` (разбор, типизация, создание реактивных свойств)
      ↓
4. Диспатч события 'setup' → вызов setup()
      ↓
5. Рендеринг шаблона (applyTemplate)
      ↓
6. Диспатч события 'rendered'
      ↓
7. MutationObserver следит за изменениями атрибутов `:*`
```

```
8. <st-app> удалён из DOM  (disconnectedCallback)
      ↓
   Очистка всех эффектов, подписок, слушателей событий
```

### setup()

`setup()` — правильное место для:
- вызовов `this.watch()`
- инициализации данных на основе переданных атрибутов
- первичного вызова `this.applyTemplate()`

```js
App.create({
    app: 'myApp',
    items: [],

    async setup() {
        // данные из :attr уже доступны здесь
        this.items = await fetch('/api/items').then(r => r.json());

        this.watch('items', (newVal) => {
            console.log('items changed:', newVal.length);
        });
    },

    template: `<ul><li #for="item in items">{{ item.name }}</li></ul>`
});
```

---

## watch() — наблюдатель изменений

```js
let unwatch = this.watch(source, callback, options?)
```

| Параметр | Описание |
|---|---|
| `source` | Что наблюдать (см. варианты ниже) |
| `callback(newVal, oldVal, unwatch)` | Вызывается при изменении; третий аргумент `unwatch()` — остановить наблюдение |
| `options.immediate` | `boolean` — вызвать `callback` сразу при подписке |
| `options.deep` | `boolean` — глубокое наблюдение за объектом/массивом |

Возвращаемое значение — функция `unwatch()`, вызов которой снимает подписку.

### Варианты `source`

#### Строка — имя свойства

```js
this.watch('count', (newVal, oldVal, unwatch) => {
    console.log(`count: ${oldVal} → ${newVal}`);

    // автоматически отменить наблюдение при достижении 10
    if (newVal >= 10) unwatch();
}, { immediate: true }); // ← вызвать callback сразу
```

#### Строка — путь к вложенному свойству

```js
this.watch('user.name', (newVal) => {
    console.log('Имя изменилось:', newVal);
});
```

#### Строка — глубокое наблюдение за объектом

```js
this.watch('user', (newVal, oldVal) => {
    // вызывается при изменении любого вложенного свойства
    console.log('Объект user изменился');
}, { deep: true });
```

#### Строка `'method()'` — перехват вызова метода

```js
this.watch('save()', (args, result, unwatch) => {
    console.log('save() вызван с аргументами:', args);
    console.log('Вернул:', result);
});
```

> `callback` при перехвате метода получает: `args` — массив аргументов, `result` — возвращённое значение (или Promise).

#### Функция-геттер

Автоматически отслеживает использованные реактивные свойства:

```js
this.watch(
    () => this.firstName + ' ' + this.lastName,  // ← геттер-вычисление
    (newFullName, oldFullName) => {
        console.log('ФИО изменилось:', newFullName);
    }
);
```

### Полный пример watch()

```js
App.create({
    app: 'watchDemo',
    count: 0,
    user: { name: 'Гость', role: 'user' },
    firstName: 'Иван',
    lastName: 'Петров',

    setup() {
        // 1. Наблюдение за примитивом, автостоп при 5
        this.watch('count', (newVal, oldVal, unwatch) => {
            console.log('[count]', oldVal, '->', newVal);
            if (newVal >= 5) unwatch();
        }, { immediate: true });

        // 2. Глубокое наблюдение за объектом
        this.watch('user', (n) => console.log('[user deep]', n), { deep: true });

        // 3. Путь к вложенному свойству
        this.watch('user.name', (n) => console.log('[user.name]', n));

        // 4. Функция-геттер
        this.watch(
            () => this.firstName + ' ' + this.lastName,
            (v) => console.log('[fullName]', v)
        );

        // 5. Перехват метода
        this.watch('save()', (args, result) => console.log('[save()]', result));
    },

    save() { return { ok: true, ts: Date.now() }; },

    template: `
        <div>
            <button @click="count++">count: {{ count }}</button>
            <input #model="user.name">
            <input #model="firstName"> <input #model="lastName">
            <button @click="save()">save()</button>
        </div>
    `
});
```

---

## applyTemplate() — переключение шаблонов

```js
this.applyTemplate(html?)
```

- `applyTemplate(htmlStr)` — применяет переданный HTML как шаблон. Старые эффекты и слушатели очищаются. **Базовый шаблон при этом не меняется.**
- `applyTemplate()` (без аргументов) — возвращается к базовому шаблону из `App.create()`.

Реактивные данные (`this.count`, `this.name`, и т.д.) **сохраняются** при любом переключении шаблона.

```js
const TMPL_LOADING = `
    <div style="text-align:center;padding:48px;">
        <p>⏳ Загрузка...</p>
    </div>`;

const TMPL_SETTINGS = `
    <div>
        <h3>⚙️ Настройки</h3>
        <label>Имя: <input #model="name"></label>
        <button @click="applyTemplate()">← Назад</button>
    </div>`;

App.create({
    app: 'app',
    name: 'Пользователь',

    setup() {
        // Показать экран загрузки, затем вернуться к основному
        this.applyTemplate(TMPL_LOADING);
        setTimeout(() => this.applyTemplate(), 1500);
    },

    template: `
        <div>
            <h3>🏠 Главный экран</h3>
            <p>Привет, {{ name }}!</p>
            <button @click="applyTemplate(TMPL_SETTINGS)">⚙️ Настройки</button>
        </div>
    `
});
```

---

## Вложенные компоненты

`<st-app>` можно вкладывать внутрь другого `<st-app>`. Данные передаются через атрибуты `:attr`.

### Передача данных через `:attr="{{ expr }}"`

```js
// Родитель
App.create({
    app: 'parent',
    sharedCount: 0,
    userName: 'Пользователь',

    template: `
        <div>
            <p>Родитель: {{ sharedCount }}</p>
            <button @click="sharedCount++">+1</button>
            <input #model="userName">

            <!-- Передача реактивных значений дочернему компоненту -->
            <st-app ::app="child"
                :count="{{ sharedCount }}"
                :name="{{ userName }}">
            </st-app>
        </div>
    `
});

// Дочерний
App.create({
    app: 'child',
    count: 0,   // будет перезаписано из :count
    name: '',   // будет перезаписано из :name

    template: `
        <div style="border: 1px solid #ccc; padding: 10px; margin-top: 10px;">
            <p>Дочерний получил: count={{ count }}, name={{ name }}</p>
        </div>
    `
});
```

При изменении `sharedCount` или `userName` в родителе дочерний компонент автоматически получает новые значения.

### Трёхуровневая вложенность

```html
<!-- grandparent → parent2 → grandchild -->
<st-app ::app="grandparent"></st-app>
```

```js
App.create({
    app: 'grandparent', data: 42,
    template: `
        <div>
            <button @click="data = Math.random() * 100 | 0">🎲</button>
            <st-app ::app="parent2" :data="{{ data }}"></st-app>
        </div>
    `
});

App.create({
    app: 'parent2', data: 0,
    template: `<st-app ::app="grandchild" :data="{{ data }}"></st-app>`
});

App.create({
    app: 'grandchild', data: 0,
    template: `<p>Финальные данные: <strong>{{ data }}</strong></p>`
});
```

---

## innerHTML как шаблон

Если `template: ''` (или `template` не задан), а у элемента `<st-app>` есть содержимое — оно будет использовано как шаблон:

```html
<st-app ::app="inlineTemplate">
    <div>
        <h3>{{ title }}</h3>
        <input type="text" #model="message">
        <p>{{ message }}</p>
    </div>
</st-app>
```

```js
App.create({
    app: 'inlineTemplate',
    title: 'Заголовок',
    message: 'Привет!',
    template: ''   // ← пустой шаблон → берётся innerHTML
});
```

Также работает без `App.create()` совсем — тогда атрибуты `:attr` задают данные напрямую:

```html
<!-- Без App.create() — данные через атрибуты, шаблон из innerHTML -->
<st-app :name="Иван" :count="5">
    <p>{{ name }}: {{ count }}</p>
    <button @click="count++">+1</button>
</st-app>
```

---

## Публичный API экземпляра

### `this.watch(source, callback, options?)` — подробно описан выше

### `this.applyTemplate(html?)` — подробно описан выше

### `this.clone(options?)`

Создаёт копию компонента через `App.extend()`, используя `app` из текущего атрибута `::app`:

```js
// Внутри метода компонента:
this.clone({ label: 'Клон', count: 999 });
```

### `this.dispatch(eventName, detail, options?)`

Диспатчит `CustomEvent` на элементе. Возвращает объект события.

```js
let event = this.dispatch('my-event', { value: 42 }, { bubbles: true });
if (!event.defaultPrevented) {
    // обработка
}
```

```js
// Подписка слушателя:
document.querySelector('st-app').addEventListener('my-event', e => {
    console.log(e.detail.value); // 42
});
```

### `this.attrs` — объект для работы с атрибутами

| Метод | Описание |
|---|---|
| `this.attrs.get(name)` | `getAttribute(name)` |
| `this.attrs.set(name, value)` | `setAttribute(name, value)` |
| `this.attrs.remove(name)` | `removeAttribute(name)` |
| `this.attrs.has(name)` | `hasAttribute(name)` |
| `this.attrs.toggle(name, force?)` | переключить атрибут |
| `this.attrs.keys()` | массив имён всех атрибутов |
| `this.attrs.entries()` | массив пар `[name, value]` |

```js
setup() {
    // Чтение произвольных атрибутов, заданных на <st-app>
    let mode = this.attrs.get('data-mode') || 'default';
}
```

### `this.template` — геттер базового шаблона

Возвращает строку базового шаблона, установленного при инициализации:

```js
let baseHtml = this.template;
```

### `this.toggleAttribute(name, value1?, value2?)`

Переопределённый метод — если оба значения не указаны, работает как стандартный `toggleAttribute`. Если указаны — переключает между `value1` и `value2`:

```js
// Переключить наличие атрибута:
this.toggleAttribute('hidden');

// Переключить между двумя значениями:
this.toggleAttribute('data-mode', 'dark', 'light');
```

---

## Комплексные примеры

### Todo-список

```js
App.create({
    app: 'todo',
    todos: [
        { id: 1, text: 'Изучить фреймворк', done: true },
        { id: 2, text: 'Создать приложение', done: false }
    ],
    newTodo: '',
    filter: 'all',

    get filteredTodos() {
        if (this.filter === 'active')    return this.todos.filter(t => !t.done);
        if (this.filter === 'completed') return this.todos.filter(t => t.done);
        return this.todos;
    },

    get stats() {
        return {
            total:     this.todos.length,
            active:    this.todos.filter(t => !t.done).length,
            completed: this.todos.filter(t => t.done).length
        };
    },

    addTodo() {
        if (!this.newTodo.trim()) return;
        this.todos.push({ id: Date.now(), text: this.newTodo.trim(), done: false });
        this.newTodo = '';
    },

    removeTodo(id) {
        let idx = this.todos.findIndex(t => t.id === id);
        if (idx !== -1) this.todos.splice(idx, 1);
    },

    clearCompleted() {
        this.todos = this.todos.filter(t => !t.done);
    },

    template: `
        <div>
            <input #model="newTodo" placeholder="Что сделать?"
                   @keyup="if ($event.key === 'Enter') addTodo()">
            <button @click="addTodo()">➕ Добавить</button>

            <div style="margin: 10px 0;">
                <button @click="filter = 'all'">Все ({{ stats.total }})</button>
                <button @click="filter = 'active'">Активные ({{ stats.active }})</button>
                <button @click="filter = 'completed'">Завершённые ({{ stats.completed }})</button>
            </div>

            <ul>
                <li #for="todo in filteredTodos"
                    style="display:flex;align-items:center;gap:10px;">
                    <input type="checkbox" #model="todo.done">
                    <span style="{{ todo.done ? 'text-decoration:line-through;color:#999' : '' }}">
                        {{ todo.text }}
                    </span>
                    <button @click="removeTodo(todo.id)">🗑️</button>
                </li>
            </ul>

            <p #show="filteredTodos.length === 0" style="color:#999;">Задач нет</p>
            <button #show="stats.completed > 0" @click="clearCompleted()">
                Очистить завершённые
            </button>
        </div>
    `
});
```

### Вложенные реактивные объекты

```js
App.create({
    app: 'nested',
    user: {
        profile: { name: 'Иван', age: 25 },
        settings: { theme: 'dark', notifications: true }
    },

    toggleTheme() {
        this.user.settings.theme =
            this.user.settings.theme === 'dark' ? 'light' : 'dark';
    },

    template: `
        <div>
            <input #model="user.profile.name">
            <input type="number" #model="user.profile.age">
            <input type="checkbox" #model="user.settings.notifications">
            <button @click="toggleTheme()">Тема: {{ user.settings.theme }}</button>
            <pre>{{ JSON.stringify(user, null, 2) }}</pre>
        </div>
    `
});
```

### applyTemplate — многоэкранный интерфейс

```js
const TMPL_LOADING = `<div style="text-align:center;padding:48px;">⏳ Загрузка...</div>`;
const TMPL_SETTINGS = `
    <div>
        <h3>⚙️ Настройки</h3>
        <label>Имя: <input #model="name"></label>
        <select #model="theme">
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
        </select>
        <button @click="applyTemplate()">← Назад</button>
    </div>`;

App.create({
    app: 'screens',
    name: 'Пользователь',
    theme: 'light',
    counter: 0,

    setup() {
        this.applyTemplate(TMPL_LOADING);
        setTimeout(() => this.applyTemplate(), 1500);
    },

    template: `
        <div>
            <h3>🏠 Главный экран</h3>
            <p>Привет, {{ name }}! Счётчик: {{ counter }}</p>
            <button @click="counter++">+1</button>
            <button @click="applyTemplate(TMPL_SETTINGS)">⚙️ Настройки</button>
            <button @click="applyTemplate(TMPL_LOADING); setTimeout(() => applyTemplate(), 1500)">
                🔄 Перезагрузить
            </button>
        </div>
    `
});
```

---

## Быстрая шпаргалка

```html
<!-- Монтирование -->
<st-app ::app="myApp"></st-app>
<st-app ::app="myApp" :prop="value" :number="42" :flag="true"></st-app>

<!-- Интерполяция -->
{{ expression }}
{{ user.name }}  {{ count * 2 }}  {{ isOk ? 'да' : 'нет' }}

<!-- Условия -->
<div #if="a">A</div>
<div #else-if="b">B</div>
<div #else>C</div>

<!-- Цикл по массиву -->
<li #for="item in items">{{ $index }}: {{ item }}</li>

<!-- Цикл по объекту -->
<li #for="val in obj">{{ $key }}: {{ val }}</li>

<!-- Видимость -->
<p #show="isVisible">текст</p>

<!-- Двусторонняя привязка -->
<input #model="name">
<input type="checkbox" #model="agreed">
<input type="number" #model="age">
<select #model="country">...</select>

<!-- События -->
<button @click="count++">+</button>
<button @click="doSomething()">действие</button>
<input @keyup="if ($event.key === 'Enter') submit()">

<!-- Реактивный атрибут (с интерполяцией) -->
<div class="item-{{ status }}"></div>
<button disabled="{{ !isValid }}">Отправить</button>

<!-- Передача данных дочернему компоненту -->
<st-app ::app="child" :value="{{ parentData }}"></st-app>

<!-- Пропустить поддерево -->
<pre #pre>{{ не будет обработано }}</pre>
```

```js
// Регистрация
App.create({ app: 'id', prop: val, method() {}, get computed() {}, template: `...` });
App.extend('base', { app: 'derived', ...overrides });

// В setup() / методах:
this.watch('prop', (n, o, unwatch) => { ... }, { immediate: true, deep: false });
this.watch('prop.nested', callback);
this.watch(() => this.a + this.b, callback);
this.watch('method()', (args, result, unwatch) => { ... });

this.applyTemplate(htmlString);  // переключить шаблон
this.applyTemplate();            // вернуться к базовому

this.dispatch('my-event', detail, { bubbles: true });
this.clone({ ...overrides });
this.attrs.get('name');
```
