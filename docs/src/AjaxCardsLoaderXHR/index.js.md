# AjaxCardsLoaderXHR.js

## Описание

Загружает HTML-страницу через `XMLHttpRequest`, парсит ответ и вставляет / заменяет элементы на текущей странице согласно заданным маппингам. Поддерживает дедупликацию по `id` и `outerHTML`, `mutator`-хук для преобразования нод до вставки и `on_paste` — после.

## Конструктор

```js
new AjaxCardsLoaderXHR(mappings, options)
```

| Параметр | Тип | Описание |
|---|---|---|
| `mappings` | `Array` | Массив объектов маппинга |
| `mappings[].method` | `'replace'\|'append'` | Действие: заменить или дополнить |
| `mappings[].current` | `string` | CSS-селектор на текущей странице |
| `mappings[].new` | `string?` | CSS-селектор в ответе (по умолчанию = `current`) |
| `options.mutator` | `Function?` | Вызывается с `Element[]` до вставки в DOM |
| `options.on_paste` | `Function?` | Вызывается с `Element[]` после вставки в DOM |

## Публичные методы

| Метод | Возвращает | Описание |
|---|---|---|
| `load(urlOrOptions, extraOptions?)` | `Promise<report>` | Выполнить XHR и применить маппинги |
| `abort()` | `void` | Прервать текущий запрос |
| `getLastXhr()` | `XMLHttpRequest\|null` | Получить последний объект XHR |

`urlOrOptions` — строка URL или объект `{ url, method, headers, body, timeout, withCredentials }`.

Объект `report` содержит `mappingReports[]` с информацией по каждому маппингу (`added`, `removed`, `skipped`, …).

## Пример

```js
const loader = new AjaxCardsLoaderXHR(
    [
        { method: 'append', current: '.cards-list' },
        { method: 'replace', current: '.pagination', new: '.pagination' }
    ],
    {
        on_paste: (nodes) => nodes.forEach(n => n.classList.add('new'))
    }
);

document.querySelector('.load-more').addEventListener('click', async () => {
    const report = await loader.load('/page/2');
    console.log(report.mappingReports);
});
```
