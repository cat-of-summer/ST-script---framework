export default class App extends HTMLElement {
    static #boolean_attributes = new Set(['disabled', 'checked', 'readonly', 'required', 'selected', 'hidden', 'open', 'autofocus']);
    // Атрибут у них - только начальное значение: после действий пользователя браузер
    // смотрит на свойство, поэтому привязка выставляет и его.
    static #live_properties = new Set(['checked', 'selected', 'value']);
    static #apps = new Map();
    static #instances = new Set();
    static #selectSync = new WeakMap();

    static create(options) {
        let { app, setup = () => {}, template = ``, events = {} } = options;
        if (App.#apps.has(app))
            throw new Error(`Application "${app}" already exists!`);
        App.#apps.set(app, { setup, template, events, config: options });
        App.#instances.forEach(instance => {
            if (instance.#booted !== true)
                instance.#boot();
        });
    }

    static extend(app, options = {}) {
        let base = App.#apps.get(app);
        if (!base)
            throw new Error(`Application "${app}" not found!`);
        let baseConfig = base.config;
        // Через дескрипторы, а не spread: spread вычисляет геттеры и замораживает их значения.
        let merged = Object.defineProperties({}, {
            ...Object.getOwnPropertyDescriptors(baseConfig),
            ...Object.getOwnPropertyDescriptors(options)
        });
        if (baseConfig.events || options.events)
            merged.events = { ...baseConfig.events, ...options.events };
        return App.create(merged);
    }

    #booted = false;
    #template = '';
    #rendered = false;
    #deps = new Map();
    #activeEffect = null;
    #updateQueue = new Set();
    #flushing = false;
    #bindings = [];
    #loopContext = null;
    #getters = new Map();
    #attrObserver = null;
    #watchers = [];
    #triggeredKeys = new Set();
    #pendingFlush = false;
    #tickWaiters = [];
    // Тип значения из конфига: по нему приводится строка из атрибута :prop.
    #types = new Map();
    #methodWrappers = new Map();
    #renderToken = 0;
    #appliedTemplate = '';
    #tornDown = false;
    #templated = false;

    constructor() {
        super();
        App.#instances.add(this);
    }

    #cleanupBindings(bindings) {
        if (!bindings || !bindings.length) return;
        bindings.forEach(binding => {
            // Слушатели снимаются в следующей задаче. Между слушателями пользовательского
            // события браузер выполняет микрозадачи: #model меняет данные, #if убирает ветку,
            // и снятый сразу @input того же события уже не был бы вызван.
            if (binding.type === 'event' && binding.element && binding.handler)
                setTimeout(() => binding.element.removeEventListener(binding.eventName, binding.handler));
            else if (binding.type === 'model' && binding.element && binding.handler) {
                let eventName = binding.element.tagName === 'SELECT' ? 'change' : 'input';
                setTimeout(() => binding.element.removeEventListener(eventName, binding.handler));
            } else if (binding.type === 'attrSync' && binding.unwatch)
                binding.unwatch();
            binding.dispose?.();

            if (binding.effect) {
                this.#deps.forEach((effects, key) => {
                    effects.delete(binding.effect);
                    if (effects.size === 0)
                        this.#deps.delete(key);
                });
                this.#updateQueue.delete(binding.effect);
            }
        });
    }

    get template() {
        return this.#template;
    }

    get attrs() {
        return {
            get: (name) => this.getAttribute(name),
            set: (name, value) => this.setAttribute(name, value),
            remove: (name) => this.removeAttribute(name),
            has: (name) => this.hasAttribute(name),
            toggle: (name, force) => this.toggleAttribute(name, force),
            keys: () => Array.from(this.attributes).map(a => a.name),
            entries: () => Array.from(this.attributes).map(a => [a.name, a.value])
        };
    }

    addEventListener(type, listener, options) {
        if ((type === 'setup' || type === 'rendered') && this.#rendered) {
            queueMicrotask(() => {
                let event = new CustomEvent(type);
                if (typeof listener === 'function')
                    listener.call(this, event);
                else
                    listener?.handleEvent?.(event);
            });
            return;
        }
        super.addEventListener(type, listener, options);
    }

    dispatchEvent(event, detail = null, options = {}) {
        if (typeof event === 'string') {
            let customEvent = new CustomEvent(event, {cancelable: true, ...options, detail});
            return super.dispatchEvent(customEvent);
        }
        return super.dispatchEvent(event);
    }

    applyTemplate(template = '') {
        let tplContent = template || this.#template;
        this.#templated = true;
        this.#appliedTemplate = tplContent;
        this.#cleanupBindings(this.#bindings);
        this.#bindings = [];
        this.innerHTML = '';
        if (tplContent) {
            let tpl = document.createElement('template');
            tpl.innerHTML = tplContent.trim();
            let fragment = tpl.content.cloneNode(true);
            this.#processChildren(fragment);
            this.#mount(fragment);
        }
        let token = ++this.#renderToken;
        new Promise(resolve => {
            let timeout = null;
            let observer;
            let setMyTimeout = () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    observer.disconnect();
                    this.#promiseCallback(Array.from(this.children)).then(resolve);
                }, 0);
            };
            observer = new MutationObserver((r) => {
                if (r.some(rec => rec.type === 'childList'))
                    setMyTimeout();
            });
            observer.observe(this, { childList: true });
            setMyTimeout();
        }).then(() => {
            if (token !== this.#renderToken) return;
            this.#rendered = true;
            this.dispatchEvent('rendered');
        });
    }

    #mount(node) {
        HTMLElement.prototype.appendChild.call(this, node);
    }

    clone(options = {}) {
        let app = this.attrs.get('app');
        return App.extend(app, options);
    }

    watch(source, callback, options = {}) {
        if (typeof callback !== 'function') return () => {};
        let { deep = false, immediate = false } = options;
        if (typeof source === 'string' && source.endsWith('()')) {
            let methodName = source.slice(0, -2);
            let original = this[methodName];
            if (typeof original !== 'function') return () => {};
            let entry = this.#methodWrappers.get(methodName);
            if (!entry) {
                entry = { original, handlers: [] };
                this.#methodWrappers.set(methodName, entry);
                let wrapper = (...args) => {
                    let result = original.apply(this, args);
                    let runHandlers = (res) => {
                        for (let h of [...entry.handlers])
                            h.callback(args, res, h.unwatch);
                    };
                    if (result instanceof Promise)
                        return result.then(r => { runHandlers(r); return r; });
                    runHandlers(result);
                    return result;
                };
                this[methodName] = wrapper;
            }
            let unwatch = () => {
                let idx = entry.handlers.findIndex(h => h.unwatch === unwatch);
                if (idx !== -1) entry.handlers.splice(idx, 1);
                if (entry.handlers.length === 0) {
                    this[methodName] = entry.original;
                    this.#methodWrappers.delete(methodName);
                }
            };
            entry.handlers.push({ callback, unwatch });
            return unwatch;
        }
        if (typeof source === 'string') {
            let key = source;
            let unwatch = () => {
                let idx = this.#watchers.findIndex(w => w.unwatch === unwatch);
                if (idx !== -1) this.#watchers.splice(idx, 1);
            };
            let w = { type: 'key', key, callback, deep, immediate, lastValue: undefined, unwatch };
            this.#watchers.push(w);
            if (immediate) {
                let val = this.#getValueByPath(key);
                w.lastValue = deep && val !== null && typeof val === 'object'
                    ? JSON.parse(JSON.stringify(val)) : val;
                callback(val, undefined, unwatch);
            }
            return unwatch;
        }
        if (typeof source === 'function') {
            let getter = source;
            let lastValue = undefined;
            let entry = { type: 'getter', getter, callback, deep, lastValue, effect: null, unwatch: null };
            this.#watchers.push(entry);
            let unwatch = () => {
                let idx = this.#watchers.indexOf(entry);
                if (idx !== -1) this.#watchers.splice(idx, 1);
                if (entry.effect) {
                    this.#deps.forEach((effects, k) => {
                        effects.delete(entry.effect);
                        if (effects.size === 0) this.#deps.delete(k);
                    });
                    this.#updateQueue.delete(entry.effect);
                }
            };
            entry.unwatch = unwatch;
            let effectFn = () => {
                let newVal = getter.call(this);
                let changed = deep ? !this.#deepEqual(newVal, lastValue) : newVal !== lastValue;
                if (changed) {
                    let oldVal = lastValue;
                    lastValue = deep && newVal !== null && typeof newVal === 'object'
                        ? JSON.parse(JSON.stringify(newVal)) : newVal;
                    callback(newVal, oldVal, entry.unwatch);
                }
            };
            let effect = this.#effect(effectFn);
            entry.effect = effect;
            return unwatch;
        }
        return () => {};
    }

    unwatch() {
        [...this.#watchers].forEach(w => w.unwatch());
        this.#methodWrappers.forEach(entry => {
            [...entry.handlers].forEach(h => h.unwatch());
        });
    }

    hasWatchers() {
        let methodCount = 0;
        this.#methodWrappers.forEach(entry => { methodCount += entry.handlers.length; });
        return this.#watchers.length + methodCount;
    }

    watched(source, callback, options = {}) {
        if (typeof source === 'string' && source.endsWith('()')) {
            let methodName = source.slice(0, -2);
            let entry = this.#methodWrappers.get(methodName);
            if (entry) [...entry.handlers].forEach(h => h.unwatch());
        } else if (typeof source === 'string') {
            this.#watchers
                .filter(w => w.type === 'key' && w.key === source)
                .forEach(w => w.unwatch());
        } else if (typeof source === 'function') {
            this.#watchers
                .filter(w => w.type === 'getter' && w.getter === source)
                .forEach(w => w.unwatch());
        }
        return this.watch(source, callback, options);
    }

    #track(key) {
        if (this.#activeEffect) {
            if (!this.#deps.has(key))
                this.#deps.set(key, new Set());
            this.#deps.get(key).add(this.#activeEffect);
        }
    }

    #trigger(key) {
        this.#triggeredKeys.add(key);
        let effects = this.#deps.get(key);
        if (effects)
            effects.forEach(effect => this.#updateQueue.add(effect));
        if (this.#flushing) {
            this.#pendingFlush = true;
            return;
        }
        this.#flushing = true;
        const runFlush = () => {
            this.#updateQueue.forEach(effect => {
                try {
                    effect();
                } catch (e) {
                    console.error('Effect execution error:', e);
                }
            });
            this.#updateQueue.clear();
            
            let keys = Array.from(this.#triggeredKeys);
            let toRun = new Set();
            for (let key of keys) {
                for (let w of this.#watchers) {
                    if (w.type !== 'key') continue;
                    let match = w.key === key || (w.deep && (key === w.key || key.startsWith(w.key + '.')));
                    if (match) toRun.add(w);
                }
            }
            for (let w of toRun) {
                if (w.type !== 'key') continue;
                let newVal = this.#getValueByPath(w.key);
                let changed = w.deep ? !this.#deepEqual(newVal, w.lastValue) : newVal !== w.lastValue;
                if (!changed) continue;
                let oldVal = w.lastValue;
                w.lastValue = w.deep && newVal !== null && typeof newVal === 'object'
                    ? JSON.parse(JSON.stringify(newVal)) : newVal;
                try {
                    w.callback(newVal, oldVal, w.unwatch);
                } catch (e) {
                    console.error('Watcher callback error:', e);
                }
            }

            this.#triggeredKeys.clear();
            this.#flushing = false;
            if (this.#pendingFlush) {
                this.#pendingFlush = false;
                this.#flushing = true;
                Promise.resolve().then(runFlush);
            } else
                this.#tickWaiters.splice(0).forEach(resolve => resolve());
        };
        Promise.resolve().then(runFlush);
    }

    // Промис, который разрешается после того, как DOM догнал данные: очередь эффектов
    // и колбэков watch() пуста. Первую отрисовку вложенных <st-app> он не ждёт — для неё rendered.
    nextTick() {
        if (!this.#flushing)
            return Promise.resolve();
        return new Promise(resolve => this.#tickWaiters.push(resolve));
    }

    #getValueByPath(path) {
        return path.split('.').reduce((o, k) => o?.[k], this);
    }

    #deepEqual(a, b) {
        if (Object.is(a, b)) return true;
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
        let keysA = Object.keys(a);
        let keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        for (let k of keysA) {
            if (!keysB.includes(k) || !this.#deepEqual(a[k], b[k])) return false;
        }
        return true;
    }

    static #raw(value) {
        return value !== null && typeof value === 'object' ? value.__raw ?? value : value;
    }

    // Один прокси на пару «объект + путь»: items.indexOf(item) и сравнение по ссылке
    // работают. Путь входит в ключ, потому что зависимости отслеживаются по пути.
    #proxyCache = new WeakMap();

    #createReactiveProxy(obj, path = []) {
        if (obj === null || typeof obj !== 'object' || obj.__isReactive)
            return obj;
        let pathKey = path.join('.');
        let byPath = this.#proxyCache.get(obj);
        if (!byPath)
            this.#proxyCache.set(obj, byPath = new Map());
        if (byPath.has(pathKey))
            return byPath.get(pathKey);
        let $this = this;
        let proxy = new Proxy(obj, {
            get(target, prop, receiver) {
                if (prop === '__isReactive') return true;
                if (prop === '__raw') return target;
                const pathSegment = typeof prop === 'symbol' ? '<symbol>' : prop;
                let fullPath = [...path, pathSegment].join('.');
                $this.#track(fullPath);
                let value = Reflect.get(target, prop, receiver);
                if (value !== null && typeof value === 'object' && !value.__isReactive)
                    return $this.#createReactiveProxy(value, [...path, pathSegment]);
                return value;
            },
            set(target, prop, value, receiver) {
                let oldValue = target[prop];
                if (oldValue === value) return true;
                let result = Reflect.set(target, prop, value, receiver);
                const setPathSegment = typeof prop === 'symbol' ? '<symbol>' : prop;
                let fullPath = [...path, setPathSegment].join('.');
                $this.#trigger(fullPath);
                if (Array.isArray(target) && (prop === 'length' || !isNaN(prop))) {
                    let arrayPath = path.join('.');
                    if (arrayPath)
                        $this.#trigger(arrayPath);
                }
                return result;
            },
            deleteProperty(target, prop) {
                let result = Reflect.deleteProperty(target, prop);
                const delPathSegment = typeof prop === 'symbol' ? '<symbol>' : prop;
                let fullPath = [...path, delPathSegment].join('.');
                $this.#trigger(fullPath);
                return result;
            }
        });
        byPath.set(pathKey, proxy);
        return proxy;
    }

    #createReactiveFunction(fn, key) {
        let $this = this;
        return new Proxy(fn, {
            apply(target, thisArg, args) {
                let result = Reflect.apply(target, $this, args);
                // Вызов из выражения шаблона (форматтер в {{ }}) не перерисовывает
                // читателей метода: иначе каждый рендер порождает лишний проход flush.
                if ($this.#activeEffect)
                    return result;
                if (result instanceof Promise)
                    return result.then(r => {
                        $this.#trigger(key);
                        return r;
                    });
                $this.#trigger(key);
                return result;
            }
        });
    }

    #effect(fn) {
        let capturedLoopCtx = this.#loopContext ? { ...this.#loopContext } : null;
        let wrappedEffect = () => {
            // Стек, а не обнуление: вложенный эффект (#for внутри ветки #if) не должен
            // сбрасывать отслеживание внешнего.
            let prevEffect = this.#activeEffect;
            this.#activeEffect = wrappedEffect;
            try {
                // Контекст цикла восстанавливается целиком, включая #loopContext: привязки,
                // созданные при перезапуске (ветка #if внутри строки), видят переменные строки.
                if (capturedLoopCtx)
                    this.#withLoopVars(capturedLoopCtx, fn);
                else
                    fn();
            } finally {
                this.#activeEffect = prevEffect;
            }
        };
        wrappedEffect();
        return wrappedEffect;
    }

    static #compiled = new Map();

    static #compile(body) {
        let fn = App.#compiled.get(body);
        if (!fn) {
            fn = new Function('$s', '$event', '$__v', `with($s) { ${body} }`);
            App.#compiled.set(body, fn);
        }
        return fn;
    }

    // Scope для with: свойства компонента без Element.prototype[Symbol.unscopables],
    // иначе методы remove(), append() и т. п. в шаблоне не видны.
    #scopeProxy = null;

    get #scope() {
        return this.#scopeProxy ??= new Proxy(this, {
            has: (target, key) => typeof key === 'string' && key in target,
            get: (target, key) => {
                if (key === Symbol.unscopables) return undefined;
                let value = Reflect.get(target, key);
                this.#warnNotReactive(key, value);
                // Вызов f() внутри with передаёт this = scope; методам прототипа (нативным
                // и с приватными полями) нужен сам элемент.
                return typeof value === 'function' && !Object.hasOwn(target, key)
                    ? value.bind(target) : value;
            },
            set: (target, key, value) => Reflect.set(target, key, value)
        });
    }

    #warnedKeys = new Set();

    // Поля конфига — аксессоры на элементе. Обычное собственное свойство (this.loaded = …
    // без объявления в конфиге) шаблон прочитает, но перерисовки по нему не будет.
    #warnNotReactive(key, value) {
        if (typeof key !== 'string' || typeof value === 'function' || this.#warnedKeys.has(key)) return;
        if (this.#loopContext && key in this.#loopContext) return;
        let descriptor = Object.getOwnPropertyDescriptor(this, key);
        if (!descriptor || !('value' in descriptor)) return;
        this.#warnedKeys.add(key);
        console.warn(`<st-app app="${this.getAttribute('app') ?? ''}">: свойство "${key}" не объявлено в конфиге и не реактивно`);
    }

    #evalExpression(expr) {
        try {
            return App.#compile(`return (${expr});`).call(this, this.#scope);
        } catch (e) {
            console.warn('Expression evaluation error:', expr, e);
            return undefined;
        }
    }

    #execStatement(statement, event = null) {
        try {
            return App.#compile(statement).call(this, this.#scope, event);
        } catch (e) {
            console.error('Statement execution error:', statement, e);
        }
    }

    #assign(prop, value) {
        try {
            App.#compile(`${prop} = $__v;`).call(this, this.#scope, null, value);
        } catch (e) {
            console.error('Model binding error:', prop, e);
        }
    }

    #processTextInterpolation(textNode) {
        let originalText = textNode.nodeValue;
        let parts = [];
        let expressions = [];
        let lastIndex = 0;
        let regex = /\{\{(.+?)\}\}/g;
        let match;
        while ((match = regex.exec(originalText)) !== null) {
            if (match.index > lastIndex)
                parts.push(originalText.substring(lastIndex, match.index));
            let expr = match[1].trim();
            parts.push(null);
            expressions.push({ index: parts.length - 1, expr });
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < originalText.length)
            parts.push(originalText.substring(lastIndex));
        let effect = this.#effect(() => {
            expressions.forEach(({ index, expr }) => {
                let value = this.#evalExpression(expr);
                parts[index] = value == null ? '' : String(value);
            });
            textNode.nodeValue = parts.join('');
        });
        this.#bindings.push({ type: 'text', node: textNode, effect });
    }

    #bindEvent(element, attr) {
        // @input.self — только события самого элемента, без всплывших от потомков:
        // так событие вложенного <st-app> не путается с нативным input из его полей.
        let [eventName, ...modifiers] = attr.name.slice(1).split('.');
        let self = modifiers.includes('self');
        let statement = attr.value;
        let capturedLoopCtx = this.#loopContext ? { ...this.#loopContext } : null;
        let handler = (e) => {
            if (self && e.target !== element) return;
            if (capturedLoopCtx)
                this.#withLoopVars(capturedLoopCtx, () => this.#execStatement(statement, e));
            else
                this.#execStatement(statement, e);
        };
        element.addEventListener(eventName, handler);
        this.#bindings.push({ type: 'event', element, eventName, handler });
    }

    // Сырой HTML без обработки директив внутри. Только для доверенной разметки.
    #bindHtml(element, attr) {
        let expr = attr.value;
        let effect = this.#effect(() => {
            let value = this.#evalExpression(expr);
            element.innerHTML = value == null ? '' : String(value);
        });
        this.#bindings.push({ type: 'html', element, effect });
    }

    #bindShow(element, attr) {
        let expr = attr.value;
        let effect = this.#effect(() => {
            let visible = this.#evalExpression(expr);
            if (visible)
                element.style.display = '';
            else
                element.style.display = 'none';
        });
        this.#bindings.push({ type: 'show', element, effect });
    }

    #bindModel(element, attr) {
        let prop = attr.value;
        let effect = this.#effect(() => {
            let value = this.#evalExpression(prop);
            if (element.tagName === 'INPUT' && element.type === 'checkbox')
                element.checked = !!value;
            else if (element.tagName === 'INPUT' && element.type === 'radio')
                element.checked = element.value === value;
            else if (element.tagName === 'SELECT') {
                // Опции из #for появляются позже эффекта: ставим значение ещё раз после них.
                let sync = () => { element.value = value; };
                App.#selectSync.set(element, sync);
                sync();
                queueMicrotask(sync);
            } else
                element.value = value == null ? '' : value;
        });
        let capturedLoopCtx = this.#loopContext ? { ...this.#loopContext } : null;
        let eventName = element.tagName === 'SELECT' ? 'change' : 'input';
        let handler = (e) => {
            let newValue;
            if (element.type === 'checkbox')
                newValue = element.checked;
            else if (element.type === 'number' || element.type === 'range')
                newValue = element.valueAsNumber;
            else
                newValue = element.value;
            if (capturedLoopCtx)
                this.#withLoopVars(capturedLoopCtx, () => this.#assign(prop, newValue));
            else
                this.#assign(prop, newValue);
        };
        element.addEventListener(eventName, handler);
        this.#bindings.push({ type: 'model', element, effect, handler });
    }

    #bindConditional(element, attr) {
        let expr = attr.value;
        let placeholder = document.createComment(`if: ${expr}`);
        element.parentNode.insertBefore(placeholder, element);
        element.removeAttribute(attr.name);
        // Ветка хранит чистый шаблон и собирается заново при каждом показе:
        // привязки скрытой ветки сняты, её прежний узел мёртв.
        let chain = [{ expr, template: element.cloneNode(true) }];
        let nextSibling = element.nextElementSibling;
        while (nextSibling) {
            if (nextSibling.hasAttribute('#else-if')) {
                let elseIfExpr = nextSibling.getAttribute('#else-if');
                nextSibling.removeAttribute('#else-if');
                chain.push({ expr: elseIfExpr, template: nextSibling.cloneNode(true) });
                let next = nextSibling.nextElementSibling;
                nextSibling.remove();
                nextSibling = next;
            } else if (nextSibling.hasAttribute('#else')) {
                nextSibling.removeAttribute('#else');
                chain.push({ expr: 'true', template: nextSibling.cloneNode(true) });
                nextSibling.remove();
                break;
            } else
                break;
        }
        element.remove();
        let current = { branch: null, node: null, bindings: [] };
        let hide = () => {
            current.node?.remove();
            this.#cleanupBindings(current.bindings);
            current.node = null;
            current.bindings = [];
        };
        let effect = this.#effect(() => {
            let matchedBranch = chain.find(branch => this.#evalExpression(branch.expr)) ?? null;
            if (current.branch === matchedBranch) return;
            hide();
            current.branch = matchedBranch;
            if (!matchedBranch) return;
            let node = matchedBranch.template.cloneNode(true);
            placeholder.parentNode.insertBefore(node, placeholder.nextSibling);
            current.bindings = this.#collectBindings(() => this.#processNode(node));
            current.node = node;
        });
        this.#bindings.push({ type: 'conditional', placeholder, effect, dispose: hide });
    }

    // Привязки, созданные внутри fn, забираются из общего списка: ими владеет
    // вызывающий (ветка #if, строка #for) и снимает их вместе со своим узлом.
    #collectBindings(fn) {
        let before = this.#bindings.length;
        fn();
        return this.#bindings.splice(before);
    }

    // Временно кладёт переменные цикла на компонент, чтобы их видели выражения.
    #withLoopVars(vars, fn) {
        let saved = {};
        for (let key of Object.keys(vars)) {
            saved[key] = this[key];
            this[key] = vars[key];
        }
        let previousLoopCtx = this.#loopContext;
        this.#loopContext = { ...previousLoopCtx, ...vars };
        try {
            return fn();
        } finally {
            this.#loopContext = previousLoopCtx;
            for (let key of Object.keys(saved)) {
                if (saved[key] !== undefined)
                    this[key] = saved[key];
                else
                    delete this[key];
            }
        }
    }

    #bindLoop(element, attr) {
        let loopExpr = attr.value;
        let match = loopExpr.match(/^\s*(\w+)\s+in\s+(.+)$/);
        if (!match) {
            console.error('Invalid for syntax:', loopExpr);
            return;
        }
        let itemName = match[1];
        let collectionExpr = match[2];
        let keyExpr = element.getAttribute('#key');
        element.removeAttribute(attr.name);
        element.removeAttribute('#key');
        // Якорь вместо запомненного родителя: на верхнем уровне шаблона родитель —
        // DocumentFragment, который после монтирования пуст.
        let anchor = document.createComment(`for: ${loopExpr}`);
        element.parentNode.insertBefore(anchor, element);
        let template = element.cloneNode(true);
        element.remove();
        let usesIndex = template.outerHTML.includes('$index');
        let rendered = new Map();
        let dispose = entry => {
            entry.node.remove();
            this.#cleanupBindings(entry.bindings);
        };
        let effect = this.#effect(() => {
            let collection = this.#evalExpression(collectionExpr);
            let entries = [];
            if (Array.isArray(collection))
                entries = collection.map((value, index) => ({ value, key: undefined, index }));
            else if (collection !== null && typeof collection === 'object')
                entries = Object.entries(collection).map(([key, value], index) => ({ value, key, index }));
            let next = new Map();
            let ordered = [];
            entries.forEach(({ value, key, index }) => {
                let vars = { [itemName]: value, $index: index };
                if (key !== undefined) vars.$key = key;
                let id = keyExpr ? this.#withLoopVars(vars, () => this.#evalExpression(keyExpr)) : Symbol();
                if (keyExpr && next.has(id))
                    console.warn('Duplicate #key in #for:', loopExpr, id);
                let prev = rendered.get(id);
                // Узел переиспользуется, только если не изменились ни элемент, ни путь к нему:
                // эффекты строки отслеживают путь items.N.*, а не сам объект.
                if (prev && App.#raw(prev.value) === App.#raw(value) && (prev.index === index || !usesIndex && prev.key === key && !Array.isArray(collection))) {
                    rendered.delete(id);
                    next.set(id, prev);
                    ordered.push(prev);
                    return;
                }
                let node = template.cloneNode(true);
                let bindings = this.#withLoopVars(vars, () => this.#collectBindings(() => this.#processNode(node)));
                let entry = { node, bindings, value, index, key };
                next.set(id, entry);
                ordered.push(entry);
            });
            rendered.forEach(dispose);
            rendered = next;
            let ref = anchor;
            for (let i = ordered.length - 1; i >= 0; i--) {
                let node = ordered[i].node;
                if (node.nextSibling !== ref)
                    anchor.parentNode.insertBefore(node, ref);
                ref = node;
            }
            let select = anchor.parentNode?.closest?.('select');
            if (select) App.#selectSync.get(select)?.();
        });
        this.#bindings.push({ type: 'loop', anchor, template, effect, dispose: () => {
            rendered.forEach(dispose);
            rendered.clear();
        } });
    }

    #bindAttribute(element, attr) {
        let attrName = attr.name;
        let attrValue = attr.value;
        let parts = [];
        let expressions = [];
        let lastIndex = 0;
        let regex = /\{\{(.+?)\}\}/g;
        let match;
        while ((match = regex.exec(attrValue)) !== null) {
            if (match.index > lastIndex)
                parts.push(attrValue.substring(lastIndex, match.index));
            let expr = match[1].trim();
            parts.push(null);
            expressions.push({ index: parts.length - 1, expr });
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < attrValue.length)
            parts.push(attrValue.substring(lastIndex));
        let effect = this.#effect(() => {
            expressions.forEach(({ index, expr }) => {
                let value = this.#evalExpression(expr);
                parts[index] = value == null ? '' : String(value);
            });
            let finalValue = parts.join('');
            let live = App.#live_properties.has(attrName) && attrName in element
                && (attrName !== 'value' || element.tagName === 'INPUT');
            if (App.#boolean_attributes.has(attrName)) {
                let falsy = finalValue === '' || finalValue === 'false' || finalValue === '0' || finalValue === 'null' || finalValue === 'undefined' || !finalValue;
                if (falsy)
                    element.removeAttribute(attrName);
                else
                    element.setAttribute(attrName, '');
                if (live)
                    element[attrName] = !falsy;
            } else {
                element.setAttribute(attrName, finalValue);
                // Сравнение - чтобы не сбрасывать курсор в поле при каждом проходе эффекта.
                if (live && element.value !== finalValue)
                    element.value = finalValue;
            }
        });
        this.#bindings.push({ type: 'attribute', element, attrName, effect });
    }

    #processDirectives(element) {
        let attrs = Array.from(element.attributes);
        for (let attr of attrs) {
            if (attr.name === '#if') {
                this.#bindConditional(element, attr);
                element.removeAttribute(attr.name);
                return true;
            }
            else if (attr.name === '#for') {
                this.#bindLoop(element, attr);
                element.removeAttribute(attr.name);
                return true;
            }
            else if (attr.name === '#html') {
                this.#bindHtml(element, attr);
                element.removeAttribute(attr.name);
                return true;
            }
            else if (attr.name === '#show') {
                this.#bindShow(element, attr);
                element.removeAttribute(attr.name);
            }
            else if (attr.name === '#model') {
                this.#bindModel(element, attr);
                element.removeAttribute(attr.name);
            }
            else if (attr.name === '#once')
                element.removeAttribute(attr.name);
            else if (attr.name === '#pre') {
                element.removeAttribute(attr.name);
                return true;
            }
            else if (attr.name.startsWith('@')) {
                this.#bindEvent(element, attr);
                element.removeAttribute(attr.name);
            }
            else if (/\{\{.+?\}\}/.test(attr.value))
                this.#bindAttribute(element, attr);
        }
        return false;
    }

    #processNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            let elementRemoved = this.#processDirectives(node);
            if (node.localName === 'st-app')
                return;
            if (!elementRemoved && (node.parentNode || node.childNodes.length > 0))
                this.#processChildren(node);
        }
        else if (node.nodeType === Node.TEXT_NODE && /\{\{.+?\}\}/.test(node.nodeValue))
            this.#processTextInterpolation(node);
    }

    // Обход по снимку, но без узлов, вынутых по ходу: #if забирает соседние #else-if/#else
    // в свою цепочку, и привязки на их отсоединённых оригиналах вычислялись бы впустую.
    #processChildren(parent) {
        for (let child of Array.from(parent.childNodes))
            if (child.parentNode === parent)
                this.#processNode(child);
    }

    #boot() {
        let app = this.attrs.get('app');
        let prototype = App.#apps.get(app);

        if (prototype) {
            this.addEventListener('setup', prototype.setup);
            
            Object.entries(prototype.events).forEach(([event, handler]) =>
                this.addEventListener(event, handler)
            );
            this.#template = prototype.template;
            let config = prototype.config;
            let descriptors = Object.getOwnPropertyDescriptors(config);
            let skipKeys = new Set(['app', 'setup', 'template', 'events']);
            Object.entries(descriptors).forEach(([key, descriptor]) => {
                if (skipKeys.has(key)) return;
                if (descriptor.get) {
                    let originalGetter = descriptor.get;
                    this.#getters.set(key, originalGetter);
                    Object.defineProperty(this, key, {
                        get() {
                            this.#track(key);
                            return originalGetter.call(this);
                        },
                        enumerable: descriptor.enumerable,
                        configurable: true
                    });
                } else if (descriptor.value !== undefined) {
                    let value = descriptor.value;
                    if (value !== null)
                        this.#types.set(key, typeof value === 'object' ? 'json' : typeof value);
                    let internalValue = value;
                    if (typeof value === 'object' && value !== null)
                        internalValue = this.#createReactiveProxy(value, [key]);
                    else if (typeof value === 'function')
                        internalValue = this.#createReactiveFunction(value, key);
                    Object.defineProperty(this, key, {
                        get() {
                            this.#track(key);
                            return internalValue;
                        },
                        set(newValue) {
                            if (internalValue !== newValue) {
                                if (typeof newValue === 'object' && newValue !== null)
                                    internalValue = this.#createReactiveProxy(newValue, [key]);
                                else
                                    internalValue = newValue;
                                this.#trigger(key);
                            }
                        },
                        enumerable: true,
                        configurable: true
                    });
                }
            });

            if (typeof this.#booted === 'function')
                this.#booted();

            this.#booted = true;
        } else {
            if (!this.attrs.get('app')) {
                if (typeof this.#booted === 'function')
                    this.#booted();
                this.#booted = true;
            }
        }
    }

    async #promiseCallback(node_array) {
        await Promise.all(node_array.map(node => new Promise(resolve => {
            let timeout = null;
            let setMyTimeout = () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    observer.disconnect();
                    this.#promiseCallback(Array.from(node.children)).then(resolve);
                }, 0);
            };
            let observer = new MutationObserver((r) => {
                if (r.some(rec => rec.type === 'childList'))
                    setMyTimeout();
            });
            observer.observe(node, { childList: true });
            setMyTimeout();
        })));
    }

    #serializeForAttr(value) {
        if (value === null || value === undefined) return '';
        if (value === true) return 'true';
        if (value === false) return 'false';
        if (typeof value === 'number') return String(value);
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    // Строка атрибута → значение. type — модификатор (:value.json) или тип из конфига;
    // без него — угадывание по виду строки, как для свойств, которых нет в конфиге.
    #castAttr(raw, type) {
        if (raw === '') return type && type !== 'string' ? null : '';
        switch (type) {
            case 'string': return raw;
            case 'number': {
                let number = Number(raw);
                return Number.isNaN(number) ? raw : number;
            }
            case 'boolean': return !['false', '0', 'null', 'undefined'].includes(raw);
            case 'json': try { return JSON.parse(raw); } catch { return raw; }
        }
        if (raw === 'true') return true;
        if (raw === 'false') return false;
        if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
        try { return JSON.parse(raw); } catch { return raw; }
    }

    // initial — первое применение при монтировании: только тогда пустой :prop означает
    // «взять значение из конфига». Позже пустой атрибут — это пустое значение.
    #applySingleAttributeOption(name, initial = false) {
        if (!name.startsWith(':')) return;
        // Имена атрибутов браузер приводит к нижнему регистру: :initial-count → initialCount.
        let [propName, cast] = name.replace(/^:+/, '').split('.');
        propName = propName.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        let raw = this.getAttribute(name);
        if (raw === null) return;
        let descriptor = Object.getOwnPropertyDescriptor(this, propName);
        let val;
        if (raw === '' && initial && descriptor && (descriptor.get || descriptor.value !== undefined)) {
            val = this[propName];
            let serialized = this.#serializeForAttr(val);
            if (raw !== serialized)
                this.setAttribute(name, serialized);
            descriptor = null;
        } else {
            if (descriptor && descriptor.set === undefined && descriptor.writable === false) return;
            if (descriptor && descriptor.get !== undefined && descriptor.set === undefined) return;
            // Атрибут уже совпадает со свойством: это обратная синхронизация, а не новое значение.
            // Иначе null, отражённый в атрибут как '', вернулся бы в свойство строкой.
            if (descriptor && this.#serializeForAttr(this[propName]) === raw) return;
            val = this.#castAttr(raw, cast ?? this.#types.get(propName));
        }
        if (!descriptor || !descriptor.set) {
            let internalValue = val;
            if (typeof val === 'object' && val !== null)
                internalValue = this.#createReactiveProxy(val, [propName]);
            else if (typeof val === 'function')
                internalValue = this.#createReactiveFunction(val, propName);
            let attrName = name;
            Object.defineProperty(this, propName, {
                get() {
                    this.#track(propName);
                    return internalValue;
                },
                set(newValue) {
                    if (internalValue !== newValue) {
                        if (typeof newValue === 'object' && newValue !== null)
                            internalValue = this.#createReactiveProxy(newValue, [propName]);
                        else
                            internalValue = newValue;
                        this.#trigger(propName);
                        let serialized = this.#serializeForAttr(newValue);
                        if (this.getAttribute(attrName) !== serialized)
                            this.setAttribute(attrName, serialized);
                    }
                },
                enumerable: true,
                configurable: true
            });
            if (typeof val === 'object' && val !== null) {
                let unwatch = this.watch(propName, () => {
                    let v = this[propName];
                    let s = this.#serializeForAttr(v);
                    if (this.getAttribute(name) !== s)
                        this.setAttribute(name, s);
                }, { deep: true });
                this.#bindings.push({ type: 'attrSync', unwatch });
            }
        } else
            this[propName] = val;
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name.startsWith(':') && name !== 'app' && oldValue !== newValue && this.#booted === true)
            this.#applySingleAttributeOption(name);
    }

    connectedCallback() {
        App.#instances.add(this);
        if (this.#booted === true) {
            // Вернули в DOM после полной очистки — привязки сняты, собираем заново.
            if (this.#tornDown) {
                this.#tornDown = false;
                this.applyTemplate(this.#appliedTemplate);
            }
            if (!this.#attrObserver) {
                this.#attrObserver = new MutationObserver(mutations => {
                    for (let m of mutations) {
                        if (m.type === 'attributes' && m.attributeName && m.attributeName.startsWith(':') && m.attributeName !== 'app')
                            this.#applySingleAttributeOption(m.attributeName);
                    }
                });
                this.#attrObserver.observe(this, { attributes: true });
            }
            return;
        }
        // Внутри <st-app>, который ещё не взял шаблон: родитель заберёт эту разметку как есть
        // и пересоздаст узел. Отрисуйся он раньше — в шаблон родителя попал бы готовый снимок.
        let host = this.parentElement?.closest('st-app');
        if (host && !host.#templated) {
            App.#instances.delete(this);
            return;
        }
        this.#boot();
        Promise.all([
            new Promise(resolve => {
                if (this.#booted === true) return resolve();
                this.#booted = resolve;
            }),
            new Promise(resolve => {
                let timeout = null;
                let setMyTimeout = () => {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => {
                        observer.disconnect();
                        this.#promiseCallback(Array.from(this.children)).then(resolve);
                    }, 0);
                };
                let observer = new MutationObserver((r) => {
                    if (r.some(rec => rec.type === 'childList'))
                        setMyTimeout();
                });
                observer.observe(this, { childList: true });
                setMyTimeout();
            })
        ]).then(() => {
            this.dispatchEvent('setup');
            for (let name of this.attrs.keys()) {
                if (!name.startsWith(':')) continue;
                this.#applySingleAttributeOption(name, true);
            }
            let appliedInline = false;
            if (this.childNodes.length > 0) {
                let hasNonEmptyContent = Array.from(this.childNodes).some(node =>
                    node.nodeType === Node.ELEMENT_NODE ||
                    (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '')
                );
                if (hasNonEmptyContent) {
                    if (this.#template) {
                        this.applyTemplate(this.innerHTML);
                        appliedInline = true;
                    } else
                        this.#template = this.innerHTML;
                }
            }
            if (!appliedInline)
                this.applyTemplate();
            if (this.#booted === true && !this.#attrObserver) {
                this.#attrObserver = new MutationObserver(mutations => {
                    for (let m of mutations) {
                        if (m.type === 'attributes' && m.attributeName && m.attributeName.startsWith(':') && m.attributeName !== 'app')
                            this.#applySingleAttributeOption(m.attributeName);
                    }
                });
                this.#attrObserver.observe(this, { attributes: true });
            }
        });
    }

    disconnectedCallback() {
        // Очистка откладывается: перенос узла (append в другой контейнер, Modal)
        // вызывает disconnected и connected в одной задаче, и привязки должны выжить.
        queueMicrotask(() => {
            if (!this.isConnected)
                this.#teardown();
        });
    }

    #teardown() {
        this.#tornDown = true;
        if (this.#attrObserver) {
            this.#attrObserver.disconnect();
            this.#attrObserver = null;
        }
        this.#cleanupBindings(this.#bindings);
        this.#bindings = [];
        for (let w of this.#watchers) {
            if (w.type === 'getter' && w.effect) {
                this.#deps.forEach((effects, k) => {
                    effects.delete(w.effect);
                    if (effects.size === 0) this.#deps.delete(k);
                });
                this.#updateQueue.delete(w.effect);
            }
        }
        this.#watchers = [];
        this.#methodWrappers.forEach((entry, methodName) => {
            this[methodName] = entry.original;
        });
        this.#methodWrappers.clear();
        this.#triggeredKeys.clear();
        this.#deps.clear();
        this.#updateQueue.clear();
        App.#instances.delete(this);
    }

    // Нативная сигнатура (name, force) сохраняется: на неё полагается сторонний код.
    // Строковые аргументы — старый режим, он же cycleAttribute.
    toggleAttribute(name, ...args) {
        if (args.length <= 1 && (args[0] === undefined || typeof args[0] === 'boolean'))
            return super.toggleAttribute(name, ...args);
        return this.cycleAttribute(name, ...args);
    }

    cycleAttribute(name, value_1 = '', value_2 = '') {
        let value = this.getAttribute(name);

        this[
            value_1 == '' && value_2 == '' && (value || this.hasAttribute(name))
                ? 'removeAttribute' 
                : 'setAttribute'
        ](name, value != value_1 ? value_1 : value_2);
    }

    static { customElements.define('st-app', this); }
}