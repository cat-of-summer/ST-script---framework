export default class Core {
    

    //Улушчить, взять идеи из Lodash, слабое место - typeof old_object[field] == "object", что для null валидно и сломает массивы как структуру
    static object_merge(...OBJECTS) {
        let new_object = {};
        OBJECTS.forEach(old_object => {
            let recursive = (field, old_object, new_object) => {
                if (typeof old_object[field] == "object")
                    for (let content in old_object[field]) {
                        if (!new_object[field]) new_object[field] = {};
                        recursive(content, old_object[field], new_object[field]);
                    }
                else
                    new_object[field] = old_object[field];
            }
            for (let field in old_object)
                recursive(field, old_object, new_object)
        });
        return new_object
    }

    static generate_unique_prefix(params) {
        params = {
            characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
            length: 16,
    
            ...params,
        };

        return [...Array(params.length)].map(_ =>
            params.characters[Math.random() * params.characters.length | 0]
          ).join('');
    }

    //Сделать асинхронность + param может быть объектом формы
    static fetch(params) {
        params = {
            url: '',
            method: '',
            data: null,
            headers: {},
            timeout: 0,
            response_type: '',
            before_send: undefined,
            on_send: undefined,
            on_complete: undefined,
            on_success: undefined,
            on_failed: undefined,
            ...params
        };
        
        let has_error = false;

        const handle_error = (err) => {
            if (has_error) return;
            has_error = true;

            const payload = err instanceof XMLHttpRequest
                ? {
                    status: err.status,
                    status_text: err.statusText,
                    response: err.responseText,
                    request: err
                }
                : {
                    status: undefined,
                    status_text: '',
                    response: err
                };

            if (params.on_failed)
                try { params.on_failed(payload) } catch (e) { console.error('st_ajax: on_failed error', e) }
            else
                console.error('st_ajax: on_failed error', payload)
        };

        try {
            let url = params.url;
            let method = params.method;
            let body = null;

            if (params.before_send)
                try { params.before_send(params) } catch (e) { console.error('st_ajax: before_send error', e); }

            if (params.data instanceof FormData)
                body = params.data;
            else if (params.data instanceof HTMLFormElement) {
                if (!url) url = params.data.getAttribute('action');
                if (!method) method = params.data.getAttribute('method');

                body = new FormData(params.data);
            } else
                body = params.data;

            if (!url) url = window.location.href;
            if (!method) 
                method = 'GET'
            else
                method = method.toUpperCase();

            if (body && typeof body == 'object') {
                if (method == 'GET') {
                    let query = body instanceof FormData
                        ? new URLSearchParams(body).toString()
                        : Object.entries(body)
                            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                            .join('&');
    
                    if (query) url += (/\?.+=/.test(url) ? '&' : '?') + query;

                    body = null;
                } else if (!body instanceof FormData)  {
                    body = JSON.stringify(params.data);
                    
                    if (!Object.keys(params.headers).some(h => h.toLowerCase() == 'content-type'))
                        params.headers['Content-Type'] = 'application/json';
                }
            }
            
            const request = new XMLHttpRequest();

            if (params.response_type)
                try { request.responseType = params.response_type; } catch (e) {}
            
            if (params.timeout && Number.isFinite(params.timeout) && params.timeout > 0)
                request.timeout = params.timeout;
            
            request.onreadystatechange = () => {
                if (request.readyState !== 4) return;

                let data;
                
                if (request.status >= 200 && request.status < 300) {

                    if (request.responseType) {
                        data = request.response;
                    } else {
                        let response_type = request.getResponseHeader("Content-Type") || params.response_type || "";

                        if (response_type.includes("/json"))
                            try {
                                data = JSON.parse(request.responseText);
                            } catch (e) {
                                data = request.responseText;
                            }
                        else if (response_type.includes("/xml"))
                            data = (new DOMParser()).parseFromString(request.responseText, "application/xml");
                        else if (response_type.includes("/html"))
                            data = (new DOMParser()).parseFromString(request.responseText, "text/html");
                        else
                            data = request.responseText;
                    }
                    
                    if (params.on_success)
                        try { params.on_success({ data, request }) } catch (e) { console.error('st_ajax: on_success error', e) }
                } else
                    handle_error(request);

                if (params.on_complete)
                    try { params.on_complete({ data, request }) } catch (e) { console.error('st_ajax: on_complete error', e) }
            };

            request.onerror = () => handle_error(request);
            request.ontimeout = () => handle_error(request);
            request.open(method, url, true);
        
            for (let header_name in params.headers) {
                if (!Object.prototype.hasOwnProperty.call(params.headers, header_name)) continue;

                try { request.setRequestHeader(header_name, params.headers[header_name]) } catch (e) {}
            }

            request.send(body);

            if (params.on_send)
                try { params.on_send({ detail: params }) } catch (e) { console.error('st_ajax: on_send error', e) }
            
            return request;
        } catch (error) {
            handle_error(error);
            return undefined;
        }
    }


}