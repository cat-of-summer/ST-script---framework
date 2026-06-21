import { element, find, own } from '../_traits/hasInstanceSymbol.js';
import Core from '../core/index.js';

export default class Loader {
    data = null;

    #params = {};
    #methods = {};
    #request = null;

    static find = find;

    // строка ИЛИ tagged template → первый Element (шаблон-хелпер)
    static html(s, ...v) {
        let str = Array.isArray(s) ? s.reduce((a, p, i) => a + v[i - 1] + p) : s;
        return new DOMParser().parseFromString(str, 'text/html').body.firstElementChild;
    }

    get params()  { return this.#params; }
    get loading() { return !!this.#request; }

    html = Loader.html;

    clone(params) {
        return new Loader({ ...this.#params, ...this.#methods, ...params, parent: this });
    }

    constructor(params) {
        params = {
            target: null,            // селектор/Element контейнера карточек
            source: null,            // CSS-селектор карточки в HTML-ответе
            mode: 'append',          // append | replace | prepend
            allow_interrupt: false,

            render(item) { return item; },                 // деф.: identity (HTML-элемент)
            count() { return this.data?.length ?? 0; },    // сколько раз звать render
            extract(response) {                            // response → this.data (умно лишь для HTML)
                return response instanceof Document
                    ? [...response.querySelectorAll(this.params.source)]
                    : response;
            },

            before_load:  () => {},
            on_load:      () => {},
            before_paste: () => {},
            on_paste:     () => {},
            on_failed:    () => {},
            on_complete:  () => {},
            before_init:  () => {},
            on_init:      () => {},

            ...params
        };

        for (let [key, value] of Object.entries(params))
            if (typeof value == 'function') {
                this[key] = value.bind(this);
                this.#methods[key] = value;
            } else
                this.#params[key] = value;

        this.before_init(this.#params);

        this.target = element(this.#params.target);
        if (this.target) own(this.target, this);

        this.on_init(this.#params);
    }

    load(params = {}) {
        let { mode = this.#params.mode, ...fetch } =
            typeof params == 'string' ? { url: params } : params;

        if (this.#request) {
            if (!this.#params.allow_interrupt) return this;
            this.#request.abort();
        }

        this.target?.setAttribute('state', 'loading');
        this.before_load(fetch);

        let req = Core.fetch(fetch)
            .onSuccess(({ data: response, request }) => {
                this.data = this.extract(response);
                this.on_load(response, request);

                let nodes = [];
                for (let i = 0, n = this.count(); i < n; i++) {
                    let node = this.render(this.data?.[i], i);
                    if (node) nodes.push(node);
                }

                this.before_paste(nodes);

                let frag = document.createDocumentFragment();
                nodes.forEach(n => frag.append(n));

                if (this.target)
                    mode == 'replace' ? this.target.replaceChildren(frag)
                  : mode == 'prepend' ? this.target.prepend(frag)
                  :                     this.target.append(frag);

                this.on_paste(nodes, response);
            })
            .onFailed(payload => this.on_failed(payload))
            .onComplete(payload => this.on_complete(payload));

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
