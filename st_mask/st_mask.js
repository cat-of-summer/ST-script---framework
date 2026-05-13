class st_mask {
    
    #default_filler = '_';
    #placeholder = true;
    #mask_array = [];
    #inputs = [];

    #apply_mask(mask, input_string) {
        let result = "";
        let static_mask_index = 0;
        let dynamic_mask_index = 0;
    
        for (let char of input_string) {
            while (dynamic_mask_index + static_mask_index < mask.length) {
                let [value, is_regexp, filler] = mask[dynamic_mask_index + static_mask_index];
        
                if (!is_regexp) result += value, static_mask_index++;
                else {
                    if (new RegExp(`^${value}$`).test(char)) result += char, dynamic_mask_index++;
                    break;
                }
            }
        }
        
        if (this.#default_filler && this.#placeholder)
            while (dynamic_mask_index + static_mask_index < mask.length)
                result += mask[dynamic_mask_index + static_mask_index++][1] 
                    ? mask[dynamic_mask_index + static_mask_index - 1][2] 
                    : mask[dynamic_mask_index + static_mask_index - 1][0];
        else if (!dynamic_mask_index) result = '';
        else if (dynamic_mask_index + static_mask_index < mask.length && !mask[dynamic_mask_index + static_mask_index][1]) 
            result += mask[dynamic_mask_index + static_mask_index++][0];
        
        return [result, dynamic_mask_index, mask.filter(mask_char => mask_char[1]).length == dynamic_mask_index];
    }

    #return_best_mask(raw_value) {
        return this.#mask_array
            .map(mask => this.#apply_mask(mask, raw_value))
            .reduce((best, value, index) => (!best || value[1] > best[0][1] 
                ? [value, index] 
                : best)
            , null);
    }

    #prepare_mask(mask) {
        return mask.replace(/{(\d+)\*{([^}]*?)}(.*?)}/g, (_, g1, g2, g3) => (`{{${g2}}${g3}}`).repeat(g1))
            .split(/({{.*?}.*?})/)
            .filter(Boolean)
            .map(value => {
                let [, inner_value] = value.match(/^{{(.*?)}.*?}$/) || [];
                let [, filler] = value.match(/^{{.*?}=(.*?)}$/) || [];
                return [inner_value || value, !!inner_value, filler || this.#default_filler];
            })
    }

    #refresh_mask(input_object = null) {
        if (this.#is_mask_array_empty()) {
            console.warn('Попытка обновить маску после удаления правил', this);
            return;
        }

        (input_object ? [input_object] : this.#inputs).forEach(obj => {
            obj.best_mask = this.#return_best_mask(obj.value);
            obj.input.value = obj.best_mask[0][0];
            Object.assign(obj.input.dataset, {
                mask_id: obj.best_mask[1], 
                progress: obj.best_mask[0][1], 
                is_full: obj.best_mask[0][2]
            });
        });
    }

    #is_mask_array_empty() {
        return !this.#mask_array.some(item => !item != null);
    }

    add_mask(mask) {
        this.#mask_array.push(this.#prepare_mask(mask));

        this.#refresh_mask();

        return this.#mask_array.length - 1;
    }

    remove_mask(index) {
        delete this.#mask_array[index];

        this.#refresh_mask();
    }

    set_masks(masks) {
        this.#mask_array = masks.map((mask) => {
            return this.#prepare_mask(mask);
        });

        this.#refresh_mask();
    }

    constructor(param) {
        let $this = this;
        
        $this.#default_filler = param.default_filler ?? $this.#default_filler;
        $this.#placeholder = param.placeholder ?? $this.#placeholder;

        let elements = param.inputs
            ? (param.inputs instanceof Element ? [param.inputs] : Array.from(param.inputs))
            : Array.from(document.querySelectorAll(param.selector));

        elements.forEach(input => {

            let input_object = {
                input: input,
                value: input.value.split().filter(Boolean)
            };
            
            input.addEventListener("input", (event) => {
                event.preventDefault();
                
                if (this.#is_mask_array_empty()) {
                    console.error('Нет масок для этого поля.', this);
                    return;
                }

                if (event.data === null) {
                    let new_raw_value = [];

                    for (let char of input_object.value) {
                        new_raw_value.push(char);
                    
                        if (this.#apply_mask(this.#mask_array[input_object.best_mask[1]], new_raw_value)[1] == input_object.best_mask[0][1]) {
                            new_raw_value.pop();
                            break;
                        }
                    }
                    
                    input_object.value = new_raw_value;
                } else
                    input_object.value.push(...event.data);      

                $this.#refresh_mask(input_object);
                
                if (typeof param.on_input === 'function')
                    param.on_input(input, {
                        mask_id: input_object.best_mask[1], 
                        progress: input_object.best_mask[0][1], 
                        is_full: input_object.best_mask[0][2]
                    });
            });

            $this.#inputs.push(input_object);

            input.closest('form')?.addEventListener('reset', () => {
                input_object.value = [];
                $this.#refresh_mask(input_object);
            });
        });

        if (param.masks)
            $this.set_masks(param.masks);
    }

}

class n_st_mask {
    constructor (params) {
        params = {
            masks: ["{{\\d}} {2*{\\w}=А}"], //Надо сделать бесконечность + повторения блоков, типо для чисел \d\d\d \d\d\d \d\d\d ...
            filler: '_',
            placeholder: true,
            reverse_input_order: false,

            on_input: () => {},
            on_fill: () => {},

            ...params
        };


    }
}