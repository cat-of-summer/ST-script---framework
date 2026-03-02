# st_observer.js

## Описание

Обёртка над `IntersectionObserver` с поддержкой `on_show`/`on_hide`, `once_show`/`once_hide`, `while_show`/`while_hide` хуков, а также определения пересечения (кросс) двух элементов на экране. Экземпляры сравниваются по `selector` — повторный `new st_observer({ selector })` для одного селектора возвращает тот же экземпляр.

## Конструктор

```js
new st_observer(params)
```

| Параметр | По умолчанию | Описание |
|---|---|---|
| `selector` | — | **Обязательный.** CSS-селектор, `Element` или `NodeList` |
| `root` | `null` | Корневой элемент для IntersectionObserver |
| `rootMargin` | `'0px'` | Отступ зоны наблюдения |
| `threshold` | `0` | Порог пересечения (0–1) |
| `before_init()` | — | До инициализации |
| `on_init()` | — | После инициализации |

## Публичные методы

| Метод | Описание |
|---|---|
| `on(target?, callbacks)` | Подписаться на `on_show`/`on_hide`/`while_show`/`while_hide` |
| `once(target?, callbacks)` | То же, но хуки срабатывают один раз |
| `cross(target, goals, callbacks)` | Следить пересечение `target` с элементами `goals` |
| `enableAutoCrossChecks(interval?)` | Запустить автопроверку cross-правил по таймеру |
| `disconnect()` | Отключить IntersectionObserver |

### callbacks для `on`/`once`:
- `on_show(entry, el)` — элемент появился в зоне видимости
- `on_hide(entry, el)` — элемент вышел из зоны видимости
- `while_show(entry, el)` — вызывается при каждом intersection-событии, пока виден

### callbacks для `cross`:
- `on_cross({target, goal}, t, g)` — при начале пересечения
- `once_cross` — одинраз
- `while_cross` — при каждой проверке

## Пример

```js
const obs = new st_observer({ selector: '.card', threshold: 0.3 });

obs.on({
    on_show: (entry, el) => el.classList.add('visible'),
    on_hide: (entry, el) => el.classList.remove('visible')
});

// Пересечение элементов
obs.cross('.card', ['.sidebar'], {
    on_cross: ({ target, goal }) => console.log('пересекли', target, goal)
});
obs.enableAutoCrossChecks(200);
```
