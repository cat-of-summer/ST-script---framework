class st_button_widget {

    static DEFAULT_ICONS = {
        arrow: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve"><style type="text/css">.st0{fill:#77B3D4;}.st1{opacity:0.2;}.st2{fill:#231F20;}.st3{fill:#FFFFFF;}</style><g id="Layer_1"><g><circle class="st0" cx="32" cy="32" r="32"/></g><g class="st1"><path class="st2" d="M49.5,33.9L35.3,15.7c-1.8-2.3-4.7-2.3-6.5,0L14.5,33.9c-1.8,2.3-1,4.1,1.7,4.1H24v12c0,2.2,1.8,4,4,4h8c2.2,0,4-1.8,4-4V38h7.8C50.6,38,51.3,36.1,49.5,33.9z"/></g><g><path class="st3" d="M40,48c0,2.2-1.8,4-4,4h-8c-2.2,0-4-1.8-4-4V24c0-2.2,1.8-4,4-4h8c2.2,0,4,1.8,4,4V48z"/></g><g><path class="st3" d="M16.2,36c-2.7,0-3.5-1.9-1.7-4.1l14.3-18.1c1.8-2.3,4.7-2.3,6.5,0l14.3,18.1c1.8,2.3,1,4.1-1.7,4.1H16.2z"/></g></g><g id="Layer_2"></g></svg>',
    }

    static #PARAMETERS_PROTOTYPE = {
        settings: {
            position: "bottom-right"
        },
        condition: {
            name: "scroll",
            options: {
                hiding_type: "opacity",
                transition: "0.3s",
                attribute: [],
                margin_top: Math.min(window.innerHeight, document.documentElement.clientHeight),
                margin_left: undefined,
                margin_right: undefined,
                margin_bottom: undefined
            }
        },
        action: {
            name: "scroll",
            options: {
                selector: undefined,
                hiding_type: "opacity",
                setAttribute: undefined,
                removeAttribute: undefined,
                toggleAttribute: undefined,
                top: 0,
                left: undefined,
                behavior: "smooth",
                hook: function(){}
            }
        },
        widget_container: {
            id: undefined, 
            class: undefined,
            style: {}
        },
        widget: {
            id: undefined, 
            class: undefined,
            style: {}
        },
        button_container: {
            id: undefined,
            class: undefined,
            style: {}
        },
        button: {
            src: st_button_widget.DEFAULT_ICONS.arrow
        }
    }

    static #DEFAULT_STYLE_RULES = {
        "widget_container": {
            "position": "fixed",
            "width": "60px",
            "height": "60px",
            "margin": "30px"
        },
        "widget": {
            "position": "absolute"
        },
        "button_container": {
            "display": "flex",
            "justify-content": "center",
            "align-items": "center",
            "overflow": "hidden",
            "width": "60px",
            "height": "60px",
            "border-radius": "50%",
            "cursor": "pointer"
        },
        "button": {
            "width": "100%",
            "height": "100%",
            "object-fit": "cover"
        }
    }

    static #st_assoc_merge(...e){function o(e,o){function t(e,o,f){if("object"==typeof o[e])for(let n in o[e])f[e]||(f[e]={}),t(n,o[e],f[e]);else f[e]=o[e]}for(let f in e)t(f,e,o)}let t={};for(let f of e)o(f,t);return t}

    static #generate_unique_prefix(length) {
        let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

        let result = '';
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    static #hidding_types = {
        "opacity": "0",
        "visibility" : "hidden",
        "display": "none"
    };

    #class_unique_prefix = "st_" + st_button_widget.#generate_unique_prefix(16);

    #widget_container_class = this.#class_unique_prefix + "_wc";
    #widget_class = this.#class_unique_prefix + "_w";
    #button_container_class = this.#class_unique_prefix + "_bc";
    #button_class = this.#class_unique_prefix + "_b";

    #style_CSS = document.createElement('style');
    #widget_container_DOM = document.createElement('div');
    #widget_DOM = document.createElement('div');
    #button_container_DOM = document.createElement('div');

    #put_style_to_CSS(selector, property, value) {
        if (new RegExp(selector + "{.*?" + property + ":.*?;.*?}").test(this.#style_CSS.innerHTML)) {
            this.#style_CSS.innerHTML = this.#style_CSS.innerHTML.replace(new RegExp("(" + selector + "{.*?" + property + ":).*?(;.*?})"), "$1" + value + "$2");
        } else {
            if (new RegExp(selector + "{.*?}").test(this.#style_CSS.innerHTML)) {
                this.#style_CSS.innerHTML = this.#style_CSS.innerHTML.replace(new RegExp("(" + selector + "{.*?)(})"), "$1" + property + ":" + value + ";" + "$2");
            } else {
                this.#style_CSS.innerHTML += selector + "{" + property + ":" + value + ";" + "}";
            }
        }
    }

    #apply_style_rules(selector, style_rules) {
        for (let rule in style_rules) {
            this.#put_style_to_CSS(selector, rule, style_rules[rule]);
        }
    }

    constructor(NEW_PARAMETERS) {

        function get_display_functions(element_DOM, hiding_type, unset = false) {
            return {
                show: function() {
                    element_DOM.style.removeProperty(hiding_type);
                },
                hide: function() {
                    element_DOM.style.setProperty(hiding_type, unset ? "unset" : st_button_widget.#hidding_types[hiding_type]);
                }
            }
        }

        function get_style_rules_for_position(position) {
            switch (position) {
                case "top-left":
                    return {
                        "top": "0",   
                        "left": "0"
                    }
                case "top-right":
                    return {
                        "top": "0",   
                        "right": "0"
                    }
                case "bottom-left":
                    return {
                        "bottom": "0",   
                        "left": "0"
                    }
                case "bottom-right":
                default:
                    return {
                        "bottom": "0",   
                        "right": "0"
                    }
            }
        }

        function get_setAttribute_correct_array_or_null(setAttribute_param) {
            return setAttribute_param ? ((typeof setAttribute_param == "object")? [setAttribute_param[0] ?? "st_active", setAttribute_param[1] ?? "", setAttribute_param[2] ?? ""] : [setAttribute_param ?? "st_active", "", ""]) : null;
        }

        const PARAMETERS = st_button_widget.#st_assoc_merge(st_button_widget.#PARAMETERS_PROTOTYPE, NEW_PARAMETERS);

        this.#apply_style_rules("." + this.#widget_container_class, st_button_widget.#DEFAULT_STYLE_RULES['widget_container']);
        this.#apply_style_rules("." + this.#widget_class, st_button_widget.#DEFAULT_STYLE_RULES['widget']);
        this.#apply_style_rules("." + this.#button_container_class, st_button_widget.#DEFAULT_STYLE_RULES['button_container']);
        this.#apply_style_rules("." + this.#button_class, st_button_widget.#DEFAULT_STYLE_RULES['button']);
  
        this.#apply_style_rules("." + this.#widget_container_class, get_style_rules_for_position(PARAMETERS.settings.position));
        this.#apply_style_rules("." + this.#widget_class, get_style_rules_for_position(PARAMETERS.settings.position));

        this.#widget_container_DOM.classList.add(this.#widget_container_class);
        this.#apply_style_rules("." + this.#widget_container_class, PARAMETERS.widget_container.style);
        if (PARAMETERS.widget_container.class) this.#widget_container_DOM.classList.add(PARAMETERS.widget_container.class);
        if (PARAMETERS.widget_container.id) this.#widget_container_DOM.id = PARAMETERS.widget_container.id;

        this.#widget_DOM.classList.add(this.#widget_class);
        this.#apply_style_rules("." + this.#widget_class, PARAMETERS.widget.style);
        if (PARAMETERS.widget.class) this.#widget_DOM.classList.add(PARAMETERS.widget.class);
        if (PARAMETERS.widget.id) this.#widget_DOM.id = PARAMETERS.widget.id;

        this.#button_container_DOM.classList.add(this.#button_container_class);
        this.#apply_style_rules("." + this.#button_container_class, PARAMETERS.button_container.style);
        if (PARAMETERS.button_container.class) this.#button_container_DOM.classList.add(PARAMETERS.button_container.class);
        if (PARAMETERS.button_container.id) this.#button_container_DOM.id = PARAMETERS.button_container.id;

        if (PARAMETERS.condition) {

            function get_attr_functions(element_DOM, attribute) {
                let correct_attribute = get_setAttribute_correct_array_or_null(attribute);
                return {
                    set: function() {
                        if (correct_attribute) correct_attribute[1] ? element_DOM.setAttribute(correct_attribute[0], correct_attribute[1]) : element_DOM.setAttribute(correct_attribute[0], "");
                    },
                    remove : function() {
                        if (correct_attribute) correct_attribute[1] ? (correct_attribute[2] ? element_DOM.setAttribute(correct_attribute[0], correct_attribute[2]) : element_DOM.setAttribute(correct_attribute[0], "")) : element_DOM.removeAttribute(correct_attribute[0]);
                    }
                }
            }

            if (!PARAMETERS.condition.options.hiding_type in st_button_widget.#hidding_types) return;

            let display_widget = get_display_functions(this.#widget_DOM, PARAMETERS.condition.options.hiding_type);
            let attribute_widget = get_attr_functions(this.#widget_DOM, PARAMETERS.condition.options.attribute);

            display_widget.hide();
            attribute_widget.remove();
            switch (PARAMETERS.condition.name) {
                case 'hover':
                    this.#widget_container_DOM.addEventListener("mouseenter", function() {
                        display_widget.show();
                        attribute_widget.set();
                    });
                    this.#widget_container_DOM.addEventListener("mouseleave", function() {
                        display_widget.hide();
                        attribute_widget.remove();
                    });
                    break;
                case 'scroll':
                default:
                    let window_height = Math.min(window.innerHeight, document.documentElement.clientHeight);
                    let window_width = Math.min(window.innerWidth, document.documentElement.clientWidth);

                    let document_height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight, document.body.clientHeight, document.documentElement.clientHeight);
                    let document_width = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, document.body.offsetWidth, document.documentElement.offsetWidth, document.body.clientWidth, document.documentElement.clientWidth);

                    let margin_top = PARAMETERS.condition.options.margin_top;
                    let margin_bottom = PARAMETERS.condition.options.margin_bottom;
                    let margin_right = PARAMETERS.condition.options.margin_right;
                    let margin_left = PARAMETERS.condition.options.margin_left;

                    window.addEventListener('scroll', function() {
                        let scroll_y_top = window.pageYOffset || window.scrollY || document.documentElement.scrollTop;
                        let scroll_y_bottom = scroll_y_top + window_height;
                        let scroll_x_left = window.pageXOffset || window.scrollX || document.documentElement.scrollLeft
                        let scroll_x_right = scroll_x_left + window_width;

                        if ((scroll_y_top > margin_top) || (scroll_y_bottom < document_height - margin_bottom) || (scroll_x_right < document_width - margin_right) || (scroll_x_left > margin_left)) {
                            display_widget.show();
                            attribute_widget.set();
                        } else {
                            display_widget.hide();
                            attribute_widget.remove();
                        }
                    });
                    break;
            }
            if (PARAMETERS.condition.options.transition) {this.#widget_DOM.style.setProperty("transition", PARAMETERS.condition.options.transition)}
        }

        if (PARAMETERS.action) {
            switch (PARAMETERS.action.name) {
                case 'show_popup':
                    if (!PARAMETERS.action.options.selector) return
                    if (!PARAMETERS.action.options.hiding_type in st_button_widget.#hidding_types) return;

                    this.#button_container_DOM.addEventListener("click", function() {
                        for (let popup of document.querySelectorAll(PARAMETERS.action.options.selector)) {

                            let display_widget = get_display_functions(popup, PARAMETERS.action.options.hiding_type, true);

                            if (popup.style[st_button_widget.#hidding_types[PARAMETERS.action.options.hiding_type]])
                                display_widget.show();
                            else
                                display_widget.hide();
                            
                            if (PARAMETERS.action.options.setAttribute) {
                                let correct_attribute = get_setAttribute_correct_array_or_null(PARAMETERS.action.options.setAttribute);
                                popup.setAttribute(correct_attribute[0], correct_attribute[1]);
                            }
                            if (PARAMETERS.action.options.removeAttribute) popup.removeAttribute(PARAMETERS.action.options.removeAttribute);
                            if (PARAMETERS.action.options.toggleAttribute) popup.toggleAttribute(PARAMETERS.action.options.toggleAttribute);
                        }
                    });
                    
                    break;
                case 'function':
                    this.#button_container_DOM.addEventListener("click", PARAMETERS.action.options.hook);
                    break;
                case 'scroll':
                default:
                    this.#button_container_DOM.addEventListener("click", function() {
                        window.scrollTo({
                            top: PARAMETERS.action.options.top,
                            left: PARAMETERS.action.options.left,
                            behavior: PARAMETERS.action.options.behavior
                        });
                    });
                    break;
            }
        }
        
        if (new RegExp("^<svg.*?</svg>$").test(PARAMETERS.button.src)) {
            this.#button_container_DOM.innerHTML = PARAMETERS.button.src;
        } else {
            this.#button_container_DOM.innerHTML = '<img src=' + PARAMETERS.button.src + ' alt="icon">';
        }
        this.#button_container_DOM.childNodes[0].classList.add(this.#button_class);

        this.#style_CSS.setAttribute("widget", this.#class_unique_prefix);
        document.head.appendChild(this.#style_CSS);

        this.#widget_DOM.appendChild(this.#button_container_DOM);
        this.#widget_container_DOM.appendChild(this.#widget_DOM);
        document.querySelector("body").appendChild(this.#widget_container_DOM);
    }
}

export default st_button_widget;
