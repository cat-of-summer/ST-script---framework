export default class st_modal {
    static #instance = Symbol();

    modal;
    overlay;
    container;
    content;

    #params = {};
    #methods = {};
    #state = 'hidden';

    static #find_element(param) {
        try {
            return param instanceof Element
                ? param
                : document.querySelector(param);
        } catch {
            return undefined;
        }
    }

    static find(tag) {
        return st_modal.#find_element(tag)[st_modal.#instance];
    }

    get state() {return this.#state;}
    get params() {return this.#params;}

    clone(params) {
        let content = this.content.cloneNode(true);
        content.id = params.id ?? (content.id || 'modal').replace(/#+$/, '') + (params.suffix ?? '_copy');

        return new st_modal({
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
            trigger: null,

            close_by_overlay: true,
            close_by_esc: true,
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
        this.modal[st_modal.#instance] = this;

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
            overflowY: 'auto',
            alignItems: 'flex-start',
        });
        
        this.modal.setAttribute('state', 'hidden');

        try {
            st_modal.#find_element(this.#params.container).append(this.modal);
        } catch {
            throw new Error("Неудачная попытка вставить модальное окно в указанный контейнер");
        }

        if (this.#params.overlay) {
            this.overlay = document.createElement('overlay');
            this.overlay[st_modal.#instance] = this;

            Object.assign(this.overlay.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                backgroundColor: `rgba(0, 0, 0, ${this.#params.overlay_shading})`,
                backdropFilter: `blur(${this.#params.overlay_blur})`,
                zIndex: ++this.#params.zIndex,
                transition: 'inherit',
                pointerEvents: 'all',
            });
            
            this.modal.append(this.overlay);

            if (this.#params.close_by_overlay)
                this.overlay.addEventListener('click', () => this.hide(this.overlay));
        }

        this.container = document.createElement('container');
        this.container[st_modal.#instance] = this;

        const loc = (this.#params.location || '').toLowerCase().split(/\s+/);

        Object.assign(this.container.style, {
            position: 'relative',
            flexShrink: '0',
            width: 'max-content',
            height: 'max-content',
            maxWidth: '100vw',
            zIndex: ++this.#params.zIndex,
            transition: 'inherit',
            pointerEvents: 'all',
            marginTop:    loc.includes('top')    ? '0' : 'auto',
            marginBottom: loc.includes('bottom') ? '0' : 'auto',
            marginLeft:   loc.includes('left')   ? '0' : 'auto',
            marginRight:  loc.includes('right')  ? '0' : 'auto',
        });

        this.modal.append(this.container);

        try {
            this.content = st_modal.#find_element(this.#params.content) ??
                (new DOMParser()).parseFromString(this.#params.content, 'text/html').body.firstElementChild;
        } catch {
            throw new Error("Неудачная попытка вставить переданный контент в модальное окно");
        }

        this.container.append(this.content);
        this.content[st_modal.#instance] = this;
        this.content.style.transition = 'inherit';

        this.content.querySelectorAll(`[action="close"]`).forEach(close_button => {
            close_button.addEventListener('click', () => this.hide());
        });

        let toggle = (params) => {
            params.before_func(params.data);
            
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

                    }, this.#params.duration * 1000);
                });
            });

        }

        this.show = (data = null) => {
            if (
                this.#state == 'hidden' ||
                (this.#params.allow_interrupt && this.#state == 'hiding')
            ) {
                toggle({
                    before_func: this.before_show,
                    after_func: this.on_show,
                    process: 'showing',
                    final: 'shown',
                    hide: false,
                    data
                });

                if (this.#params.overlay_scroll_lock && this.overlay) {
                    default_scroll_behavior = document.documentElement.style.scrollBehavior;

                    body_inline_styles = document.body.style;
                    body_inline_styles = {
                        position: body_inline_styles.position,
                        top: body_inline_styles.top,
                        left: body_inline_styles.left,
                        width: body_inline_styles.width,
                        scroll_Y: window.scrollY || document.documentElement.scrollTop,
                        scroll_X: window.scrollX || document.documentElement.scrollLeft
                    };

                    document.documentElement.style.scrollBehavior = 'unset';
                    Object.assign(document.body.style, {
                        position: 'fixed',
                        width: '100vw',
                        top: `-${body_inline_styles.scroll_Y}px`,
                        left:`-${body_inline_styles.scroll_X}px`,
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
            if (
                this.#state == 'shown' ||
                (this.#params.allow_interrupt && this.#state == 'showing')
            ) {
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
            document.addEventListener('keydown', e => {
                if ((e.code === 'Escape' || e.keyCode === 27)) this.hide(e);
            });

        if (this.#params.trigger)
            document.querySelectorAll(this.#params.trigger).forEach(trigger => {
                trigger.addEventListener('click', () => this.show(trigger));
            });
        
        this.on_init(this.#params);
    }
}
