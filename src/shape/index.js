import { elements, find, own, disown } from '../_traits/hasInstanceSymbol.js';
import { parse, build, pick } from './_engine.js';

const NS = 'http://www.w3.org/2000/svg';
const CALLBACKS = ['before_init', 'on_init', 'on_draw'];

// Фигуры по путям из Figma: углы сохраняют размер, прямые тянутся. Внутрь элемента первым ребёнком кладётся
// <svg class="shape-layer"><path/></svg> — фон и обводка (цвета задаёт CSS, st-style [shape]), — а сам
// элемент клипается тем же путём. Форма пересчитывается при смене размера элемента, брейкпоинта
// и атрибутов.
export default class Shape {

    static #CONFIG = ['target'];

    #params = {};
    #methods = {};
    #shapes = new Map();
    #pending = new Set();
    #frame = 0;
    #abort = new AbortController();
    #ro = new ResizeObserver(entries => this.#schedule(entries.map(e => e.target)));
    #mo = new MutationObserver(records => {
        for (let { target } of records) this.#read(target);
        this.#schedule(records.map(r => r.target));
    });

    static find = find;

    get params() { return this.#params; }

    get elements() { return [...this.#shapes.keys()]; }

    clone(params) {
        return new Shape({ ...this.#params, ...this.#methods, ...params, parent: this });
    }

    constructor(params) {
        params = {
            target: '[shape]',
            attribute: 'shape',
            // Шкала st-style по умолчанию: фигура для брейкпоинта — атрибут shape-<ключ>, действует от min и шире.
            breakpoints: { xs: 360, sm: 576, md: 768, lp: 1024, lg: 1280, dt: 1536, xl: 1920 },
            // px макета в 1rem: координаты переводятся в rem и масштабируются вместе с вёрсткой.
            // 0 — без масштаба, 1px макета = 1px экрана.
            scale: 10,
            ...Object.fromEntries(CALLBACKS.map(k => [k, () => {}])),
            ...params
        };

        for (let [key, value] of Object.entries(params))
            if (typeof value == 'function' && !Shape.#CONFIG.includes(key)) {
                this[key] = value.bind(this);
                this.#methods[key] = value;
            } else
                this.#params[key] = value;

        this.before_init(this.#params);

        let signal = this.#abort.signal, redraw = () => this.#schedule(this.elements);
        for (let min of Object.values(this.#params.breakpoints))
            matchMedia(`(min-width: ${min}px)`).addEventListener('change', redraw, { signal });

        for (let el of elements(this.#params.target)) this.#bind(el);

        this.on_init(this.#params);
    }

    #names() {
        let a = this.#params.attribute;
        return [a, ...Object.keys(this.#params.breakpoints).map(bp => `${a}-${bp}`)];
    }

    #bind(el) {
        if (this.#shapes.has(el)) return;
        let owner = find(el);
        if (owner instanceof Shape && owner !== this) return;

        own(el, this);

        let svg = document.createElementNS(NS, 'svg');
        let path = document.createElementNS(NS, 'path');
        svg.classList.add('shape-layer');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.append(path);
        el.prepend(svg);

        this.#shapes.set(el, { svg, path, clip: el.style.clipPath, variants: {} });
        this.#read(el);
        this.#draw(el);

        this.#ro.observe(el);
        this.#mo.observe(el, { attributes: true, attributeFilter: this.#names() });
    }

    #read(el) {
        let data = this.#shapes.get(el);
        if (!data) return;
        let a = this.#params.attribute;
        data.variants = { base: parse(el.getAttribute(a)) };
        for (let bp of Object.keys(this.#params.breakpoints))
            if (el.hasAttribute(`${a}-${bp}`)) data.variants[bp] = parse(el.getAttribute(`${a}-${bp}`));
    }

    // Пересчёт пачкой в кадре: ResizeObserver и смена брейкпоинта приходят на много элементов сразу.
    #schedule(list) {
        for (let el of list) this.#pending.add(el);
        this.#frame ||= requestAnimationFrame(() => {
            this.#frame = 0;
            let batch = [...this.#pending];
            this.#pending.clear();
            batch.forEach(el => this.#draw(el));
        });
    }

    #draw(el) {
        let data = this.#shapes.get(el);
        if (!data) return;

        let shape = pick(data.variants, this.#params.breakpoints, innerWidth);
        let { width, height } = el.getBoundingClientRect();
        if (!shape || !width || !height) {
            data.path.removeAttribute('d');
            el.style.clipPath = data.clip;
            return;
        }

        let scale = this.#params.scale;
        let k = scale ? parseFloat(getComputedStyle(document.documentElement).fontSize) / scale : 1;
        let d = build(shape, width, height, k);

        data.path.setAttribute('d', d);
        data.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        el.style.clipPath = `path("${d}")`;

        this.on_draw(el, d);
    }

    // Перечитать атрибуты и перерисовать; новые элементы под target — взять под управление.
    refresh(target = this.#params.target) {
        for (let el of elements(target)) {
            if (!this.#shapes.has(el)) { this.#bind(el); continue; }
            this.#read(el);
            this.#draw(el);
        }
        return this;
    }

    // Разобрать: снять наблюдатели и слушатели, убрать svg, вернуть прежний clip-path.
    destroy() {
        this.#abort.abort();
        this.#ro.disconnect();
        this.#mo.disconnect();
        cancelAnimationFrame(this.#frame);
        this.#frame = 0;
        this.#pending.clear();

        for (let [el, { svg, clip }] of this.#shapes) {
            svg.remove();
            el.style.clipPath = clip;
            if (!el.getAttribute('style')) el.removeAttribute('style');
            disown(el, this);
        }

        this.#shapes.clear();
    }
}
