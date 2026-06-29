export default class Route {

    #params = {};
    #methods = {};

    #routes = [];
    #stack = [];
    #dispatched = false;

    params = {};
    query = {};

    #path = '';
    #url = '';

    clone(params) {
        return new Route({
            ...this.#params,
            ...this.#methods,
            ...params,
            parent: this
        });
    }

    constructor(params) {
        params = {
            point: '/',
            name: '',
            match_all: true,
            strict_mode: true,

            before_init: () => {},
            on_init:     () => {},

            ...params
        };

        for (let [key, value] of Object.entries(params))
            if (typeof value == "function") {
                this[key] = value.bind(this);

                this.#methods[key] = value;
            } else
                this.#params[key] = value;

        this.before_init(this.#params);

        this.#stack.push({ prefix: this.#params.point, middlewares: [] });

        if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', () => this.#dispatch());
        else
            queueMicrotask(() => this.#dispatch());

        this.on_init(this.#params);
    }

    #current() {
        return this.#stack[this.#stack.length - 1];
    }

    prefix(uri) {
        let parent = this.#current();

        this.#stack.push({
            prefix: '/' + this.#trim(parent.prefix) + '/' + this.#trim(uri) + '/',
            middlewares: [...parent.middlewares],
        });

        return this;
    }

    group(closure) {
        closure();

        if (this.#stack.length > 1) this.#stack.pop();
    }

    middleware(mids) {
        let parent = this.#current();

        parent.middlewares = parent.middlewares.concat(Array.isArray(mids) ? mids : [mids]);

        return this;
    }

    get(uri, closure, params = {}) {
        return this.#add_route(uri, closure, params);
    }

    #trim(uri) {
        return String(uri).replace(/^\/+|\/+$/g, '');
    }

    #add_route(uri, closure, params = {}) {
        if (typeof closure != 'function')
            throw new Error('Route: обработчик должен быть замыканием');

        if (typeof params == 'string') params = { alias: params };

        let base = this.#current();
        let strict = params.strict_mode ?? this.#params.strict_mode;

        let full = strict
            ? ('/' + this.#trim(base.prefix) + '/' + this.#trim(uri) + '/').replace(/\/{2,}/g, '/')
            : (this.#trim(base.prefix) + '/' + this.#trim(uri)).replace(/\/{2,}/g, '/');

        for (let route of this.#routes)
            if (route.pattern === full)
                throw new Error(`Route: дубликат маршрута: ${full}`);

        let { regex, names } = this.#compile(full);

        this.#routes.push({
            pattern: full,
            uri,
            alias: params.alias ?? null,
            closure,
            middlewares: base.middlewares,
            names,
            regex,
            strict_mode: strict,
        });

        return this;
    }

    #compile(pattern) {
        let names = [];
        let escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        let body = pattern.replace(/\{(\w+)\}|\*|[^{*]+/g, (token, name) => {
            if (name !== undefined) { names.push(name); return '([^/]+)'; }
            if (token === '*')      { names.push('*');  return '(.*)'; }
            return escape(token);
        });

        let source = '^' + body.replace(/\/+$/, '') + '/?$';

        return { regex: new RegExp(source), names };
    }

    #signal() {
        return this.#params.name ? 'route:' + this.#params.name : 'route';
    }

    #matchEvent(tail) {
        return 'route:' + this.#params.name + ':' + tail;
    }

    #emit(name, detail) {
        document.dispatchEvent(new CustomEvent(name, { detail }));
    }

    #dispatch() {
        if (this.#dispatched) return;
        this.#dispatched = true;

        this.#path = location.pathname;
        this.#url = location.href;
        this.query = Object.fromEntries(new URLSearchParams(location.search));

        this.#emit(this.#signal(), { name: this.#params.name, path: this.#path, query: this.query, url: this.#url });

        for (let route of this.#routes) {
            let m = route.regex.exec(this.#path);
            if (!m) continue;

            let values = m.slice(1).map(Route.#decode);

            this.params = {};
            route.names.forEach((name, i) => { this.params[name] = values[i]; });

            if (route.middlewares.some(mid => !mid.call(this, ...values)))
                continue;

            route.closure.call(this, ...values);

            let detail = {
                name: this.#params.name,
                pattern: route.pattern,
                uri: route.uri,
                alias: route.alias,
                params: this.params,
                values,
                query: this.query,
                path: this.#path,
                url: this.#url,
            };

            if (route.alias) this.#emit(this.#matchEvent(route.alias), detail);
            if (route.uri)   this.#emit(this.#matchEvent(route.uri), detail);

            if (!this.#params.match_all) break;
        }
    }

    get routes() { return this.#routes; }

    get path() { return this.#path; }

    get url() { return this.#url; }

    static #decode(v) {
        if (v == null) return v;
        try { return decodeURIComponent(v); } catch { return v; }
    }
}
