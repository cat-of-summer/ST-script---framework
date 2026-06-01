Класс позволяет быстро создавать статичный блок иконок-ссылок.

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
    links_container: {
        id: undefined, // ['links_container_id']
        class: undefined, // ['links_container_class']
        style: {}
    },
    links: {
        0: {   
            href: 'undefined',
            src: st_links_widget.DEFAULT_ICONS.link, // // Либо ссылка на заполнитель, либо контент <svg></svg> 
            id: undefined,
            class: undefined, // ['links_container_group_1']
            style: {} // //Применяется по ID
        }
    }
}

Пример:

new st_links_widget({});