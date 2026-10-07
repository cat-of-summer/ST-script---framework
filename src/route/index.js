import { closestInPath } from '../_traits/hasInstanceSymbol.js';

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

            // static — один разбор адреса при загрузке; history и hash — SPA:
            // navigate(), переходы назад/вперёд, перехват ссылок.
            mode: 'static',
            intercept_links: true,

            before_init: () => {},
            on_init:     () => {},
            not_found:   () => {},

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

        if (this.#spa()) {
            window.addEventListener(this.#params.mode === 'hash' ? 'hashchange' : 'popstate', () => this.#dispatch());

            if (this.#params.intercept_links)
                document.addEventListener('click', e => this.#intercept(e));
        }

        this.on_init(this.#params);
    }

    #spa() {
        return this.#params.mode === 'history' || this.#params.mode === 'hash';
    }

    navigate(url, { replace = false } = {}) {
        if (!this.#spa()) {
            location[replace ? 'replace' : 'assign'](url);
            return;
        }

        if (this.#params.mode === 'hash') {
            let hash = '#' + String(url).replace(/^#/, '');
            if (hash === location.hash) return this.#dispatch();
            if (replace)
                history.replaceState(history.state, '', hash);
            else
                history.pushState(history.state, '', hash);
        } else
            history[replace ? 'replaceState' : 'pushState'](null, '', url);

        this.#dispatch();
    }

    #intercept(e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        let link = closestInPath(e, 'a[href]');
        if (!link || link.target && link.target !== '_self' || link.hasAttribute('download') || /\bexternal\b/.test(link.rel)) return;

        let raw = link.getAttribute('href');
        if (this.#params.mode === 'hash') {
            if (!raw.startsWith('#')) return;
            e.preventDefault();
            this.navigate(raw);
            return;
        }

        let url = new URL(link.href, location.href);
        if (url.origin !== location.origin) return;
        if (!url.pathname.startsWith('/' + this.#trim(this.#params.point))) return;
        if (url.pathname === location.pathname && url.search === location.search && url.hash) return;

        e.preventDefault();
        this.navigate(url.pathname + url.search + url.hash);
    }

    // Текущий адрес: в hash-режиме путь и query живут после #.
    #read() {
        if (this.#params.mode !== 'hash')
            return { path: location.pathname, search: location.search };

        let hash = location.hash.slice(1) || '/';
        let index = hash.indexOf('?');

        return index === -1
            ? { path: hash, search: '' }
            : { path: hash.slice(0, index) || '/', search: hash.slice(index) };
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
        if (this.#dispatched && !this.#spa()) return;
        this.#dispatched = true;

        let { path, search } = this.#read();

        this.#path = path;
        this.#url = location.href;
        this.query = Object.fromEntries(new URLSearchParams(search));
        this.params = {};

        let matched = false;

        this.#emit(this.#signal(), { name: this.#params.name, path: this.#path, query: this.query, url: this.#url });

        for (let route of this.#routes) {
            let m = route.regex.exec(this.#path);
            if (!m) continue;

            let values = m.slice(1).map(Route.#decode);

            this.params = {};
            route.names.forEach((name, i) => { this.params[name] = values[i]; });

            if (route.middlewares.some(mid => !mid.call(this, ...values)))
                continue;

            matched = true;
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

        if (!matched) {
            this.not_found(this.#path);
            this.#emit(this.#matchEvent('404'), { name: this.#params.name, path: this.#path, query: this.query, url: this.#url });
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
