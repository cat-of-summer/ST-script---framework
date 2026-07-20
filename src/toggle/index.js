import { elements, expose, find, own } from '../_traits/hasInstanceSymbol.js';


export default class Toggle {

    #params = {};
    #methods = {};
    #timers = new WeakMap();
    #anchors = new Map();
    #last = null;

    static find = find;

    get params() {return this.#params;}

    clone(params) {
        return new Toggle({
            ...this.#params,
            ...this.#methods,
            ...params,
            parent: this
        });
    }

    constructor(params) {
        params = {
            duration: 0,
            trigger: '[trigger]',
            target: null,
            allow_interrupt: false,
            action: 'click',
            anchor: false,
            keep_history: false,

            before_activate:    () => {},
            on_activate:        () => {},
            before_deactivate:  () => {},
            on_deactivate:      () => {},

            before_activated:   () => {},
            on_activated:       () => {},
            before_deactivated: () => {},
            on_deactivated:     () => {},

            before_init: () => {},
            on_init:     () => {},

            ...params
        };

        if (params.keep_history) params.anchor = true;

        for (let [key, value] of Object.entries(params))
            if (typeof value == "function" && key != 'target') {
                this[key] = value.bind(this);

                this.#methods[key] = value;
            } else
                this.#params[key] = value;

        this.before_init(this.#params);

        let init = el => el.hasAttribute('state') || el.setAttribute('state', 'inactive');

        for (let trigger of elements(this.#params.trigger)) {
            own(trigger, this);
            expose(trigger, {
                toggle:     () => this.toggle(trigger),
                activate:   () => this.activate(trigger),
                deactivate: () => this.deactivate(trigger)
            });
            init(trigger);
            this.#targets(trigger).forEach(init);

            let id = this.#anchorId(trigger);
            if (id) this.#anchors.set(id, trigger);

            if (this.#params.action == 'hover') {
                trigger.addEventListener('mouseenter', () => this.activate(trigger));
                trigger.addEventListener('mouseleave', () => this.deactivate(trigger));
            } else
                trigger.addEventListener(this.#params.action, () => this.toggle(trigger));
        }

        if (this.#params.anchor) {
            this.#applyHash();
            if (this.#params.keep_history)
                window.addEventListener('hashchange', () => this.#applyHash());
        }

        this.on_init(this.#params);
    }

    #targets(trigger) {
        let target = this.#params.target;

        if (typeof target == "function") target = target(trigger);
        target ??= trigger.getAttribute('target');

        return elements(target);
    }

    #anchorId(trigger) {
        if (!this.#params.anchor) return null;
        if (trigger.id) return trigger.id;

        let targets = this.#targets(trigger);
        return targets.length === 1 && targets[0].id ? targets[0].id : null;
    }

    #writeHash(id) {
        let url = '#' + id;
        if (location.hash === url) return;

        this.#params.keep_history
            ? history.pushState(null, '', url)
            : history.replaceState(null, '', url);
    }

    #clearHash() {
        if (!location.hash) return;

        let base = location.pathname + location.search;
        this.#params.keep_history
            ? history.pushState(null, '', base)
            : history.replaceState(null, '', base);
    }

    #applyHash() {
        let trigger = this.#anchors.get(location.hash.slice(1));

        if (trigger) this.activate(trigger);
        else if (this.#params.keep_history && this.#last) {
            this.deactivate(this.#last);
            this.#last = null;
        }
    }

    #transition(els, process, final, before, after) {
        els.forEach(el => (before(el), clearTimeout(this.#timers.get(el))));

        requestAnimationFrame(() => {
            els.forEach(el => el.setAttribute('state', process));

            requestAnimationFrame(() => {
                let timer = setTimeout(
                    () => els.forEach(el => (el.setAttribute('state', final), after(el))),
                    this.#params.duration * 1000
                );

                els.forEach(el => this.#timers.set(el, timer));
            });
        });
    }

    #act(trigger, on) {
        let state = trigger.getAttribute('state') ?? 'inactive', ai = this.#params.allow_interrupt;

        if (!(on ? state == 'inactive' || ai && state == 'deactivating'
                 : state == 'active'   || ai && state == 'activating')) return;

        let verb = on ? 'activate' : 'deactivate',
            process = on ? 'activating' : 'deactivating',
            final   = on ? 'active'     : 'inactive',
            targets = this.#targets(trigger);

        let id = this.#anchorId(trigger);
        if (id) {
            if (on) { this.#writeHash(id); this.#last = trigger; }
            else if (location.hash.slice(1) === id) { this.#clearHash(); this.#last = null; }
        }

        this.#transition([trigger], process, final,
            el => this[`before_${verb}`](el, targets), el => this[`on_${verb}`](el, targets));

        this.#transition(targets, process, final,
            el => this[`before_${verb}d`](el, trigger), el => this[`on_${verb}d`](el, trigger));
    }

    toggle(el) {
        elements(el).forEach(t => this.#act(t, !['active', 'activating'].includes(t.getAttribute('state'))));
    }

    activate(el)   { elements(el).forEach(t => this.#act(t, true)); }
    deactivate(el) { elements(el).forEach(t => this.#act(t, false)); }
}
