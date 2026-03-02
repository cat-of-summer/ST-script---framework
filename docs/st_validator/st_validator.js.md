# st_validator.js

## Описание

Подвешивает валидацию на указанные события. Проверяет логику: `regexp` по `value`, атрибуту или произвольному `property` значению, плюс произвольная функция `validator`. Вызывает `on_valid` / `on_invalid` для каждого элемента.

## Конструктор

```js
new st_validator(params)
```

| Параметр | Описание |
|---|---|
| `selector` | CSS-селектор валидируемых элементов |
| `events` | `['input', 'blur']` | События, триггеряющие проверку |
| `regexp` | — | `RegExp` или строка для проверки |
| `attribute` | — | Проверяет наличие атрибута или значение `regexp` по атрибуту |
| `property` | — | Применяет `regexp` к свойству элемента (`innerHTML`, `textContent`, …) |
| `validator(input)` | — | Произвольная функция, дополняющая regexp |
| `on_valid(input)` | — | Цветовые / другие действия при валидном значении |
| `on_invalid(input)` | — | Цветовые / другие действия при инвалидном |
| `after_check(input)` | — | Вызывается после каждой проверки |
| `onload` | `false` | `true` — вызвать `apply()` сразу; функция — получит `selector` |

## Публичные методы

| Метод | Описание |
|---|---|
| `apply(selector?)` | Применить валидацию немедленно ко всем подходящим элементам |

## Пример

```js
// Валидация email по regexp
const emailValidator = new st_validator({
    selector: 'input[name=email]',
    regexp: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    on_valid: (input) => input.style.borderColor = 'green',
    on_invalid: (input) => input.style.borderColor = 'red'
});

// Валидация при загрузке сразу
const hiddenValidator = new st_validator({
    selector: 'input[name=code]',
    onload: true,
    attribute: 'data-key',
    regexp: /^\d{6}$/,
    on_valid: (input) => input.closest('label').style.color = 'blue',
    on_invalid: (input) => input.closest('label').style.color = 'red'
});

// Ручной запуск
if (formIsLoaded) emailValidator.apply();
```
