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

    // Русское склонение по числу: plural(3, 'файл', 'файла', 'файлов') → 'файла'.
    static plural(n, one, few, many) {
        let abs = Math.abs(n), mod10 = abs % 10, mod100 = abs % 100;

        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
        return many;
    }

    // Экранирование для вставки строки в HTML (#html, innerHTML).
    static escape(text) {
        return String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    }

    // Текст в буфер обмена. Promise<boolean>. Вне защищённого контекста (http не на
    // localhost) Clipboard API нет — копирование через скрытое поле и execCommand.
    static async copy(text) {
        text = String(text ?? '');

        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            let area = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
            Object.assign(area.style, { position: 'fixed', top: '0', left: '0', opacity: '0' });

            let active = document.activeElement;
            document.body.append(area);
            area.select();

            let ok = false;
            try { ok = document.execCommand('copy'); } catch {}

            area.remove();
            active?.focus?.({ preventScroll: true });
            return ok;
        }
    }

    // Отдать строку или Blob файлом: download('текст', 'key.txt').
    static download(content, filename, type = 'text/plain') {
        let blob = content instanceof Blob ? content : new Blob([content], { type });
        let url = URL.createObjectURL(blob);
        let link = Object.assign(document.createElement('a'), { href: url, download: filename, hidden: true });

        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url));
    }

    static #form(form) {
        return {
            url:    form.getAttribute('action') || '',
            method: form.getAttribute('method') || '',
            data:   new FormData(form),
        };
    }

    // Объект → пары имя/значение в PHP-нотации, как их собирает $_POST: вложенность и массивы
    // объектов — с индексами (RULES[0][FROM]), массив примитивов — DRIVERS[]. undefined
    // пропускается, null — пустая строка, булевы — по bool (['1', '0']), File и Blob как есть.
    static #pairs(value, bool, name = '', out = []) {
        let leaf = v => v === null || typeof v != 'object' || v instanceof Date || v instanceof Blob;

        if (value === undefined) return out;
        if (typeof value == 'boolean') out.push([name, bool[value ? 0 : 1]]);
        else if (value === null) out.push([name, '']);
        else if (value instanceof Date) out.push([name, value.toISOString()]);
        else if (value instanceof Blob) out.push([name, value]);
        else if (typeof value == 'object') {
            let flat = Array.isArray(value) && value.every(leaf);
            for (let [key, item] of Object.entries(value))
                Core.#pairs(item, bool, name ? `${name}[${flat ? '' : key}]` : key, out);
        } else out.push([name, String(value)]);

        return out;
    }

    // Настроенный fetch: база API, постоянные заголовки и поля (sessid) без глобального
    // состояния — Loader и app/form, которые сами вызывают Core.fetch, их не получают.
    static {
        this.fetch.with = ({ base, ...defaults }) => params => {
            if (params instanceof HTMLFormElement) params = Core.#form(params);
            params = { ...params };

            let { data, url } = params, extra = defaults.data;
            if (data instanceof HTMLFormElement) {
                url ||= data.getAttribute('action') || '';
                params.method ||= data.getAttribute('method') || '';
                data = new FormData(data);
            }

            // Поля по умолчанию не перекрывают переданные.
            if (extra != null) {
                if (data == null) data = extra;
                else if (data instanceof FormData) {
                    let copy = new FormData();
                    for (let [key, value] of data) copy.append(key, value);
                    for (let [key, value] of Core.#pairs(extra, params.form_bool ?? defaults.form_bool ?? ['1', '0']))
                        if (!data.has(key)) copy.append(key, value);
                    data = copy;
                } else if (Object.getPrototypeOf(data) === Object.prototype)
                    data = { ...extra, ...data };
            }

            let merged = { ...defaults, ...params, data, url, headers: { ...defaults.headers, ...params.headers } };
            if (base && url) merged.url = new URL(url, new URL(base, window.location.href)).href;

            // Колбэки по умолчанию идут первыми, затем переданные.
            for (let name of ['before_send', 'on_send', 'on_success', 'on_complete', 'on_failed'])
                merged[name] = [defaults[name], params[name]];

            return Core.fetch(merged);
        };
    }

    static fetch(params) {
        if (params instanceof HTMLFormElement)
            params = Core.#form(params);

        params = { url: '', method: '', data: null, headers: {}, timeout: 0, response_type: '', encode: '', form_bool: ['1', '0'], ...params };

        // Колбэк — функция или список функций (так их передаёт Core.fetch.with).
        const events = {
            beforeSend: [params.before_send].flat(),
            onSend:     [params.on_send].flat(),
            onSuccess:  [params.on_success].flat(),
            onComplete: [params.on_complete].flat(),
            onFailed:   [params.on_failed].flat(),
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

        // Тело ответа — одинаково для успеха и ошибки. При заданном responseType
        // XHR не даёт читать responseText (InvalidStateError), берём response.
        const parse = (xhr) => {
            if (xhr.responseType) return xhr.response;
            const type = xhr.getResponseHeader('Content-Type') || params.response_type || '';
            if (type.includes('/json'))
                try { return JSON.parse(xhr.responseText) } catch (e) { return xhr.responseText }
            if (type.includes('/xml'))
                return new DOMParser().parseFromString(xhr.responseText, 'application/xml');
            if (type.includes('/html'))
                return new DOMParser().parseFromString(xhr.responseText, 'text/html');
            return xhr.responseText;
        };

        const handle_error = (err, response) => {
            if (done) return;
            done = true;
            const payload = err instanceof XMLHttpRequest
                ? { status: err.status, status_text: err.statusText, response: response === undefined ? parse(err) : response, request: err }
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
                    // encode: 'form' — объект как форма с PHP-нотацией вложенности (Bitrix, $_POST).
                    const pairs = params.encode == 'form' && !(body instanceof FormData)
                        ? Core.#pairs(body, params.form_bool) : null;

                    if (method == 'GET') {
                        const query = body instanceof FormData || pairs
                            ? new URLSearchParams(pairs ?? body).toString()
                            : Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
                        if (query) url += (/\?.+=/.test(url) ? '&' : '?') + query;
                        body = null;
                    } else if (pairs) {
                        body = new FormData();
                        for (const [name, value] of pairs) body.append(name, value);
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

                    const data = parse(request);
                    if (request.status >= 200 && request.status < 300) {
                        fire('onSuccess', { data, request });
                        done = true;
                        resolve({ data, request });
                    } else
                        handle_error(request, data);

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
