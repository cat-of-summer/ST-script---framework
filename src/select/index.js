import { elements, expose, find, own } from '../_traits/hasInstanceSymbol.js';


export default class Select {

    #params = {};
    #methods = {};
    #timers = new WeakMap();

    static find = find;

    get params() {return this.#params;}

    get value() {
        return elements(this.#params.target).map(select => select.multiple
            ? [...select.selectedOptions].map(o => o.value)
            : select.value);
    }

    clone(params) {
        return new Select({
            ...this.#params,
            ...this.#methods,
            ...params,
            parent: this
        });
    }

    constructor(params) {
        params = {
            target: 'select',
            location: 'bottom center',
            action: 'click',

            duration: 0,
            allow_interrupt: false,

            close_on_select: true,
            close_on_outside: true,

            before_open:   () => {},
            on_open:       () => {},
            before_close:  () => {},
            on_close:      () => {},

            before_change: () => {},
            on_change:     () => {},

            before_init:   () => {},
            on_init:       () => {},

            ...params
        };

        for (let [key, value] of Object.entries(params))
            if (typeof value == "function" && key != 'target') {
                this[key] = value.bind(this);

                this.#methods[key] = value;
            } else
                this.#params[key] = value;

        this.before_init(this.#params);

        for (let select of elements(this.#params.target))
            this.#build(select);

        this.on_init(this.#params);
    }

    #locate(options) {
        let loc = (this.#params.location || '').toLowerCase().split(/\s+/);

        Object.assign(options.style, {
            position: 'absolute',
            top:    loc.includes('top')   ? 'auto' : '100%',
            bottom: loc.includes('top')   ? '100%' : 'auto',
            left:   loc.includes('right') ? 'auto' : loc.includes('center') ? '50%' : '0',
            right:  loc.includes('right') ? '0'    : 'auto',
            transform: loc.includes('center') && !loc.includes('right') ? 'translateX(-50%)' : 'none',
        });
    }

    #build(select) {
        own(select, this);
        expose(select, {
            open:   () => this.open(select),
            close:  () => this.close(select),
            toggle: () => this.toggle(select)
        });

        let container = document.createElement('select-container');
        own(container, this);
        Object.assign(container.style, { position: 'relative', display: 'inline-block' });

        let trigger = document.createElement('select-trigger');
        own(trigger, this);
        Object.assign(trigger.style, { display: 'block', cursor: 'pointer' });

        let options = document.createElement('select-options');
        own(options, this);
        Object.assign(options.style, { transition: `all ${this.#params.duration}s` });
        this.#locate(options);

        Object.assign(select.style, {
            position: 'absolute', width: '1px', height: '1px',
            overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)',
        });

        select.parentNode.insertBefore(container, select);
        container.append(trigger, select, options);
        container.setAttribute('state', 'closed');

        for (let option of [...select.options]) {
            let item = document.createElement('select-option');
            own(item, this);
            item.textContent = option.textContent;
            item.style.cursor = 'pointer';
            if (option.disabled) item.setAttribute('disabled', '');
            item.toggleAttribute('selected', option.selected);

            item.addEventListener('click', () => {
                if (!option.disabled) this.#choose(container, select, option, item);
            });

            options.append(item);
        }

        this.#render(select, trigger);

        if (this.#params.action == 'hover') {
            container.addEventListener('mouseenter', () => this.open(container));
            container.addEventListener('mouseleave', () => this.close(container));
        } else
            trigger.addEventListener(this.#params.action, () => this.toggle(container));

        if (this.#params.close_on_outside)
            document.addEventListener('click', (e) => {
                if (!container.contains(e.target)) this.close(container);
            });
    }

    #choose(container, select, option, item) {
        if (this.before_change(option, select) === false) return;

        if (select.multiple) {
            option.selected = !option.selected;
            item.toggleAttribute('selected', option.selected);
        } else {
            select.value = option.value;
            [...container.querySelectorAll('select-option')]
                .forEach(el => el.toggleAttribute('selected', el === item));
        }

        select.dispatchEvent(new Event('change', { bubbles: true }));
        this.#render(select, container.querySelector('select-trigger'));

        this.on_change(option, select);

        if (!select.multiple && this.#params.close_on_select) this.close(container);
    }

    #render(select, trigger) {
        if (select.multiple)
            trigger.textContent = [...select.selectedOptions].map(o => o.textContent).join(', ');
        else
            trigger.textContent = (select.selectedOptions[0] ?? select.options[0])?.textContent ?? '';
    }

    #transition(el, process, final, before, after) {
        before(el);
        clearTimeout(this.#timers.get(el));

        requestAnimationFrame(() => {
            el.setAttribute('state', process);

            requestAnimationFrame(() => {
                this.#timers.set(el, setTimeout(
                    () => (el.setAttribute('state', final), after(el)),
                    this.#params.duration * 1000
                ));
            });
        });
    }

    #act(container, open) {
        let state = container.getAttribute('state') ?? 'closed', ai = this.#params.allow_interrupt;

        if (!(open ? state == 'closed' || ai && state == 'closing'
                   : state == 'open'   || ai && state == 'opening')) return;

        this.#transition(container,
            open ? 'opening' : 'closing',
            open ? 'open'    : 'closed',
            open ? this.before_open : this.before_close,
            open ? this.on_open     : this.on_close);
    }

    open(el)  { elements(el).map(this.#resolve).forEach(c => c && this.#act(c, true)); }
    close(el) { elements(el).map(this.#resolve).forEach(c => c && this.#act(c, false)); }

    toggle(el) {
        elements(el).map(this.#resolve).forEach(c => {
            if (c) this.#act(c, !['open', 'opening'].includes(c.getAttribute('state')));
        });
    }

    #resolve = (el) => el?.closest?.('select-container')
        ?? (el?.tagName?.toLowerCase() == 'select' ? el.parentElement : null);
}
