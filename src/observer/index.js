import { element, elements, find, own } from '../_traits/hasInstanceSymbol.js';
import { parse_zone, measure, state_of, progress_of, intersects, steps } from './_engine.js';

const CALLBACKS = ['before_init', 'on_init', 'on_enter', 'on_leave', 'on_progress', 'on_cross', 'on_uncross'];

export default class Observer {

    static #CONFIG = ['target', 'root', 'cross'];

    // атрибут-флаг: нет атрибута → значение по умолчанию, '' / 'true' → да, 'false' → нет
    static #flag(attr, fallback) {
        return attr == null ? !!fallback : attr != 'false';
    }

    #params = {};
    #methods = {};
    #zone = null;
    #root = null;
    #states = new Map();
    #done = new WeakSet();
    #goals = [];
    #frame = 0;
    #io = null;
    #mo = null;
    #ro = null;
    #schedule = () => { this.#frame ||= requestAnimationFrame(() => this.#tick()); };
    #later = () => requestAnimationFrame(this.#schedule);

    static find = find;

    get params() { return this.#params; }

    get elements() { return [...this.#states.keys()]; }

    clone(params) {
        return new Observer({ ...this.#params, ...this.#methods, ...params, parent: this });
    }

    constructor(params) {
        params = {
            target: '[observe]',
            root: null,
            axis: 'y',
            start: 'top bottom',
            end: 'bottom top',
            once: false,
            progress: false,
            stagger: 0,
            live: false,
            cross: null,
            ...Object.fromEntries(CALLBACKS.map(k => [k, () => {}])),
            ...params
        };

        for (let [key, value] of Object.entries(params))
            if (typeof value == "function" && !Observer.#CONFIG.includes(key)) {
                this[key] = value.bind(this);
                this.#methods[key] = value;
            } else
                this.#params[key] = value;

        this.before_init(this.#params);

        this.#zone = parse_zone(this.#params.start, this.#params.end);
        this.#root = this.#params.root == null ? null : element(this.#params.root) ?? null;

        // гейт: каждый кадр меряются только элементы в пределах ещё одного root с каждой стороны
        this.#io = new IntersectionObserver(entries => {
            for (let entry of entries) {
                let st = this.#states.get(entry.target);
                if (!st) continue;
                st.near = entry.isIntersecting;
                st.dirty = true;
            }
            this.#schedule();
        }, { root: this.#root, rootMargin: '100%' });

        // scroll не всплывает, но ловится на захвате: так видна прокрутка и окна, и вложенных контейнеров
        document.addEventListener('scroll', this.#schedule, { capture: true, passive: true });
        window.addEventListener('resize', this.#schedule, { passive: true });

        this.#ro = new ResizeObserver(this.#schedule);
        this.#ro.observe(this.#root ?? document.documentElement);

        if (this.#params.live && typeof this.#params.target == 'string') {
            let pending = false;
            this.#mo = new MutationObserver(records => {
                if (pending || !records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n instanceof Element)))
                    return;
                pending = true;
                queueMicrotask(() => { pending = false; this.refresh(); });
            });
            this.#mo.observe(document.documentElement, { childList: true, subtree: true });
        }

        this.#goals = elements(this.#params.cross);
        for (let el of elements(this.#params.target)) this.#bind(el);

        this.on_init(this.#params);
    }

    // явный observe берёт и отпущенные раньше элементы (после once или unobserve)
    observe(target) {
        for (let el of elements(target)) {
            this.#done.delete(el);
            this.#bind(el);
        }
        return this;
    }

    unobserve(target) {
        for (let el of elements(target)) {
            this.#done.add(el);
            this.#release(el);
        }
        return this;
    }

    // Пересканировать target и цели cross, отпустить элементы, ушедшие из DOM, пересчитать всё.
    // Отпущенные через once / unobserve при пересканировании не берутся заново
    refresh() {
        for (let el of this.#states.keys()) if (!el.isConnected) this.#release(el);
        if (typeof this.#params.target == 'string')
            for (let el of elements(this.#params.target)) if (!this.#done.has(el)) this.#bind(el);
        this.#goals = elements(this.#params.cross);
        for (let st of this.#states.values()) st.dirty = true;
        this.#schedule();
        return this;
    }

    state(target) {
        let st = this.#states.get(element(target));
        return st ? { state: st.state, progress: st.value, direction: st.direction } : null;
    }

    destroy() {
        for (let el of [...this.#states.keys()]) this.#release(el);
        cancelAnimationFrame(this.#frame);
        this.#frame = 0;
        this.#io.disconnect();
        this.#ro.disconnect();
        this.#mo?.disconnect();
        document.removeEventListener('scroll', this.#schedule, { capture: true });
        window.removeEventListener('resize', this.#schedule);
    }

    #bind(el) {
        if (this.#states.has(el)) return;
        let owner = find(el);
        if (owner instanceof Observer && owner !== this) {
            console.warn('Observer: элемент уже отслеживается другим Observer — пропущен', el);
            return;
        }
        own(el, this);

        let attr = name => el.getAttribute('observe-' + name);
        let start = attr('start'), end = attr('end');

        // начальное состояние — before: вход в зону на следующих кадрах проигрывает CSS-переход
        this.#states.set(el, {
            zone: start == null && end == null ? this.#zone
                : parse_zone(start ?? this.#params.start, end ?? this.#params.end),
            once: Observer.#flag(attr('once'), this.#params.once),
            progress: Observer.#flag(attr('progress'), this.#params.progress),
            state: 'before', direction: null, value: null, index: 0,
            near: true, dirty: true, timer: 0, pending: null, crossing: new Set()
        });
        el.setAttribute('state', 'before');

        this.#io.observe(el);
        this.#later();
    }

    // forget = false оставляет владение: Observer.find(el) после once по-прежнему отвечает
    #release(el, forget = true) {
        let st = this.#states.get(el);
        if (!st) return;
        clearTimeout(st.timer);
        this.#states.delete(el);
        this.#io.unobserve(el);
        if (forget && find(el) === this) own(el, undefined);
    }

    #root_rect() {
        if (!this.#root) {
            let doc = document.documentElement;
            return { top: 0, left: 0, width: doc.clientWidth, height: doc.clientHeight };
        }
        let r = this.#root.getBoundingClientRect();
        return { top: r.top + this.#root.clientTop, left: r.left + this.#root.clientLeft,
                 width: this.#root.clientWidth, height: this.#root.clientHeight };
    }

    // Кадр: сначала все чтения геометрии, потом все записи — без layout thrashing
    #tick() {
        this.#frame = 0;

        let root = this.#root_rect(), axis = this.#params.axis;
        let goals = this.#goals.filter(g => g.isConnected).map(g => [g, g.getBoundingClientRect()]);
        let reads = [];

        for (let [el, st] of this.#states) {
            if (!el.isConnected || !st.near && !st.dirty && !goals.length) continue;
            st.dirty = false;

            let rect = el.getBoundingClientRect();
            let { a, b } = measure(rect, root, st.zone, axis);
            let crossing = goals.length
                ? new Set(goals.filter(([g, r]) => g !== el && intersects(rect, r)).map(([g]) => g))
                : null;
            reads.push([el, st, state_of(a, b), progress_of(a, b), crossing]);
        }

        let entering = [];

        for (let [el, st, next, progress, crossing] of reads) {
            if (st.progress) this.#progress(el, st, progress);
            if (crossing) this.#cross(el, st, crossing);

            // отложенный stagger-вход ждёт своей очереди; если цель сменилась — отменяется,
            // и события считаются от уже показанного состояния
            if (st.timer) {
                if (st.pending == next) continue;
                clearTimeout(st.timer);
                st.timer = 0;
            }

            let events = steps(st.state, next);
            if (!events.length) continue;

            if (this.#params.stagger > 0 && events[0].hook == 'on_enter') entering.push([el, st, next, events]);
            else this.#commit(el, st, next, events);
        }

        if (!entering.length) return;

        entering.sort(([x], [y]) => x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
        entering.forEach(([el, st, next, events], index) => {
            st.index = index;
            st.pending = next;
            el.style.setProperty('--index', index);
            st.timer = setTimeout(() => this.#commit(el, st, next, events), index * this.#params.stagger * 1000);
        });
    }

    #commit(el, st, next, events) {
        st.timer = 0;

        // once: первый вход фиксирует active навсегда, дальше элемент не отслеживается
        let once = st.once && events[0].hook == 'on_enter';
        if (once) [events, next] = [[events[0]], 'active'];

        let prev = st.state;
        st.state = next;
        st.direction = events.at(-1).direction;
        el.setAttribute('state', next);

        for (let { hook, direction, state } of events)
            this.#call(hook, el, { state, prev, direction, progress: st.value, index: st.index });

        if (once) {
            this.#done.add(el);
            this.#release(el, false);
        }
    }

    #progress(el, st, progress) {
        let value = Math.round(progress * 1e4) / 1e4;
        if (value === st.value) return;
        st.value = value;
        el.style.setProperty('--progress', value);
        this.#call('on_progress', el, { state: st.state, prev: st.state, direction: st.direction, progress: value, index: st.index });
    }

    #cross(el, st, crossing) {
        for (let goal of st.crossing)
            if (!crossing.has(goal)) { st.crossing.delete(goal); this.#call('on_uncross', el, goal); }
        for (let goal of crossing)
            if (!st.crossing.has(goal)) { st.crossing.add(goal); this.#call('on_cross', el, goal); }
        el.toggleAttribute('crossing', st.crossing.size > 0);
    }

    // ошибка в пользовательском хуке не должна ронять кадр для остальных элементов
    #call(hook, ...args) {
        try { this[hook](...args); } catch (e) { console.error(e); }
    }
}
