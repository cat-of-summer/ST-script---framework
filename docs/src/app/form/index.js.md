# form.js

## Обзор

`form` — приложение-расширение для `st_app`, которое берёт на себя всю механику HTML-формы: валидацию, отправку через XHR, заполнение полей и обработку ответа сервера. Подключается как обычное `st_app`-приложение и настраивается через метод `configure()`.

**Ключевые возможности:**

- Отправка формы через XHR без перезагрузки страницы
- Гибкая валидация: встроенная браузерная + кастомные функции на любые поля
- Заполнение полей любого типа через `fill()`: text, checkbox, radio, select, file (File, data-URL, URL)
- Управление полями: добавление, удаление, сброс
- Полная событийная модель для формы и каждого поля
- Автоматическое переключение `enctype` при наличии `<input type="file">`
- Обработка серверного редиректа через `{ redirect: '...' }` в ответе

---

## Подключение в HTML

```html
<st-app app="form">
    <form action="/submit" method="post">
        <input type="text" name="name" required>
        <input type="email" name="email" required>
        <button type="submit">Отправить</button>
    </form>
</st-app>
```

> Внутри `<st-app app="form">` обязан находиться элемент `<form>`. Если в форме есть `<input type="file">`, `enctype="multipart/form-data"` устанавливается автоматически.

---

## configure(config)

Главная точка настройки. Вызывается на элементе `<st-app>`.

```js
form.configure({
    setup() { /* вызывается после рендеринга */ },
    validate: { /* валидаторы */ },
    form:  { /* обработчики событий формы */ },
    field: { /* обработчики событий полей */ },
});
```

| Ключ | Тип | Описание |
|---|---|---|
| `setup` | `function` | Вызывается один раз после рендеринга формы. `this` — элемент `<st-app>`. Если форма уже отрендерена — запускается немедленно через `queueMicrotask` |
| `validate` | `object` | Объект `{ selector: fn(field) => string }`. Функция возвращает строку ошибки или `''` при успехе |
| `form` | `object` | Обработчики событий формы — ключи совпадают с именами событий без префикса `form:` |
| `field` | `object` | Обработчики событий полей — ключи совпадают с именами событий без префикса `field:` |

---

## События формы (form:*)

Подписываются через ключ `form` в `configure()` или напрямую через `addEventListener('form:*', handler)`.

| Событие | `e.detail` | Описание |
|---|---|---|
| `before_send` | `{ url, method, headers, data: FormData }` | Вызывается перед отправкой. Можно мутировать `data` (добавлять поля в FormData), изменять `url`, `method`, `headers` |
| `send` | `{ detail }` | Запрос отправлен |
| `success` | `{ data, request }` | Сервер вернул успешный ответ |
| `failed` | payload | Запрос завершился ошибкой |
| `complete` | `{ data, request }` | Вызывается всегда после завершения (кроме случая редиректа) |
| `redirect` | `{ url, data, request }` | Ответ сервера содержит `{ redirect: '...' }`. Если обработчик не отменяет событие — браузер выполняет редирект |
| `invalid` | `{ errors }` | Форма не прошла валидацию. `errors` — объект `{ fieldName: validationMessage }`. Если обработчик возвращает `false` — браузерный `reportValidity()` не вызывается |
| `reset` | — | Форма сброшена через `reset()` |

> `data` в событиях — результат разбора ответа: объект, если сервер вернул JSON, иначе строка.  
> `request` — объект `XMLHttpRequest` с полями `status`, `statusText`, `responseText`.

---

## События полей (field:*)

Подписываются через ключ `field` в `configure()` или напрямую через `addEventListener('field:*', handler)`.

| Событие | `e.detail` | Описание |
|---|---|---|
| `input` | `{ field, name, value }` | Пользователь ввёл данные. Для чекбоксов `value` — `boolean` |
| `focus` | `{ field, name, value }` | Поле получило фокус |
| `invalid` | `{ field, name, value }` | Поле не прошло валидацию при сабмите. Если обработчик возвращает `false` — браузерное всплывающее сообщение подавляется |

---

## Свойства

Можно задавать программно на элементе до или после `configure()`.

| Свойство | Тип | По умолчанию | Описание |
|---|---|---|---|
| `action` | `string\|null` | `null` | Переопределяет атрибут `action` формы |
| `method` | `string\|null` | `null` | Переопределяет атрибут `method` формы |
| `headers` | `object\|null` | `null` | Дополнительные HTTP-заголовки запроса |
| `form` | `HTMLFormElement` | — | Ссылка на внутренний элемент `<form>` (read-only) |

---

## Методы API

### fields(selector?)

Возвращает массив элементов формы. Без аргумента — все поля. Аргумент может быть именем поля (`name`) или CSS-селектором.

```js
form.fields();                        // все поля формы
form.fields('email');                 // поля с name="email"
form.fields('[type="phone"], [type="tel"]'); // по CSS-селектору
```

### field(selector)

Возвращает первое найденное поле или `null`.

```js
const emailInput = form.field('email');
```

### appendField(name, value, options?)

Если поле с таким именем уже существует — обновляет его `value` и применяет `options` к элементу. Если нет — создаёт элемент и добавляет в форму.

`options.tag` задаёт тег создаваемого элемента (по умолчанию `'input'`). По умолчанию `type="hidden"`, но можно переопределить через `options`. Ключ `tag` удаляется из `options` до применения к элементу.

```js
form.appendField('sessid', BX.bitrix_sessid());
form.appendField('source', 'organic', { type: 'text' });
form.appendField('note', '', { tag: 'textarea', rows: 3 });
form.appendField('city', '', { tag: 'select' });
```

### removeField(name)

Удаляет поле и связанный с ним `<label>` (если есть).

```js
form.removeField('promo_code');
```

### resetField(name)

Сбрасывает конкретное поле. Корректно обрабатывает checkbox, radio, file, multiple select.

```js
form.resetField('phone');
form.resetField('agree'); // checkbox → unchecked
```

### reset()

Сбрасывает всю форму через нативный `form.reset()` и генерирует событие `form:reset`.

```js
form.reset();
```

### fill(data)

Заполняет поля формы переданным объектом. Ключи — имена полей (`name`).

```js
form.fill({
    name: 'Иван',
    agree: true,
    rating: '4',
    tags: ['js', 'css'],  // multiple select или checkbox-группа
});
```

Поддерживаемые типы значений по типу поля:

| Тип поля | Допустимое значение |
|---|---|
| `text`, `textarea`, и др. | `string` |
| `checkbox` | `boolean`, `string` (сравнивается с `value`), `string[]` (для группы) |
| `radio` | `string` (сравнивается с `value` каждого radio) |
| `select[multiple]` | `string[]` |
| `file` | `File`, data-URL (`data:mime;base64,...`), URL-строка (загружается через `fetch`) |

### validate(validators)

Добавляет или обновляет валидаторы программно. Сливается с существующими.

```js
form.validate({
    '[type="tel"]': input => /^\+7/.test(input.value) ? '' : 'Неверный формат',
});
```

### hide() / show()

Скрывает или показывает элемент `<st-app>`.

```js
form.hide();
form.show();
```

---

## Валидация

Валидаторы задаются объектом `{ selector: fn }`:

```js
{
    '[type="tel"]': input => /^\+7\s\(\d{3}\)/.test(input.value.trim())
        ? ''
        : 'Неверный формат номера телефона',
    '[name="agree"]': input => input.checked
        ? ''
        : 'Необходимо согласие',
}
```

Функция получает элемент поля и должна вернуть:
- `''` (пустую строку) — если поле валидно
- строку с описанием ошибки — если нет

Под капотом валидатор патчит `checkValidity()` и `reportValidity()` у поля, интегрируясь в стандартный механизм браузерной валидации. При сабмите сначала вызываются кастомные валидаторы, затем — `form.reportValidity()`.

---

## Примеры

### Базовая отправка с обработкой ответа

```js
document.querySelectorAll('st-app[app="form"]').forEach(form => {
    form.configure({
        form: {
            before_send() {
                // добавляем csrf-токен перед отправкой
                form.appendField('sessid', BX.bitrix_sessid());
            },
            complete(e) {
                const { data, request } = e.detail;

                let messages = ['Форма успешно отправлена!'];
                const success = request.status >= 200 && request.status < 300;

                if (success) {
                    form.reset();

                    if (data) {
                        if (data.message)
                            messages = Array.isArray(data.message)
                                ? data.message
                                : [data.message];

                        form.fill(data.data || {});
                    }
                } else {
                    console.error('Form submission failed', {
                        status: request.status,
                        status_text: request.statusText,
                        response: request.responseText,
                    });
                    messages = ['Произошла ошибка. Попробуйте позже.'];
                }

                success_modal.show(messages);
            },
        },
    });
});
```

---

### Маска телефона + валидация

```js
document.querySelectorAll('st-app[app="form"]').forEach(form => {
    form.configure({
        setup() {
            new st_mask({
                inputs: form.querySelectorAll('[type="phone"], [type="tel"]'),
                masks: [
                    "+{{7}=7} ({3*{\\d}}) {3*{\\d}} - {2*{\\d}} - {2*{\\d}}",
                    "{{8}=8} ({3*{\\d}}) {3*{\\d}} - {2*{\\d}} - {2*{\\d}}",
                    "+7 ({3*{\\d}}) {3*{\\d}} - {2*{\\d}} - {2*{\\d}}",
                ],
                placeholder: true,
                default_filler: '_',
            });
        },
        validate: {
            '[type="phone"], [type="tel"]': input =>
                /^\+7\s\(\d{3}\)\s\d{3}\s-\s\d{2}\s-\s\d{2}$/.test(input.value.trim())
                    ? ''
                    : 'Неверный формат номера телефона',
        },
        field: {
            invalid(e) {
                e.detail.field.style.borderColor = 'red';
            },
            input(e) {
                e.detail.field.style.borderColor = '';
            },
        },
    });
});
```

---

### Звёздный рейтинг

Обработка кастомного UI-элемента с привязкой к скрытому полю и сбросом при `form:reset`.

```js
document.querySelectorAll('st-app[app="form"]').forEach(appEl => {
    let starsAbort = null;

    appEl.addEventListener('rendered', () => {
        const container = appEl.querySelector('.review-form__stars');
        if (!container) return;

        if (starsAbort) starsAbort.abort();
        starsAbort = new AbortController();
        const { signal } = starsAbort;

        const stars = Array.from(container.querySelectorAll('.review-form__star'));
        const input = appEl.querySelector('[name="rating"]');
        let current = 0;

        function highlight(upTo) {
            stars.forEach((s, i) => s.classList.toggle('is-active', i < upTo));
        }

        stars.forEach((star, idx) => {
            star.addEventListener('mouseenter', () => highlight(idx + 1), { signal });
            star.addEventListener('click', () => {
                current = idx + 1;
                if (input) input.value = current;
                highlight(current);
            }, { signal });
        });

        container.addEventListener('mouseleave', () => highlight(current), { signal });

        // сброс звёзд при form.reset()
        appEl.addEventListener('form:reset', () => {
            current = 0;
            if (input) input.value = 0;
            highlight(0);
        }, { signal });
    });
});
```

> `AbortController` используется для снятия всех слушателей при повторном рендеринге (например, при смене шаблона).

---

### Программное управление формой

```js
const form = document.querySelector('st-app[app="form"]');

// заполнить форму данными (например, при редактировании)
form.fill({
    name: 'Иван Иванов',
    email: 'ivan@example.com',
    agree: true,
    role: 'admin',             // radio
    interests: ['js', 'css'], // checkbox-группа или multiple select
});

// добавить скрытое поле
form.appendField('user_id', 42);

// убрать поле, которое не нужно в этом контексте
form.removeField('promo_code');

// сбросить только одно поле
form.resetField('phone');

// программный сброс всей формы
form.reset();
```
