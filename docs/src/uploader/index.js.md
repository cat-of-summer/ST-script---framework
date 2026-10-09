# uploader.js

## Описание

Компонент загрузки файлов с поддержкой drag & drop, предпросмотром изображений, ограничениями (количество, размер, типы) и поддержкой уже существующих файлов (для редактирования). Структура HTML описывается через атрибуты-маркеры.

Подключение:

```js
// ESM / npm
import Uploader from '@cat-of-summer/st-script/uploader';
```

```html
<!-- CDN / IIFE: объявляет глобальный Uploader -->
<script defer src="dist/uploader.min.js"></script>
```

## Статические методы

| Метод | Описание |
|---|---|
| `Uploader.formatSize(bytes)` | Преобразует байты в читаемую строку (Б, КБ, МБ, ГБ, ТБ) |
| `Uploader.find(element \| selector)` | Возвращает экземпляр, которому принадлежит контейнер (или `undefined`) |

## Конструктор

```js
new Uploader(params)
```

### Основные параметры

| Параметр | Описание |
|---|---|
| `target` | Корневой контейнер: CSS-селектор (можно несколько совпадений), элемент или список элементов |
| `input_name` | Имя `<input file>` для передачи файлов в форме. Обязателен. При `limits.files != 1` к нему дописывается `[]` |
| `delete_name` | Имя поля для значений удалённых существующих файлов (по умолчанию `<input_name>_to_delete`) |
| `entry` | Шаблон записи файла: CSS-селектор существующих записей (по умолчанию `'*[file-item]'`) или HTML-строка |

Шаблон записи берётся в таком порядке: первая существующая запись по селектору `entry`, HTML из `entry`, содержимое `<template entry>` внутри контейнера. Если ничего не нашлось, конструктор бросает ошибку.

### callbacks

`before_init`, `on_init`, `before_files_add`, `on_files_add`, `before_file_delete`, `on_file_delete`, `before_drop`, `on_drop`, `handle_exception`

Колбэки привязываются к контейнеру: внутри них `this` — элемент `target`. `before_file_delete` может вернуть `false`, чтобы отменить удаление по кнопке.

### `limits`

| Параметр | Описание |
|---|---|
| `limits.files` | Макс. количество файлов (`0` = без ограничений) |
| `limits.file_size` | Макс. размер одного файла в байтах |
| `limits.total_size` | Макс. общий размер всех файлов в байтах |
| `limits.mimes` | Допустимые MIME-типы (`['image/*', 'application/pdf']`) |

### Ошибки лимитов

Нарушение лимита сначала вызывает событие `uploader:error`, затем `handle_exception(error)`. У `error` есть `message`, `file` и `code`: `0` — количество, `1` — размер файла, `2` — общий размер, `3` — тип. Если `handle_exception` не задан и ни один слушатель события не вызвал `preventDefault()`, показывается `alert`.

## HTML-маркеры в шаблоне

| Атрибут | На каком элементе | Описание |
|---|---|---|
| `add-button` | `<button>` или `<div>` | Кнопка добавления файла |
| `drop-zone` | любой | Зона drag & drop |
| `files-list` | любой | Контейнер списка файлов |
| `file-item` | любой | Запись файла |
| `entry` | `<template>` | Шаблон записи, если существующих записей нет |
| `preview` | `<img>` | Превью изображения |
| `filename` | любой | Название файла |
| `fileweight` | любой | Размер файла |
| `delete-button` | `<button>` | Кнопка удаления |

## События

Вызываются на контейнере `target` и всплывают:

| Событие | `detail` | Когда |
|---|---|---|
| `uploader:add` | `{ files }` | Добавлены файлы, прошедшие лимиты (после `on_files_add`) |
| `uploader:delete` | `{ file }` | Запись удалена кнопкой или `clear()` (после `on_file_delete`) |
| `uploader:error` | `{ error }` | Нарушен лимит. Отменяемое: `preventDefault()` убирает `alert` |

## Методы

- `uploader.clear()` — убрать все записи из всех контейнеров экземпляра. Для каждой вызываются `on_file_delete` и `uploader:delete`; `before_file_delete` не спрашивается. Существующие файлы уходят в `delete_name`, как при удалении кнопкой.
- `target.clear()` — то же для одного контейнера.

## Свойства `target` после инициализации

- `target.files` (тип `Map`) — все выбранные файлы
- `target.total_size` — общий размер прикреплённых файлов

## Пример

```js
new Uploader({
    target: '.upload-wrapper',
    input_name: 'FILES',
    delete_name: 'FILES_TO_DELETE',
    limits: {
        files: 3,
        file_size: 5 * 1024 * 1024,
        mimes: ['image/*', 'application/pdf']
    }
});

document.addEventListener('uploader:add', e => console.log('Добавлено:', e.detail.files));
```
