import { disown, element, elements, expose, find, own } from '../_traits/hasInstanceSymbol.js';


const active = el => ['active', 'activating'].includes(el.getAttribute('state'));

export default class Toggle {

    #params = {};
    #methods = {};
    #timers = new WeakMap();
    #pending = new Set();
    #anchors = new Map();
    #triggers = [];
    #last = null;
    #abort = new AbortController();
    // Индикатор и триггер, за которым он следует (последний начавший активацию).
    #indicator = null;
    #current = null;
    // ResizeObserver: пересчёт индикатора и доводка, отложенная до показа скрытых табов.
    #resize = null;
    #deferred = null;
    // До конца конструктора индикатор и доводка — без анимации: страница только открылась.
    #ready = false;

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
            group: false,
            indicator: null,
            reveal: false,

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
            if (typeof value == "function" && key != 'target' && key != 'indicator') {
                this[key] = value.bind(this);

                this.#methods[key] = value;
            } else
                this.#params[key] = value;

        this.before_init(this.#params);

        let init = el => el.hasAttribute('state') || el.setAttribute('state', 'inactive');
        let signal = this.#abort.signal;

        for (let trigger of elements(this.#params.trigger)) {
            own(trigger, this);
            this.#triggers.push(trigger);
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
                trigger.addEventListener('mouseenter', () => this.activate(trigger), { signal });
                trigger.addEventListener('mouseleave', () => this.deactivate(trigger), { signal });
            } else
                trigger.addEventListener(this.#params.action, () => this.toggle(trigger), { signal });
        }

        let indicator = this.#params.indicator;
        this.#indicator = element(typeof indicator == 'function' ? indicator(this) : indicator) ?? null;

        if (this.#params.anchor) {
            this.#applyHash();
            if (this.#params.keep_history)
                window.addEventListener('hashchange', () => this.#applyHash(), { signal });
        }

        // Стартовый активный триггер из разметки: якорь его не выбрал — доводим и ставим индикатор.
        if (!this.#current && (this.#current = this.#triggers.filter(active).at(-1) ?? null))
            this.#reveal(this.#current);

        if (this.#indicator) {
            this.#indicate();
            this.#observe();
            // Индикатор вне прокручиваемой ленты следует за ней; внутри ленты координаты не меняются.
            document.addEventListener('scroll', e => {
                let t = e.target;
                if (t !== document && this.#current && t.contains(this.#current) && !t.contains(this.#indicator))
                    this.#indicate(true);
            }, { capture: true, passive: true, signal });
        }

        this.#ready = true;

        this.on_init(this.#params);
    }

    // Разобрать: снять обработчики (в том числе hashchange на window), таймеры переходов и
    // ResizeObserver. state на триггерах и целях и переменные индикатора остаются как есть.
    destroy() {
        this.#abort.abort();
        this.#resize?.disconnect();
        this.#resize = this.#deferred = this.#indicator = this.#current = null;
        this.#pending.forEach(clearTimeout);
        this.#pending.clear();
        this.#triggers.forEach(trigger => disown(trigger, this, ['toggle', 'activate', 'deactivate']));
        this.#triggers = [];
        this.#anchors.clear();
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

    // history.state сохраняется: его держат роутеры SPA (vue-router хранит в нём позицию
    // и прокрутку), и затёртое состояние ломает им «назад».
    #writeHash(id) {
        let url = '#' + id;
        if (location.hash === url) return;

        this.#params.keep_history
            ? history.pushState(history.state, '', url)
            : history.replaceState(history.state, '', url);
    }

    #clearHash() {
        if (!location.hash) return;

        let base = location.pathname + location.search;
        this.#params.keep_history
            ? history.pushState(history.state, '', base)
            : history.replaceState(history.state, '', base);
    }

    #applyHash() {
        let trigger = this.#anchors.get(location.hash.slice(1));

        // Таб из ссылки выбрал не пользователь — доводим до видимости всегда, без reveal.
        if (trigger) this.#act(trigger, true, true);
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
                let timer = setTimeout(() => {
                    this.#pending.delete(timer);
                    els.forEach(el => (el.setAttribute('state', final), after(el)));
                }, this.#params.duration * 1000);
                this.#pending.add(timer);

                els.forEach(el => this.#timers.set(el, timer));
            });
        });
    }

    // Пересчитать индикатор. Мгновенно (без transition) — при ресайзе, прокрутке и первой
    // расстановке, иначе он отстаёт или выезжает из нуля; анимированно — при смене триггера.
    #indicate(instant = !this.#ready) {
        let el = this.#indicator, t = this.#current;
        if (!el) return;

        instant ||= el.getAttribute('state') != 'active';
        el.setAttribute('state', t ? 'active' : 'inactive');

        // Координаты — от offsetParent индикатора, с его прокруткой: индикатор внутри ленты
        // прокручивается вместе с ней.
        let p = el.offsetParent;
        if (!t || !p || !t.getClientRects().length) return;

        let r = t.getBoundingClientRect(), pr = p.getBoundingClientRect(), transition = el.style.transition;
        if (instant) el.style.transition = 'none';

        Object.entries({
            x: r.left - pr.left - p.clientLeft + p.scrollLeft,
            y: r.top - pr.top - p.clientTop + p.scrollTop,
            width: r.width,
            height: r.height,
        }).forEach(([key, value]) => el.style.setProperty('--indicator-' + key, value + 'px'));

        if (instant) {
            el.offsetWidth;
            el.style.transition = transition;
        }
    }

    // Довести триггер до полной видимости в ближайшей горизонтальной ленте с прокруткой.
    // Только эта лента и только по горизонтали: страница не двигается. scrollLeft — абсолютный,
    // а не scrollBy: при быстрых кликах плавная прокрутка ещё идёт, и приращения накопились бы.
    #reveal(trigger, instant = !this.#ready) {
        // Табы скрыты (закрытая модалка, панель) — размеров нет, доводим при показе.
        if (!trigger.getClientRects().length) {
            this.#deferred = trigger;
            return this.#observe();
        }

        let box = trigger.parentElement, css;
        while (box && !(box.scrollWidth > box.clientWidth && /auto|scroll/.test((css = getComputedStyle(box)).overflowX)))
            box = box.parentElement;
        if (!box) return;

        let r = trigger.getBoundingClientRect(),
            start = box.getBoundingClientRect().left + box.clientLeft,
            left  = start + (parseFloat(css.scrollPaddingLeft) || 0),
            right = start + box.clientWidth - (parseFloat(css.scrollPaddingRight) || 0),
            rtl = css.direction == 'rtl';

        // Шире ленты — к начальному краю (в RTL — к правому).
        let delta = r.width > right - left ? (rtl ? r.right - right : r.left - left)
                  : r.left < left ? r.left - left
                  : r.right > right ? r.right - right : 0;
        if (Math.abs(delta) < 1) return;

        // scroll-snap: лента прилипла бы к ближайшей точке, и таб снова ушёл бы за край.
        // Берём ближайшую к текущему положению точку, где таб виден целиком.
        if (/^(x|inline|both)/.test(css.scrollSnapType)) {
            let max = box.scrollWidth - box.clientWidth, now = box.scrollLeft, best = null;
            for (let el of box.querySelectorAll('*')) {
                let align = getComputedStyle(el).scrollSnapAlign.split(' ').at(-1);
                if (align == 'none') continue;
                if (rtl && align != 'center') align = align == 'start' ? 'end' : 'start';

                let e = el.getBoundingClientRect(),
                    d = align == 'start' ? e.left - left : align == 'end' ? e.right - right : (e.left + e.right - left - right) / 2;
                // Точка за пределом прокрутки прижимается к краю (в RTL scrollLeft от -max до 0).
                d = Math.min(Math.max(now + d, rtl ? -max : 0), rtl ? 0 : max) - now;

                if (r.left - d >= left - 0.5 && r.right - d <= right + 0.5 && (best === null || Math.abs(d) < Math.abs(best)))
                    best = d;
            }
            delta = best ?? delta;
        }

        let behavior = box.style.scrollBehavior;
        if (instant) box.style.scrollBehavior = 'auto';
        box.scrollLeft += delta;
        if (instant) box.style.scrollBehavior = behavior;
    }

    #observe() {
        if (this.#resize || typeof ResizeObserver == 'undefined') return;

        this.#resize = new ResizeObserver(() => {
            let t = this.#deferred;
            if (t?.getClientRects().length) {
                this.#deferred = null;
                this.#reveal(t, true);
            }
            this.#indicate(true);
        });

        // Контейнер индикатора: ширина ленты меняется, а позиции табов (по центру) — вслед за ней.
        [...this.#triggers, this.#indicator?.parentElement].forEach(el => el && this.#resize.observe(el));
    }

    #act(trigger, on, reveal = false) {
        let state = trigger.getAttribute('state') ?? 'inactive', ai = this.#params.allow_interrupt;

        if (!(on ? state == 'inactive' || ai && state == 'deactivating'
                 : state == 'active'   || ai && state == 'activating')) return;

        let verb = on ? 'activate' : 'deactivate',
            process = on ? 'activating' : 'deactivating',
            final   = on ? 'active'     : 'inactive',
            targets = this.#targets(trigger);

        // Индикатор переезжает сразу, вместе с activating. Выключили тот, за кем он шёл, —
        // к оставшемуся активному или гаснет (state="inactive").
        let moved = on || trigger === this.#current;
        if (on) this.#current = trigger;
        else if (moved)
            this.#current = this.#triggers.filter(t => t !== trigger && active(t)).at(-1) ?? null;

        if (on && this.#params.group)
            this.#triggers
                .filter(t => t !== trigger && active(t))
                .forEach(t => this.#act(t, false));

        if (moved) this.#indicate();
        if (on && reveal) this.#reveal(trigger);

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

    // Клик и вызов из кода доводят таб до видимости по reveal; при hover — никогда:
    // наведение на крайний пункт прокрутило бы меню под курсором.
    get #revealing() { return this.#params.reveal && this.#params.action != 'hover'; }

    toggle(el) {
        elements(el).forEach(t => {
            let on = !active(t);
            if (on || this.#params.group != 'radio') this.#act(t, on, this.#revealing);
        });
    }

    activate(el)   { elements(el).forEach(t => this.#act(t, true, this.#revealing)); }
    deactivate(el) { elements(el).forEach(t => this.#act(t, false)); }
}
