class st_accordion {

    static #PARAMETERS_PROTOTYPE = {
        settings: {
            namespace: "st_",
            caption_attribute: "caption",
            content_attribute: "content",
            target_attribute: "target",
            group_attribute: "group"
        },
        options: {
            accordion_selector: undefined,
            hiding_type: "display",
            transition: undefined,
            trigger: "click",
            attribute: []
        }
    }

    static #hidding_types = {
        "opacity": "0",
        "visibility": "hidden",
        "display": "none"
    };

    static #triggers = [
        "click",
        "hover"
    ];

    static #st_assoc_merge(...e){function o(e,o){function t(e,o,f){if("object"==typeof o[e])for(let n in o[e])f[e]||(f[e]={}),t(n,o[e],f[e]);else f[e]=o[e]}for(let f in e)t(f,e,o)}let t={};for(let f of e)o(f,t);return t}

    constructor(NEW_PARAMETERS) {

        function get_display_functions(hiding_type, unset = false) {
            return {
                show: function(element_DOM) {
                    element_DOM.style.removeProperty(hiding_type);
                },
                hide: function(element_DOM) {
                    element_DOM.style.setProperty(hiding_type, unset ? "unset" : st_accordion.#hidding_types[hiding_type]);
                }
            }
        }

        function get_attr_functions(attribute) {

            function get_setAttribute_correct_array_or_null(setAttribute_param) {
                return (typeof setAttribute_param == "object") ? [setAttribute_param[0] ?? "st_active", setAttribute_param[1] ?? "", setAttribute_param[2] ?? ""] : [setAttribute_param ?? "st_active", "", ""];
            }

            function isActive(element_DOM , correct_attribute) {
                return correct_attribute ? (correct_attribute[1] ? (element_DOM.getAttribute(correct_attribute[0]) == correct_attribute[1]) : element_DOM.hasAttribute(correct_attribute[0])) : false;
            }

            function set(element_DOM, correct_attribute) {
                if (correct_attribute) 
                    correct_attribute[1] ? element_DOM.setAttribute(correct_attribute[0], correct_attribute[1]) : element_DOM.setAttribute(correct_attribute[0], "");
            }

            function remove(element_DOM, correct_attribute) {
                if (correct_attribute) 
                    correct_attribute[1] ? (correct_attribute[2] ? element_DOM.setAttribute(correct_attribute[0], correct_attribute[2]) : element_DOM.setAttribute(correct_attribute[0], "")) : element_DOM.removeAttribute(correct_attribute[0]);
            }

            let correct_attribute = get_setAttribute_correct_array_or_null(attribute);

            return {
                set: function(element_DOM) {
                    set(element_DOM, correct_attribute);
                },
                remove : function(element_DOM) {
                    remove(element_DOM, correct_attribute);
                },
                toggle: function(element_DOM) {
                    if (correct_attribute) 
                        correct_attribute[1] ? isActive(element_DOM, correct_attribute) ? remove(element_DOM, correct_attribute) : set(element_DOM, correct_attribute) : element_DOM.toggleAttribute(correct_attribute[0])
                },
                isActive: function(element_DOM) {
                    return isActive(element_DOM, correct_attribute);
                }
            }
        }

        function isHiding(hiding_type, element_DOM) {
            if (!element_DOM.hasAttribute(hiding_type)) return false;
            return element_DOM.getAttribute(hiding_type) == st_accordion.#hidding_types[hiding_type] ? true : false;
        }

        NEW_PARAMETERS = st_accordion.#st_assoc_merge(st_accordion.#PARAMETERS_PROTOTYPE, NEW_PARAMETERS);

        NEW_PARAMETERS.settings.caption_attribute = NEW_PARAMETERS.settings.namespace + NEW_PARAMETERS.settings.caption_attribute;
        NEW_PARAMETERS.settings.content_attribute = NEW_PARAMETERS.settings.namespace + NEW_PARAMETERS.settings.content_attribute;
        NEW_PARAMETERS.settings.target_attribute = NEW_PARAMETERS.settings.namespace + NEW_PARAMETERS.settings.target_attribute;
        NEW_PARAMETERS.settings.group_attribute = NEW_PARAMETERS.settings.namespace + NEW_PARAMETERS.settings.group_attribute;

        const PARAMETERS = NEW_PARAMETERS;

        if (!PARAMETERS.options.hiding_type in st_accordion.#hidding_types) return;
        if (!PARAMETERS.options.trigger in st_accordion.#triggers) return;
        if (!PARAMETERS.options.accordion_selector) return;

        let display_functions = get_display_functions(PARAMETERS.options.hiding_type);
        let attribute_functions = get_attr_functions(PARAMETERS.options.attribute);

        for (let accordion_DOM of document.querySelectorAll(PARAMETERS.options.accordion_selector)) {
            for (let content of accordion_DOM.querySelectorAll("["+PARAMETERS.settings.content_attribute+"]")) {
                display_functions.hide(content);
                if (PARAMETERS.options.transition) content.style.setProperty("transition", PARAMETERS.options.transition);
            }

            for (let caption of accordion_DOM.querySelectorAll("["+PARAMETERS.settings.caption_attribute+"]")) {
                attribute_functions.remove(caption);

                let general_trigger_action = function(caption) {
                    if (caption.hasAttribute(PARAMETERS.settings.group_attribute)) 
                        for (let group_item of accordion_DOM.querySelectorAll("["+PARAMETERS.settings.caption_attribute+"]["+PARAMETERS.settings.group_attribute+"="+caption.getAttribute(PARAMETERS.settings.group_attribute)+"]"))
                            if (group_item != caption) {
                                attribute_functions.remove(group_item);
                                if (group_item.hasAttribute(PARAMETERS.settings.target_attribute))
                                    for (let target_item of accordion_DOM.querySelectorAll(group_item.getAttribute(PARAMETERS.settings.target_attribute)+"["+PARAMETERS.settings.content_attribute+"]"))
                                        display_functions.hide(target_item);
                            }
                            
                        let active_handler = {
                            isTrue: function(element_DOM) {
                                attribute_functions.remove(element_DOM);
                                return function (target_item) {display_functions.hide(target_item)};
                            },
                            isFalse: function(element_DOM) {
                                attribute_functions.set(element_DOM);
                                return function (target_item) {display_functions.show(target_item)};
                            }
                        }
                        
                        let action_with_targets = attribute_functions.isActive(caption) ? active_handler.isTrue(caption): active_handler.isFalse(caption);
  
                        if (caption.hasAttribute(PARAMETERS.settings.target_attribute))
                            for (let target_item of accordion_DOM.querySelectorAll(caption.getAttribute(PARAMETERS.settings.target_attribute)+"["+PARAMETERS.settings.content_attribute+"]")) 
                                action_with_targets(target_item);
                }

                switch (PARAMETERS.options.trigger) {
                    case "hover":
                        // caption.addEventListener("mouseenter", function() {

                        //     if (this.hasAttribute(PARAMETERS.settings.target_attribute)) 
                        //         for (let target_item of accordion_DOM.querySelectorAll(this.getAttribute(PARAMETERS.settings.target_attribute)+"["+PARAMETERS.settings.content_attribute+"]")) 
                        //             if ((target_item == event.relatedTarget) && (!isHiding(PARAMETERS.options.hiding_type, target_item))) return;
                            
                        //     general_trigger_action(this);
                        // });
                        
                        // caption.addEventListener("mouseleave", function() {
                        //     if (this.hasAttribute(PARAMETERS.settings.target_attribute)) 
                        //         for (let target_item of accordion_DOM.querySelectorAll(this.getAttribute(PARAMETERS.settings.target_attribute)+"["+PARAMETERS.settings.content_attribute+"]")) 
                        //             if (target_item == event.relatedTarget) return;
                            
                        //     for (let target_item of accordion_DOM.querySelectorAll(this.getAttribute(PARAMETERS.settings.target_attribute)+"["+PARAMETERS.settings.content_attribute+"]")) 
                        //         display_functions.hide(target_item);
                            
                        //     attribute_functions.remove(this);
                        // })
                        // break;
                    case "click":
                    default:
                        caption.addEventListener("click", function() {general_trigger_action(this)});
                        break;
                }
            }
        }
    }


    
  }

export default st_accordion;
