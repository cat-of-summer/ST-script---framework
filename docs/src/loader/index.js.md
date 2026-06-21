# Loader.js

## Описание

Загружает список (карточки товаров и т.п.) через `Core.fetch`, нормализует ответ и
вставляет элементы в контейнер. Один инстанс = один механизм списка: подгрузка
(«показать ещё»), фильтр, сортировка. Ответ может быть **HTML** (`Document`) или **JSON**
(object/array) — `Core.fetch` сам парсит по `Content-Type`.

Класс ничего не слушает сам (imperative): всё через `load(params)`. Состояние запроса
не копится — каждый `load()` полностью задаёт параметры. Управление поведением — через
замыкания (`render`, `extract`, `count`) и хуки (`before_*`/`on_*`).

## Конструктор

```js
new Loader(params)
```

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `target` | `string\|Element` | `null` | Контейнер карточек на странице |
| `source` | `string` | `null` | CSS-селектор карточки в **HTML**-ответе (для дефолтного `extract`) |
| `mode` | `'append'\|'replace'\|'prepend'` | `'append'` | Режим вставки по умолчанию |
| `allow_interrupt` | `boolean` | `false` | Разрешить новому `load()` аборт текущего запроса |
| `render` | `Function` | identity | `render(item, i)` → **Node**. Для JSON обязателен |
| `count` | `Function` | `() => this.data?.length ?? 0` | Сколько раз вызвать `render` |
| `extract` | `Function` | умный (см. ниже) | `extract(response)` → значение для `this.data` |

`this` во всех функциях-параметрах — инстанс `Loader` (доступны `this.data`, `this.params`, `this.html`).

### Дефолтный `extract`

- `Document` (HTML-ответ) → `[...response.querySelectorAll(source)]`.
- Иначе (JSON) → возвращает `response` как есть. **Для JSON переопредели `extract`**, чтобы
  положить в `this.data` нужный массив (или произвольную структуру — `render`/`count` сами решат).

### Поток обработки `load()`

`before_load(params)` → `Core.fetch` → `this.data = extract(response)` → `on_load(response, request)`
→ цикл `count()` раз: `render(this.data[i], i)` → `before_paste(nodes)` → вставка по `mode`
→ `on_paste(nodes, response)`; `on_failed(payload)` при ошибке, `on_complete(payload)` всегда.

## Хуки

| Хук | Аргументы | Когда |
|---|---|---|
| `before_init` / `on_init` | `params` | В конструкторе |
| `before_load` | `fetchParams` | Перед запросом |
| `on_load` | `response, request` | После успеха, до рендера (правка `this.data`, дедуп, вторичные регионы) |
| `before_paste` | `nodes` | После рендера, до вставки в DOM |
| `on_paste` | `nodes, response` | После вставки (вешать listeners на новые ноды) |
| `on_failed` | `payload` | При ошибке/таймауте |
| `on_complete` | `payload` | По завершении (успех или ошибка) |

## Публичные методы и свойства

| Член | Возвращает | Описание |
|---|---|---|
| `load(urlOrParams)` | `this` | Запрос + вставка. `params` (кроме `mode`) уходят в `Core.fetch`. Строка = `{ url }` |
| `abort()` | `this` | Прервать текущий запрос |
| `clone(params)` | `Loader` | Новый инстанс с унаследованными параметрами |
| `loading` | `boolean` | Идёт ли запрос |
| `params` | `object` | Текущие не-функциональные параметры |
| `data` | `any` | Буфер последнего ответа (что вернул `extract`) |
| `Loader.html` | `Element` | Хелпер: html-строка/tagged template → первый Element |
| `Loader.find(el)` | `Loader` | Инстанс, владеющий элементом |

`mode` передаётся в `load({ mode })` и переопределяет дефолт. Остальные ключи
(`url`, `method`, `data`, `headers`, `timeout`, …) идут в `Core.fetch`; фильтр/сортировка/
страница передаются через `data` (для GET `Core.fetch` сам строит querystring).

На `target` выставляется атрибут `state` = `loading` / `loaded` (для CSS-индикации).

## Примеры

HTML-ответ — фильтр (replace) и подгрузка (append):

```js
let loader = new Loader({
    target: '.cards',
    source: '.card',
    on_paste: nodes => nodes.forEach(n =>
        n.querySelector('[buy]')?.addEventListener('click', onBuy)),
});

loader.load({ url: '/catalog', data: { sort: 'price', color: 'red' }, mode: 'replace' });
loader.load({ url: '/catalog', data: { sort: 'price', color: 'red', page: 2 } });
```

JSON-ответ — свой `extract` + `render` через шаблон-хелпер:

```js
let loader = new Loader({
    target: '.cards',
    extract: r => r.items,
    render: p => Loader.html`<article class="card">
        <h3>${p.title}</h3><span>${p.price} ₽</span>
    </article>`,
    on_load: r => updatePager(r.pages),
});

loader.load({ url: '/api/catalog', data: { page: 1 }, mode: 'replace' });
```
