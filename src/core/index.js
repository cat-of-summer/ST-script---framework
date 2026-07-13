export default class Core {
    
    static merge(...objects) {
        const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v)
            && (Object.getPrototypeOf(v) ?? Object.prototype) === Object.prototype;

        const merge = (a, b) => {
            if (typeof a === 'function' && typeof b === 'function')
                return (...args) => merge(a(...args), b(...args));
            if (!((Array.isArray(a) && Array.isArray(b)) || (plain(a) && plain(b))))
                return b;

            const result = Array.isArray(a) ? a.slice() : { ...a };
            for (const [k, v] of Object.entries(b))
                result[k] = k in result ? merge(result[k], v) : v;
            return result;
        };

        return objects.reduce(merge, {});
    }

    static getRandomChars(params = {}) {
        params = {
            characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
            length: 16,

            ...params,
        };

        return Array.from(crypto.getRandomValues(new Uint8Array(params.length)), b =>
            params.characters[b % params.characters.length]
        ).join('');
    }

    static uuid(version = 7) {
        let data = crypto.getRandomValues(new Uint8Array(16));

        if (version === 4) {
            data[6] = (data[6] & 0x0f) | 0x40;
        } else {
            for (let i = 0; i < 6; i++)
                data[i] = Number((BigInt(Date.now()) >> BigInt(40 - i * 8)) & 0xffn);

            data[6] = (data[6] & 0x0f) | 0x70;
        }

        data[8] = (data[8] & 0x3f) | 0x80;

        let hex = Array.from(data, b => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }

    static fetch(params) {
        if (params instanceof HTMLFormElement)
            params = {
                url:    params.getAttribute('action') || '',
                method: params.getAttribute('method') || '',
                data:   new FormData(params),
            };

        params = { url: '', method: '', data: null, headers: {}, timeout: 0, response_type: '', ...params };

        const events = {
            beforeSend: [params.before_send],
            onSend:     [params.on_send],
            onSuccess:  [params.on_success],
            onComplete: [params.on_complete],
            onFailed:   [params.on_failed],
        };

        let request, resolve, reject, done = false;
        const promise = new Promise((res, rej) => (resolve = res, reject = rej));
        const fire = (event, payload) => {
            for (const cb of events[event])
                if (cb) try { cb(payload) } catch (e) { console.error(`st_ajax: ${event} error`, e) }
        };

        const api = {
            then:    (a, b) => promise.then(a, b),
            catch:   b => promise.catch(b),
            finally: f => promise.finally(f),
            abort:   () => request?.abort(),
        };
        for (const event of Object.keys(events))
            api[event] = cb => (events[event].push(cb), api);

        const handle_error = (err) => {
            if (done) return;
            done = true;
            const payload = err instanceof XMLHttpRequest
                ? { status: err.status, status_text: err.statusText, response: err.responseText, request: err }
                : { status: undefined, status_text: '', response: err };
            fire('onFailed', payload);
            reject(payload);
        };

        queueMicrotask(() => {
            try {
                let url = params.url, method = params.method, body;

                fire('beforeSend', params);

                if (params.data instanceof FormData)
                    body = params.data;
                else if (params.data instanceof HTMLFormElement) {
                    url    = url    || params.data.getAttribute('action');
                    method = method || params.data.getAttribute('method');
                    body   = new FormData(params.data);
                } else
                    body = params.data;

                url    = url || window.location.href;
                method = method ? method.toUpperCase() : 'GET';

                if (body && typeof body == 'object') {
                    if (method == 'GET') {
                        const query = body instanceof FormData
                            ? new URLSearchParams(body).toString()
                            : Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
                        if (query) url += (/\?.+=/.test(url) ? '&' : '?') + query;
                        body = null;
                    } else if (!(body instanceof FormData)) {
                        body = JSON.stringify(params.data);
                        if (!Object.keys(params.headers).some(h => h.toLowerCase() == 'content-type'))
                            params.headers['Content-Type'] = 'application/json';
                    }
                }

                request = new XMLHttpRequest();
                if (params.response_type) try { request.responseType = params.response_type } catch (e) {}
                if (params.timeout > 0 && Number.isFinite(params.timeout)) request.timeout = params.timeout;

                request.onerror = request.ontimeout = () => handle_error(request);
                request.onreadystatechange = () => {
                    if (request.readyState !== 4) return;

                    let data;
                    if (request.status >= 200 && request.status < 300) {
                        if (request.responseType)
                            data = request.response;
                        else {
                            const type = request.getResponseHeader('Content-Type') || params.response_type || '';
                            if (type.includes('/json'))
                                try { data = JSON.parse(request.responseText) } catch (e) { data = request.responseText }
                            else if (type.includes('/xml'))
                                data = new DOMParser().parseFromString(request.responseText, 'application/xml');
                            else if (type.includes('/html'))
                                data = new DOMParser().parseFromString(request.responseText, 'text/html');
                            else
                                data = request.responseText;
                        }
                        fire('onSuccess', { data, request });
                        done = true;
                        resolve({ data, request });
                    } else
                        handle_error(request);

                    fire('onComplete', { data, request });
                };

                request.open(method, url, true);
                for (const name in params.headers)
                    if (Object.prototype.hasOwnProperty.call(params.headers, name))
                        try { request.setRequestHeader(name, params.headers[name]) } catch (e) {}

                request.send(body);
                fire('onSend', { detail: params });
            } catch (error) {
                handle_error(error);
            }
        });

        return api;
    }


}
