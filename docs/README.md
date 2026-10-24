<!-- DOCGEN:START -->
# ST-script---framework

## Папки

- [src](src/)

<!-- DOCGEN:END -->

## Документация

Документация по каждому классу лежит рядом с его исходником — в
[`src/<модуль>/index.js.md`](src/). Сборка и способы подключения (npm / CDN,
ESM / IIFE) описаны в корневом [`README.md`](../README.md) репозитория.

## Подключение (кратко)

Пакет: **`@cat-of-summer/st-script`**. Сборка кладёт в `dist/` две версии каждого
модуля — ESM (`*.esm.min.js`) и IIFE/глобал (`*.min.js`).

```html
<!-- CDN, обычный скрипт (глобал window.Modal) -->
<script defer src="https://cdn.jsdelivr.net/npm/@cat-of-summer/st-script/dist/modal.min.js"></script>

<!-- CDN, ES-модуль -->
<script type="module">
  import Modal from 'https://cdn.jsdelivr.net/npm/@cat-of-summer/st-script/dist/modal.esm.min.js';
</script>
```

```js
// npm
import Modal from '@cat-of-summer/st-script/modal';
```

Полный список модулей и примеры - в корневом `README.md` и в `docs/src/`.

## Модули в динамическом DOM (App, Vue и др.)

Модули находят свои элементы при создании. Если разметку потом перерисовывает `<st-app>`, Vue или
свой код, новые узлы модуль сам не увидит. Модули об App и Vue не знают; связь - через общий
контракт:

- **элементы - селектором или функцией.** `target` (у Toggle и Modal - `trigger`) принимает
  функцию, которая возвращает элементы: `() => root.querySelectorAll('[role=tab]')`. Селектор и
  функцию можно пересчитать; готовый список элементов - нет;
- **`refresh()`** пересчитывает: элементы, ушедшие из DOM, отпускает (снимает обработчики и
  наблюдателей), новые привязывает. Возвращает экземпляр;
- **`destroy()`** снимает всё, когда компонент уходит.

| Модуль | `refresh()` | Что делает |
|---|---|---|
| Toggle | да | Триггеры: снять ушедшие, привязать новые, открыть вкладку из hash, пересчитать индикатор |
| Modal | да | Привязать новые триггеры |
| Mask, Validator | да | Поля: отпустить ушедшие, привязать новые |
| Select | да | Без аргумента - ещё и поднять новые `<select>`, отпустить ушедшие |
| Shape, Observer, Typograf | да | Элементы: отпустить ушедшие, взять новые, пересчитать |
| Uploader | да | Корни загрузчика; содержимое корня ведёт сам Uploader, перерисовывать его снаружи нельзя |
| Loader | да | Найти контейнер заново |
| Route | не нужен | Слушает клики на `document` |
| Cookie, st_button_widget, st_links_widget | не нужен | Строят свою разметку и в чужой не живут |

**`<st-app>`** сообщает о перерисовке событием `updated`:

```js
App.create({
    app: 'settings',
    tabs: ['rules', 'keys'],
    events: {
        rendered() {
            this.tabs_toggle = new Toggle({ trigger: () => this.querySelectorAll('[role=tab]'), group: 'radio' });
        },
        updated() { this.tabs_toggle.refresh(); },
    },
});
```

**Vue** - те же три шага в хуках компонента:

```js
const root = ref(null);
let tabs;
onMounted(() => { tabs = new Toggle({ trigger: () => root.value.querySelectorAll('[role=tab]'), group: 'radio' }); });
onUpdated(() => tabs.refresh());
onBeforeUnmount(() => tabs.destroy());
```

Состояние модуля живёт в узлах (`state`, привязанная маска). Если фреймворк пересоздаёт узел, модуль
поднимает новый с начальным состоянием из разметки. Сохранить состояние помогают ключи: строку
`#for` с `#key` App переносит, а не пересоздаёт; во Vue - `:key`.
