import { elements, expose, find, own } from '../_traits/hasInstanceSymbol.js';

export default class Validator {

    static #CONFIG = ['target', 'test', 'message'];

    #params = {};
    #methods = {};
    #elements = [];

    static find = find;

    get params() { return this.#params; }

    // Валидность по привязанным элементам без state и хуков (customValidity синхронизируется).
    get valid() { return this.#elements.map(el => this.#sync(el).valid); }

    clone(params) {
        return new Validator({ ...this.#params, ...this.#methods, ...params, parent: this });
    }

    constructor(params) {
        params = {
            target: '[validate]',
            events: ['input', 'blur'],

            test: null,
            property: null,
            attribute: null,
            message: 'Некорректное значение',

            native: true,
            check_on_init: false,

            before_init:  () => {},
            on_init:      () => {},
            before_check: () => {},
            on_valid:     () => {},
            on_invalid:   () => {},
            on_check:     () => {},

            ...params
        };

        for (let [key, value] of Object.entries(params))
            if (typeof value == "function" && !Validator.#CONFIG.includes(key)) {
                this[key] = value.bind(this);
                this.#methods[key] = value;
            } else
                this.#params[key] = value;

        this.before_init(this.#params);

        for (let el of elements(this.#params.target))
            this.#bind(el);

        if (this.#params.check_on_init) this.check();

        this.on_init(this.#params);
    }

    check(target = this.#elements) {
        return this.#own(target).map(el => this.#check(el)).every(Boolean);
    }

    reset(target = this.#elements) {
        for (let el of this.#own(target)) {
            el.removeAttribute('state');
            this.#sync(el);
        }
    }

    #own(target) {
        return elements(target).filter(el => find(el) === this);
    }

    #bind(el) {
        if (find(el)) throw new Error("Валидатор уже привязан к этому элементу");
        own(el, this);
        this.#elements.push(el);

        expose(el, {
            check: () => this.check(el),
            reset: () => this.reset(el)
        });

        for (let event of this.#params.events)
            el.addEventListener(event, () => this.#check(el));

        // Попытка отправить форму: браузер шлёт invalid каждому невалидному полю.
        el.addEventListener('invalid', () => this.#check(el));

        (el.form ?? el.closest('form'))
            ?.addEventListener('reset', () => queueMicrotask(() => this.reset(el)));

        this.#sync(el);
    }

    #check(el) {
        if (this.before_check(el) === false) return el.getAttribute('state') != 'invalid';

        let { valid, message } = this.#sync(el);

        el.setAttribute('state', valid ? 'valid' : 'invalid');

        if (valid) this.on_valid(el);
        else this.on_invalid(el, message);

        this.on_check(el, valid, message);

        return valid;
    }

    #sync(el) {
        let result = this.#test(el);

        if (this.#native(el))
            el.setCustomValidity(result.valid ? '' : result.message || ' ');

        return result;
    }

    #native(el) {
        return this.#params.native && typeof el.setCustomValidity == 'function';
    }

    #test(el) {
        let { test, property, attribute } = this.#params;

        // Встроенные ограничения (required, type, pattern…) проверяются первыми.
        if (this.#native(el)) {
            el.setCustomValidity('');
            if (!el.validity.valid) return { valid: false, message: el.validationMessage };
        }

        if (attribute && !el.hasAttribute(attribute)) return this.#fail(el);

        let source = String((property ? el[property]
            : attribute ? el.getAttribute(attribute)
            : el.value) ?? '');

        for (let rule of [test ?? []].flat()) {
            let result = typeof rule == 'function' ? rule.call(this, el) : new RegExp(rule).test(source);

            if (typeof result == 'string') return { valid: false, message: result };
            if (!result) return this.#fail(el);
        }

        return { valid: true, message: '' };
    }

    #fail(el) {
        let message = this.#params.message;
        return { valid: false, message: typeof message == 'function' ? message.call(this, el) : message };
    }
}
