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
let sent = null;  // последний запрос: { method, url, headers, body }

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
    setRequestHeader(name, value) { sent.headers[name] = value }
    open(method, url) { sent = { method, url, headers: {}, body: null } }
    abort() {}
    send(payload) {
        sent.body = payload;
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

// ---------------------------------------------------------------------------
// encode: 'form' — PHP-нотация; без encode — как раньше
// ---------------------------------------------------------------------------

const ok = { status: 200, type: 'text/plain', body: '' };
const entries = body => [...body].map(([k, v]) => [k, v instanceof Blob ? 'blob' : v]);
const data = { RULES: [{ FROM: 'a', ON: true }, { FROM: 'b', ON: false }], DRIVERS: ['x', 'y'], EMPTY: [], N: null, U: undefined, F: new Blob(['1']) };

await run(ok, { method: 'POST', data, encode: 'form' });
eq([sent.body instanceof FormData, entries(sent.body)], [true, [
    ['RULES[0][FROM]', 'a'], ['RULES[0][ON]', '1'], ['RULES[1][FROM]', 'b'], ['RULES[1][ON]', '0'],
    ['DRIVERS[]', 'x'], ['DRIVERS[]', 'y'], ['N', ''], ['F', 'blob'],
]], 'encode form: POST → FormData с вложенностью, [] у примитивов, null → пусто');

await run(ok, { method: 'POST', data: { A: true, B: false }, encode: 'form', form_bool: ['Y', 'N'] });
eq(entries(sent.body), [['A', 'Y'], ['B', 'N']], 'form_bool: Y/N');

await run(ok, { url: '/x?p=1', data: { a: [1, 2], o: { k: 'v' } }, encode: 'form' });
eq(decodeURIComponent(sent.url), '/x?p=1&a[]=1&a[]=2&o[k]=v', 'encode form: GET → query с той же нотацией');

await run(ok, { url: '/x', data: { a: [1, 2] } });
eq(decodeURIComponent(sent.url), '/x?a=1,2', 'без encode GET как раньше');
await run(ok, { method: 'POST', data: { a: 1 } });
eq([sent.body, sent.headers['Content-Type']], ['{"a":1}', 'application/json'], 'без encode POST — JSON, как раньше');

// ---------------------------------------------------------------------------
// Core.fetch.with — база, заголовки, постоянные поля, колбэки
// ---------------------------------------------------------------------------

const order = [];
const api = Core.fetch.with({
    base: 'http://api.test/rest/', method: 'POST', encode: 'form', headers: { 'X-A': '1' },
    data: { sessid: 's1', mode: 'def' }, on_success: () => order.push('default'),
});

next = ok;
await api({ url: 'rules.save', data: { mode: 'own' }, headers: { 'X-B': '2' }, on_success: () => order.push('own') });
eq([sent.method, sent.url, sent.headers, entries(sent.body), order],
    ['POST', 'http://api.test/rest/rules.save', { 'X-A': '1', 'X-B': '2' }, [['sessid', 's1'], ['mode', 'own']], ['default', 'own']],
    'with: base, слияние заголовков и data, колбэки по умолчанию первыми');

const fd = new FormData();
fd.append('mode', 'form');
await api({ url: '/abs', data: fd });
eq([sent.url, entries(sent.body), [...fd].length], ['http://api.test/abs', [['mode', 'form'], ['sessid', 's1']], 1],
    'with: в FormData дописываются недостающие поля, исходная не меняется');

await api({ url: 'list', method: 'GET' });
eq(decodeURIComponent(sent.url), 'http://api.test/rest/list?sessid=s1&mode=def', 'with: GET без data — поля по умолчанию в query');

await Core.fetch({ url: '/plain' });
eq(sent.url, '/plain', 'обычный Core.fetch настройки with не получает');

// ---------------------------------------------------------------------------
// plural, escape
// ---------------------------------------------------------------------------

eq([0, 1, 2, 5, 11, 21, 22, 112, 1001, -3].map(n => Core.plural(n, 'файл', 'файла', 'файлов')),
    ['файлов', 'файл', 'файла', 'файлов', 'файлов', 'файл', 'файла', 'файлов', 'файл', 'файла'], 'plural: русские формы');
eq(Core.escape(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;', 'escape: все пять символов');
eq(Core.escape(null), '', 'escape: null → пустая строка');

console.log(`core: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
