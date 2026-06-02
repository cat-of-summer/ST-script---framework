const instance = Symbol();

export const element = (param) => {
    try {
        return param instanceof Element ? param : document.querySelector(param);
    } catch {
        return undefined;
    }
};

export const elements = (param) => {
    if (param instanceof Element) return [param];
    if (param instanceof NodeList || param instanceof HTMLCollection) return param;

    try {
        const result = document.querySelectorAll(param);
        if (result.length === 0) throw new Error();
        return result;
    } catch {
        return [document.body.appendChild(
            new DOMParser().parseFromString(param, 'text/html').body.firstElementChild
        )];
    }
};

export const find = (param) => element(param)?.[instance];

export const own = (el, inst) => { if (el) el[instance] = inst; return el; };
