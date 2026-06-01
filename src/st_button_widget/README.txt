Класс позволяет быстро создавать кнопку с различным функционалом.

Прототип:

Комментарии к параметрам даны в виде: "по умолчанию" // [возможные варианты] ->[условие применения] // дополнительные комментарии

static #PARAMETERS_PROTOTYPE = {
    settings: {
        position: "bottom-right" // ["top-left", "top-right", "bottom-left", "bottom-right"]
    },
    condition: {
        name: "scroll", // ["hover", "scroll"]
        options: {
            hiding_type: "opacity", // ["opacity", "visibility", "display"] //Возможные варианты описаны в class.#hidding_types
            transition: "0.3s", // ->[hover, scroll]
            attribute: [], // [[], "attr_name", ["attr_name", "value_1", "value_2"] и т.п.] ->[hover, scroll]
            margin_top: Math.min(window.innerHeight, document.documentElement.clientHeight), // [->scroll] //Отступ, до которого виджет скрыт
            margin_left: undefined, // [->scroll]
            margin_right: undefined, // [->scroll]
            margin_bottom: undefined // [->scroll]
        }
    },
    action: {
        name: "scroll",  // ['scroll', 'show_popup', 'function']
        options: {
            selector: undefined, // ->['show_popup'] // Обязательный параметр, кнопка будет менять его свойства (убирать) или менять теги
            hiding_type: "opacity", // ["opacity", "visibility", "display"] //Возможные варианты описаны в class.#hidding_types
            setAttribute: undefined, // [[], "attr_name", ["attr_name", "value_1", "value_2"] и т.п.] ->[Возможна смена тегов для всех]
            removeAttribute: undefined, // // Аналогично предыдущему
            toggleAttribute: undefined, // // Аналогично предыдущему
            top: 0, // ->['scroll'] // Параметр для ScrollTo 
            left: undefined, // ->['scroll'] // Параметр для ScrollTo 
            behavior: "smooth", // ->['scroll'] // Параметр для ScrollTo 
            hook: function(){} // //Функция, привязываемая к нажатию кнопки
        }
    },
    widget_container: {
        id: undefined, // ['widget_container_id']
        class: undefined, // ['widget_container_class']
        style: {
            //'property1': 'property1_value', // Параметры и далее в таком виде
            //'property2': 'property2_value',
        }
    },
    widget: {
        id: undefined, // ['widget_id']
        class: undefined, // ['widget_class']
        style: {}
    },
    button_container: {
        id: undefined, // ['button_container_id']
        class: undefined, // ['button_container_class']
        style: {}
    },
    button: {
        src: st_button_widget.DEFAULT_ICONS.arrow // // Либо ссылка на заполнитель, либо контент <svg></svg> 
    }
}

Пример:

new st_button_widget({});