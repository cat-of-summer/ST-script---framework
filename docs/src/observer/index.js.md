# Observer.js

## Описание

Механизм анимаций по скроллу. Следит, где элемент находится относительно зоны прокрутки, и
пишет это на сам элемент: атрибут `state`, CSS-переменные `--progress` и `--index`, атрибут
`crossing`. Анимацию задаёт CSS потребителя по этим меткам, как `[state]` у `Select` и
`Loader`. Хуки нужны там, где мало CSS: счётчики, ленивая загрузка, аналитика.

Один инстанс обслуживает все подходящие элементы. Одна прокрутка — один кадр
`requestAnimationFrame` на инстанс: сначала все чтения геометрии, потом все записи.

## Модель: зона и три состояния

Зона задаётся двумя линиями, как в GSAP ScrollTrigger:

- `start: 'top bottom'` — зона начинается, когда **верх элемента** встречает **низ root**;
- `end: 'bottom top'` — зона кончается, когда **низ элемента** встречает **верх root**.

Первое слово линии — край элемента, второе — край root (viewport или контейнера `root`).

```
            before                     active                      after
  ┌──────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────┐
  элемент ниже линии start   между start и end, 0 → 1     элемент прошёл линию end
```

| `state` | Когда | `--progress` |
|---|---|---|
| `before` | Зона ещё впереди (и начальное состояние при привязке) | `0` |
| `active` | Элемент между линиями start и end | `0…1` |
| `after` | Зона пройдена | `1` |

Края в линии:

| Запись | Значение |
|---|---|
| `top` / `center` / `bottom` | 0 / 50% / 100% высоты (для `axis: 'x'` — `left` / `center` / `right`) |
| `80%`, `120px`, `-20` | Доля размера или пиксели от начала (число без единиц — пиксели) |
| `top+100px`, `bottom-10%`, `50%+20px` | Край со сдвигом |

Второе слово можно опустить: у `start` root по умолчанию `bottom`, у `end` — `top`.

Типичные зоны:

| Задача | `start` | `end` |
|---|---|---|
| Весь путь через экран (параллакс) | `top bottom` | `bottom top` |
| Появиться, когда элемент поднялся на 20% экрана | `top 80%` | `bottom top` |
| Прогресс чтения статьи | `top top` | `bottom bottom` |
| Подсветка пункта меню, пока секция под серединой экрана | `top center` | `bottom center` |

## Конструктор

```js
new Observer(params)
```

| Параметр | По умолчанию | Описание |
|---|---|---|
| `target` | `'[observe]'` | Селектор / Element / NodeList отслеживаемых элементов |
| `root` | `null` | Контейнер прокрутки (селектор / Element); `null` — viewport |
| `axis` | `'y'` | Ось: `'y'` или `'x'` (горизонтальная лента) |
| `start` | `'top bottom'` | Линия начала зоны |
| `end` | `'bottom top'` | Линия конца зоны |
| `once` | `false` | После первого входа `state="active"` навсегда, элемент снимается с учёта |
| `progress` | `false` | Писать `--progress` и вызывать `on_progress` |
| `stagger` | `0` | Сек. Элементы, вошедшие в одном кадре, входят по очереди с этим шагом |
| `live` | `false` | Подхватывать новые элементы по `target` и отпускать удалённые (`MutationObserver`). Только для строкового `target` |
| `cross` | `null` | Селектор / Element целей: следить пересечение каждого элемента с ними |

### Переопределение атрибутами

Атрибуты элемента перекрывают параметры для этого элемента. Читаются при привязке.

| Атрибут | Перекрывает |
|---|---|
| `observe-start="top 80%"` | `start` |
| `observe-end="bottom 20%"` | `end` |
| `observe-once` / `observe-once="false"` | `once` |
| `observe-progress` / `observe-progress="false"` | `progress` |

Пустое значение атрибута-флага значит «да».

### Хуки

Передаются в `params` и привязываются к инстансу (`this` — Observer).

| Хук | Аргументы | Когда |
|---|---|---|
| `before_init` / `on_init` | `(params)` | В начале и в конце конструктора |
| `on_enter` | `(el, info)` | Вход в зону: `forward` — из `before`, `backward` — из `after` |
| `on_leave` | `(el, info)` | Выход: `forward` — в `after`, `backward` — в `before` |
| `on_progress` | `(el, info)` | Изменился прогресс (только при `progress`) |
| `on_cross` / `on_uncross` | `(el, goal)` | Элемент начал или перестал пересекаться с целью из `cross` |

`info = { state, prev, direction, progress, index }`:
`state` — состояние после события, `prev` — до перехода, `direction` — `'forward'` (прокрутка
вниз или вправо) или `'backward'`, `progress` — последнее значение, `index` — место в
stagger-очереди.

Если быстрый скролл перескочил зону за кадр (`before → after`), вызываются оба хука подряд:
`on_enter`, затем `on_leave`. Ни одна пара вход/выход не теряется. Ошибка в хуке пишется в
консоль и не мешает остальным элементам.

Таблица соответствия ScrollTrigger: `onEnter` = `on_enter` + `forward`, `onEnterBack` =
`on_enter` + `backward`, `onLeave` = `on_leave` + `forward`, `onLeaveBack` = `on_leave` + `backward`.

## Что пишется на элементы

| Метка | Когда | Значение |
|---|---|---|
| атрибут `state` | всегда | `before` / `active` / `after` |
| `--progress` | `progress` | `0…1`, 4 знака |
| `--index` | `stagger > 0` | Порядковый номер во входящей пачке |
| атрибут `crossing` | `cross` | Есть, пока элемент пересекается хоть с одной целью |

Прятать элементы стоит по `[state="before"]`, а не по «не active». Тогда уже прокрученные
(`after`) остаются видимыми, а без JS атрибута нет совсем — и ничего не скрыто.

## Публичные методы и свойства

| Член | Описание |
|---|---|
| `observe(target)` | Взять элементы на учёт, в том числе отпущенные раньше через `once` или `unobserve`; возвращает `this` |
| `unobserve(target)` | Снять с учёта; атрибуты на элементе остаются как есть |
| `refresh()` | Пересканировать `target` и цели `cross`, отпустить ушедшие из DOM, пересчитать всё. Элементы, отпущенные через `once` или `unobserve`, заново не берутся — иначе `live` перезапускал бы уже отыгравшие анимации |
| `state(el)` | `{ state, progress, direction }` или `null` |
| `destroy()` | Снять все слушатели, наблюдателей и таймеры |
| `clone(params)` | Новый инстанс с объединёнными параметрами и `parent: this` |
| `params` | Конфигурация без функций |
| `elements` | Элементы на учёте |
| `Observer.find(el)` | Инстанс, владеющий элементом |

## Как устроено внутри

- **Геометрия** — чистые функции [_engine.js](_engine.js.md): по прямоугольникам элемента и root
  считаются `a` и `b` — расстояния до линий start и end. От них зависят состояние и прогресс.
- **Кадр** — `scroll` ловится на `document` в фазе захвата (это и окно, и вложенные
  контейнеры), `resize` — на window, рост контента — `ResizeObserver` на root. Всё это только
  планирует кадр; постоянного rAF-цикла нет.
- **Гейт** — `IntersectionObserver` с `rootMargin: 100%` отмечает элементы в пределах ещё
  одного root с каждой стороны. Каждый кадр меряются только они. Ушедший далеко элемент
  меряется один раз и получает финальное состояние. Если задан `cross`, меряются все элементы.
- **Первый показ** — при привязке ставится `state="before"`, а пересчёт идёт через кадр. Так
  элементы на первом экране тоже проигрывают CSS-переход входа, как в AOS.
- **Stagger** — входящие в одном кадре элементы сортируются по порядку в документе. `state`
  и `on_enter` откладываются на `index × stagger`. Если до своей очереди элемент снова
  покинул зону, вход отменяется.

## Примеры

### Появление при прокрутке (как AOS)

```html
<section observe class="fade-up">…</section>
<section observe observe-start="top 60%">…</section>
```

```css
.fade-up { transition: opacity .6s, transform .6s; }
.fade-up[state="before"] { opacity: 0; transform: translateY(40px); }
```

```js
new Observer({ start: 'top 85%', once: true });
```

### Каскад карточек

```css
.card { transition: opacity .4s, transform .4s; }
.card[state="before"] { opacity: 0; transform: scale(.94); }
```

```js
new Observer({ target: '.card', start: 'top 90%', once: true, stagger: 0.08, live: true });
```

`live` подхватывает карточки, которые позже вставит `Loader`. Очередь входа держит таймер
`stagger`. `--index` остаётся на элементе и пригодится в CSS для чего-то ещё, например для
чередования направления: `translate: calc((var(--index) % 2 * 2 - 1) * 20px) 0`.

### Параллакс и прогресс

```css
.hero img { transform: translateY(calc((var(--progress, 0) - .5) * -120px)); }
.reading-bar { transform: scaleX(var(--progress, 0)); transform-origin: left; }
```

```js
new Observer({ target: '.hero', progress: true });

// прогресс статьи пишется на саму статью, полоса читает его через наследование
new Observer({ target: 'article', start: 'top top', end: 'bottom bottom', progress: true });
```

### Шапка над тёмной секцией

```css
header { position: fixed; color: #111; }
header[crossing] { color: #fff; }
```

```js
new Observer({ target: 'header', cross: '.section-dark' });
```

### Меню-оглавление (scrollspy)

```js
new Observer({
    target: 'section[id]',
    start: 'top center',
    end: 'bottom center',
    on_enter: el => document.querySelector(`nav a[href="#${el.id}"]`)?.classList.add('current'),
    on_leave: el => document.querySelector(`nav a[href="#${el.id}"]`)?.classList.remove('current'),
});
```

### Счётчик при первом показе

```js
new Observer({
    target: '[counter]',
    once: true,
    on_enter: el => animateNumber(el, +el.getAttribute('counter')),
});
```

## Сравнение с библиотеками

| Возможность | AOS | GSAP ScrollTrigger | Motion `inView` / `scroll` | Observer |
|---|---|---|---|---|
| Вход и выход, `once` | ✓ | ✓ | ✓ | ✓ |
| Направление входа и выхода | — | ✓ | — | ✓ `direction` |
| Зона двумя линиями | offset | ✓ | ✓ `offset` | ✓ `start` / `end` |
| Прогресс 0…1 | — | ✓ `scrub` | ✓ | ✓ `--progress` |
| Анимация чистым CSS | ✓ пресеты | toggleClass | — | ✓ `[state]`, `--progress` |
| Каскад | delay | `batch()` | — | ✓ `stagger`, `--index` |
| Новые элементы из DOM | `refresh` вручную | `refresh` вручную | — | ✓ `live` |
| Пересечение двух элементов | — | — | — | ✓ `cross` |
| Pin, smooth-scroll, snap | — | ✓ | — | — (CSS `sticky`, `scroll-snap`) |
| Готовые анимации | ✓ | ✓ таймлайны | ✓ | — (это делает CSS) |

Нативные CSS scroll-driven animations (`animation-timeline: view()`) решают ту же задачу для
`--progress` без JS, но не дают хуков, `once`, stagger и `cross`, а поддержка браузерами ещё
неполная. Observer работает везде, где есть `IntersectionObserver` и `ResizeObserver`.

## Ограничения

- **Один элемент — один Observer.** Элемент, уже занятый другим инстансом, пропускается с
  предупреждением: два инстанса спорили бы за атрибут `state`.
- **Гейт на один root.** Элементы дальше одного размера root от его краёв меряются только
  при входе в гейт и выходе из него. Если линия зоны вынесена дальше (`'top -150%'`), смена
  состояния за гейтом проявится, только когда элемент в него вернётся.
- **Сдвиг вёрстки без прокрутки и без изменения размера root** (например, `transform`
  соседей) кадр не планирует — вызовите `refresh()`.
- **`once` и `--progress`.** После первого входа элемент снят с учёта, прогресс замирает.
