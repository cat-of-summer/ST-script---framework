# st_uploader.js

## Описание

Компонент загрузки файлов с поддержкой drag & drop, предпросмотром изображений, ограничениями (количество, размер, типы) и поддержкой уже существующих файлов (для редактирования). Структура HTML описывается через атрибуты-маркеры.

## Статические методы

| Метод | Описание |
|---|---|
| `st_uploader.formatSize(bytes)` | Преобразует байты в читаемую строку (Б, КБ, МБ, ГБ, ТБ) |

## Конструктор

```js
new st_uploader(params)
```

### Основные параметры

| Параметр | Описание |
|---|---|
| `target` | CSS-селектор корневого контейнера |
| `input_name` | Имя `<input file>` для передачи файлов в форме |
| `delete_name` | Имя поля для списка ID удалённых файлов |
| `entry` | `'*[file-item]'` | CSS-селектор шаблона карточки файла |

### callbacks

`before_init`, `on_init`, `before_files_add`, `on_files_add`, `before_file_delete`, `on_file_delete`, `before_drop`, `on_drop`, `handle_exception`

### `limits`

| Параметр | Описание |
|---|---|
| `limits.files` | Макс. количество файлов (`0` = без ограничений) |
| `limits.file_size` | Макс. размер одного файла в байтах |
| `limits.total_size` | Макс. общий размер всех файлов в байтах |
| `limits.mimes` | Допустимые MIME-типы (`['image/*', 'application/pdf']`) |

## HTML-маркеры в шаблоне

| Атрибут | На каком элементе | Описание |
|---|---|---|
| `add-button` | `<button>` или `<div>` | Кнопка добавления файла |
| `drop-zone` | любой | Зона drag & drop |
| `files-list` | любой | Контейнер списка файлов |
| `file-item` | любой | Шаблон карточки файла |
| `preview` | `<img>` | Превью изображения |
| `filename` | любой | Название файла |
| `fileweight` | любой | Размер файла |
| `delete-button` | `<button>` | Кнопка удаления |

## Свойства `target` после инициализации

- `target.files` (тип `Map`) — все выбранные файлы
- `target.total_size` — общий размер прикреплённых файлов

## Пример

```js
new st_uploader({
    target: '.upload-wrapper',
    input_name: 'FILES',
    delete_name: 'FILES_TO_DELETE',
    on_files_add: (files) => console.log('Добавлено:', files),
    limits: {
        files: 3,
        file_size: 5 * 1024 * 1024,
        mimes: ['image/*', 'application/pdf']
    }
});
```
