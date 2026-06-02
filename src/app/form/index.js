export default {
    app: 'form',

    action: null,
    method: null,
    headers: null,

    validators: {},
    validate(new_validators) {
        this.validators = { ...this.validators, ...new_validators };
    },
    configure(config) {
        const self = this;

        self.addEventListener('setup', () => {
            if (config.validate) self.validate(config.validate);

            if (config.form) {
                for (const [event, handler] of Object.entries(config.form)) {
                    self.addEventListener(`form:${event}`, handler);
                }
            }

            if (config.field) {
                for (const [event, handler] of Object.entries(config.field)) {
                    self.addEventListener(`field:${event}`, handler);
                }
            }
        });

        if (config.setup) {
            self.form
                ? queueMicrotask(config.setup.bind(self))
                : self.addEventListener('rendered', config.setup.bind(self), { once: true });
        }
    },

    setup() {
        this._validators = new WeakMap();
    },
    
    events: {
        rendered: function() {
            const self = this;

            if (!(self._form = self.querySelector('form'))) return console.error('form: <form> not found');

            if (self.form.querySelector('input[type=file]')) self.form.enctype = 'multipart/form-data';

            if (self.action) self.form.action = self.action;
            if (self.method) self.form.method = self.method;

            self.form.app = self;

            self.form.addEventListener('input', e => {
                const field = e.target;
                if (!field.name) return;

                if (self._validators.has(field)) field.setCustomValidity('');

                self.dispatchEvent('field:input', {
                    field,
                    name: field.name,
                    value: field.type === 'checkbox' ? field.checked : field.value
                }, { bubbles: true });
            });

            self.form.addEventListener('focus', e => {
                const field = e.target;
                if (!field.name) return;

                self.dispatchEvent('field:focus', {
                    field,
                    name: field.name,
                    value: field.type === 'checkbox' ? field.checked : field.value
                }, { bubbles: true });
            }, true);

            self.form.addEventListener('invalid', e => {
                const field = e.target;
                const appEvent = self.dispatchEvent('field:invalid', {
                    field,
                    name:    field.name || field.id || null,
                    value: field.type === 'checkbox' ? field.checked : field.value
                }, { bubbles: true });
                if (!appEvent) e.preventDefault();
            }, true);

            self.form.addEventListener('submit', e => {
                e.preventDefault();
                self._submit();
            });

            self.watch('validators', validators => {
                if (!self.form) return;
                for (const [key, fn] of Object.entries(validators)) {
                    self.fields(key).forEach(field => {
                        self._validators.set(field, fn);

                        if (field.__validatorPatched) return;
                        field.__validatorPatched = true;

                        const origCheck  = field.checkValidity.bind(field);
                        const origReport = field.reportValidity.bind(field);

                        field.checkValidity = () => {
                            const validatorFn = self._validators.get(field);
                            if (validatorFn) {
                                const result = validatorFn(field);
                                field.setCustomValidity(result || '');
                            }
                            return origCheck();
                        };

                        field.reportValidity = () => {
                            field.checkValidity();
                            return origReport();
                        };
                    });
                }
            }, { immediate: true });
        }
    },
    get form() {
        return this._form;
    },
    fields(name = null) {
        if (!name)
            return Array.from(this.form.elements);
        
        let isSelector =
            name.includes(' ') ||
            name.includes('#') ||
            name.includes('.') ||
            name.includes('[') ||
            name.includes('>') ||
            name.includes(':');

        return isSelector
            ? this.form.querySelectorAll(name)
            : this.form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
    },
    field(name) {
        const fields = this.fields(name);
        return fields.length ? fields[0] : null;
    },
    appendField(name, value, options = {}) {
        let field = this.field(name);

        if (field) {
            Object.assign(field, {
                ...options,

                value: value
            });

            return;
        }

        field = document.createElement('input');

        Object.assign(field, {
            type: 'hidden',

            ...options,

            name: name,
            value: value
        });

        this.form.appendChild(field);
    },
    removeField(name) {
        const field = this.field(name);
        if (!field) return;
        const labelFor = field.id || name;
        const label = this.form.querySelector(`label[for="${labelFor}"]`) || field.closest(`label`);
        if (label) label.remove();
        field.remove();
    },
    resetField(name) {
        const fields = Array.from(this.fields(name));
        if (!fields.length) return;

        const allCheckbox = fields.every(f => f.type === 'checkbox');
        const allRadio    = fields.every(f => f.type === 'radio');
        const allFiles    = fields.every(f => f.type === 'file');

        if (allCheckbox || allRadio) {
            fields.forEach(f => { f.checked = false; });
        } else if (allFiles) {
            fields.forEach(f => { f.value = ''; });
        } else if (fields.length === 1 && fields[0].multiple) {
            Array.from(fields[0].options).forEach(opt => { opt.selected = false; });
        } else {
            fields[0].value = '';
        }
    },
    reset() {
        this.form.reset();
        
        this.dispatchEvent('form:reset');
    },
    fill(data) {
        const self = this;

        const fillFile = (field, val) => {
            const assign = (file) => {
                const dt = new DataTransfer();
                dt.items.add(file);
                field.files = dt.files;
            };

            if (val instanceof File) {
                assign(val);
                return;
            }

            if (typeof val === 'string' && val.startsWith('data:')) {
                const [meta, base64] = val.split(',');
                const mime = meta.match(/:(.*?);/)?.[1] || 'application/octet-stream';
                const binary = atob(base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                const blob = new Blob([bytes], { type: mime });
                assign(new File([blob], 'file', { type: mime }));
                return;
            }

            if (typeof val === 'string') {
                const filename = val.split('/').pop().split('?')[0] || 'file';
                fetch(val)
                    .then(r => r.blob())
                    .then(blob => assign(new File([blob], filename, { type: blob.type })))
                    .catch(() => {});
            }
        };

        for (const [name, value] of Object.entries(data)) {
            const fields = Array.from(self.fields(name));
            if (!fields.length) continue;

            const allFiles     = fields.every(f => f.type === 'file');
            const allCheckbox  = fields.every(f => f.type === 'checkbox');
            const allRadio     = fields.every(f => f.type === 'radio');

            if (allFiles) {
                const vals = Array.isArray(value) ? value : [value];
                fields.forEach((field, i) => {
                    const val = vals[i] !== undefined ? vals[i] : vals[0];
                    if (val != null) fillFile(field, val);
                });
            } else if (allCheckbox) {
                fields.forEach(cb => {
                    if (typeof value === 'boolean') {
                        cb.checked = value;
                    } else if (Array.isArray(value)) {
                        cb.checked = value.map(String).includes(cb.value);
                    } else {
                        cb.checked = String(cb.value) === String(value);
                    }
                });
            } else if (allRadio) {
                fields.forEach(r => {
                    r.checked = String(r.value) === String(value);
                });
            } else if (fields.length === 1 && fields[0].multiple && Array.isArray(value)) {
                const select = fields[0];
                Array.from(select.options).forEach(opt => {
                    opt.selected = value.map(String).includes(opt.value);
                });
            } else if (Array.isArray(value)) {
                fields.forEach((field, i) => {
                    if (value[i] !== undefined) field.value = value[i];
                });
            } else {
                fields[0].value = value ?? '';
            }
        }
    },
    hide() {
        this.style.display = 'none';
    },
    show() {
        this.style.display = '';
    },
    _submit() {
        const self = this;
        const form = self.form;
        const fields = self.fields();

        fields.forEach(field => {
            if (self._validators.has(field)) field.setCustomValidity('');
        });

        fields.forEach(field => {
            if (!self._validators.has(field)) return;
            const result = self._validators.get(field)(field);
            field.setCustomValidity(result || '');
        });

        const errors = {};
        fields.forEach(field => {
            if (!field.validity.valid) {
                const key = field.name || field.id || null;
                if (key) errors[key] = field.validationMessage;
            }
        });

        if (Object.keys(errors).length) {
            const ev = self.dispatchEvent('form:invalid', { errors }, { bubbles: true });
            if (ev) form.reportValidity();
            return;
        }

        self._send();
    },
    _send() {
        const self = this;
        const form = self.form;

        const params = {
            url:     self.action || form.getAttribute('action') || window.location.href,
            method:  self.method || form.getAttribute('method') || 'GET',
            headers: self.headers || {},
        };

        self.dispatchEvent('form:before_send', params, { bubbles: true });

        let url    = params.url;
        let method = (params.method || 'GET').toUpperCase();
        let body   = new FormData(form);

        if (method === 'GET') {
            const query = new URLSearchParams(body).toString();
            if (query) url += (/\?.+=/.test(url) ? '&' : '?') + query;
            body = null;
        }

        let has_error = false;

        const handle_error = (err) => {
            if (has_error) return;
            has_error = true;

            const payload = err instanceof XMLHttpRequest
                ? { status: err.status, status_text: err.statusText, response: err.responseText, request: err }
                : { status: undefined, status_text: '', response: err };

            self.dispatchEvent('form:failed', payload, { bubbles: true });
        };

        const request = new XMLHttpRequest();

        request.onreadystatechange = () => {
            if (request.readyState !== 4) return;

            let data;

            if (request.status >= 200 && request.status < 300) {
                const response_type = request.getResponseHeader('Content-Type') || '';

                if (response_type.includes('/json'))
                    try { data = JSON.parse(request.responseText); } catch (e) { data = request.responseText; }
                else if (response_type.includes('/xml'))
                    data = (new DOMParser()).parseFromString(request.responseText, 'application/xml');
                else if (response_type.includes('/html'))
                    data = (new DOMParser()).parseFromString(request.responseText, 'text/html');
                else
                    data = request.responseText;

                if (data && typeof data === 'object' && data.redirect) {
                    const ev = self.dispatchEvent('form:redirect', { url: data.redirect, data, request }, { bubbles: true });
                    self.dispatchEvent('form:complete', { data, request }, { bubbles: true });
                    if (ev) window.location.href = data.redirect;
                    return;
                }

                self.dispatchEvent('form:success', { data, request }, { bubbles: true });
            } else {
                handle_error(request);
            }

            self.dispatchEvent('form:complete', { data, request }, { bubbles: true });
        };

        request.onerror   = () => handle_error(request);
        request.ontimeout = () => handle_error(request);

        request.open(method, url, true);

        for (const name in params.headers) {
            if (!Object.prototype.hasOwnProperty.call(params.headers, name)) continue;
            try { request.setRequestHeader(name, params.headers[name]); } catch (e) {}
        }

        request.send(body);

        self.dispatchEvent('form:send', { detail: params }, { bubbles: true });

        return request;
    }
};
