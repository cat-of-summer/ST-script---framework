import { elements } from '../_traits/hasInstanceSymbol.js';

class st_select {
    constructor (params = {}) {
        
        let position = params.position || '';
        let hide_rule = {
            height: 'height: 0px;',
            width: 'width: 0%;',
            opacity: 'opacity: 0;',
            visibility: 'visibility: hidden;',
        }[params.hiding_method] || 'display: none;';

        document.querySelectorAll(params.selector || 'select').forEach(select => {
            let select_container = document.createElement('div');
            let options_container = document.createElement('div');

            select_container.setAttribute('type', 'select_container');
            select_container.style.cssText = 'display: inline-block; position: relative;';
            
            options_container.setAttribute('type', 'options_container');
            options_container.style.cssText = `position: absolute; overflow: hidden;
                ${position.includes('horizontal')
                    ? `${position.includes('left')
                            ? 'right: 100%;'
                            : 'left: 100%;'
                        } ${position.includes('top')
                            ? 'top: -100%;'
                            : position.includes('bottom')
                                ? 'top: 100%'
                                : 'top: 0;'
                        } 
                    height: 100%; display: flex;`
                    : `${position.includes('right')
                            ? 'left: 100%;'
                            : position.includes('left')
                                ? 'right: 100%;'
                                : 'left: 0;'
                        } ${position.includes('top')
                            ? 'top: -100%;'
                            : 'top: 100%;'
                        } 
                    width: 100%;`
            } ${hide_rule}`;

            select.parentNode.insertBefore(select_container, select);
            select_container.append(select, options_container);

            select.addEventListener('mousedown', (event) => {
                event.preventDefault();

                if (options_container.style.cssText.includes(hide_rule))
                    options_container.style.cssText = options_container.style.cssText.replace(hide_rule, position.includes('horizontal')
                        ? params.hiding_method == 'width' 
                            ? `width: ${options_container.scrollWidth}px;`
                            : params.hiding_method == 'height'
                                ? 'height: 100%;'
                                : ''
                        : params.hiding_method == 'height' 
                            ? `height: ${options_container.scrollHeight}px;`
                            : params.hiding_method == 'width'
                                ? 'width: 100%;'
                                : ''
                    );
                else if ((params.hide_on || []).includes('toggle_click'))
                    options_container.style.cssText += hide_rule;
            });
            
            if ((params.hide_on || []).includes('outside_click'))
                document.addEventListener('click', (event) => {
                    if (!select_container.contains(event.target))
                    options_container.style.cssText += hide_rule;
                });

            select.querySelectorAll('option').forEach(option => {
                options_container.appendChild(option);
                option.addEventListener('click', () => {
                    select.innerHTML = option.outerHTML;
                    if ((params.hide_on || []).includes('element_click') || !(params.hide_on || []).includes('toggle_click'))
                        options_container.style.cssText += hide_rule;
                });
            });

            let first_option = Array.from(options_container.children).find(option => !option.disabled);
            if (first_option) select.innerHTML = first_option.outerHTML;
        });
    }
}

class n_st_select {

    constructor (params) {
        params = {
            // target: `<select></select`,
            location: 'bottom center',

            ...params
        };

        elements(params.target).forEach(select => {
            let select_container = document.createElement('container');
            Object.assign(select_container, {
                display: 'inline-block',
                position: 'relative'
            });

            let options_container = document.createElement('options');
            Object.assign(options_container, {
                position: 'absolute',
                overflow: 'hidden',

            });

        })
    }
}

export default st_select;
