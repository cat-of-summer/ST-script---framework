const instance = Symbol();

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
