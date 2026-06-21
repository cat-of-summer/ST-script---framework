# Loader.js

## Описание

Загружает список или одиночный контент через `Core.fetch`, нормализует ответ и
вставляет результат в контейнер. Один инстанс = один механизм: подгрузка
(«показать ещё»), фильтр, сортировка, детальный контент. Ответ может быть **HTML**
(`Document`), **JSON** (object/array) или **текст** — `Core.fetch` парсит по
`Content-Type`, а Loader сам определяет тип и подбирает обработку.

Класс ничего не слушает сам (imperative): всё через `load(params)`. Состояние запроса
не копится — каждый `load()` полностью задаёт параметры. Маппинг ответа описывается
декларативно (`source` + `multiple` + `render`), поведение — через хуки (`before_*`/`on_*`).

## Конструктор

```js
new Loader(params)
```

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `target` | `string\|Element` | `null` | Контейнер на странице |
| `source` | `string` | `null` | Где в ответе данные. **HTML** — CSS-селектор; **JSON** — dot-path (`'data.items'`) |
| `multiple` | `boolean` | `true` | `true` → массив элементов, `render` на каждый; `false` → один элемент, `render` один раз |
| `mode` | `'append'\|'replace'\|'prepend'` | `'append'` | Режим вставки по умолчанию |
| `allow_interrupt` | `boolean` | `false` | Разрешить новому `load()` аборт текущего запроса |
| `render` | `Function` | identity | `render(item, i)` → **Node**. Не-`Node` отбрасывается. Для JSON задаётся обязательно |
| `formats` | `object` | `{}` | Per-type оверрайды: `{ json:{…}, html:{…}, text:{…} }` (см. ниже) |

`this` во всех функциях-параметрах — инстанс `Loader` (доступны `this.data`, `this.params`, `this.html`).

### Извлечение данных (`source` + `multiple`)

Внутреннее, по типу ответа:

- **HTML**, `source` задан: `multiple` → `[...querySelectorAll(source)]`, иначе `querySelector(source)`.
- **HTML**, `source` пуст: `multiple` → дети корня ответа, иначе первый дочерний элемент.
- **JSON**, `source` задан: dot-path по объекту (`'products'`, `'data.items'`).
- **JSON**, `source` пуст: весь ответ.
- **text**: строка как есть.

Результат кладётся в `this.data`. При `multiple: true` ожидается массив (`render` зовётся
`data.length` раз), при `false` — `render(this.data)` один раз.

### Per-type оверрайды (`formats`)

`formats[type]` (`type` = `'html' | 'json' | 'text'`) переопределяет параметры под конкретный
тип ответа. Один инстанс обслуживает оба формата без дублирования.

- **`render`, `source`, `mode`, `multiple`** — ветка перекрывает корень.
- **Хуки `on_load` / `before_paste` / `on_paste`** — *складываются*: сначала корневой, затем веточный.

Lifecycle-хуки `before_init` / `on_init` / `before_load` / `on_failed` / `on_complete` —
только корневые (тип ответа на этих этапах неизвестен).

### Поток обработки `load()`

`before_load(fetchParams)` → `Core.fetch` → определение типа → `this.data = extract(response)`
→ `on_load(response, request)` → `render` (`multiple` ? на каждый элемент : один раз)
→ `before_paste(nodes)` → вставка по `mode` → `on_paste(nodes, response)`;
`on_failed(payload)` при ошибке, `on_complete(payload)` всегда.

## Хуки

| Хук | Аргументы | Когда | Per-type |
|---|---|---|---|
| `before_init` / `on_init` | `config` | В конструкторе (можно править config до резолва `target`) | — |
| `before_load` | `fetchParams` | Перед запросом | — |
| `on_load` | `response, request` | После успеха, до рендера (правка `this.data`, вторичные регионы) | ✓ |
| `before_paste` | `nodes` | После рендера, до вставки | ✓ |
| `on_paste` | `nodes, response` | После вставки (вешать listeners) | ✓ |
| `on_failed` | `payload` | При ошибке/таймауте | — |
| `on_complete` | `payload` | По завершении (успех или ошибка) | — |

## Публичные методы и свойства

| Член | Возвращает | Описание |
|---|---|---|
| `load(urlOrParams)` | `this` | Запрос + вставка. `params` (кроме `mode`) уходят в `Core.fetch`. Строка = `{ url }` |
| `abort()` | `this` | Прервать текущий запрос |
| `clone(params)` | `Loader` | Новый инстанс с унаследованными параметрами (`formats` сливается поверхностно) |
| `loading` | `boolean` | Идёт ли запрос |
| `params` | `object` | Текущие не-функциональные параметры (без `formats`) |
| `data` | `any` | Результат извлечения из последнего ответа |
| `Loader.html` | `Element` | Хелпер: html-строка/tagged template → первый Element |
| `Loader.find(el)` | `Loader` | Инстанс, владеющий элементом |

`mode` в `load({ mode })` переопределяет и дефолт, и веточный `mode`. Остальные ключи
(`url`, `method`, `data`, `headers`, `timeout`, …) идут в `Core.fetch`; фильтр/сортировка/
страница передаются через `data` (для GET `Core.fetch` сам строит querystring).

На `target` выставляется атрибут `state` = `loading` / `loaded` (для CSS-индикации).

## Примеры

Один инстанс на HTML и JSON одновременно:

```js
let loader = new Loader({
    target: '.cards',
    on_paste: nodes => nodes.forEach(wireCard),   // общий для обоих форматов
    formats: {
        html: { source: '.card' },                                  // render = identity
        json: { source: 'products', render: p => Loader.html`
            <article class="card"><h3>${p.title}</h3><span>${p.price} ₽</span></article>` },
    },
});

loader.load({ url: '/catalog', data: { sort: 'price' }, mode: 'replace' }); // HTML или JSON — по Content-Type
loader.load({ url: '/catalog', data: { sort: 'price', page: 2 } });          // append
```

Детальный контент (один элемент, дописываем в существующий блок):

```js
let detail = new Loader({
    target: '#log',
    multiple: false,                 // ответ = один элемент
    mode: 'append',                  // дописываем, не перетираем
    formats: { json: { render: r => Loader.html(`<p>${r.message}</p>`) } },
});

detail.load('/api/next-message');
```
