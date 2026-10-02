import { element, elements, find, own } from '../_traits/hasInstanceSymbol.js';
import { RULES, glue, text } from './_engine.js';

const CALLBACKS = ['before_init', 'on_init', 'on_apply'];

// Общие на все инстансы: исходный текст узла до первой правки и то, что записано последним
const originals = new WeakMap();
const written = new WeakMap();

// Склейка идёт сквозь элементы с display: inline / contents — их текст часть строки соседей.
// Прочие — границы прогона; блочные к тому же заканчивают строку (там работает last_word)
const display = el => getComputedStyle(el).display;
const inline = node => node.nodeType == Node.TEXT_NODE || /^(inline|contents)$/.test(display(node));

export default class Typograf {

    static #CONFIG = ['target', 'root'];

    #params = {};
    #methods = {};
    #states = new Map();
    #done = new WeakSet();
    #io = null;
    #mo = null;

    static find = find;

    // Типографика строки без DOM: Typograf.text('в доме') → 'в доме'
    static text = (str, rules) => text(str, rules);

    get params() { return this.#params; }

    get elements() { return [...this.#states.keys()]; }

    clone(params = {}) {
        return new Typograf({
            ...this.#params, ...this.#methods, ...params,
            rules: { ...this.#params.rules, ...params.rules },
            parent: this,
        });
    }

    constructor(params) {
        params = {
            target: '[typograf]',
            root: null,
            live: false,
            lazy: true,
            rules: {},
            skip: 'script, style, noscript, template, code, pre, textarea, kbd, samp, var, svg, math, '
                + '[contenteditable]:not([contenteditable="false"]), [typograf-skip]',
            ...Object.fromEntries(CALLBACKS.map(k => [k, () => {}])),
            ...params
        };

        for (let [key, value] of Object.entries(params))
            if (typeof value == "function" && !Typograf.#CONFIG.includes(key)) {
                this[key] = value.bind(this);
                this.#methods[key] = value;
            } else
                this.#params[key] = value;

        this.#params.rules = { ...RULES, ...this.#params.rules };

        this.before_init(this.#params);

        let root = this.#params.root == null ? null : element(this.#params.root) ?? null;

        // ленивость: цель обрабатывается, когда до неё остаётся не больше экрана
        this.#io = new IntersectionObserver(entries => {
            for (let entry of entries) {
                let st = this.#states.get(entry.target);
                if (!st) continue;
                st.near = entry.isIntersecting;
                if (st.near && st.dirty) this.#apply(entry.target);
            }
        }, { root, rootMargin: '100%' });

        this.#mo = new MutationObserver(records => this.#mutated(records));
        if (this.#params.live && typeof this.#params.target == 'string')
            this.#mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

        for (let el of elements(this.#params.target)) this.#bind(el);

        this.on_init(this.#params);
    }

    // явный observe берёт и отпущенные раньше элементы
    observe(target) {
        for (let el of elements(target)) {
            this.#done.delete(el);
            this.#bind(el);
        }
        return this;
    }

    // перестать обрабатывать и вернуть исходный текст
    unobserve(target) {
        for (let el of elements(target)) {
            this.#done.add(el);
            this.#release(el);
        }
        return this;
    }

    // обработать сейчас, мимо ленивости
    apply(target) {
        for (let el of target == null ? this.elements : elements(target))
            if (this.#states.has(el)) this.#apply(el);
        return this;
    }

    // Пересканировать target, отпустить ушедшие из DOM, пересчитать цели у экрана
    refresh() {
        this.#scan();
        for (let [el, st] of this.#states) {
            st.dirty = true;
            if (st.near || !this.#params.lazy) this.#apply(el);
        }
        return this;
    }

    #scan() {
        for (let el of this.#states.keys()) if (!el.isConnected) this.#release(el);
        if (typeof this.#params.target == 'string')
            for (let el of elements(this.#params.target)) if (!this.#done.has(el)) this.#bind(el);
    }

    destroy() {
        for (let el of [...this.#states.keys()]) this.#release(el);
        this.#io.disconnect();
        this.#mo.disconnect();
    }

    #bind(el) {
        if (this.#states.has(el)) return;
        let owner = find(el);
        if (owner instanceof Typograf && owner !== this) {
            console.warn('Typograf: элемент уже обрабатывается другим Typograf — пропущен', el);
            return;
        }
        own(el, this);

        // начальная обработка синхронно, если цель у экрана: без мигания сырого текста
        let st = { near: !this.#params.lazy || Typograf.#near(el), dirty: true };
        this.#states.set(el, st);

        if (!this.#params.live) this.#mo.observe(el, { childList: true, subtree: true, characterData: true });
        this.#io.observe(el);
        if (st.near) this.#apply(el);
    }

    #release(el) {
        if (!this.#states.has(el)) return;
        this.#states.delete(el);
        this.#io.unobserve(el);
        this.#restore(el);
        if (find(el) === this) own(el, undefined);
    }

    static #near(el) {
        let r = el.getBoundingClientRect(), h = innerHeight, w = innerWidth;
        return r.bottom >= -h && r.top <= 2 * h && r.right >= -w && r.left <= 2 * w;
    }

    #skipped(node) {
        let el = node.nodeType == Node.ELEMENT_NODE ? node : node.parentElement;
        try { return !!el?.closest(this.#params.skip); } catch { return false; }
    }

    // цель, внутри которой лежит узел
    #target_of(node) {
        for (let p = node; p; p = p.parentNode)
            if (this.#states.has(p)) return p;
        return null;
    }

    // ближайший блок узла: подъём по inline-предкам, не выше цели
    #block_of(node, target) {
        let p = node.nodeType == Node.ELEMENT_NODE ? node : node.parentNode;
        while (p && p !== target && inline(p) && p.parentNode) p = p.parentNode;
        return p;
    }

    #mutated(records) {
        let blocks = new Map();
        let live = false;

        for (let r of records) {
            if (r.type == 'childList' && [...r.addedNodes, ...r.removedNodes].some(n => n instanceof Element))
                live = this.#params.live;

            let target = this.#target_of(r.target);
            if (!target) continue;

            // правки внутри пропускаемого (код, редактор, лог) и вставка/удаление целых
            // пропускаемых элементов текст цели не меняют
            if (this.#skipped(r.target)) continue;
            if (r.type == 'childList' && [...r.addedNodes, ...r.removedNodes]
                    .every(n => n instanceof Element && this.#skipped(n))) continue;

            if (r.type == 'characterData') {
                let node = r.target;
                if (node.nodeValue === written.get(node)) continue;
                // внешняя правка: новое значение — новый оригинал
                originals.delete(node);
                written.delete(node);
            }

            let st = this.#states.get(target);
            st.dirty = true;
            if (!st.near) continue;

            let set = blocks.get(target) ?? new Set();
            set.add(this.#block_of(r.target, target));
            blocks.set(target, set);
        }

        for (let [target, set] of blocks) {
            for (let block of set) if (block.isConnected) this.#process(block);
            this.#states.get(target).dirty = false;
            this.#call('on_apply', target);
        }

        if (live) this.#scan();
    }

    #apply(el) {
        let st = this.#states.get(el);
        if (!st) return;
        st.dirty = false;
        this.#process(el);
        this.#call('on_apply', el);
    }

    // Обойти поддерево, разбить текст на прогоны и склеить каждый
    #process(block) {
        if (this.#skipped(block)) return;

        let runs = [], run = [];
        let close = tail => { if (run.length) runs.push([run, tail]); run = []; };

        let walk = (parent) => {
            for (let node of parent.childNodes) {
                if (node.nodeType == Node.TEXT_NODE) { run.push(node); continue; }
                if (node.nodeType != Node.ELEMENT_NODE) continue;

                if (node.nodeName == 'BR') { close(true); continue; }

                let skip = this.#skipped(node), mode = display(node);
                if (/^(inline|contents)$/.test(mode) && !skip) { walk(node); continue; }

                // граница прогона: блок, inline-block, замещаемый или пропускаемый элемент
                let block = !mode.startsWith('inline');
                close(block);
                if (!skip && !Typograf.#preformatted(node)) walk(node), close(block);
            }
        };

        if (Typograf.#preformatted(block)) return;
        walk(block);
        close(true);

        for (let [nodes, tail] of runs) {
            let parts = nodes.map(n => originals.has(n) && n.nodeValue === written.get(n) ? originals.get(n) : n.nodeValue);
            let out = glue(parts, { ...this.#params.rules, last_word: this.#params.rules.last_word && tail });

            nodes.forEach((node, i) => {
                if (!originals.has(node) || node.nodeValue !== written.get(node)) originals.set(node, node.nodeValue);
                written.set(node, out[i]);
                if (node.nodeValue !== out[i]) node.nodeValue = out[i];
            });
        }
    }

    static #preformatted(el) {
        return /^(pre|break-spaces)/.test(getComputedStyle(el).whiteSpace);
    }

    // вернуть исходный текст узлам, которые с тех пор никто не менял
    #restore(el) {
        let walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let node; (node = walker.nextNode());) {
            if (originals.has(node) && node.nodeValue === written.get(node))
                node.nodeValue = originals.get(node);
            originals.delete(node);
            written.delete(node);
        }
    }

    // ошибка в пользовательском хуке не должна ронять обработку
    #call(hook, ...args) {
        try { this[hook](...args); } catch (e) { console.error(e); }
    }
}
