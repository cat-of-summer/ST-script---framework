// Автотесты Core.fetch: node tests/core.test.mjs
// Ненулевой exit-код при провале. Браузер не нужен — XMLHttpRequest подменён
// фейком, который отвечает заранее заданным статусом, заголовком и телом.

let failed = 0, passed = 0;

function eq(actual, expected, label) {
    let a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { passed++; return; }
    failed++;
    console.error(`FAIL: ${label}\n  ожидалось: ${e}\n  получено:  ${a}`);
}

// ---------------------------------------------------------------------------
// Окружение: фейковый XHR и заглушки DOM
// ---------------------------------------------------------------------------

let next = null; // { status, type, body } — ответ для следующего запроса

class FakeXHR {
    responseType = '';
    readyState = 0;
    status = 0;
    statusText = '';
    #body = '';
    #type = null;

    get responseText() {
        if (this.responseType && this.responseType !== 'text')
            throw new Error('InvalidStateError: responseText недоступен при responseType');
        return this.#body;
    }
    get response() {
        if (this.responseType === 'json')
            try { return JSON.parse(this.#body) } catch (e) { return null }
        return this.#body;
    }
    getResponseHeader(name) { return name.toLowerCase() == 'content-type' ? this.#type : null }
    setRequestHeader() {}
    open() {}
    abort() {}
    send() {
        const { status, type = null, body = '', network = false } = next;
        setTimeout(() => {
            this.readyState = 4;
            this.status = network ? 0 : status;
            this.statusText = network ? '' : String(status);
            this.#type = network ? null : type;
            this.#body = network ? '' : body;
            this.onreadystatechange?.();
            if (network) this.onerror?.();
        });
    }
}

globalThis.XMLHttpRequest = FakeXHR;
globalThis.HTMLFormElement = class {};
globalThis.window = { location: { href: 'http://test/' } };

const { default: Core } = await import('../src/core/index.js');

// Запускает запрос и собирает всё, что пришло в колбэки и в промис.
async function run(response, params = {}) {
    next = response;
    const seen = {};
    const req = Core.fetch({ url: '/x', ...params })
        .onSuccess(p => seen.success = p.data)
        .onFailed(p => seen.failed = { status: p.status, response: p.response })
        .onComplete(p => seen.complete = p.data);

    const timeout = new Promise(res => setTimeout(() => res('висит'), 200));
    seen.settled = await Promise.race([
        req.then(() => 'resolve', () => 'reject'),
        timeout,
    ]);
    return seen;
}

// ---------------------------------------------------------------------------
// Успех
// ---------------------------------------------------------------------------

let r = await run({ status: 200, type: 'application/json; charset=utf-8', body: '{"ok":1}' });
eq(r.success, { ok: 1 }, '200 + JSON → объект');
eq(r.settled, 'resolve', '200 → resolve');

r = await run({ status: 200, type: 'text/plain', body: 'hello' });
eq(r.success, 'hello', '200 + text → строка');

// ---------------------------------------------------------------------------
// Ошибка: тело разбирается так же, как при успехе
// ---------------------------------------------------------------------------

r = await run({ status: 422, type: 'application/json', body: '{"errors":{"name":["required"]}}' });
eq(r.failed, { status: 422, response: { errors: { name: ['required'] } } }, '422 + JSON → response объект');
eq(r.complete, { errors: { name: ['required'] } }, '422 → onComplete получает разобранное тело');
eq(r.settled, 'reject', '422 → reject');
eq(r.success, undefined, '422 → onSuccess не вызван');

r = await run({ status: 403, type: 'text/plain', body: 'forbidden' });
eq(r.failed, { status: 403, response: 'forbidden' }, '403 + text → response строка');

r = await run({ status: 500, type: 'application/json', body: 'not json' });
eq(r.failed, { status: 500, response: 'not json' }, 'битый JSON → исходный текст');

// ---------------------------------------------------------------------------
// response_type: responseText недоступен, промис всё равно завершается
// ---------------------------------------------------------------------------

r = await run({ status: 500, type: 'application/json', body: '{"error":"boom"}' }, { response_type: 'json' });
eq(r.settled, 'reject', '500 при response_type json → reject, а не зависание');
eq(r.failed, { status: 500, response: { error: 'boom' } }, '500 при response_type json → response из xhr.response');

r = await run({ status: 200, type: 'application/json', body: '{"a":2}' }, { response_type: 'json' });
eq(r.success, { a: 2 }, '200 при response_type json → xhr.response');

// ---------------------------------------------------------------------------
// Сетевая ошибка
// ---------------------------------------------------------------------------

r = await run({ network: true });
eq(r.failed, { status: 0, response: '' }, 'сеть → status 0, пустое тело');
eq(r.settled, 'reject', 'сеть → reject');

console.log(`core: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
