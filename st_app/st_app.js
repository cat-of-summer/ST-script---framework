class App extends HTMLElement {
    static {customElements.define('st-app', this)}

    static #boolean_attributes = new Set(['disabled', 'checked', 'readonly', 'required', 'selected', 'hidden', 'open', 'autofocus']);
    static #apps = new Map();
    static #instances = new Set();

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
        let merged = { ...baseConfig, ...options };
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
    #methodWrappers = new Map();
    #renderToken = 0;

    constructor() {
        super();
        App.#instances.add(this);
    }

    #cleanupBindings(bindings) {
        if (!bindings || !bindings.length) return;
        bindings.forEach(binding => {
            if (binding.type === 'event' && binding.element && binding.handler)
                binding.element.removeEventListener(binding.eventName, binding.handler);
            else if (binding.type === 'model' && binding.element && binding.handler) {
                let eventName = binding.element.tagName === 'SELECT' ? 'change' : 'input';
                binding.element.removeEventListener(eventName, binding.handler);
            } else if (binding.type === 'attrSync' && binding.unwatch)
                binding.unwatch();
                
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
            queueMicrotask(() => listener(new CustomEvent(type)));
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
        this.#cleanupBindings(this.#bindings);
        this.#bindings = [];
        this.innerHTML = '';
        if (tplContent) {
            let tpl = document.createElement('template');
            tpl.innerHTML = tplContent.trim();
            let fragment = tpl.content.cloneNode(true);
            Array.from(fragment.childNodes).forEach(child => this.#processNode(child));
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
                w.callback(newVal, oldVal, w.unwatch);
            }

            this.#triggeredKeys.clear();
            this.#flushing = false;
            if (this.#pendingFlush) {
                this.#pendingFlush = false;
                this.#flushing = true;
                Promise.resolve().then(runFlush);
            }
        };
        Promise.resolve().then(runFlush);
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

    #createReactiveProxy(obj, path = []) {
        if (obj === null || typeof obj !== 'object' || obj.__isReactive)
            return obj;
        let $this = this;
        let proxy = new Proxy(obj, {
            get(target, prop, receiver) {
                if (prop === '__isReactive') return true;
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
        return proxy;
    }

    #createReactiveFunction(fn, key) {
        let $this = this;
        return new Proxy(fn, {
            apply(target, thisArg, args) {
                let result = Reflect.apply(target, $this, args);
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
            let savedValues = null;
            if (capturedLoopCtx) {
                savedValues = {};
                for (let key of Object.keys(capturedLoopCtx)) {
                    savedValues[key] = this[key];
                    this[key] = capturedLoopCtx[key];
                }
            }
            this.#activeEffect = wrappedEffect;
            try {
                fn();
            } finally {
                this.#activeEffect = null;
                if (savedValues) {
                    for (let key of Object.keys(savedValues)) {
                        if (savedValues[key] !== undefined)
                            this[key] = savedValues[key];
                        else
                            delete this[key];
                    }
                }
            }
        };
        wrappedEffect();
        return wrappedEffect;
    }

    #evalExpression(expr) {
        try {
            return new Function('$event', `with(this) { return (${expr}); }`).call(this);
        } catch (e) {
            console.warn('Expression evaluation error:', expr, e);
            return undefined;
        }
    }

    #execStatement(statement, event = null) {
        try {
            return new Function('$event', `with(this) { ${statement} }`).call(this, event);
        } catch (e) {
            console.error('Statement execution error:', statement, e);
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
        let eventName = attr.name.slice(1);
        let statement = attr.value;
        let capturedLoopCtx = this.#loopContext ? { ...this.#loopContext } : null;
        let handler = (e) => {
            if (capturedLoopCtx) {
                let savedValues = {};
                for (let key of Object.keys(capturedLoopCtx)) {
                    savedValues[key] = this[key];
                    this[key] = capturedLoopCtx[key];
                }
                this.#execStatement(statement, e);
                for (let key of Object.keys(savedValues)) {
                    if (savedValues[key] !== undefined)
                        this[key] = savedValues[key];
                    else
                        delete this[key];
                }
            } else
                this.#execStatement(statement, e);
        };
        element.addEventListener(eventName, handler);
        this.#bindings.push({ type: 'event', element, eventName, handler });
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
            else if (element.tagName === 'SELECT')
                element.value = value;
            else
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
            if (capturedLoopCtx) {
                let savedValues = {};
                for (let key of Object.keys(capturedLoopCtx)) {
                    savedValues[key] = this[key];
                    this[key] = capturedLoopCtx[key];
                }
                try {
                    new Function('value', `with(this) { ${prop} = value; }`).call(this, newValue);
                } catch (e) {
                    console.error('Model binding error:', prop, e);
                }
                for (let key of Object.keys(savedValues)) {
                    if (savedValues[key] !== undefined)
                        this[key] = savedValues[key];
                    else
                        delete this[key];
                }
            } else {
                try {
                    new Function('value', `with(this) { ${prop} = value; }`).call(this, newValue);
                } catch (e) {
                    console.error('Model binding error:', prop, e);
                }
            }
        };
        element.addEventListener(eventName, handler);
        this.#bindings.push({ type: 'model', element, effect, handler });
    }

    #bindConditional(element, attr) {
        let expr = attr.value;
        let placeholder = document.createComment(`if: ${expr}`);
        element.parentNode.insertBefore(placeholder, element);
        let chain = [{ expr, element, bindings: [], processed: false }];
        let nextSibling = element.nextElementSibling;
        while (nextSibling) {
            if (nextSibling.hasAttribute('#else-if')) {
                let elseIfExpr = nextSibling.getAttribute('#else-if');
                chain.push({ expr: elseIfExpr, element: nextSibling, bindings: [], processed: false });
                nextSibling.removeAttribute('#else-if');
                let next = nextSibling.nextElementSibling;
                nextSibling.remove();
                nextSibling = next;
            } else if (nextSibling.hasAttribute('#else')) {
                chain.push({ expr: 'true', element: nextSibling, bindings: [], processed: false });
                nextSibling.removeAttribute('#else');
                nextSibling.remove();
                break;
            } else
                break;
        }
        element.removeAttribute(attr.name);
        element.remove();
        let currentBranch = null;
        let effect = this.#effect(() => {
            let matchedBranch = null;
            for (let branch of chain) {
                let condition = this.#evalExpression(branch.expr);
                if (condition) {
                    matchedBranch = branch;
                    break;
                }
            }
            if (currentBranch !== matchedBranch) {
                if (currentBranch) {
                    if (currentBranch.element && currentBranch.element.parentNode)
                        currentBranch.element.remove();
                    this.#cleanupBindings(currentBranch.bindings);
                    currentBranch.bindings = [];
                }
                if (matchedBranch) {
                    placeholder.parentNode.insertBefore(matchedBranch.element, placeholder.nextSibling);
                    if (!matchedBranch.processed) {
                        let bindingsLengthBefore = this.#bindings.length;
                        this.#processNode(matchedBranch.element);
                        matchedBranch.bindings = this.#bindings.slice(bindingsLengthBefore);
                        matchedBranch.processed = true;
                    }
                }
                currentBranch = matchedBranch;
            }
        });
        this.#bindings.push({ type: 'conditional', placeholder, chain, effect });
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
        let parent = element.parentNode;
        let nextSibling = element.nextSibling;
        element.removeAttribute(attr.name);
        let template = element.cloneNode(true);
        element.remove();
        let renderedItems = [];
        let effect = this.#effect(() => {
            let collection = this.#evalExpression(collectionExpr);
            renderedItems.forEach(item => {
                if (item.node && item.node.parentNode)
                    item.node.remove();
                this.#cleanupBindings(item.bindings);
            });
            renderedItems = [];
            let entries;
            if (Array.isArray(collection)) {
                entries = collection.map((value, index) => ({ value, key: undefined, index }));
            } else if (collection !== null && typeof collection === 'object') {
                entries = Object.entries(collection).map(([key, value], index) => ({ value, key, index }));
            } else {
                return;
            }
            if (entries.length === 0) return;
            let fragment = document.createDocumentFragment();
            entries.forEach(({ value: item, key, index }) => {
                let clone = template.cloneNode(true);
                let originalItem = this[itemName];
                let originalIndex = this.$index;
                let originalKey = this.$key;
                this[itemName] = item;
                this.$index = index;
                if (key !== undefined) this.$key = key;
                let previousLoopCtx = this.#loopContext;
                let loopCtx = { ...previousLoopCtx, [itemName]: item, $index: index };
                if (key !== undefined) loopCtx.$key = key;
                this.#loopContext = loopCtx;
                let bindingsLengthBefore = this.#bindings.length;
                this.#processNode(clone);
                let itemBindings = this.#bindings.slice(bindingsLengthBefore);
                this.#loopContext = previousLoopCtx;
                if (originalItem !== undefined)
                    this[itemName] = originalItem;
                else
                    delete this[itemName];
                if (originalIndex !== undefined)
                    this.$index = originalIndex;
                else
                    delete this.$index;
                if (originalKey !== undefined)
                    this.$key = originalKey;
                else
                    delete this.$key;
                fragment.appendChild(clone);
                renderedItems.push({ node: clone, bindings: itemBindings });
            });
            parent.insertBefore(fragment, nextSibling);
        });
        this.#bindings.push({ type: 'loop', parent, nextSibling, template, effect });
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
            if (App.#boolean_attributes.has(attrName)) {
                let falsy = finalValue === '' || finalValue === 'false' || finalValue === '0' || finalValue === 'null' || finalValue === 'undefined' || !finalValue;
                if (falsy)
                    element.removeAttribute(attrName);
                else
                    element.setAttribute(attrName, '');
            } else
                element.setAttribute(attrName, finalValue);
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
                Array.from(node.childNodes).forEach(child => this.#processNode(child));
        }
        else if (node.nodeType === Node.TEXT_NODE && /\{\{.+?\}\}/.test(node.nodeValue))
            this.#processTextInterpolation(node);
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

    #applySingleAttributeOption(name) {
        if (!name.startsWith(':') || name === 'app') return;
        let propName = name.replace(/^:+/,'');
        let raw = this.getAttribute(name);
        let descriptor = Object.getOwnPropertyDescriptor(this, propName);
        let val = raw;
        if (!raw) {
            if (descriptor && (descriptor.get || descriptor.value !== undefined)) {
                let existingVal = this[propName];
                let serialized = this.#serializeForAttr(existingVal);
                if (this.getAttribute(name) !== serialized)
                    this.setAttribute(name, serialized);
                val = existingVal;
                descriptor = null;
            }
        }
        if (descriptor && descriptor.set === undefined && descriptor.writable === false) return;
        if (descriptor && descriptor.get !== undefined && descriptor.set === undefined) return;
        if (raw) {
            if (raw === 'true') val = true;
            else if (raw === 'false') val = false;
            else if (/^-?\d+(\.\d+)?$/.test(raw)) val = Number(raw);
            else { try { val = JSON.parse(raw); } catch { val = raw; } }
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
                if (!name.startsWith(':') || name === 'app') continue;
                this.#applySingleAttributeOption(name);
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

    toggleAttribute(name, value_1 = '', value_2 = '') {
        let value = this.getAttribute(name);

        this[
            value_1 == '' && value_2 == '' && (value || this.hasAttribute(name))
                ? 'removeAttribute' 
                : 'setAttribute'
        ](name, value != value_1 ? value_1 : value_2);
    }

}
