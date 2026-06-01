class st_links_widget {

    static DEFAULT_ICONS = {
        link: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g id="chain"><circle cx="16" cy="16" fill="#33d9b2" r="16" style="fill: rgb(119, 179, 212);"></circle><g fill="#fff" fill-rule="evenodd"><path d="m16.75 10h-7.5a.5.5 0 0 0 -.5.5v12a.5.5 0 0 0 .5.5h12a.5.5 0 0 0 .5-.5v-7.5a.5.5 0 0 0 -1 0v7h-11v-11h7a.5.5 0 0 0 0-1z" fill="#fff" style="fill: rgb(255, 255, 255);"></path><path d="m21.543 9.5-6.643 6.646a.5.5 0 0 0 .708.707l6.646-6.646v1.793a.5.5 0 0 0 1 0v-3a.5.5 0 0 0 -.5-.5h-3a.5.5 0 0 0 0 1z" fill="#fff" style="fill: rgb(255, 255, 255);"></path></g></g></svg>',
        email: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve"><style type="text/css">.st0{fill:#77B3D4;}.st1{opacity:0.2;}.st2{fill:#231F20;}.st3{fill:#E0E0D1;}.st4{fill:#FFFFFF;}</style><g id="Layer_1"><g><circle class="st0" cx="32" cy="32" r="32"/></g><g><g class="st1"><path class="st2" d="M52,44c0,2.2-1.8,4-4,4H16c-2.2,0-4-1.8-4-4V24c0-2.2,1.8-4,4-4h32c2.2,0,4,1.8,4,4V44z"/></g><g><path class="st3" d="M52,42c0,2.2-1.8,4-4,4H16c-2.2,0-4-1.8-4-4V22c0-2.2,1.8-4,4-4h32c2.2,0,4,1.8,4,4V42z"/></g><g class="st1"><g><path class="st2" d="M35.5,30.2c-1.9-2.1-5.1-2.1-7,0L13,43.2c-0.2,0.2-0.3,0.4-0.5,0.6c0.7,1.3,2,2.2,3.4,2.2h32c1.5,0,2.7-0.9,3.4-2.2c-0.1-0.2-0.3-0.4-0.5-0.6L35.5,30.2z"/></g></g><g><g><path class="st3" d="M35.5,32c-1.9-1.9-5.1-1.9-7,0L13,43.5c-0.2,0.2-0.3,0.3-0.5,0.5c0.7,1.2,2,1.9,3.4,1.9h32c1.5,0,2.7-0.8,3.4-1.9c-0.1-0.2-0.3-0.3-0.5-0.5L35.5,32z"/></g></g><g class="st1"><g><path class="st2" d="M12.6,20.2c0.7-1.3,2-2.2,3.4-2.2h32c1.5,0,2.7,0.9,3.4,2.2c-0.1,0.2-0.3,0.4-0.5,0.6l-15.4,13c-1.9,2.1-5.1,2.1-7,0L12.6,20.2z"/></g></g><g><g><path class="st4" d="M28.5,32c1.9,1.9,5.1,1.9,7,0L51,20.5c0.2-0.2,0.3-0.3,0.5-0.5c-0.7-1.2-2-1.9-3.4-1.9H16c-1.5,0-2.7,0.8-3.4,1.9c0.1,0.2,0.3,0.3,0.5,0.5L28.5,32z"/></g></g></g></g><g id="Layer_2"></g></svg>',
        telegram: '<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid"><g><path d="M128,0 C57.307,0 0,57.307 0,128 L0,128 C0,198.693 57.307,256 128,256 L128,256 C198.693,256 256,198.693 256,128 L256,128 C256,57.307 198.693,0 128,0 L128,0 Z" fill="#40B3E0"></path><path d="M190.2826,73.6308 L167.4206,188.8978 C167.4206,188.8978 164.2236,196.8918 155.4306,193.0548 L102.6726,152.6068 L83.4886,143.3348 L51.1946,132.4628 C51.1946,132.4628 46.2386,130.7048 45.7586,126.8678 C45.2796,123.0308 51.3546,120.9528 51.3546,120.9528 L179.7306,70.5928 C179.7306,70.5928 190.2826,65.9568 190.2826,73.6308" fill="#FFFFFF"></path><path d="M98.6178,187.6035 C98.6178,187.6035 97.0778,187.4595 95.1588,181.3835 C93.2408,175.3085 83.4888,143.3345 83.4888,143.3345 L161.0258,94.0945 C161.0258,94.0945 165.5028,91.3765 165.3428,94.0945 C165.3428,94.0945 166.1418,94.5735 163.7438,96.8115 C161.3458,99.0505 102.8328,151.6475 102.8328,151.6475" fill="#D2E5F1"></path><path d="M122.9015,168.1154 L102.0335,187.1414 C102.0335,187.1414 100.4025,188.3794 98.6175,187.6034 L102.6135,152.2624" fill="#B5CFE4"></path></g></svg>',
        whatsapp: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><title>Whatsapp-color</title><desc>Created with Sketch.</desc><defs></defs><g id="Icons" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"><g id="Color-" transform="translate(-700.000000, -360.000000)" fill="#67C15E"><path d="M723.993033,360 C710.762252,360 700,370.765287 700,383.999801 C700,389.248451 701.692661,394.116025 704.570026,398.066947 L701.579605,406.983798 L710.804449,404.035539 C714.598605,406.546975 719.126434,408 724.006967,408 C737.237748,408 748,397.234315 748,384.000199 C748,370.765685 737.237748,360.000398 724.006967,360.000398 L723.993033,360.000398 L723.993033,360 Z M717.29285,372.190836 C716.827488,371.07628 716.474784,371.034071 715.769774,371.005401 C715.529728,370.991464 715.262214,370.977527 714.96564,370.977527 C714.04845,370.977527 713.089462,371.245514 712.511043,371.838033 C711.806033,372.557577 710.056843,374.23638 710.056843,377.679202 C710.056843,381.122023 712.567571,384.451756 712.905944,384.917648 C713.258648,385.382743 717.800808,392.55031 724.853297,395.471492 C730.368379,397.757149 732.00491,397.545307 733.260074,397.27732 C735.093658,396.882308 737.393002,395.527239 737.971421,393.891043 C738.54984,392.25405 738.54984,390.857171 738.380255,390.560912 C738.211068,390.264652 737.745308,390.095816 737.040298,389.742615 C736.335288,389.389811 732.90737,387.696673 732.25849,387.470894 C731.623543,387.231179 731.017259,387.315995 730.537963,387.99333 C729.860819,388.938653 729.198006,389.89831 728.661785,390.476494 C728.238619,390.928051 727.547144,390.984595 726.969123,390.744481 C726.193254,390.420348 724.021298,389.657798 721.340985,387.273388 C719.267356,385.42535 717.856938,383.125756 717.448104,382.434484 C717.038871,381.729275 717.405907,381.319529 717.729948,380.938852 C718.082653,380.501232 718.421026,380.191036 718.77373,379.781688 C719.126434,379.372738 719.323884,379.160897 719.549599,378.681068 C719.789645,378.215575 719.62006,377.735746 719.450874,377.382942 C719.281687,377.030139 717.871269,373.587317 717.29285,372.190836 Z" id="Whatsapp"></path></g></g></svg>',
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
        links_container: {
            id: undefined,
            class: undefined,
            style: {}
        },
        links: {
            0: {   
                href: 'undefined',
                src: st_links_widget.DEFAULT_ICONS.link,
                id: undefined,
                class: undefined, 
                style: {}
            }
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
            "position": "absolute",
            "display": "flex",
            "flex-direction": "column",
            "gap": "15px"
        },
        "links_container": {
            "display": "flex",
            "justify-content": "center",
            "align-items": "center",
            "overflow": "hidden",
            "width": "60px",
            "height": "60px",
            "border-radius": "50%",
            "cursor": "pointer"
        },
        "link": {
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

    #class_unique_prefix = "st_" + st_links_widget.#generate_unique_prefix(16);

    #widget_container_class = this.#class_unique_prefix + "_wc";
    #widget_class = this.#class_unique_prefix + "_w";
    #links_container_class = this.#class_unique_prefix + "_ic";
    #link_class = this.#class_unique_prefix + "_i";

    #style_CSS = document.createElement('style');
    #widget_DOM = document.createElement('div');
    #widget_container_DOM = document.createElement('div');

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
                    element_DOM.style.setProperty(hiding_type, unset ? "unset" : st_links_widget.#hidding_types[hiding_type]);
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

        const PARAMETERS = st_links_widget.#st_assoc_merge(st_links_widget.#PARAMETERS_PROTOTYPE, NEW_PARAMETERS);

        this.#apply_style_rules("." + this.#widget_container_class, st_links_widget.#DEFAULT_STYLE_RULES['widget_container']);
        this.#apply_style_rules("." + this.#widget_class, st_links_widget.#DEFAULT_STYLE_RULES['widget']);
        this.#apply_style_rules("." + this.#links_container_class, st_links_widget.#DEFAULT_STYLE_RULES['links_container']);
        this.#apply_style_rules("." + this.#link_class, st_links_widget.#DEFAULT_STYLE_RULES['link']);

        this.#apply_style_rules("." + this.#widget_container_class, get_style_rules_for_position(PARAMETERS.settings.position));
        this.#apply_style_rules("." + this.#widget_class, get_style_rules_for_position(PARAMETERS.settings.position));

        this.#apply_style_rules("." + this.#links_container_class, PARAMETERS.links_container.style);

        this.#widget_container_DOM.classList.add(this.#widget_container_class);
        this.#apply_style_rules("." + this.#widget_container_class, PARAMETERS.widget_container.style);
        if (PARAMETERS.widget_container.class) this.#widget_container_DOM.classList.add(PARAMETERS.widget_container.class);
        if (PARAMETERS.widget_container.id) this.#widget_container_DOM.id = PARAMETERS.widget_container.id;

        this.#widget_DOM.classList.add(this.#widget_class);
        this.#apply_style_rules("." + this.#widget_class, PARAMETERS.widget.style);
        if (PARAMETERS.widget.class) this.#widget_DOM.classList.add(PARAMETERS.widget.class);
        if (PARAMETERS.widget.id) this.#widget_DOM.id = PARAMETERS.widget.id;

        if (PARAMETERS.condition) {

            function get_attr_functions(element_DOM, attribute) {

                function get_setAttribute_correct_array_or_null(setAttribute_param) {
                    return setAttribute_param ? ((typeof setAttribute_param == "object")? [setAttribute_param[0] ?? "st_active", setAttribute_param[1] ?? "", setAttribute_param[2] ?? ""] : [setAttribute_param ?? "st_active", "", ""]) : null;
                }

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

            if (!PARAMETERS.condition.options.hiding_type in st_links_widget.#hidding_types) return;

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

        for (let link_id in PARAMETERS.links) {
            let links_container = document.createElement('a');

            links_container.classList.add(this.#links_container_class);
            if (PARAMETERS.links_container.class) links_container.classList.add(PARAMETERS.links_container.class);
            if (PARAMETERS.links[link_id].class) links_container.classList.add(PARAMETERS.links[link_id].class);
            if (PARAMETERS.links[link_id].id) {
                links_container.id = PARAMETERS.links[link_id].id;
                this.#apply_style_rules("#" + PARAMETERS.links[link_id].id, PARAMETERS.links[link_id].style);
            }

            links_container.setAttribute("href", PARAMETERS.links[link_id].href);
            links_container.setAttribute("target", "_blank");
            links_container.setAttribute("rel", "nofollow noopener noreferrer");

            if (new RegExp("^<svg.*?</svg>$").test(PARAMETERS.links[link_id].src)) {
                links_container.innerHTML = PARAMETERS.links[link_id].src;
            } else {
                links_container.innerHTML = '<img src=' + PARAMETERS.links[link_id].src + ' alt="icon">';
            }
            links_container.childNodes[0].classList.add(this.#link_class);

            this.#widget_DOM.appendChild(links_container);
        }

        this.#style_CSS.setAttribute("widget", this.#class_unique_prefix);
        document.head.appendChild(this.#style_CSS);

        this.#widget_container_DOM.appendChild(this.#widget_DOM);
        document.querySelector("body").appendChild(this.#widget_container_DOM);
    }

}

export default st_links_widget;
