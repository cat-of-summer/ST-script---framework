import { element, find, own } from '../_traits/hasInstanceSymbol.js';
import Core from '../core/index.js';

export default class Loader {
    #config = {};
    #request = null;

    static find = find;

    // composable-хуки: при per-type оверрайде root → branch вызываются оба
    static HOOKS = ['before_load', 'on_load', 'before_paste', 'on_paste',
                    'on_failed', 'on_complete', 'before_init', 'on_init'];

    // строка ИЛИ tagged template → первый Element (шаблон-хелпер)
    static html(s, ...v) {
        let str = Array.isArray(s) ? s.reduce((a, p, i) => a + v[i - 1] + p) : s;
        return new DOMParser().parseFromString(str, 'text/html').body.firstElementChild;
    }

    get params() {
        let o = {};
        for (let [k, v] of Object.entries(this.#config))
            if (typeof v != 'function' && k != 'formats') o[k] = v;
        return o;
    }
    get loading() { return !!this.#request; }

    html = Loader.html;

    clone(params = {}) {
        return new Loader({
            ...this.#config, ...params,
            formats: { ...this.#config.formats, ...params.formats },
            parent: this,
        });
    }

    constructor(params) {
        this.#config = {
            target: null,            // селектор/Element контейнера
            source: null,            // HTML: CSS-селектор; JSON: dot-path до данных
            mode: 'append',          // append | replace | prepend
            multiple: true,          // true → массив элементов; false → один элемент
            allow_interrupt: false,
            formats: {},             // per-type оверрайды: { json:{…}, html:{…}, text:{…} }

            render(item) { return item; },   // деф.: identity (готовый HTML-элемент)

            before_load:  () => {},
            on_load:      () => {},
            before_paste: () => {},
            on_paste:     () => {},
            on_failed:    () => {},
            on_complete:  () => {},
            before_init:  () => {},
            on_init:      () => {},

            ...params,
        };

        this.#config.before_init.call(this, this.#config);

        this.target = element(this.#config.target);
        if (this.target) own(this.target, this);

        this.#config.on_init.call(this, this.#config);
    }

    // тип ответа из распарсенных Core данных
    #type(response) {
        if (response instanceof Document) return 'html';
        if (typeof response == 'string')  return 'text';
        return 'json';
    }

    // эффективный конфиг для типа: root + formats[type] (хуки складываются, прочее перекрывается)
    #resolve(type) {
        let root = this.#config, branch = root.formats?.[type] ?? {}, out = {};

        for (let k of new Set([...Object.keys(root), ...Object.keys(branch)])) {
            if (k == 'formats') continue;
            let a = root[k], b = branch[k], v;

            if (k in branch && k in root && Loader.HOOKS.includes(k)
                && typeof a == 'function' && typeof b == 'function')
                // on_load прокидывает data по цепочке (return заменяет); прочие хуки — сайд-эффекты
                v = k == 'on_load'
                    ? (response, data, request) => {
                          let d = a.call(this, response, data, request) ?? data;
                          return b.call(this, response, d, request) ?? d;
                      }
                    : (...args) => { a.apply(this, args); b.apply(this, args); };
            else
                v = k in branch ? b : a;

            out[k] = typeof v == 'function' ? v.bind(this) : v;
        }
        return out;
    }

    // response → this.data по source/multiple/type
    #extract(response, cfg, type) {
        if (type == 'html') {
            let root = response.body ?? response.documentElement ?? response;
            if (cfg.source)
                return cfg.multiple ? [...root.querySelectorAll(cfg.source)] : root.querySelector(cfg.source);
            return cfg.multiple ? [...root.children] : root.firstElementChild;
        }
        if (type == 'json')
            return cfg.source ? cfg.source.split('.').reduce((o, k) => o?.[k], response) : response;
        return response; // text
    }

    load(params = {}) {
        let { mode, ...fetch } = typeof params == 'string' ? { url: params } : params;

        if (this.#request) {
            if (!this.#config.allow_interrupt) return this;
            this.#request.abort();
        }

        this.target?.setAttribute('state', 'loading');
        this.#config.before_load.call(this, fetch);

        let req = Core.fetch(fetch)
            .onSuccess(({ data: response, request }) => {
                let type = this.#type(response);
                let cfg  = this.#resolve(type);

                let data = this.#extract(response, cfg, type);
                data = cfg.on_load(response, data, request) ?? data;

                let nodes = [];
                let n = cfg.multiple ? (data?.length ?? 0) : 1;
                for (let i = 0; i < n; i++) {
                    let item = cfg.multiple ? data?.[i] : data;
                    let node = cfg.render(item, i);
                    if (node instanceof Node) nodes.push(node);
                }

                cfg.before_paste(nodes);

                let frag = document.createDocumentFragment();
                nodes.forEach(node => frag.append(node));

                let m = mode ?? cfg.mode;
                if (this.target)
                    m == 'replace' ? this.target.replaceChildren(frag)
                  : m == 'prepend' ? this.target.prepend(frag)
                  :                  this.target.append(frag);

                cfg.on_paste(nodes, response);
            })
            .onFailed(payload => this.#config.on_failed.call(this, payload))
            .onComplete(payload => this.#config.on_complete.call(this, payload));

        // сброс состояния на любом завершении; guard от устаревшего finally при abort+новый запрос
        req.finally(() => {
            if (this.#request !== req) return;
            this.#request = null;
            this.target?.setAttribute('state', 'loaded');
        });

        this.#request = req;
        return this;
    }

    abort() { this.#request?.abort(); return this; }
}
