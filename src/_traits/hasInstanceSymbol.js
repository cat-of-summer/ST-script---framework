const instance = Symbol();
const exposed = Symbol();

// Один существующий элемент: Element или CSS-селектор → Element | undefined.
export const element = (param) => {
    try {
        return param instanceof Element ? param : document.querySelector(param);
    } catch {
        return undefined;
    }
};

// Множество существующих элементов: Element | NodeList | HTMLCollection | Array |
// CSS-селектор | функция, возвращающая одно из них → Array<Element>. Без побочных эффектов
// (несовпадение → []). Селектор и функцию refresh() модулей пересчитывает заново.
export const elements = (param) => {
    if (param == null) return [];
    if (typeof param == 'function') return elements(param());
    if (param instanceof Element) return [param];
    if (param instanceof NodeList || param instanceof HTMLCollection) return [...param];
    if (Array.isArray(param)) return param.flatMap(elements);

    try {
        return [...document.querySelectorAll(param)];
    } catch {
        return [];
    }
};

// Можно ли пересканировать параметр в refresh(): готовый список элементов — нельзя.
export const rescannable = (param) => typeof param == 'string' || typeof param == 'function';

// Подписки одного элемента: обрываются вместе с общим сигналом экземпляра (destroy) и
// отдельно — refresh() отпускает элемент, ушедший из DOM, со слушателями на его форме.
export const linked = (signal) => {
    let controller = new AbortController();
    signal.addEventListener('abort', () => controller.abort(), { once: true, signal: controller.signal });
    return controller;
};

export const find = (param) => element(param)?.[instance];

export const own = (el, inst) => { if (el) el[instance] = inst; return el; };

// Опубликовать API владельца прямо на элементе: input.raw(), select.open() и т.п.
// Свойства неперечислимые (не попадают в Object.keys и JSON). Занятое имя — нативное
// или чужое — не затирается: предупреждение и пропуск.
export const expose = (el, api) => {
    if (!el) return el;

    let published = el[exposed] ??= new Set();

    for (let [name, value] of Object.entries(api)) {
        if (name in el && !published.has(name)) {
            console.warn(`Имя "${name}" уже занято на элементе — метод не опубликован`, el);
            continue;
        }

        Object.defineProperty(el, name, { value, writable: true, configurable: true, enumerable: false });
        published.add(name);
    }

    return el;
};

// Обратное own + expose для destroy(): снять владельца (только если это inst) и опубликованные
// им методы. Чужие методы на том же элементе (Mask и Validator на одном поле) остаются.
export const disown = (el, inst, names = []) => {
    if (!el) return el;
    if (el[instance] === inst) delete el[instance];

    let published = el[exposed];
    for (let name of names) {
        if (!published?.has(name)) continue;
        delete el[name];
        published.delete(name);
    }

    return el;
};

// Ближайший к цели элемент события, подходящий под селектор. Путь берётся из composedPath():
// он зафиксирован при отправке, а e.target к всплытию может быть уже вынут из DOM перерисовкой
// (App обновляет шаблон в микрозадаче между слушателями). root — граница поиска, включительно.
export const closestInPath = (e, selector, root = null) => {
    for (let node of e.composedPath()) {
        if (node instanceof Element && node.matches(selector)) return node;
        if (node === root) return undefined;
    }
};
