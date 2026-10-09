import { closestInPath, element, find, own } from '../_traits/hasInstanceSymbol.js';

export default class Modal {
    modal;
    overlay;
    area;
    container;
    content;

    #params = {};
    #methods = {};
    #state = 'hidden';
    #pending_show = null;
    // open(): промисы текущего показа и ждущие отложенного show().
    #resolvers = [];
    #waiting = [];
    #result = null;
    #return_to = null;
    // Куда идёт окно. Меняется синхронно, а state — только в requestAnimationFrame,
    // поэтому show() сразу после hide() видит закрытие по #target.
    #target = 'hidden';

    static find = find;

    // Открытые окна в порядке открытия: Esc закрывает только верхнее.
    static #open = [];
    static #esc_bound = false;

    static #bind_esc() {
        if (Modal.#esc_bound) return;
        Modal.#esc_bound = true;
        document.addEventListener('keydown', e => {
            if (e.code !== 'Escape' && e.keyCode !== 27) return;
            // Неблокирующие окна (уведомления) не перекрывают Esc окну под ними.
            let top = Modal.#open.filter(modal => modal.params.blocking).at(-1);
            if (top?.params.close_by_esc) top.hide(e);
        });
    }

    get state() {return this.#state;}
    get params() {return this.#params;}

    // Показать окно и дождаться результата: промис разрешается значением из hide(value)
    // после полного закрытия. Закрытие по Esc, оверлею или [action="close"] даёт null.
    open(data = null) {
        return new Promise(resolve => {
            (this.#target == 'shown' ? this.#resolvers : this.#waiting).push(resolve);
            this.show(data);
        });
    }

    #emit(name, data) {
        this.content?.dispatchEvent(new CustomEvent(`modal:${name}`, { bubbles: true, detail: { modal: this, data } }));
    }

    clone(params) {
        let content = this.content.cloneNode(true);
        content.id = params.id ?? (content.id || 'modal').replace(/#+$/, '') + (params.suffix ?? '_copy');

        return new Modal({
            ...this.#params,
            ...this.#methods,
            content,
            ...params,
            parent: this
        });
    }

    constructor(params) {
        params = {
            zIndex: 1000,
            duration: 0,

            container: 'body',

            overlay: true,
            overlay_shading: 0.5,
            overlay_blur: '5px',
            overlay_scroll_lock: true,

            content: `<div></div>`,
            location: 'center center',
            fluid: false,
            trigger: null,

            close_by_overlay: true,
            close_by_esc: true,
            // После закрытия вернуть фокус элементу, который был активен до показа.
            return_focus: true,
            // false — окно не перекрывает страницу (уведомления): клики мимо контейнера
            // уходят на страницу, прокрутка не блокируется, Esc его пропускает.
            blocking: true,
            auto_close: -1,
         
            allow_interrupt: false,

            before_show: () => {},
            on_show: () => {},
            before_hide: () => {},
            on_hide: () => {},
            before_init: () => {},
            on_init: () => {},

            ...params
        };

        let timeout;
        let body_inline_styles;
        let default_scroll_behavior;

        for (let [key, value] of Object.entries(params))
            if (typeof value == "function") {
                this[key] = value.bind(this);

                this.#methods[key] = value;
            } else
                this.#params[key] = value;
        
        this.before_init(this.#params);

        this.modal = document.createElement('modal');
        own(this.modal, this);

        Object.assign(this.modal.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            zIndex: this.#params.zIndex,
            transition: `all ${this.#params.duration}s`,
            pointerEvents: 'none',
            display: 'none',
            overflow: 'hidden',
        });
        
        this.modal.setAttribute('state', 'hidden');

        try {
            element(this.#params.container).append(this.modal);
        } catch {
            throw new Error("Неудачная попытка вставить модальное окно в указанный контейнер");
        }

        if (this.#params.overlay) {
            this.overlay = document.createElement('modal-overlay');
            own(this.overlay, this);

            Object.assign(this.overlay.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                backgroundColor: `var(--modal-overlay-color, rgba(0, 0, 0, ${this.#params.overlay_shading}))`,
                backdropFilter: `var(--modal-overlay-filter, blur(${this.#params.overlay_blur}))`,
                zIndex: ++this.#params.zIndex,
                transition: 'inherit',
            });

            this.modal.append(this.overlay);
        }

        let loc = (this.#params.location || '').toLowerCase().split(/\s+/);

        this.area = document.createElement('modal-area');
        own(this.area, this);

        Object.assign(this.area.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            overflowY: this.#params.blocking ? 'auto' : 'visible',
            overflowX: this.#params.blocking ? 'clip' : 'visible',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: loc.includes('left') ? 'flex-start' : loc.includes('right') ? 'flex-end' : 'center',
            zIndex: ++this.#params.zIndex,
            pointerEvents: this.#params.blocking ? 'all' : 'none',
            transition: 'inherit'
        });

        this.modal.append(this.area);

        if (this.#params.close_by_overlay)
            this.area.addEventListener('click', (e) => {
                // composedPath, а не e.target: перерисовка могла вынуть цель из контейнера до всплытия.
                if (!e.composedPath().includes(this.container)) this.hide(e);
            });

        this.container = document.createElement('modal-container');
        own(this.container, this);

        Object.assign(this.container.style, {
            position: 'relative',
            flexShrink: '0',
            width: this.#params.fluid ? '100%' : 'max-content',
            height: 'max-content',
            maxWidth: this.#params.fluid ? 'none' : '100vw',
            zIndex: ++this.#params.zIndex,
            transition: 'inherit',
            pointerEvents: 'all',
            marginTop:    loc.includes('top')    ? '0' : 'auto',
            marginBottom: loc.includes('bottom') ? '0' : 'auto',
            marginLeft:   loc.includes('left')   ? '0' : 'auto',
            marginRight:  loc.includes('right')  ? '0' : 'auto',
        });

        this.area.append(this.container);

        try {
            this.content = element(this.#params.content) ??
                (new DOMParser()).parseFromString(this.#params.content, 'text/html').body.firstElementChild;
        } catch {
            throw new Error("Неудачная попытка вставить переданный контент в модальное окно");
        }

        this.container.append(this.content);
        own(this.content, this);
        this.content.style.transition = 'inherit';

        // Делегирование: кнопки, появившиеся или пересозданные позже (App, innerHTML), тоже работают.
        this.content.addEventListener('click', e => {
            if (closestInPath(e, '[action="close"]', this.content)) this.hide();
        });

        let toggle = (params) => {
            params.before_func(params.data);
            this.#emit(params.hide ? 'hide' : 'show', params.data);

            clearTimeout(timeout);

            this.modal.style.display = 'flex';

            requestAnimationFrame(() => {
                this.#state = params.process;
                this.modal.setAttribute('state', this.#state);

                requestAnimationFrame(() => {
                    timeout = setTimeout(() => {
                        this.#state = params.final;
                        this.modal.setAttribute('state', this.#state);

                        if (params.hide) this.modal.style.display = 'none';

                        params.after_func(params.data);
                        this.#emit(params.final, params.data);

                        if (params.hide) {
                            this.#restoreFocus();
                            let result = this.#result;
                            this.#result = null;
                            this.#resolvers.splice(0).forEach(resolve => resolve(result));
                        }

                        // show(), пришедший во время hiding, выполняется после полного закрытия.
                        if (params.hide && this.#pending_show) {
                            let pending = this.#pending_show;
                            this.#pending_show = null;
                            this.show(pending.data);
                        }

                    }, this.#params.duration * 1000);
                });
            });

        }

        this.show = (data = null) => {
            if (this.#target == 'hidden' && this.#state != 'hidden' && !this.#params.allow_interrupt) {
                this.#pending_show = { data };
                return;
            }

            if (
                this.#state == 'hidden' ||
                (this.#params.allow_interrupt && this.#state == 'hiding')
            ) {
                Modal.#open = Modal.#open.filter(modal => modal !== this);
                Modal.#open.push(this);
                this.#target = 'shown';
                this.#resolvers.push(...this.#waiting.splice(0));

                // Фокус запоминается только при показе с нуля, не при прерванном закрытии.
                if (this.#state == 'hidden') {
                    let active = document.activeElement;
                    this.#return_to = active && active !== document.body && !this.modal.contains(active) ? active : null;
                }

                toggle({
                    before_func: this.before_show,
                    after_func: this.on_show,
                    process: 'showing',
                    final: 'shown',
                    hide: false,
                    data
                });

                if (this.#params.overlay_scroll_lock && this.overlay && this.#params.blocking) {
                    default_scroll_behavior = document.documentElement.style.scrollBehavior;

                    body_inline_styles = document.body.style;
                    body_inline_styles = {
                        position: body_inline_styles.position,
                        top: body_inline_styles.top,
                        left: body_inline_styles.left,
                        right: body_inline_styles.right,
                        width: body_inline_styles.width,
                        scroll_Y: window.scrollY || document.documentElement.scrollTop,
                        scroll_X: window.scrollX || document.documentElement.scrollLeft
                    };

                    document.documentElement.style.scrollBehavior = 'unset';
                    Object.assign(document.body.style, {
                        position: 'fixed',
                        width: 'auto',
                        top: `-${body_inline_styles.scroll_Y}px`,
                        left: `-${body_inline_styles.scroll_X}px`,
                        right: `${body_inline_styles.scroll_X}px`,
                    });
                }

                if (this.#params.auto_close > 0) {
                    clearTimeout(timeout);

                    timeout = setTimeout(() => {
                        this.hide();
                    }, this.#params.auto_close * 1000);
                }
            }
        };

        this.hide = (data = null) => {
            // Отложенный show() отменён: ждущие его open() получают null.
            if (this.#pending_show)
                this.#waiting.splice(0).forEach(resolve => resolve(null));
            this.#pending_show = null;

            if (
                this.#state == 'shown' ||
                (this.#params.allow_interrupt && this.#state == 'showing')
            ) {
                Modal.#open = Modal.#open.filter(modal => modal !== this);
                this.#target = 'hidden';
                // Esc и клик по оверлею передают событие — это не результат.
                this.#result = data instanceof Event ? null : data;

                toggle({
                    before_func: this.before_hide,
                    after_func: this.on_hide,
                    process: 'hiding',
                    final: 'hidden',
                    hide: true,
                    data
                });

                clearTimeout(timeout);

                timeout = setTimeout(() => {
                    if (body_inline_styles) {
                        Object.assign(document.body.style, body_inline_styles);
                        window.scrollTo(body_inline_styles.scroll_X, body_inline_styles.scroll_Y);
                    }

                    if (default_scroll_behavior != null)
                        document.documentElement.style.scrollBehavior = default_scroll_behavior;
                    
                }, this.#params.duration * 1000);
            }
        };

        if (this.#params.close_by_esc)
            Modal.#bind_esc();

        if (this.#params.trigger)
            document.querySelectorAll(this.#params.trigger).forEach(trigger => {
                trigger.addEventListener('click', () => this.show(trigger));
            });
        
        this.on_init(this.#params);
    }

    // Фокус возвращается, только если он остался в окне или ушёл на body: пользователь,
    // успевший перейти в другое место, его не теряет.
    #restoreFocus() {
        let target = this.#return_to;
        this.#return_to = null;
        if (!this.#params.return_focus || !target?.isConnected) return;
        let active = document.activeElement;
        if (active && active !== document.body && !this.modal.contains(active)) return;
        target.focus?.({ preventScroll: true });
    }
}