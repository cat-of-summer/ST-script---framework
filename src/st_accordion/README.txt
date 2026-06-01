Класс позволяет связать любую HTML-структуру в аккордион, задать параметры отображения для любых тегов и т.п.

Прототип:

Комментарии к параметрам даны в виде: "по умолчанию" // [возможные варианты] ->[условие применения] // дополнительные комментарии

static #PARAMETERS_PROTOTYPE = {
        settings: {
            namespace: "st_", // // Этот префикс будет перед всеми атрибутами аккордиона, позволяет тонко настраивать вложенность
            caption_attribute: "caption", // // Атрибут для управляющих кнопок (заголовков) аккордиона
            content_attribute: "content", // // Атрибут для управляемых блоков (контента) аккордиона
            target_attribute: "target", // // Атрибут управляющих кнопок, селектор управляемого блока
            group_attribute: "group" // // Атрибут управляющих кнопок, связывает кнопки взаимовыключаемым способом
        },
        options: {
            accordion_selector: undefined, // // Обязательный параметр, селектор для самого аккордиона
            hiding_type: "display", // ["opacity", "visibility", "display"] // Возможные варианты описаны в class.#hidding_types
            transition: undefined,
            trigger: "click", // ["click", "hover"]
            attribute: [], // [[], "attr_name", ["attr_name", "value_1", "value_2"] и т.п.]
        }
    }

Пример: 

new st_accordion({
    options: {
        accordion_selector: "#accordion_id"
    }
});