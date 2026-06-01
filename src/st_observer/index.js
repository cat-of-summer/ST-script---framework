class st_observer {
  static #registry = new Map();

  constructor(params = {}) {
    const cfg = Object.assign({
      selector: null,
      root: null,
      rootMargin: '0px',
      threshold: 0,
      before_init: () => {},
      on_init: () => {}
    }, params);

    if (!cfg.selector) throw new Error('st_observer: selector required');

    const key = (typeof cfg.selector === 'string') ? cfg.selector : Symbol('selector');

    if (st_observer.#registry.has(key)) {
      this._internal = st_observer.#registry.get(key);
      return this;
    }

    const internal = {
      key,
      selector: cfg.selector,
      options: { root: cfg.root, rootMargin: cfg.rootMargin, threshold: cfg.threshold },
      observer: null,
      callbacks: new WeakMap(), // element -> callback object (show/hide)
      elements: new Set(),
      _connected: false,
      crossRules: new Map() // Map<targetEl, Array<rule>>
    };

    cfg.before_init();

    const createCbObj = () => ({
      on_show: new Set(), once_show: new Set(), while_show: new Set(),
      on_hide: new Set(), once_hide: new Set(), while_hide: new Set(),
      _once_shown: false, _once_hidden: false, _wasIntersecting: false
    });

    const safeCall = (fn, ...args) => { try { fn(...args); } catch (e) { console.error(e); } };

    const rectsIntersect = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);

    const resolveTargets = (target) => {
      if (!target) {
        if (typeof internal.selector === 'string') return Array.from(document.querySelectorAll(internal.selector));
        if (internal.selector instanceof Element) return [internal.selector];
        if (NodeList.prototype.isPrototypeOf(internal.selector) || Array.isArray(internal.selector)) return Array.from(internal.selector);
        return [];
      }
      if (typeof target === 'string') return Array.from(document.querySelectorAll(target));
      if (target instanceof Element) return [target];
      if (NodeList.prototype.isPrototypeOf(target) || Array.isArray(target)) return Array.from(target);
      return [];
    };

    // cross rule factory
    const createCrossRule = (goals) => ({
      goals: new Set(goals),
      on_cross: new Set(),
      once_cross: new Set(),
      while_cross: new Set(),
      _once_done: new Set(),
      _wasCrossing: new Map()
    });

    const checkCrossForTarget = (targetEl) => {
      const rules = internal.crossRules.get(targetEl);
      if (!rules || !rules.length) return;
      if (!document.contains(targetEl)) return;
      const rTarget = targetEl.getBoundingClientRect();
      for (const rule of rules) {
        for (const goalEl of rule.goals) {
          if (!document.contains(goalEl)) {
            rule._wasCrossing.set(goalEl, false);
            continue;
          }
          const rGoal = goalEl.getBoundingClientRect();
          const crossing = rectsIntersect(rTarget, rGoal);

          if (crossing) {
            rule.while_cross.forEach(fn => safeCall(fn, {target: targetEl, goal: goalEl}, targetEl, goalEl));
          }

          const was = !!rule._wasCrossing.get(goalEl);
          if (!was && crossing) {
            rule.on_cross.forEach(fn => safeCall(fn, {target: targetEl, goal: goalEl}, targetEl, goalEl));
          }

          if (crossing && !rule._once_done.has(goalEl)) {
            rule.once_cross.forEach(fn => safeCall(fn, {target: targetEl, goal: goalEl}, targetEl, goalEl));
            rule._once_done.add(goalEl);
          }

          rule._wasCrossing.set(goalEl, !!crossing);
        }
      }
    };

    const runAllCrossChecks = () => {
      for (const targetEl of Array.from(internal.crossRules.keys())) {
        if (!document.contains(targetEl)) continue;
        try { checkCrossForTarget(targetEl); } catch (e) { console.error(e); }
      }
    };

    const makeIoCallback = () => (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        let cbObj = internal.callbacks.get(el);
        if (!cbObj) {
          cbObj = createCbObj();
          internal.callbacks.set(el, cbObj);
        }

        if (entry.isIntersecting) {
          cbObj.while_show.forEach(fn => safeCall(fn, entry, el));
          if (!cbObj._wasIntersecting) cbObj.on_show.forEach(fn => safeCall(fn, entry, el));
          if (!cbObj._once_shown) {
            cbObj._once_shown = true;
            cbObj.once_show.forEach(fn => safeCall(fn, entry, el));
          }
          cbObj._wasIntersecting = true;
        } else {
          cbObj.while_hide.forEach(fn => safeCall(fn, entry, el));
          if (cbObj._wasIntersecting) cbObj.on_hide.forEach(fn => safeCall(fn, entry, el));
          if (!cbObj._once_hidden) {
            cbObj._once_hidden = true;
            cbObj.once_hide.forEach(fn => safeCall(fn, entry, el));
          }
          cbObj._wasIntersecting = false;
        }
      }

      // after processing intersection entries — check cross rules (so crossing reacts to movement)
      runAllCrossChecks();
    };

    // attach internals
    this._internal = internal;
    this._createCbObj = createCbObj;
    this._resolveTargets = resolveTargets;
    this._createCrossRule = createCrossRule;
    this._checkCrossForTarget = checkCrossForTarget;
    this._runAllCrossChecks = runAllCrossChecks;
    this._makeIoCallback = makeIoCallback;

    // seed initial elements (selector)
    const initial = resolveTargets();
    for (const el of initial) {
      internal.elements.add(el);
      cfg.on_init(el);
      if (!internal.callbacks.get(el)) internal.callbacks.set(el, createCbObj());
    }
    st_observer.#registry.set(key, internal);

    // auto-connect
    this.connect();

    // cfg.on_init();
  }

  enableAutoCrossChecks(options = {}) {
    const cfg = Object.assign({ strategy: 'all', watchScrollAncestors: true, watchResize: true, rAFWhileAnimating: false }, options);
    if (this._autoChecks) {
      // уже включены — обновим конфиг
      this._autoChecks.cfg = cfg;
      return this;
    }

    const internal = this._internal;
    const self = this;

    // throttled runner через rAF
    let scheduled = false;
    const requestRun = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (cfg.strategy === 'all') {
          self._runAllCrossChecks();
        } else if (cfg.strategy === 'entryOnly') {
          // если entryOnly — у нас нет списка entry здесь, будем просто запускать всё, либо
          // можно хранить lastEntries при IO и проверять только те элементы — см. ниже улучшение.
          self._runAllCrossChecks();
        }
      });
    };

    // helper: find scrollable ancestors of elements in internal.elements
    const findScrollParents = (el) => {
      const res = new Set();
      let node = el.parentNode;
      while (node && node !== document) {
        if (node instanceof HTMLElement) {
          const style = getComputedStyle(node);
          const overflow = style.overflow + style.overflowX + style.overflowY;
          if (/(auto|scroll|overlay)/.test(overflow)) res.add(node);
        }
        node = node.parentNode;
      }
      // also listen to window
      res.add(window);
      return Array.from(res);
    };

    // attach listeners
    const onScrollOrResize = () => requestRun();
    const scrollTargets = new Set();

    if (cfg.watchScrollAncestors) {
      // attach to scroll parents of currently observed elements
      for (const el of Array.from(internal.elements)) {
        const sp = findScrollParents(el);
        sp.forEach(p => {
          if (!scrollTargets.has(p)) {
            p.addEventListener('scroll', onScrollOrResize, { passive: true });
            scrollTargets.add(p);
          }
        });
      }
    } else {
      window.addEventListener('scroll', onScrollOrResize, { passive: true });
      scrollTargets.add(window);
    }

    if (cfg.watchResize) {
      window.addEventListener('resize', onScrollOrResize, { passive: true });
    }

    // optional RAF loop for animations (start/stop)
    let rafId = null;
    const rafLoop = () => {
      self._runAllCrossChecks();
      rafId = requestAnimationFrame(rafLoop);
    };

    // store autoChecks state
    this._autoChecks = {
      cfg,
      scrollTargets,
      onScrollOrResize,
      rafId,
      startRaf: () => { if (!rafId) rafLoop(); },
      stopRaf: () => { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
    };

    // if user wants rAFWhileAnimating === true, we do not start it by default;
    // startRaf can be called externally when an animation begins (or we can detect transform changes).
    return this;
  }

  disableAutoCrossChecks() {
    if (!this._autoChecks) return this;
    const ac = this._autoChecks;
    ac.scrollTargets.forEach(p => {
      try { p.removeEventListener('scroll', ac.onScrollOrResize); } catch (e) {}
    });
    try { window.removeEventListener('resize', ac.onScrollOrResize); } catch (e) {}
    ac.stopRaf();
    this._autoChecks = null;
    return this;
  }

  /* ---------- show/hide registration ---------- */
  _register(cbSetName, fn, target) {
    if (typeof fn !== 'function') return this;
    const internal = this._internal;
    const targets = this._resolveTargets(target);
    for (const el of targets) {
      let obj = internal.callbacks.get(el);
      if (!obj) {
        obj = this._createCbObj();
        internal.callbacks.set(el, obj);
      }
      obj[cbSetName].add(fn);
      if (!internal.elements.has(el)) {
        internal.elements.add(el);
        if (internal._connected && internal.observer) {
          try { internal.observer.observe(el); } catch (e) {}
        }
      }
    }
    return this;
  }

  on_show(callback, target) { return this._register('on_show', callback, target); }
  while_show(callback, target) { return this._register('while_show', callback, target); }
  once_show(callback, target) { return this._register('once_show', callback, target); }

  on_hide(callback, target) { return this._register('on_hide', callback, target); }
  while_hide(callback, target) { return this._register('while_hide', callback, target); }
  once_hide(callback, target) { return this._register('once_hide', callback, target); }

  observe(target) {
    const targets = this._resolveTargets(target);
    for (const el of targets) {
      if (!this._internal.callbacks.get(el)) this._internal.callbacks.set(el, this._createCbObj());
      this._internal.elements.add(el);
      if (this._internal._connected && this._internal.observer) {
        try { this._internal.observer.observe(el); } catch (e) {}
      }
    }
    return this;
  }

  unobserve(target) {
    const targets = this._resolveTargets(target);
    for (const el of targets) {
      try { if (this._internal.observer) this._internal.observer.unobserve(el); } catch (e) {}
      this._internal.callbacks.delete(el);
      this._internal.elements.delete(el);
    }
    return this;
  }

  disconnect() {
    try { if (this._internal.observer) this._internal.observer.disconnect(); } catch (e) {}
    this._internal.observer = null;
    this._internal._connected = false;
    return this;
  }

  connect(options = {}) {
    if (this._internal._connected) return this;

    if (options.root !== undefined) this._internal.options.root = options.root;
    if (options.rootMargin !== undefined) this._internal.options.rootMargin = options.rootMargin;
    if (options.threshold !== undefined) this._internal.options.threshold = options.threshold;

    this._internal.observer = new IntersectionObserver(this._makeIoCallback(), this._internal.options);

    if (options.resetFlags) {
      for (const el of Array.from(this._internal.elements)) {
        const obj = this._internal.callbacks.get(el);
        if (obj) { obj._once_shown = false; obj._once_hidden = false; obj._wasIntersecting = false; }
      }
    }

    for (const el of Array.from(this._internal.elements)) {
      try { this._internal.observer.observe(el); } catch (e) {}
    }

    this._internal._connected = true;
    return this;
  }

  reconnect(options = {}) { return this.connect(options); }

  resetOnceFlags(target) {
    const targets = target ? this._resolveTargets(target) : Array.from(this._internal.elements);
    for (const el of targets) {
      const obj = this._internal.callbacks.get(el);
      if (obj) { obj._once_shown = false; obj._once_hidden = false; obj._wasIntersecting = false; }
    }
    return this;
  }

  isConnected() { return !!this._internal._connected; }
  getObservedElements() { return Array.from(this._internal.elements); }

  /* ---------- cross API ---------- */
  _registerCross(cbSetName, callback, target, goal) {
    if (typeof callback !== 'function') return this;
    const internal = this._internal;
    // signature: (callback, goal) -> target omitted
    if (goal === undefined && (typeof target === 'string' || target instanceof Element || NodeList.prototype.isPrototypeOf(target) || Array.isArray(target))) {
      goal = target; target = undefined;
    }
    const targets = this._resolveTargets(target);
    const goals = this._resolveTargets(goal);
    if (!goals.length) { console.warn('st_observer: cross registration no goals'); return this; }

    for (const tEl of targets) {
      if (!internal.callbacks.get(tEl)) internal.callbacks.set(tEl, this._createCbObj());
      internal.elements.add(tEl);

      let rules = internal.crossRules.get(tEl);
      if (!rules) { rules = []; internal.crossRules.set(tEl, rules); }

      let rule = rules.find(r => {
        if (r.goals.size !== goals.length) return false;
        for (const g of goals) if (!r.goals.has(g)) return false;
        return true;
      });

      if (!rule) {
        rule = this._createCrossRule(goals);
        rules.push(rule);
      }

      rule[cbSetName].add(callback);

      for (const g of goals) internal.elements.add(g);
    }

    // immediate check
    this._runAllCrossChecks();
    return this;
  }

  on_cross(callback, target, goal) { return this._registerCross('on_cross', callback, target, goal); }
  once_cross(callback, target, goal) { return this._registerCross('once_cross', callback, target, goal); }
  while_cross(callback, target, goal) { return this._registerCross('while_cross', callback, target, goal); }

  resetCrossOnceFlags(target, goal) {
    const internal = this._internal;
    const targets = target ? this._resolveTargets(target) : Array.from(internal.crossRules.keys());
    const goals = goal ? this._resolveTargets(goal) : null;

    for (const tEl of targets) {
      const rules = internal.crossRules.get(tEl);
      if (!rules) continue;
      for (const rule of rules) {
        if (!goals) rule._once_done.clear();
        else for (const gEl of goals) rule._once_done.delete(gEl);
      }
    }
    return this;
  }
}

export default st_observer;
