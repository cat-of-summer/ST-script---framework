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
// CSS-селектор → Array<Element>. Без побочных эффектов (несовпадение → []).
export const elements = (param) => {
    if (param == null) return [];
    if (param instanceof Element) return [param];
    if (param instanceof NodeList || param instanceof HTMLCollection) return [...param];
    if (Array.isArray(param)) return param.flatMap(elements);

    try {
        return [...document.querySelectorAll(param)];
    } catch {
        return [];
    }
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
