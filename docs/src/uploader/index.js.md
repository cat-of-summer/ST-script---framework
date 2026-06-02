# uploader.js

## Описание

Компонент загрузки файлов с поддержкой drag & drop, предпросмотром изображений, ограничениями (количество, размер, типы) и поддержкой уже существующих файлов (для редактирования). Структура HTML описывается через атрибуты-маркеры.

CDN-сборка (`<script src="uploader.js">`) выставляет класс как `window.uploader`; ESM-импорт — `import { Uploader } from '@cat-of-summer/st-script'`.

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
| `target` | CSS-селектор корневого контейнера (можно несколько) |
| `input_name` | Имя `<input file>` для передачи файлов в форме |
| `delete_name` | Имя поля для списка ID удалённых файлов |
| `entry` | CSS-селектор шаблона карточки файла (по умолчанию `'*[file-item]'`) |

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
new Uploader({
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
