// Браузерные автотесты App, Modal, Uploader, Core, Cookie, Route, Shape, app/datepicker и destroy() модулей: node tests/browser.test.mjs
// Нужен Playwright: стоит не в репозитории — путь к нему в PLAYWRIGHT_FROM (README, раздел Tests).
// Браузер — BROWSER=chromium (по умолчанию) | firefox | webkit; ONLY=подстрока имени — часть тестов.
// Модули грузятся из dist/ (IIFE-сборки), поэтому перед прогоном нужен npm run build.
// Страницы отдаются через page.route с фиктивного origin: History API и cookie работают.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const playwright = require('playwright');

const ORIGIN = 'http://st.test';

let failed = 0, passed = 0;

function eq(actual, expected, label) {
    let a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { passed++; return; }
    failed++;
    console.error(`FAIL: ${label}\n  ожидалось: ${e}\n  получено:  ${a}`);
}

const browser = await playwright[process.env.BROWSER ?? 'chromium'].launch();
const context = await browser.newContext();
let html = '';

await context.route('**/*', route => {
    let url = new URL(route.request().url());
    if (url.pathname.startsWith('/dist/'))
        return route.fulfill({ path: path.join(root, url.pathname), contentType: 'text/javascript' });
    return route.fulfill({ body: html, contentType: 'text/html' });
});

// Ждёт условия, а не фиксированную паузу: анимации Modal идут через requestAnimationFrame,
// и в контейнере кадр может прийти позже любых разумных 200 мс.
const UNTIL = `<script>window.until = (fn, ms = 3000) => new Promise(r => { let end = Date.now() + ms; let t = () => fn() || Date.now() > end ? r() : setTimeout(t, 10); t(); });</script>`;

// Открывает страницу с разметкой body и подключёнными модулями.
async function open(body, modules = ['app'], url = '/') {
    html = `<!doctype html><html><head><meta charset="utf-8">${UNTIL}${modules.map(m => `<script src="/dist/${m}.min.js"></script>`).join('')}</head><body>${body}</body></html>`;
    let page = await context.newPage();
    let errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
    await page.goto(ORIGIN + url);
    page.errors = errors;
    return page;
}

const tick = page => page.evaluate(() => new Promise(r => setTimeout(r, 30)));

// ONLY=подстрока — прогнать только тесты с ней в имени (например, ONLY="Toggle ").
async function test(name, fn) {
    if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
    try {
        await fn();
    } catch (e) {
        failed++;
        console.error(`FAIL: ${name}\n  ${e.stack}`);
    }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

await test('#if: ветка, показанная повторно, живая', async () => {
    let page = await open(`<st-app app="t"><div><button id="toggle" @click="on = !on">t</button>
        <p #if="on" id="yes" @click="count++">{{ count }}</p><p #else id="no">нет</p></div></st-app>`);
    await page.evaluate(() => App.create({ app: 't', on: true, count: 0 }));
    await tick(page);
    await page.click('#yes');
    await tick(page);
    eq(await page.textContent('#yes'), '1', '#if: первый показ');
    await page.click('#toggle'); await tick(page);
    eq(await page.textContent('#no'), 'нет', '#if: ветка #else');
    await page.click('#toggle'); await tick(page);
    await page.click('#yes'); await tick(page);
    eq(await page.textContent('#yes'), '2', '#if: повторный показ — клик и {{ }} работают');
    eq(page.errors, [], '#if: без ошибок');
    await page.close();
});

await test('#for на верхнем уровне шаблона', async () => {
    let page = await open(`<st-app app="t"><span #for="x in items" class="i">{{ x }}</span></st-app>`);
    await page.evaluate(() => App.create({ app: 't', items: ['a', 'b'] }));
    await tick(page);
    eq(await page.$$eval('.i', n => n.map(e => e.textContent)), ['a', 'b'], '#for верхнего уровня: первый рендер');
    await page.evaluate(() => document.querySelector('st-app').items.push('c'));
    await tick(page);
    eq(await page.$$eval('.i', n => n.map(e => e.textContent)), ['a', 'b', 'c'], '#for верхнего уровня: перерисовка');
    await page.close();
});

await test('#model="value" и методы remove()/append()', async () => {
    let page = await open(`<st-app app="t"><div><input id="in" #model="value">
        <button id="rm" @click="remove()">x</button><i id="out">{{ value }}|{{ log }}</i></div></st-app>`);
    await page.evaluate(() => App.create({ app: 't', value: 'a', log: '', remove() { this.log = 'removed'; } }));
    await tick(page);
    await page.fill('#in', 'hello');
    await page.click('#rm');
    await tick(page);
    eq(await page.textContent('#out'), 'hello|removed', '#model="value" пишет, remove() из конфига вызывается');
    eq(page.errors, [], '#model/remove: без ошибок');
    await page.close();
});

await test('нативные методы и методы с приватными полями в выражениях', async () => {
    let page = await open(`<st-app app="t"><div><b id="o">{{ getAttribute('app') }}</b>
        <button id="b" @click="dispatchEvent('ping', 1)">p</button></div></st-app>`);
    await page.evaluate(() => {
        App.create({ app: 't' });
        window.pinged = 0;
        document.querySelector('st-app').addEventListener('ping', e => window.pinged = e.detail);
    });
    await tick(page);
    await page.click('#b');
    eq([await page.textContent('#o'), await page.evaluate(() => window.pinged)], ['t', 1], 'getAttribute() и dispatchEvent() из шаблона');
    eq(page.errors, [], 'нативные методы: без ошибок');
    await page.close();
});

await test('App.extend сохраняет геттеры', async () => {
    let page = await open(`<st-app app="child"><b id="o">{{ double }}</b></st-app>`);
    await page.evaluate(() => {
        App.create({ app: 'base', n: 1, get double() { return this.n * 2; } });
        App.extend('base', { app: 'child', n: 5 });
    });
    await tick(page);
    eq(await page.textContent('#o'), '10', 'геттер наследника считается от его данных');
    await page.evaluate(() => document.querySelector('st-app').n = 7);
    await tick(page);
    eq(await page.textContent('#o'), '14', 'геттер наследника реактивен');
    await page.close();
});

await test('#model на select с опциями из #for', async () => {
    let page = await open(`<st-app app="t"><select id="s" #model="picked"><option #for="o in opts" value="{{ o }}">{{ o }}</option></select></st-app>`);
    await page.evaluate(() => App.create({ app: 't', opts: ['a', 'b', 'c'], picked: 'b' }));
    await tick(page);
    eq(await page.$eval('#s', s => s.value), 'b', 'select получает значение после опций');
    await page.evaluate(() => document.querySelector('st-app').opts.push('d'));
    await tick(page);
    eq(await page.$eval('#s', s => s.value), 'b', 'значение держится после перерисовки опций');
    await page.close();
});

await test('вложенный эффект не сбрасывает отслеживание внешнего', async () => {
    let page = await open(`<st-app app="t"><div><section #if="show"><i #for="x in items">{{ x }}</i></section></div></st-app>`);
    await page.evaluate(() => App.create({ app: 't', show: true, items: [1] }));
    await tick(page);
    // #if отслеживает show; после создания вложенного #for внешний эффект должен
    // продолжать отслеживание. Проверяем, что смена show после этого работает.
    await page.evaluate(() => document.querySelector('st-app').show = false);
    await tick(page);
    eq(await page.$$eval('section', n => n.length), 0, '#if с вложенным #for скрывается');
    await page.close();
});

await test('эффект: чтение после вложенного эффекта отслеживается', async () => {
    let page = await open(`<st-app app="t"><b id="o"></b></st-app>`);
    let result = await page.evaluate(async () => {
        App.create({ app: 't', a: 1, b: 1 });
        await new Promise(r => setTimeout(r, 30));
        let el = document.querySelector('st-app');
        let runs = 0;
        el.watch(() => { el.watch(() => el.a, () => {}); runs++; return el.b; }, () => {});
        el.b = 2;
        await new Promise(r => setTimeout(r, 30));
        return runs;
    });
    eq(result > 1, true, 'watch-геттер перезапускается по полю, прочитанному после вложенного watch');
    await page.close();
});

await test('перенос <st-app> по DOM сохраняет привязки', async () => {
    let page = await open(`<div id="a"><st-app app="t"><button id="b" @click="n++">{{ n }}</button></st-app></div><div id="c"></div>`);
    await page.evaluate(() => App.create({ app: 't', n: 0 }));
    await tick(page);
    await page.evaluate(() => document.querySelector('#c').append(document.querySelector('st-app')));
    await tick(page);
    await page.click('#b'); await tick(page);
    eq(await page.textContent('#b'), '1', 'перенос в той же задаче: клик работает');
    await page.evaluate(async () => {
        let el = document.querySelector('st-app');
        el.remove();
        await new Promise(r => setTimeout(r, 30));
        document.querySelector('#a').append(el);
    });
    await tick(page);
    await page.click('#b'); await tick(page);
    eq(await page.textContent('#b'), '2', 'возврат после очистки: компонент перерисован и живой');
    await page.close();
});

await test('поздняя подписка на rendered получает this', async () => {
    let page = await open(`<st-app app="t"><b>x</b></st-app>`);
    let result = await page.evaluate(async () => {
        App.create({ app: 't' });
        await new Promise(r => setTimeout(r, 50));
        let el = document.querySelector('st-app');
        let fromFn = await new Promise(r => el.addEventListener('rendered', function () { r(this === el); }));
        let fromObj = await new Promise(r => el.addEventListener('rendered', { handleEvent: e => r(e.type) }));
        return [fromFn, fromObj];
    });
    eq(result, [true, 'rendered'], 'this и handleEvent у поздней подписки');
    await page.close();
});

await test('toggleAttribute: нативная семантика и cycleAttribute', async () => {
    let page = await open(`<st-app app="t"><b>x</b></st-app>`);
    let result = await page.evaluate(async () => {
        App.create({ app: 't' });
        let el = document.querySelector('st-app');
        el.setAttribute('hidden', '');
        el.toggleAttribute('hidden', false);
        let afterFalse = el.hasAttribute('hidden');
        el.toggleAttribute('data-x');
        let afterToggle = el.getAttribute('data-x');
        el.cycleAttribute('data-m', 'a', 'b');
        let m1 = el.getAttribute('data-m');
        el.toggleAttribute('data-m', 'a', 'b');
        return [afterFalse, afterToggle, m1, el.getAttribute('data-m'), el.attrs.toggle('data-x', true), el.hasAttribute('data-x')];
    });
    eq(result, [false, '', 'a', 'b', true, true], 'toggleAttribute(name, false) снимает атрибут, строковый режим цикличен');
    await page.close();
});

await test('#key в #for сохраняет узлы и фокус', async () => {
    let page = await open(`<st-app app="t"><div><input #for="row in rows" #key="row.id" class="r" #model="row.name"></div></st-app>`);
    await page.evaluate(() => App.create({ app: 't', rows: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] }));
    await tick(page);
    await page.focus('.r >> nth=1');
    await page.keyboard.type('x');
    let before = await page.evaluate(() => { window.first = document.querySelector('.r'); return document.activeElement.value; });
    await page.evaluate(() => document.querySelector('st-app').rows.push({ id: 3, name: 'c' }));
    await tick(page);
    let after = await page.evaluate(() => [
        document.querySelectorAll('.r').length,
        document.querySelector('.r') === window.first,
        document.activeElement.classList.contains('r') && document.activeElement.value
    ]);
    eq([before, ...after], ['bx', 3, true, 'bx'], 'добавление строки не пересоздаёт остальные, фокус на месте');
    await page.evaluate(() => document.querySelector('st-app').rows.splice(0, 1));
    await tick(page);
    eq(await page.$$eval('.r', n => n.map(e => e.value)), ['bx', 'c'], 'удаление первой строки: порядок и значения');
    await page.close();
});

await test('#for без #key работает как раньше', async () => {
    let page = await open(`<st-app app="t"><ul><li #for="x in items" class="i">{{ $index }}:{{ x }}</li></ul></st-app>`);
    await page.evaluate(() => App.create({ app: 't', items: ['a', 'b'] }));
    await tick(page);
    await page.evaluate(() => document.querySelector('st-app').items.unshift('z'));
    await tick(page);
    eq(await page.$$eval('.i', n => n.map(e => e.textContent)), ['0:z', '1:a', '2:b'], '#for без ключа: unshift');
    await page.close();
});

await test('прокси стабильны: indexOf находит элемент', async () => {
    let page = await open(`<st-app app="t"><ul><li #for="item in items" class="i" @click="drop(item)">{{ item.n }}</li></ul></st-app>`);
    await page.evaluate(() => App.create({ app: 't', items: [{ n: 1 }, { n: 2 }, { n: 3 }], drop(item) { this.items.splice(this.items.indexOf(item), 1); } }));
    await tick(page);
    await page.click('.i >> nth=1');
    await tick(page);
    eq(await page.$$eval('.i', n => n.map(e => e.textContent)), ['1', '3'], 'indexOf(item) из шаблона');
    await page.close();
});

await test('метод в {{ }} не порождает лишних перерисовок', async () => {
    let page = await open(`<st-app app="t"><b id="o">{{ fmt(n) }}</b></st-app>`);
    let calls = await page.evaluate(async () => {
        window.calls = 0;
        App.create({ app: 't', n: 1, fmt(v) { window.calls++; return '#' + v; } });
        await new Promise(r => setTimeout(r, 50));
        let before = window.calls;
        document.querySelector('st-app').n = 2;
        await new Promise(r => setTimeout(r, 50));
        return window.calls - before;
    });
    eq([await page.textContent('#o'), calls], ['#2', 1], 'одно изменение — один вызов форматтера');
    await page.close();
});

await test('#html', async () => {
    let page = await open(`<st-app app="t"><div id="h" #html="raw"></div></st-app>`);
    await page.evaluate(() => App.create({ app: 't', raw: '<b>bold</b> {{ not }}' }));
    await tick(page);
    eq(await page.$eval('#h', e => e.innerHTML), '<b>bold</b> {{ not }}', '#html вставляет разметку как есть');
    await page.evaluate(() => document.querySelector('st-app').raw = '<i>x</i>');
    await tick(page);
    eq(await page.$eval('#h', e => e.innerHTML), '<i>x</i>', '#html реактивен');
    await page.close();
});

const settle = page => page.waitForTimeout(150);

await test('Вложенный App в inline-шаблоне родителя: копии из #for живые', async () => {
    // Оба App зарегистрированы до разбора разметки: ребёнок мог бы отрисоваться раньше,
    // чем родитель заберёт innerHTML в шаблон.
    let page = await open(`<script>
        App.create({ app: 'kid', on: false });
        App.create({ app: 'host', items: ['a', 'b'] });
    </script>
    <st-app app="host"><div class="row" #for="x in items" #key="x"><st-app app="kid" :label="{{ x }}">
        <button @click="on = !on"><span #if="on">ON</span><span #else>OFF</span></button><i>{{ label }}</i>
    </st-app></div></st-app>`);
    await settle(page);
    let rows = () => page.$$eval('.row', rows => rows.map(r => r.querySelector('button').textContent + r.querySelector('i').textContent));
    eq(await rows(), ['OFFa', 'OFFb'], 'вложенный: первая отрисовка');
    await page.click('.row:first-child button');
    await settle(page);
    eq(await rows(), ['ONa', 'OFFb'], 'вложенный: клик меняет только свою копию');
    await page.evaluate(() => document.querySelector('st-app[app=host]').items.push('c'));
    await settle(page);
    eq(await rows(), ['ONa', 'OFFb', 'OFFc'], 'вложенный: новая строка #for');
    eq(page.errors, [], 'вложенный: без ошибок');
    await page.close();
});

await test('#else-if/#else: неактивные ветки не вычисляются', async () => {
    let page = await open(`<st-app app="e"><div class="r" #for="r in rows"><b #if="r.kind == 1">{{ r.a.x }}</b><b #else-if="r.kind == 2">{{ r.b.y }}</b><b #else>-</b></div></st-app>`);
    await page.evaluate(() => App.create({ app: 'e', rows: [{ kind: 1, a: { x: 1 }, b: null }, { kind: 2, a: null, b: { y: 2 } }, { kind: 3 }] }));
    await settle(page);
    eq(await page.$$eval('.r', r => r.map(n => n.textContent)), ['1', '2', '-'], '#else-if: ветки');
    eq(page.errors, [], '#else-if: без ошибок вычисления');
    await page.close();
});

await test(':attr — тип из конфига, модификаторы, пустое значение', async () => {
    let page = await open(`<st-app app="c" :pin="0123" :port="8080" :opts='{"a":1}' :flag="false" :list.json="[1,2]" :n.number="5" :initial-count="7" :s.string="true" :extra="x"></st-app>`);
    let result = await page.evaluate(async () => {
        App.create({ app: 'c', pin: '', port: 0, opts: {}, flag: true, template: '<p>{{ pin }}</p>' });
        await new Promise(r => setTimeout(r, 100));
        let el = document.querySelector('st-app');
        let wait = () => new Promise(r => setTimeout(r, 30));
        let types = [el.pin, el.port, el.opts.a, el.flag, el.list.length, el.n, el.s, el.initialCount];
        el.setAttribute(':pin', ''); await wait();
        let cleared = el.pin;
        el.extra = null; await wait();
        return { types, cleared, extra: el.extra, attr: el.getAttribute(':extra'), text: el.textContent };
    });
    eq(result.types, ['0123', 8080, 1, false, 2, 5, 'true', 7], ':attr: приведение');
    eq(result.cleared, '', ':attr: сброс в пустую строку');
    eq([result.extra, result.attr], [null, ''], ':attr: null не превращается в пустую строку');
    eq(page.errors, [], ':attr: без ошибок');
    await page.close();
});

await test('nextTick: DOM обновлён после await', async () => {
    let page = await open(`<st-app app="n"><p>{{ count }}</p></st-app>`);
    let text = await page.evaluate(async () => {
        App.create({ app: 'n', count: 0 });
        await new Promise(r => setTimeout(r, 100));
        let el = document.querySelector('st-app');
        el.count = 5;
        let before = el.textContent.trim();
        await el.nextTick();
        return [before, el.textContent.trim()];
    });
    eq(text, ['0', '5'], 'nextTick');
    await page.close();
});

await test('@event.self на <st-app>: только события самого компонента', async () => {
    let page = await open(`<st-app app="outer"><p>{{ count }}</p><st-app app="inner" id="inner" @input.self="count++"><input id="field"></st-app></st-app>`);
    let counts = await page.evaluate(async () => {
        App.create({ app: 'inner', template: '' });
        App.create({ app: 'outer', count: 0 });
        let wait = () => new Promise(r => setTimeout(r, 100));
        await wait();
        let outer = document.querySelector('st-app[app=outer]');
        document.querySelector('#field').dispatchEvent(new Event('input', { bubbles: true }));
        let afterNative = outer.count;
        document.querySelector('#inner').dispatchEvent('input');
        return [afterNative, outer.count];
    });
    eq(counts, [0, 1], '.self: нативный input потомка не ловится');
    await page.close();
});

await test('Предупреждение о свойстве вне конфига — один раз', async () => {
    let page = await open(`<st-app app="w"><p>{{ loaded }} {{ n }}</p></st-app>`);
    await page.evaluate(async () => {
        App.create({ app: 'w', n: 0, setup() { this.loaded = 1; } });
        await new Promise(r => setTimeout(r, 100));
        document.querySelector('st-app').n++;
    });
    await settle(page);
    eq(page.errors.filter(e => e.includes('"loaded"')).length, 1, 'предупреждение один раз');
    await page.close();
});

// Ввод с клавиатуры, а не dispatchEvent: только у пользовательского события браузер
// выполняет микрозадачи между слушателями, и #if успевает убрать поле посреди рассылки.
await test('#if убирает поле при вводе - обработчики того же события срабатывают', async () => {
    let page = await open(`<st-app app="t"><div>
        <textarea #if="text === ''" id="ta" #model="text" @input="typed++"></textarea>
        <div #if="note === ''" @input="wrapped++"><input id="in" #model="note"></div>
        <p id="n">{{ typed }}:{{ wrapped }}</p></div></st-app>`);
    await page.evaluate(() => App.create({ app: 't', text: '', note: '', typed: 0, wrapped: 0 }));
    await tick(page);
    await page.focus('#ta');
    await page.keyboard.type('x');
    await page.focus('#in');
    await page.keyboard.type('y');
    await tick(page);
    eq(await page.textContent('#n'), '1:1', '@input на поле и на обёртке ветки вызваны');
    await page.close();
});

await test('checked, selected и value следуют за состоянием после действий пользователя', async () => {
    let page = await open(`<st-app app="t"><div>
        <input type="checkbox" id="cb" checked="{{ on }}"><button id="flip" @click="on = !on">f</button>
        <select id="s"><option value="a">a</option><option value="b" selected="{{ pick === 'b' }}">b</option></select>
        <input id="v" value="{{ name }}"></div></st-app>`);
    await page.evaluate(() => App.create({ app: 't', on: true, pick: '', name: 'a' }));
    await tick(page);
    await page.click('#cb');
    await page.click('#flip'); await tick(page);
    await page.click('#flip'); await tick(page);
    await page.selectOption('#s', 'a');
    await page.fill('#v', 'zzz');
    await page.evaluate(() => Object.assign(document.querySelector('st-app'), { pick: 'b', name: 'q' }));
    await tick(page);
    eq(await page.evaluate(() => [cb.checked, s.value, v.value]), [true, 'b', 'q'], 'свойства, а не только атрибуты');
    await page.close();
});

await test('#for и #if раньше атрибутов, стоящих перед ними', async () => {
    let page = await open(`<st-app app="t"><div><i class="{{ x }}" #for="x in items">{{ x }}</i>
        <b id="if" title="{{ label }}" #if="on">{{ label }}</b></div></st-app>`);
    await page.evaluate(() => App.create({ app: 't', items: ['a', 'b'], on: true, label: 'L' }));
    await tick(page);
    eq(await page.$$eval('i', n => n.map(e => e.className)), ['a', 'b'], 'class перед #for видит переменную цикла');
    eq(await page.getAttribute('#if', 'title'), 'L', 'атрибут перед #if живёт в ветке');
    eq(page.errors, [], 'порядок директив: без ошибок');
    await page.close();
});

await test('#class: объект, массив, сосуществование с class="{{ }}"', async () => {
    let page = await open(`<st-app app="t"><div>
        <b id="a" class="base {{ extra }}" #class="{ 'is-on': on, 'x y': both }">a</b>
        <b id="b" #class="[on && 'one', 'two']">b</b></div></st-app>`);
    await page.evaluate(() => App.create({ app: 't', on: true, both: false, extra: 'e1' }));
    await tick(page);
    let classes = () => page.evaluate(() => [a.className, b.className]);
    eq(await classes(), ['base e1 is-on', 'one two'], '#class: первый рендер');
    await page.evaluate(() => Object.assign(document.querySelector('st-app'), { on: false, both: true, extra: 'e2' }));
    await tick(page);
    eq(await classes(), ['base e2 x y', 'two'], '#class: снятие, пара имён и перезапись class');
    await page.close();
});

await test('#model: пустое числовое поле - null', async () => {
    let page = await open(`<st-app app="t"><input id="n" type="number" #model="n"></st-app>`);
    await page.evaluate(() => App.create({ app: 't', n: 5 }));
    await tick(page);
    await page.fill('#n', '');
    await tick(page);
    eq(await page.evaluate(() => document.querySelector('st-app').n), null, 'пустое поле');
    await page.fill('#n', '7');
    await tick(page);
    eq(await page.evaluate(() => document.querySelector('st-app').n), 7, 'число');
    await page.close();
});

await test('App.toRaw и App.snapshot', async () => {
    let page = await open(`<st-app app="t"><b>x</b></st-app>`);
    let result = await page.evaluate(async () => {
        let source = { list: [{ a: 1 }], when: new Date(0) };
        App.create({ app: 't', data: source, other: { b: 2 } });
        await new Promise(r => setTimeout(r, 30));
        let el = document.querySelector('st-app');
        el.data.list.push(el.other);
        let copy = App.snapshot(el.data);
        return [
            App.toRaw(el.data) === source,
            copy !== source && copy.list[1].b === 2,
            App.toRaw(copy.list[1]) === copy.list[1] && copy.list[1].__isReactive === undefined,
            copy.when === source.when,
            App.snapshot(5),
        ];
    });
    eq(result, [true, true, true, true, 5], 'toRaw - исходник, snapshot - копия без прокси');
    await page.close();
});

await test('helpers: конфиг и App.helpers, без перерисовки', async () => {
    let page = await open(`<st-app app="t"><div><b id="o">{{ F.up(name) }}|{{ G.tag(name) }}|{{ calls }}</b></div></st-app>`);
    await page.evaluate(() => {
        App.helpers({ G: { tag: s => `<${s}>` } });
        App.create({ app: 't', name: 'x', calls: 0, helpers: { F: { up: s => s.toUpperCase() } } });
    });
    await tick(page);
    eq(await page.textContent('#o'), 'X|<x>|0', 'helpers видны в шаблоне');
    await page.evaluate(() => document.querySelector('st-app').name = 'y');
    await tick(page);
    eq(await page.textContent('#o'), 'Y|<y>|0', 'шаблон перерисован по данным');
    eq(await page.evaluate(() => 'F' in document.querySelector('st-app')), false, 'helpers не становятся свойствами элемента');
    await page.close();
});

await test('#for с #key переносит строку, а не пересоздаёт', async () => {
    let page = await open(`<st-app app="t"><ul><li #for="row in rows" #key="row.id" class="r">
        <span class="t">{{ $index }}:{{ row.name }}</span>
        <button class="b" @click="row.name += '!'">+</button>
        <i #for="tag in row.tags" class="tag">{{ tag }}</i></li></ul></st-app>`);
    let result = await page.evaluate(async () => {
        let wait = () => new Promise(r => setTimeout(r, 30));
        App.create({ app: 't', rows: [{ id: 1, name: 'a', tags: ['x'] }, { id: 2, name: 'b', tags: [] }, { id: 3, name: 'c', tags: [] }] });
        await wait();
        let el = document.querySelector('st-app');
        let before = [...document.querySelectorAll('.r')];
        el.rows.unshift(el.rows.pop());
        await wait();
        let after = [...document.querySelectorAll('.r')];
        let same = after[1] === before[0] && after[2] === before[1] && after[0] === before[2];
        let text = after.map(r => r.querySelector('.t').textContent);
        // После переноса строка отслеживает новый путь: правка данных и клик доходят.
        el.rows[1].name = 'A';
        el.rows[1].tags.push('y');
        await wait();
        after[1].querySelector('.b').click();
        await wait();
        return [same, text, after[1].querySelector('.t').textContent, [...after[1].querySelectorAll('.tag')].map(t => t.textContent)];
    });
    eq(result, [true, ['0:c', '1:a', '2:b'], '1:A!', ['x', 'y']], 'узлы те же, $index и привязки обновлены');
    await page.close();
});

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

await test('Modal: Esc закрывает только верхнее окно', async () => {
    let page = await open(``, ['modal']);
    let states = await page.evaluate(async () => {
        let wait = () => new Promise(r => setTimeout(r, 200));
        let a = new Modal({ content: '<div>a</div>' });
        let b = new Modal({ content: '<div>b</div>' });
        a.show(); await until(() => a.state === 'shown');
        b.show(); await until(() => b.state === 'shown');
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
        await until(() => b.state === 'hidden'); await wait();
        let first = [a.state, b.state];
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
        await until(() => a.state === 'hidden');
        return [...first, a.state];
    });
    eq(states, ['shown', 'hidden', 'hidden'], 'Esc: сначала верхнее, затем нижнее');
    await page.close();
});

await test('Modal: [action="close"], появившийся после создания', async () => {
    let page = await open(``, ['modal']);
    let state = await page.evaluate(async () => {
        let wait = () => new Promise(r => setTimeout(r, 200));
        let m = new Modal({ content: '<div></div>' });
        m.content.innerHTML = '<button action="close"><span id="in">x</span></button>';
        m.show(); await until(() => m.state === 'shown');
        document.querySelector('#in').click();
        await until(() => m.state === 'hidden');
        return m.state;
    });
    eq(state, 'hidden', 'делегированное закрытие');
    await page.close();
});

await test('Modal: show() сразу после hide() не теряется', async () => {
    let page = await open(``, ['modal']);
    let result = await page.evaluate(async () => {
        let wait = ms => new Promise(r => setTimeout(r, ms));
        let shows = [];
        let m = new Modal({ content: '<div></div>', duration: 0.1, on_show: d => shows.push(d) });
        m.show(1); await until(() => m.state === 'shown');
        m.hide();
        m.show(2);
        await until(() => shows.length === 2 && m.state === 'shown');
        return [m.state, shows];
    });
    eq(result, ['shown', [1, 2]], 'повторный show выполняется после закрытия');
    await page.close();
});

await test('Modal: цвет затемнения через CSS-переменную', async () => {
    let page = await open(`<style>modal-overlay { --modal-overlay-color: rgb(1, 2, 3); }</style>`, ['modal']);
    let color = await page.evaluate(() => {
        let m = new Modal({ content: '<div></div>' });
        m.modal.style.display = 'flex';
        return getComputedStyle(m.overlay).backgroundColor;
    });
    eq(color, 'rgb(1, 2, 3)', '--modal-overlay-color');
    await page.close();
});

await test('Modal: перерисовка App под курсором не закрывает окно', async () => {
    let page = await open(`<div id="box"><st-app app="m">
        <button id="swap" @click="on = !on"><span #if="on" class="i">A</span><span #else class="i">B</span></button>
        <button id="close" action="close" @click="on = !on"><span #if="on" class="c">A</span><span #else class="c">B</span></button>
    </st-app></div>`, ['app', 'modal']);
    let result = await page.evaluate(async () => {
        let wait = () => new Promise(r => setTimeout(r, 200));
        App.create({ app: 'm', on: false });
        await wait();
        let m = new Modal({ content: '#box' });
        m.show(); await until(() => m.state === 'shown');
        document.querySelector('#swap .i').click(); await wait();
        let afterSwap = [m.state, document.querySelector('#swap').textContent];
        document.querySelector('#close .c').click(); await until(() => m.state === 'hidden');
        return [...afterSwap, m.state];
    });
    eq(result, ['shown', 'A', 'hidden'], 'клик снаружи по composedPath');
    await page.close();
});

await test('Modal: open() разрешается значением hide(value), иначе null', async () => {
    let page = await open(`<button id="opener">o</button>`, ['modal']);
    let result = await page.evaluate(async () => {
        let m = new Modal({ content: '<div><button action="close" id="x">x</button><input id="in"></div>', duration: 0.05 });
        let opener = document.querySelector('#opener');
        opener.focus();
        let first = m.open('a');
        await until(() => m.state === 'shown');
        document.querySelector('#in').focus();
        m.hide({ ok: 1 });
        let value = await first;
        let focusBack = document.activeElement === opener;

        let second = m.open();
        await until(() => m.state === 'shown');
        document.querySelector('#x').click();
        let closed = await second;

        let third = m.open();
        await until(() => m.state === 'shown');
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
        return [value, focusBack, closed, await third];
    });
    eq(result, [{ ok: 1 }, true, null, null], 'значение, возврат фокуса, [action=close] и Esc');
    await page.close();
});

await test('Modal: события modal:* на содержимом', async () => {
    let page = await open(``, ['modal']);
    let log = await page.evaluate(async () => {
        let log = [];
        let m = new Modal({ content: '<div id="c"></div>' });
        ['show', 'shown', 'hide', 'hidden'].forEach(name =>
            document.addEventListener(`modal:${name}`, e => log.push(`${name}:${e.target.id}:${e.detail.data}`)));
        m.show(1); await until(() => m.state === 'shown');
        m.hide(2); await until(() => m.state === 'hidden');
        return log;
    });
    eq(log, ['show:c:1', 'shown:c:1', 'hide:c:2', 'hidden:c:2'], 'всплывают с данными');
    await page.close();
});

await test('Modal: blocking: false пропускает клики и Esc', async () => {
    let page = await open(`<button id="page" onclick="window.clicked = true" style="position:fixed;top:0;left:0;width:50px;height:50px">p</button>`, ['modal']);
    let result = await page.evaluate(async () => {
        let dialog = new Modal({ content: '<div>d</div>' });
        let toast = new Modal({ content: '<div>t</div>', blocking: false, overlay: false, close_by_esc: false, location: 'right bottom' });
        dialog.show(); await until(() => dialog.state === 'shown');
        toast.show(); await until(() => toast.state === 'shown');
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
        await until(() => dialog.state === 'hidden');
        let below = document.elementFromPoint(10, 10)?.id;
        return [dialog.state, toast.state, below, document.body.style.position];
    });
    eq(result, ['hidden', 'shown', 'page', ''], 'Esc закрывает окно под уведомлением, страница кликабельна');
    await page.close();
});

// ---------------------------------------------------------------------------
// Uploader
// ---------------------------------------------------------------------------

const uploaderMarkup = `<form id="f"><div id="up"><button type="button" add-button>add</button>
    <div files-list></div></div></form>`;

// Тестовый origin — http, не secure context: заодно проверяет, что Uploader работает без crypto.randomUUID.
const uploaderInit = () => new Uploader({
    target: '#up',
    input_name: 'FILES',
    entry: '<div file-item><span filename></span></div>',
});

const pick = async (page, name) => {
    let [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[add-button]')]);
    await chooser.setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(name) });
    await tick(page);
};

await test('Uploader: кнопка не плодит input[type=file]', async () => {
    let page = await open(uploaderMarkup, ['uploader']);
    await page.evaluate(uploaderInit);
    await pick(page, 'a.txt');
    await pick(page, 'b.txt');
    let state = await page.evaluate(() => ({
        pickers: document.querySelectorAll('#up input[type=file]:not([name])').length,
        outside: document.querySelectorAll('body > input[type=file]').length,
        names: [...new FormData(document.querySelector('#f')).getAll('FILES[]')].map(f => f.name),
    }));
    eq(state, { pickers: 1, outside: 0, names: ['a.txt', 'b.txt'] }, 'один picker без name, файлы уходят по одному разу');
    eq(page.errors, [], 'Uploader: без ошибок');
    await page.close();
});

await test('Uploader: повторный выбор того же файла', async () => {
    let page = await open(uploaderMarkup, ['uploader']);
    await page.evaluate(uploaderInit);
    await pick(page, 'same.txt');
    await pick(page, 'same.txt');
    eq(await page.$$eval('[file-item] [filename]', els => els.map(e => e.textContent)), ['same.txt', 'same.txt'], 'change срабатывает дважды');
    await page.close();
});

await test('Uploader: элемент в target, <template entry>, события и clear()', async () => {
    let page = await open(`<form id="f"><div id="up"><button type="button" add-button>add</button>
        <div files-list><div file-item><span filename>old.txt</span><button type="button" delete-button>x</button>
        <input type="hidden" name="FILES" value="42"></div></div>
        <template entry><div file-item><span filename></span><button type="button" delete-button>x</button></div></template></div></form>`, ['uploader']);
    await page.evaluate(() => {
        window.log = [];
        let root = document.querySelector('#up');
        ['add', 'delete'].forEach(name => document.addEventListener(`uploader:${name}`, e =>
            log.push(`${name}:${e.target.id}:${(e.detail.files ?? [e.detail.file]).map(f => f.name).join(',')}`)));
        window.up = new Uploader({ target: root, input_name: 'FILES', entry: '[files-list] [file-item]' });
    });
    await pick(page, 'a.txt');
    let result = await page.evaluate(() => {
        let before = [...document.querySelectorAll('[file-item] [filename]')].map(e => e.textContent);
        up.clear();
        return {
            before,
            after: document.querySelectorAll('#up [files-list] [file-item]').length,
            removed: [...new FormData(document.querySelector('#f')).getAll('FILES_to_delete[]')],
            log,
        };
    });
    eq(result, {
        before: ['old.txt', 'a.txt'],
        after: 0,
        removed: ['42'],
        log: ['add:up:a.txt', 'delete:up:old.txt', 'delete:up:a.txt'],
    }, 'записи из шаблона, события всплывают, clear() убирает всё');
    eq(page.errors, [], 'Uploader с элементом: без ошибок');
    await page.close();
});

await test('Uploader: uploader:error с preventDefault() вместо alert', async () => {
    let page = await open(uploaderMarkup, ['uploader']);
    let dialogs = 0;
    page.on('dialog', d => { dialogs++; d.dismiss(); });
    await page.evaluate(() => {
        window.errors = [];
        document.addEventListener('uploader:error', e => { e.preventDefault(); errors.push(e.detail.error.code); });
        new Uploader({ target: '#up', input_name: 'FILES', limits: { file_size: 1 }, entry: '<div file-item><span filename></span></div>' });
    });
    await pick(page, 'big.txt');
    eq([await page.evaluate(() => errors), dialogs], [[1], 0], 'ошибка лимита ушла событием, alert не показан');
    await page.close();
});

// ---------------------------------------------------------------------------
// Core: copy, download
// ---------------------------------------------------------------------------

await test('Core.copy без Clipboard API и Core.download', async () => {
    let page = await open(`<input id="keep">`, ['core']);
    let result = await page.evaluate(async () => {
        // Тестовый origin — http, Clipboard API недоступен: проверяется запасной путь.
        let copied = null;
        document.addEventListener('copy', e => copied = document.getSelection().toString());
        document.querySelector('#keep').focus();
        let ok = await Core.copy('секрет');
        let clicks = [];
        let click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { clicks.push([this.download, this.href.slice(0, 5)]); };
        Core.download('abc', 'key.txt');
        HTMLAnchorElement.prototype.click = click;
        return [ok, copied, document.activeElement.id, clicks, document.querySelectorAll('textarea, a').length];
    });
    eq(result, [true, 'секрет', 'keep', [['key.txt', 'blob:']], 0], 'копирование, возврат фокуса, ссылка на blob убрана');
    await page.close();
});

// ---------------------------------------------------------------------------
// Cookie
// ---------------------------------------------------------------------------

await test('Cookie: симметричная сериализация', async () => {
    let page = await open(``, ['cookie']);
    let result = await page.evaluate(() => {
        Cookie.set('o', { a: 1 });
        Cookie.set('s', 'plain');
        Cookie.set('b', false);
        Cookie.set('forever', 1, { expires: Infinity });
        return [Cookie.get('o'), Cookie.get('s'), Cookie.get('b'), Cookie.get('forever'), document.cookie.includes('s=plain')];
    });
    eq(result, [{ a: 1 }, 'plain', false, 1, true], 'объект, строка, boolean, expires: Infinity');
    await page.close();
});

await test('Cookie.callback: записанный null не перезапускает колбэк', async () => {
    let page = await open(``, ['cookie']);
    let calls = await page.evaluate(async () => {
        let calls = 0;
        Cookie.callback('cb', () => calls++, { interval: 0.05, value: null });
        await new Promise(r => setTimeout(r, 400));
        return calls;
    });
    eq(calls, 1, 'колбэк один раз при interval и value: null');
    await page.close();
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

await test('Route: history-режим', async () => {
    let page = await open(`<a id="l" href="/item/7?x=1">i</a><a id="ext" href="https://other.test/">o</a>`, ['route'], '/');
    let log = await page.evaluate(async () => {
        let wait = () => new Promise(r => setTimeout(r, 30));
        let log = [];
        let r = new Route({ mode: 'history', not_found: p => log.push('404 ' + p) });
        r.get('/', () => log.push('home'));
        r.get('/item/{id}', id => log.push('item ' + id + ' ' + r.query.x));
        await wait();
        document.querySelector('#l').click();
        await wait();
        r.navigate('/nope');
        await wait();
        history.back();
        await wait();
        return [...log, location.pathname];
    });
    eq(log, ['home', 'item 7 1', '404 /nope', 'item 7 1', '/item/7'], 'старт, клик по ссылке, 404, назад');
    await page.close();
});

await test('Route: hash-режим', async () => {
    let page = await open(``, ['route'], '/#/a');
    let log = await page.evaluate(async () => {
        let wait = () => new Promise(r => setTimeout(r, 30));
        let log = [];
        let r = new Route({ mode: 'hash' });
        r.get('/a', () => log.push('a'));
        r.get('/b/{n}', n => log.push('b' + n + r.query.q));
        await wait();
        r.navigate('/b/2?q=!');
        await wait();
        location.hash = '#/a';
        await wait();
        return log;
    });
    eq(log, ['a', 'b2!', 'a'], 'hash: старт, navigate с query, hashchange');
    await page.close();
});

await test('Route: static-режим разбирает адрес один раз', async () => {
    let page = await open(``, ['route'], '/x');
    let log = await page.evaluate(async () => {
        let log = [];
        let r = new Route({});
        r.get('/x', () => log.push('x'));
        await new Promise(r => setTimeout(r, 30));
        history.pushState(null, '', '/y');
        dispatchEvent(new PopStateEvent('popstate'));
        await new Promise(r => setTimeout(r, 30));
        return log;
    });
    eq(log, ['x'], 'static: без SPA-подписок');
    await page.close();
});

// ---------------------------------------------------------------------------
// Mask: группы и edit
// ---------------------------------------------------------------------------

const DATE_WHOLE = `new Mask({ target: '#d', mask: '{dd:00}.{mm:00}.{yyyy:0000}', placeholder: 'always',
    edit: 'whole', align: 'right', pad: '0',
    groups: { dd: { filler: 'ДД', min: 1, max: 31 }, mm: { filler: 'ММ', min: 1, max: 12 }, yyyy: { filler: 'ГГГГ', min: 1 } } })`;

const field = page => page.$eval('#d', d => [d.value, d.selectionStart, d.selectionEnd]);

async function open_mask(init) {
    let page = await open(`<input id="before"><input id="d"><input id="after">`, ['mask']);
    await page.evaluate(init);
    return page;
}

await test('Mask whole: клик выделяет группу целиком, набор как у input[type=date]', async () => {
    let page = await open_mask(DATE_WHOLE);
    await page.focus('#before');
    await page.keyboard.press('Tab');
    eq(await field(page), ['ДД.ММ.ГГГГ', 0, 2], 'Tab в поле выделяет первую группу');

    await page.keyboard.type('1');
    eq(await field(page), ['01.ММ.ГГГГ', 0, 2], '1 → 01, группа остаётся выделенной');
    await page.keyboard.type('2');
    eq(await field(page), ['12.ММ.ГГГГ', 3, 5], '12 → переход в ММ');
    await page.keyboard.type('3');
    eq(await field(page), ['12.03.ГГГГ', 6, 10], 'ММ: 3 → 03 сразу с переходом');
    await page.keyboard.type('2026');
    eq(await field(page), ['12.03.2026', 6, 10], 'год въезжает справа, остаётся выделенным');
    eq(await page.$eval('#d', d => d.state().groups), { dd: '12', mm: '03', yyyy: '2026' }, 'state().groups');
    eq(await page.$eval('#d', d => d.getAttribute('is_complete')), 'true', 'полная дата - complete');

    let box = await page.$eval('#d', d => { let r = d.getBoundingClientRect(); return [r.x, r.y, r.height]; });
    await page.mouse.click(box[0] + 12, box[1] + box[2] / 2);
    let [, s, e] = await field(page);
    eq([s, e], [0, 2], 'клик в ДД выделяет ДД целиком');
    await page.keyboard.type('5');
    eq(await field(page), ['05.03.2026', 3, 5], 'клик сбрасывает буфер: 5 → 05 и переход');
    await page.close();
});

await test('Mask whole: стрелки, Tab, ↑/↓, Backspace, вставка', async () => {
    let page = await open_mask(DATE_WHOLE);
    await page.focus('#d');
    await page.evaluate(() => document.querySelector('#d').set('12.12.2026'));
    await page.evaluate(() => document.querySelector('#d').setSelectionRange(0, 2));
    await page.keyboard.press('ArrowRight');
    eq(await field(page), ['12.12.2026', 3, 5], '→ на ММ');
    await page.keyboard.press('ArrowUp');
    eq(await field(page), ['12.01.2026', 3, 5], '↑ по кругу: 12 → 01');
    await page.keyboard.press('ArrowDown');
    eq((await field(page))[0], '12.12.2026', '↓ обратно: 01 → 12');
    await page.keyboard.press('Tab');
    eq(await field(page), ['12.12.2026', 6, 10], 'Tab на ГГГГ');
    await page.keyboard.press('Shift+Tab');
    eq(await field(page), ['12.12.2026', 3, 5], 'Shift+Tab назад на ММ');
    await page.keyboard.press('Backspace');
    eq(await field(page), ['12.ММ.2026', 3, 5], 'Backspace чистит группу целиком');
    await page.keyboard.press('Backspace');
    eq(await field(page), ['12.ММ.2026', 0, 2], 'Backspace по пустой группе - на предыдущую');
    await page.keyboard.press('ArrowLeft');
    eq((await field(page)).slice(1), [0, 2], '← с первой группы остаётся на ней');

    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    eq(await page.evaluate(() => document.activeElement.id), 'after', 'Tab с последней группы уводит из поля');

    await page.focus('#d');
    await page.$eval('#d', d => {
        let dt = new DataTransfer();
        dt.setData('text/plain', '01.02.2003');
        d.setSelectionRange(0, 2);
        d.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste', dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    eq((await field(page))[0], '01.02.2003', 'вставка раскладывается по группам');
    eq(page.errors, [], 'без ошибок и предупреждений');
    await page.close();
});

await test('Mask end: каретка прижата к концу группы, частичное выделение → группа', async () => {
    let page = await open_mask(`new Mask({ target: '#d', mask: '{dd:00}.{mm:00}.{yyyy:0000}', placeholder: 'always',
        edit: 'end', filler: 'ДДММГГГГ' })`);
    await page.focus('#d');
    await page.evaluate(() => document.querySelector('#d').set('1203'));
    await page.$eval('#d', d => d.setSelectionRange(1, 1));
    await page.keyboard.type('5');
    eq((await field(page))[0], '12.03.5ГГГ', 'набор из середины ДД идёт с конца набранного');
    await page.$eval('#d', d => d.setSelectionRange(4, 5));
    await tick(page);
    eq((await field(page)).slice(1), [3, 5], 'частичное выделение ММ расширяется до ММ');
    await page.close();
});

await test('Mask free: набор без групп не изменился', async () => {
    let page = await open_mask(`new Mask({ target: '#d', mask: '00.00.0000', placeholder: 'always', filler: 'ДДММГГГГ' })`);
    await page.focus('#d');
    await page.keyboard.type('1203');
    eq(await field(page), ['12.03.ГГГГ', 6, 6], 'сквозной набор');
    await page.$eval('#d', d => d.setSelectionRange(7, 7));
    await page.keyboard.type('9');
    eq((await field(page))[0], '12.03.Г9ГГ', 'клик в середину ГГГГ пишет поверх ячейки');
    eq(page.errors, [], 'без ошибок и предупреждений');
    await page.close();
});

// ---------------------------------------------------------------------------
// Mask: несколько шаблонов, placeholder: 'typed', on_reject, события
// ---------------------------------------------------------------------------

const COLOR = `window.rejects = [];
new Mask({ target: '#d', mask: ['RAL 0000', 'NCS S 0000-{{[YRGBN]}}', 'NCS S 0000-{{[YRGB]}}00{{[YRGB]}}'],
    placeholder: 'typed',
    before_char: (input, { char }) => char.toUpperCase(),
    on_reject: (input, { char, reason }) => rejects.push(char + ':' + reason) })`;

// Чистое поле в фокусе, набор с клавиатуры, итог: значение, полнота, маска, пусто ли, отказы
async function type_color(page, keys) {
    await page.$eval('#d', d => { d.focus(); d.clear(); window.rejects = []; });
    await page.keyboard.type(keys);
    return page.$eval('#d', d => {
        let s = d.state();
        return [d.value, s.complete, s.mask_id, s.empty, rejects.join(' ')];
    });
}

await test('Mask: RAL/NCS - автовыбор шаблона, typed, отказы с причиной', async () => {
    let page = await open_mask(COLOR);
    let cases = {
        '1':            ['RAL 1', false, 0, false, ''],
        'r':            ['RAL ', false, 0, false, ''],
        'x':            ['', false, 0, true, 'X:slot'],
        'xx1':          ['RAL 1', false, 0, false, 'X:slot X:slot'],
        'ral1234':      ['RAL 1234', true, 0, false, ''],
        'n0500n':       ['NCS S 0500-N', true, 1, false, ''],
        'n2030b50g':    ['NCS S 2030-B50G', true, 2, false, ''],
        'n1050-y':      ['NCS S 1050-Y', true, 1, false, ''],
        'ncs s 0500-n': ['NCS S 0500-N', true, 1, false, ''],
        '12345':        ['RAL 1234', true, 0, false, '5:full'],
        's1080y90r':    ['NCS S 1080-Y90R', true, 2, false, ''],
        'ral1234x':     ['RAL 1234', true, 0, false, 'X:full'],
        'n1050y90rx':   ['NCS S 1050-Y90R', true, 2, false, 'X:full'],
        'n1050yq':      ['NCS S 1050-Y', true, 1, false, 'Q:full'],
        'n10a':         ['NCS S 10', false, 1, false, 'A:slot'],
        '1a':           ['RAL 1', false, 0, false, 'A:slot'],
        'n10 ':         ['NCS S 10', false, 1, false, ' :literal'],
    };
    for (let [keys, expected] of Object.entries(cases))
        eq(await type_color(page, keys), expected, `набор "${keys}"`);

    await type_color(page, 'n1050');
    eq(await page.$eval('#d', d => [d.value, d.state().skeleton]), ['NCS S 1050-', 'NCS S 1050-_'], 'разделитель сразу, skeleton - с заполнителем');

    for (let keys of ['1234', 'n12']) {
        await type_color(page, keys);
        for (let i = 0; i < 10; i++) await page.keyboard.press('Backspace');
        eq(await page.$eval('#d', d => [d.value, d.state().empty]), ['', true], `"${keys}" стирается до пустого поля`);
    }
    eq(page.errors, [], 'без ошибок и предупреждений');
    await page.close();
});

await test("Mask: 'always' с несколькими шаблонами переключает шаблон", async () => {
    let page = await open_mask(`new Mask({ target: '#d', mask: ['0000000000', '000000000000'], placeholder: 'always' })`);
    await page.focus('#d');
    await page.keyboard.type('123456789012');
    eq(await page.$eval('#d', d => [d.value, d.state().mask_id, d.state().complete]), ['123456789012', 1, true], 'ИНН 12 цифр');

    await page.$eval('#d', d => d.set_mask(['RAL 0000', 'NCS S 0000-{{[YRGBN]}}']));
    await page.$eval('#d', d => d.clear());
    await page.keyboard.type('N10');
    eq(await page.$eval('#d', d => d.value), 'NCS S 10__-_', 'буква уводит с первого шаблона на второй');
    await page.close();
});

await test('Mask: заполнитель-подсказка не принимается за дырку вне режима ячеек', async () => {
    let page = await open_mask(`new Mask({ target: '#d', mask: [{ pattern: 'NCS S 0000-{{[YRGB]}}', filler: '0000N' }] })`);
    await page.focus('#d');
    await page.keyboard.type('NCS S 1050N');
    eq(await page.$eval('#d', d => [d.value, d.state().skeleton]), ['NCS S 1050-', 'NCS S 1050-N'], 'N не встала в слот тона');
    await page.close();
});

await test('Mask: отказ не глотает следующий input, set() шлёт input', async () => {
    let page = await open_mask(`window.inputs = 0; new Mask({ target: '#d', mask: '0000' });
        document.querySelector('#d').addEventListener('input', () => inputs++)`);
    await page.focus('#d');
    await page.keyboard.type('x');
    eq(await page.evaluate(() => inputs), 0, 'отказ - события нет');
    await page.$eval('#d', d => { d.value = '12'; d.dispatchEvent(new Event('input', { bubbles: true })); });
    eq(await page.$eval('#d', d => d.raw()), '12', 'внешний input после отказа маска разобрала');

    await page.evaluate(() => { inputs = 0; let d = document.querySelector('#d'); d.set('34'); d.set('34'); d.clear(); });
    eq(await page.evaluate(() => inputs), 2, 'set() и clear() шлют input, повтор того же значения - нет');
    await page.close();

    page = await open(`<st-app app="t"><input id="d" #model="value"><i id="out">{{ value }}</i></st-app>`, ['app', 'mask']);
    await page.evaluate(() => App.create({ app: 't', value: '' }));
    await tick(page);
    await page.evaluate(() => { new Mask({ target: '#d', mask: '00.00' }); document.querySelector('#d').set('1203'); });
    await tick(page);
    eq(await page.textContent('#out'), '12.03', '#model видит set()');
    eq(page.errors, [], 'без ошибок');
    await page.close();
});

// ---------------------------------------------------------------------------
// destroy() и Select.refresh(): компоненты, которые живут меньше страницы (SPA)
// ---------------------------------------------------------------------------

// Слушатели на document/window считаются подменой addEventListener до загрузки модулей:
// снятый через AbortSignal слушатель больше не вызывается, а по счётчику видно, что
// повторные экземпляры не копятся.
const SPY = `<script>window.calls = { document: 0, window: 0 };
for (let [name, target] of [['document', document], ['window', window]]) {
    let add = target.addEventListener.bind(target);
    target.addEventListener = (type, fn, opts) => add(type, (...a) => { if (!opts?.signal?.aborted) window.calls[name]++; return fn(...a); }, opts);
}</script>`;

await test('Modal.destroy: контент на место, окно убрано, прокрутка возвращена', async () => {
    let page = await open(`<div style="height:3000px"><main id="home"><p id="before"></p><div id="m">окно</div><p id="after"></p></main></div>`, ['modal']);
    await page.evaluate(() => window.scrollTo(0, 500));
    let result = await page.evaluate(async () => {
        let modal = new Modal({ content: '#m', duration: 0 });
        let waiting = modal.open();
        await until(() => modal.state == 'shown');
        let locked = document.body.style.position;
        modal.destroy();
        return {
            locked,
            position: document.body.style.position,
            scroll: window.scrollY,
            order: [...document.querySelector('#home').children].map(el => el.id),
            modals: document.querySelectorAll('modal').length,
            owner: Modal.find('#m') === undefined,
            result: await waiting,
        };
    });
    eq(result, { locked: 'fixed', position: '', scroll: 500, order: ['before', 'm', 'after'], modals: 0, owner: true, result: null },
        'контент вернулся между соседями, окна нет, body и прокрутка как до показа, open() получил null');
    eq(page.errors, [], 'без ошибок');
    await page.close();
});

await test('Modal.destroy: триггеры и Esc больше не открывают окно', async () => {
    let page = await open(`<button id="t">open</button><div id="m">окно</div>`, ['modal']);
    let state = await page.evaluate(async () => {
        let modal = new Modal({ content: '#m', trigger: '#t', duration: 0 });
        modal.destroy();
        document.querySelector('#t').click();
        await new Promise(r => setTimeout(r, 50));
        return [modal.state, document.querySelectorAll('modal').length];
    });
    eq(state, ['hidden', 0], 'клик по триггеру после destroy ничего не делает');
    await page.close();
});

await test('Select.destroy: select на месте, document-слушатель снят, можно поднять заново', async () => {
    let page = await open(`${SPY}<form id="f"><select id="s" style="color: red"><option>a</option><option>b</option></select></form>`, ['select']);
    let result = await page.evaluate(() => {
        for (let i = 0; i < 3; i++) new Select({ target: '#s' }).destroy();
        let select = document.querySelector('#s');
        let before = { parent: select.parentElement.id, style: select.getAttribute('style'), containers: document.querySelectorAll('select-container').length };
        window.calls.document = 0;
        document.body.click();
        let after = window.calls.document;
        new Select({ target: '#s' });
        return { before, after, again: document.querySelectorAll('select-container').length, open: typeof select.open };
    });
    eq(result, { before: { parent: 'f', style: 'color: red', containers: 0 }, after: 0, again: 1, open: 'function' },
        'разметка и style вернулись, клик мимо не доходит до разобранных, повторный Select поднимается');
    eq(page.errors, [], 'без ошибок');
    await page.close();
});

await test('Select.refresh: пункты и триггер по новым option и значению', async () => {
    let page = await open(`<select id="s"><option value="1">один</option><option value="2">два</option></select>`, ['select']);
    let result = await page.evaluate(() => {
        let select = new Select({ target: '#s' });
        let el = document.querySelector('#s');
        el.add(new Option('три', '3'));
        el.value = '3';
        select.refresh();
        return {
            items: [...document.querySelectorAll('select-option')].map(o => o.textContent + (o.hasAttribute('selected') ? '*' : '')),
            trigger: document.querySelector('select-trigger').textContent,
        };
    });
    eq(result, { items: ['один', 'два', 'три*'], trigger: 'три' }, 'пункты пересобраны, выбран новый');
    await page.close();
});

await test('Toggle.destroy: hashchange и клики сняты', async () => {
    let page = await open(`${SPY}<button id="t" trigger target="#x">t</button><div id="x"></div>`, ['toggle']);
    let result = await page.evaluate(async () => {
        let toggle = new Toggle({ trigger: '#t', anchor: true, keep_history: true });
        toggle.destroy();
        window.calls.window = 0;
        location.hash = '#x';
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('#t').click();
        await new Promise(r => setTimeout(r, 50));
        return { hashchange: window.calls.window, state: document.querySelector('#t').getAttribute('state'), api: typeof document.querySelector('#t').toggle };
    });
    eq(result, { hashchange: 0, state: 'inactive', api: 'undefined' }, 'после destroy нет реакции на hash и клик, методы с триггера сняты');
    await page.close();
});

await test('Validator.destroy и Mask.destroy: поле как до привязки', async () => {
    let page = await open(`<form id="f"><input id="i" type="number" maxlength="4" required></form>`, ['mask', 'validator']);
    let result = await page.evaluate(() => {
        let input = document.querySelector('#i');
        let mask = new Mask({ target: input, mask: '0000' });
        let validator = new Validator({ target: input });
        validator.check();
        let bound = { type: input.type, maxlength: input.getAttribute('maxlength'), state: input.getAttribute('state') };
        validator.destroy();
        mask.destroy();
        input.dispatchEvent(new Event('blur'));
        return {
            bound,
            type: input.type,
            maxlength: input.getAttribute('maxlength'),
            state: input.getAttribute('state'),
            api: [typeof input.raw, typeof input.check],
            rebind: (() => { new Mask({ target: input, mask: '00' }); new Validator({ target: input }); return true; })(),
        };
    });
    eq(result, {
        bound: { type: 'text', maxlength: null, state: 'invalid' },
        type: 'number', maxlength: '4', state: null, api: ['undefined', 'undefined'], rebind: true,
    }, 'type, maxlength и state вернулись, методы сняты, привязать можно заново');
    await page.close();
});

await test('Uploader.destroy: выбор файла снят, записи остались', async () => {
    let page = await open(`<div id="u"><div files-list><div file-item><span filename>a.pdf</span><input type="hidden" name="docs" value="1"><button type="button" delete-button>x</button></div></div><button type="button" add-button>+</button></div>`, ['uploader']);
    let result = await page.evaluate(() => {
        let uploader = new Uploader({ target: '#u', input_name: 'docs', entry: '[files-list] [file-item]' });
        uploader.destroy();
        document.querySelector('[delete-button]').click();
        return {
            pickers: document.querySelectorAll('#u > input[type=file]').length,
            items: document.querySelectorAll('[file-item]').length,
            owner: Uploader.find('#u') === undefined,
        };
    });
    eq(result, { pickers: 0, items: 1, owner: true }, 'поле выбора убрано, удаление больше не срабатывает');
    await page.close();
});

await test('Toggle anchor: history.state роутера сохраняется', async () => {
    let page = await open(`<button id="t" trigger target="#x">t</button><div id="x"></div>`, ['toggle']);
    let result = await page.evaluate(async () => {
        history.replaceState({ router: 1 }, '');
        new Toggle({ trigger: '#t', anchor: true });
        document.querySelector('#t').click();
        await new Promise(r => setTimeout(r, 50));
        let replaced = [location.hash, history.state];
        return replaced;
    });
    eq(result, ['#t', { router: 1 }], 'хеш (id триггера) записан, состояние осталось');
    await page.close();
});

// ---------------------------------------------------------------------------
// Toggle: индикатор и доводка таба до видимости
// ---------------------------------------------------------------------------

// Лента 300px, шесть табов по 120px: видны два с половиной. Панели с id — якорь берёт id цели,
// чтобы родная прокрутка браузера к фрагменту (она ушла бы к панели) не подменяла доводку ленты.
function tabs({ bar = '', pill = 'transition: transform .3s, width .3s;', attrs = '', active = 0, outside = false, before = '', after = '' } = {}) {
    let buttons = [1, 2, 3, 4, 5, 6].map(i => `<button trigger data-t="t${i}" target="#p${i}"${i === active ? ' state="active"' : ''}>Таб ${i}</button>`).join('');
    let indicator = `<i id="pill"></i>`;
    return `<style>
        body { margin: 0; }
        #wrap { position: relative; width: 300px; }
        #bar { position: relative; display: flex; width: 300px; overflow-x: auto; ${bar} }
        #bar button { flex: 0 0 120px; height: 30px; margin: 0; padding: 0; border: 0; }
        #pill { position: absolute; left: 0; top: 0; height: 2px; width: var(--indicator-width); transform: translateX(var(--indicator-x)); ${pill} }
    </style>${before}<div id="wrap"><div id="bar"${attrs}>${buttons}${outside ? '' : indicator}</div>${outside ? indicator : ''}</div>
    ${[1, 2, 3, 4, 5, 6].map(i => `<section id="p${i}"${i === active ? ' state="active"' : ''}>${i}</section>`).join('')}${after}`;
}

// Хелперы страницы: видимость таба в ленте, совпадение отрисованной пилюли с табом, ожидание
// конца прокрутки (плавной в том числе).
const TABS_HELPERS = `<script>
    window.T = id => document.querySelector('[data-t="' + id.slice(1) + '"]') ?? document.querySelector(id);
    window.on = id => ['activating', 'active'].includes(T(id).getAttribute('state'));
    window.done = () => new Promise(r => setTimeout(r, 50));
    window.bar = () => document.querySelector('#bar');
    window.fully = (id, pad = 0) => {
        let t = T(id).getBoundingClientRect(), b = bar().getBoundingClientRect();
        return t.left >= b.left + pad - 0.5 && t.right <= b.left + bar().clientWidth - pad + 0.5;
    };
    window.onPill = id => {
        let p = document.querySelector('#pill').getBoundingClientRect(), t = T(id).getBoundingClientRect();
        return Math.abs(p.left - t.left) < 1 && Math.abs(p.width - t.width) < 1;
    };
    window.frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.settled = async (el = bar()) => {
        let last = NaN, same = 0;
        for (let i = 0; i < 200 && same < 5; i++) {
            await new Promise(r => requestAnimationFrame(r));
            same = el.scrollLeft === last ? same + 1 : 0;
            last = el.scrollLeft;
        }
    };
</script>`;

// Клик мышью в видимую часть таба — как пользователь; Playwright page.click сам прокрутил бы ленту.
async function clickVisible(page, id) {
    let { x, y } = await page.evaluate(id => {
        let t = T(id).getBoundingClientRect(), b = bar().getBoundingClientRect();
        let left = Math.max(t.left, b.left), right = Math.min(t.right, b.left + bar().clientWidth);
        return { x: (left + right) / 2, y: t.top + t.height / 2 };
    }, id);
    await page.mouse.click(x, y);
}

await test('Toggle indicator: координаты с учётом прокрутки ленты', async () => {
    let page = await open(TABS_HELPERS + tabs({ pill: '' }), ['toggle']);
    let result = await page.evaluate(async () => {
        new Toggle({ trigger: '#bar [trigger]', group: 'radio', indicator: '#pill' });
        let pill = document.querySelector('#pill');
        let before = pill.getAttribute('state');
        bar().scrollLeft = 200;
        T('#t3').click();
        await frame();
        return {
            before,
            state: pill.getAttribute('state'),
            x: pill.style.getPropertyValue('--indicator-x'),
            width: pill.style.getPropertyValue('--indicator-width'),
            on: onPill('#t3'),
        };
    });
    eq(result, { before: 'inactive', state: 'active', x: '240px', width: '120px', on: true }, 'x — в координатах содержимого ленты, пилюля на табе');
    eq(page.errors, [], 'indicator: без ошибок');
    await page.close();
});

await test('Toggle indicator: ширина таба изменилась — пилюля подстроилась сразу', async () => {
    let page = await open(TABS_HELPERS + tabs({ pill: 'transition: transform 1s, width 1s;', active: 3 }), ['toggle']);
    let result = await page.evaluate(async () => {
        new Toggle({ trigger: '#bar [trigger]', group: 'radio', indicator: '#pill' });
        await frame();
        T('#t2').style.flexBasis = '160px';
        T('#t3').style.flexBasis = '150px';
        await frame();
        return { on: onPill('#t3'), x: document.querySelector('#pill').style.getPropertyValue('--indicator-x') };
    });
    eq(result, { on: true, x: '280px' }, 'ResizeObserver: без анимации, позиция и ширина новые');
    await page.close();
});

await test('Toggle indicator: лента меняет ширину, табы по центру — пилюля следует', async () => {
    let page = await open(TABS_HELPERS + `<style>#bar6 { position: relative; display: flex; justify-content: center; width: 100%; }
        #bar6 button { flex: 0 0 80px; } #pill { position: absolute; left: 0; width: var(--indicator-width); height: 2px; transform: translateX(var(--indicator-x)); transition: transform 1s; }</style>
        <div id="bar6"><button trigger id="a" state="active">a</button><button trigger id="b">b</button><i id="pill"></i></div>`, ['toggle']);
    await page.evaluate(() => new Toggle({ trigger: '#bar6 [trigger]', group: 'radio', indicator: '#pill' }));
    await page.setViewportSize({ width: 600, height: 400 });
    let on = await page.evaluate(async () => { await frame(); return onPill('#a'); });
    eq(on, true, 'ресайз окна: пилюля на табе без анимации');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.close();
});

await test('Toggle indicator: первая расстановка без выезда из нуля', async () => {
    let page = await open(TABS_HELPERS + tabs({ pill: 'transition: transform 1s, width 1s;', active: 2 }), ['toggle']);
    let result = await page.evaluate(async () => {
        new Toggle({ trigger: '#bar [trigger]', group: 'radio', indicator: '#pill' });
        let now = onPill('#t2');
        await new Promise(r => requestAnimationFrame(r));
        return [now, onPill('#t2')];
    });
    eq(result, [true, true], 'сразу и на первом кадре пилюля уже на стартовом табе');
    await page.close();
});

await test('Toggle indicator: group true — закрыли последний, state="inactive"', async () => {
    let page = await open(TABS_HELPERS + tabs({ pill: '' }), ['toggle']);
    let result = await page.evaluate(async () => {
        new Toggle({ trigger: '#bar [trigger]', group: true, indicator: '#pill' });
        let pill = document.querySelector('#pill');
        T('#t1').click();
        await done();
        let opened = pill.getAttribute('state');
        T('#t1').click();
        await done();
        return [opened, pill.getAttribute('state'), pill.style.getPropertyValue('--indicator-x')];
    });
    eq(result, ['active', 'inactive', '0px'], 'гаснет на месте: координаты остались');
    await page.close();
});

await test('Toggle indicator: без группы — выключили текущий, пилюля к оставшемуся', async () => {
    let page = await open(TABS_HELPERS + tabs({ pill: '' }), ['toggle']);
    let result = await page.evaluate(async () => {
        new Toggle({ trigger: '#bar [trigger]', indicator: '#pill' });
        T('#t1').click();
        T('#t2').click();
        await done();
        let second = onPill('#t2');
        T('#t2').click();
        await done();
        return [second, onPill('#t1'), document.querySelector('#pill').getAttribute('state')];
    });
    eq(result, [true, true, 'active'], 'следует за последним, после выключения — к t1');
    await page.close();
});

await test('Toggle indicator: после destroy() не обновляется', async () => {
    let page = await open(TABS_HELPERS + tabs({ pill: '', active: 1 }), ['toggle']);
    let result = await page.evaluate(async () => {
        let toggle = new Toggle({ trigger: '#bar [trigger]', group: 'radio', indicator: '#pill' });
        await frame();
        toggle.destroy();
        T('#t1').style.flexBasis = '200px';
        await frame();
        return document.querySelector('#pill').style.getPropertyValue('--indicator-width');
    });
    eq(result, '120px', 'ResizeObserver отключён');
    await page.close();
});

await test('Toggle reveal: якорь при загрузке доводит таб, страница на месте', async () => {
    let page = await open(TABS_HELPERS + tabs({ after: '<div style="height:3000px"></div>' }), ['toggle'], '/#p6');
    let result = await page.evaluate(async () => {
        window.scrollTo(0, 0);
        new Toggle({ trigger: '#bar [trigger]', group: 'radio', anchor: true, indicator: '#pill' });
        await frame();
        return { scroll: bar().scrollLeft > 0, fully: fully('#t6'), state: on('#t6'), on: onPill('#t6'), y: window.scrollY };
    });
    eq(result, { scroll: true, fully: true, state: true, on: true, y: 0 }, 'reveal: false не мешает: якорь доводит всегда');
    await page.close();
});

await test('Toggle reveal: hashchange доводит таб (keep_history)', async () => {
    let page = await open(TABS_HELPERS + tabs({ active: 1 }), ['toggle']);
    let result = await page.evaluate(async () => {
        new Toggle({ trigger: '#bar [trigger]', group: 'radio', keep_history: true });
        history.pushState(null, '', '#p5');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
        await settled();
        return { fully: fully('#t5'), state: on('#t5') };
    });
    eq(result, { fully: true, state: true }, '«назад/вперёд» на таб за краем — таб в ленте виден');
    await page.close();
});

await test('Toggle reveal: стартовый активный таб из разметки виден', async () => {
    let page = await open(TABS_HELPERS + tabs({ active: 5 }), ['toggle']);
    let result = await page.evaluate(async () => {
        new Toggle({ trigger: '#bar [trigger]', group: 'radio', indicator: '#pill' });
        await frame();
        return [fully('#t5'), onPill('#t5')];
    });
    eq(result, [true, true], 'state="active" на пятом табе — лента прокручена к нему');
    await page.close();
});

await test('Toggle reveal: клик по частично видному табу — только при reveal: true', async () => {
    for (let reveal of [false, true]) {
        let page = await open(TABS_HELPERS + tabs({ active: 1 }), ['toggle']);
        await page.evaluate(reveal => new Toggle({ trigger: '#bar [trigger]', group: 'radio', reveal }), reveal);
        await clickVisible(page, '#t3');
        let result = await page.evaluate(async () => { await settled(); return { scroll: bar().scrollLeft, fully: fully('#t3') }; });
        eq(result, reveal ? { scroll: 60, fully: true } : { scroll: 0, fully: false }, `reveal: ${reveal}`);
        await page.close();
    }
});

await test('Toggle reveal: видимый целиком таб ленту не двигает, страница на месте', async () => {
    let page = await open(TABS_HELPERS + tabs({ active: 1, before: '<div style="height:200px"></div>', after: '<div style="height:3000px"></div>' }), ['toggle']);
    await page.evaluate(() => { window.scrollTo(0, 150); new Toggle({ trigger: '#bar [trigger]', group: 'radio', reveal: true }); });
    await clickVisible(page, '#t2');
    await clickVisible(page, '#t3');
    let result = await page.evaluate(async () => { await settled(); return { x: window.scrollX, y: window.scrollY, fully: fully('#t3') }; });
    eq(result, { x: 0, y: 150, fully: true }, 'прокрутилась только лента');
    await page.close();
});

await test('Toggle reveal: hover-меню не прокручивается под курсором', async () => {
    let page = await open(TABS_HELPERS + tabs(), ['toggle']);
    await page.evaluate(() => new Toggle({ trigger: '#bar [trigger]', action: 'hover', reveal: true }));
    let box = await page.evaluate(() => { let b = bar().getBoundingClientRect(); return { x: b.left + 270, y: b.top + 15 }; });
    await page.mouse.move(box.x, box.y);
    let result = await page.evaluate(async () => { await settled(); return [bar().scrollLeft, on('#t3')]; });
    eq(result, [0, true], 'наведение включило таб, лента на месте');
    await page.close();
});

await test('Toggle reveal: scroll-padding-inline — таб не уходит под стрелки', async () => {
    let page = await open(TABS_HELPERS + tabs({ bar: 'scroll-padding-inline: 40px;', active: 1 }), ['toggle']);
    await page.evaluate(() => new Toggle({ trigger: '#bar [trigger]', group: 'radio', reveal: true }));
    await clickVisible(page, '#t3');
    let right = await page.evaluate(async () => { await settled(); return fully('#t3', 40); });
    await page.evaluate(() => T('#t1').click());
    let left = await page.evaluate(async () => { await settled(); return fully('#t1', 40) || bar().scrollLeft === 0; });
    eq([right, left], [true, true], 'отступ 40px соблюдён с обеих сторон');
    await page.close();
});

await test('Toggle reveal: scroll-snap — после прилипания таб виден целиком', async () => {
    for (let align of ['start', 'center', 'end']) {
        let page = await open(TABS_HELPERS + tabs({ bar: `scroll-snap-type: x mandatory;`, active: 1, before: `<style>#bar button { scroll-snap-align: ${align}; }</style>` }), ['toggle']);
        await page.evaluate(() => new Toggle({ trigger: '#bar [trigger]', group: 'radio', reveal: true }));
        let seen = [];
        // Табы за краем ленты мышью не кликнуть — переключение из кода (как стрелки «вперёд/назад»).
        for (let id of ['#t3', '#t5', '#t2', '#t6', '#t1'])
            seen.push(await page.evaluate(async id => { T(id).click(); await settled(); return fully(id); }, id));
        eq(seen, [true, true, true, true, true], `snap-align: ${align}`);
        await page.close();
    }
});

await test('Toggle reveal: плавная прокрутка и быстрые клики подряд', async () => {
    let page = await open(TABS_HELPERS + tabs({ bar: 'scroll-behavior: smooth;', active: 1 }), ['toggle']);
    let result = await page.evaluate(async () => {
        new Toggle({ trigger: '#bar [trigger]', group: 'radio', reveal: true, indicator: '#pill' });
        for (let id of ['#t4', '#t5', '#t6']) {
            T(id).click();
            await new Promise(r => requestAnimationFrame(r));
        }
        await settled();
        await new Promise(r => setTimeout(r, 400));
        return { fully: fully('#t6'), on: onPill('#t6'), end: bar().scrollLeft === bar().scrollWidth - bar().clientWidth };
    });
    eq(result, { fully: true, on: true, end: true }, 'итог — последний таб, пилюля на нём');
    await page.close();
});

await test('Toggle reveal: ручная прокрутка между кликами не сбивается', async () => {
    let page = await open(TABS_HELPERS + tabs({ active: 1 }), ['toggle']);
    await page.evaluate(() => { new Toggle({ trigger: '#bar [trigger]', group: 'radio', reveal: true }); bar().scrollLeft = 150; });
    await clickVisible(page, '#t3');
    let result = await page.evaluate(async () => { await settled(); return bar().scrollLeft; });
    eq(result, 150, 'таб и так виден целиком — лента не дёрнулась');
    await page.close();
});

await test('Toggle reveal: RTL — доводка в нужную сторону, пилюля на табе', async () => {
    let page = await open(TABS_HELPERS + tabs({ attrs: ' dir="rtl"', pill: '', active: 1 }), ['toggle']);
    await page.evaluate(() => new Toggle({ trigger: '#bar [trigger]', group: 'radio', reveal: true, indicator: '#pill' }));
    let before = await page.evaluate(() => fully('#t3'));
    await clickVisible(page, '#t3');
    let result = await page.evaluate(async () => { await settled(); return { fully: fully('#t3'), on: onPill('#t3'), scroll: bar().scrollLeft }; });
    eq([before, result], [false, { fully: true, on: true, scroll: -60 }], 'ушла влево на 60px (scrollLeft отрицательный)');
    await page.close();
});

await test('Toggle reveal: вложенные прокрутки — двигается только лента', async () => {
    let page = await open(TABS_HELPERS + `<div id="outer" style="width:400px; overflow-x:auto"><div style="width:1200px">${tabs({ active: 1 })}</div></div>`, ['toggle']);
    await page.evaluate(() => new Toggle({ trigger: '#bar [trigger]', group: 'radio', reveal: true }));
    await page.evaluate(() => T('#t6').click());
    let result = await page.evaluate(async () => { await settled(); return { fully: fully('#t6'), outer: document.querySelector('#outer').scrollLeft }; });
    eq(result, { fully: true, outer: 0 }, 'внешняя область осталась на месте');
    await page.close();
});

await test('Toggle reveal: якорь на таб в закрытой модалке — доводка при открытии', async () => {
    let page = await open(TABS_HELPERS + `<div id="box">${tabs()}</div>`, ['modal', 'toggle'], '/#p6');
    let result = await page.evaluate(async () => {
        let modal = new Modal({ content: '#box' });
        new Toggle({ trigger: '#bar [trigger]', group: 'radio', anchor: true, indicator: '#pill' });
        let hidden = bar().scrollLeft;
        modal.show();
        await until(() => modal.state === 'shown');
        await frame();
        return { hidden, fully: fully('#t6'), on: onPill('#t6') };
    });
    eq(result, { hidden: 0, fully: true, on: true }, 'пока скрыто — ничего, после показа таб и пилюля на месте');
    await page.close();
});

await test('Toggle reveal: фокус с клавиатуры — без второго рывка', async () => {
    let page = await open(TABS_HELPERS + tabs({ active: 1 }), ['toggle']);
    await page.evaluate(() => new Toggle({ trigger: '#bar [trigger]', group: 'radio', reveal: true }));
    // Сколько Tab до таба, зависит от движка (Firefox сначала фокусирует документ).
    for (let i = 0; i < 10 && await page.evaluate(() => document.activeElement.dataset?.t) !== 't4'; i++)
        await page.keyboard.press('Tab');
    let focused = await page.evaluate(async () => { await settled(); return [document.activeElement.dataset.t, bar().scrollLeft, fully('#t4')]; });
    await page.keyboard.press('Enter');
    let after = await page.evaluate(async () => { await settled(); return [on('#t4'), bar().scrollLeft]; });
    eq([focused[0], focused[2], after[0], after[1]], ['t4', true, true, focused[1]], 'браузер прокрутил к фокусу, Enter ленту не двигает');
    await page.close();
});

await test('Toggle indicator: пилюля вне ленты следует за прокруткой без отставания', async () => {
    let page = await open(TABS_HELPERS + tabs({ outside: true, active: 2, pill: 'transition: transform 1s, width 1s;' }), ['toggle']);
    let result = await page.evaluate(async () => {
        new Toggle({ trigger: '#bar [trigger]', group: 'radio', indicator: '#pill' });
        await frame();
        bar().scrollTo({ left: 200, behavior: 'smooth' });
        let frames = [];
        for (let i = 0; i < 20; i++) {
            await new Promise(r => requestAnimationFrame(r));
            frames.push(onPill('#t2'));
        }
        return { off: frames.filter(x => !x).length, moved: bar().scrollLeft > 0 };
    });
    eq(result, { off: 0, moved: true }, 'на каждом кадре прокрутки пилюля на табе');
    await page.close();
});

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

const FORM = `<st-app app="form"><form action="/submit" method="post"><input name="name" id="name"><button id="send">→</button></form>
    <div form-done>Спасибо</div></st-app>`;

await test('Form.is_done: экран «Спасибо» после успеха, false после done(false)', async () => {
    let page = await open(FORM, ['app', 'app/form']);
    await page.evaluate(() => App.create(Form));
    await tick(page);
    let start = await page.evaluate(() => document.querySelector('st-app').is_done);
    await page.fill('#name', 'Иван');
    await page.click('#send');
    await page.evaluate(() => until(() => document.querySelector('st-app').is_done));
    let result = await page.evaluate(() => {
        let app = document.querySelector('st-app'), done = app.is_done;
        app.done(false);
        return [done, app.is_done];
    });
    eq([start, ...result], [false, true, false], 'is_done отражает слот');
    await page.close();
});

await test('Form в модалке: рецепт с on_hide возвращает чистую форму', async () => {
    let page = await open(`<div id="box">${FORM}<button id="close" action="close">x</button></div>`, ['app', 'app/form', 'modal']);
    await page.evaluate(() => {
        App.create(Form);
        window.modal = new Modal({
            content: '#box',
            on_hide() {
                let form = this.content.querySelector('st-app');
                if (form.is_done) { form.done(false); form.reset(); }
            },
        });
        modal.show();
    });
    await page.evaluate(() => until(() => modal.state === 'shown'));
    await page.fill('#name', 'Иван');
    await page.click('#send');
    await page.evaluate(() => until(() => document.querySelector('st-app').is_done));
    await page.click('#close');
    await page.evaluate(() => until(() => modal.state === 'hidden'));
    let result = await page.evaluate(() => {
        let app = document.querySelector('st-app');
        return { done: app.is_done, form: app.form.hidden, value: app.field('name').value };
    });
    eq(result, { done: false, form: false, value: '' }, 'после закрытия — форма, поля пустые');
    await page.close();
});

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

await test('Shape: svg-фон, клип, пересчёт при ресайзе и destroy', async () => {
    let page = await open(`<div id="c" style="width:200px;height:100px" shape="200 100 | M10 0H200V90L190 100H0V10Z"></div>`, ['shape']);
    let result = await page.evaluate(async () => {
        let shape = new Shape({ scale: 0 });
        let el = document.querySelector('#c');
        let first = [el.firstElementChild.getAttribute('class'), el.style.clipPath];
        el.style.width = '300px';
        await until(() => el.style.clipPath.includes('300'));
        let resized = el.style.clipPath;
        shape.destroy();
        return { first, resized, after: [el.querySelector('.shape-layer'), el.style.clipPath, Shape.find(el) === undefined] };
    });
    eq(result.first, ['shape-layer', 'path("M 10 0 L 200 0 L 200 90 L 190 100 L 0 100 L 0 10 Z")'], 'svg первым ребёнком, клип по пути');
    eq(result.resized, 'path("M 10 0 L 300 0 L 300 90 L 290 100 L 0 100 L 0 10 Z")', 'шире — вырезы того же размера у своих краёв');
    eq(result.after, [null, '', true], 'destroy: svg и клип сняты');
    eq(page.errors, [], 'без ошибок');
    await page.close();
});

await test('Shape: фигура брейкпоинта и смена атрибута', async () => {
    let page = await open(`<div id="c" style="width:100px;height:100px" shape="100 100 | M0 0H100V100H0Z" shape-md="100 100 | M20 0H100V100H0V20Z"></div>`, ['shape']);
    let result = await page.evaluate(async () => {
        new Shape({ scale: 0, breakpoints: { md: 1, lp: 100000 } });
        let el = document.querySelector('#c');
        let md = el.style.clipPath;
        el.setAttribute('shape-md', '100 100 | M0 0H80L100 20V100H0Z');
        await until(() => el.style.clipPath != md);
        return [md, el.style.clipPath];
    });
    eq(result, ['path("M 20 0 L 100 0 L 100 100 L 0 100 L 0 20 Z")', 'path("M 0 0 L 80 0 L 100 20 L 100 100 L 0 100 Z")'],
        'действует shape-md, новый атрибут перечитан');
    await page.close();
});

// ---------------------------------------------------------------------------
// app/datepicker
// ---------------------------------------------------------------------------

const DATEPICKER = `<st-app app="form"><form>
    <label for="d">Дата</label>
    <st-app app="datepicker" id="single" :name="date" :input-id="d" :min="2026-01-01" :max="2026-12-31"></st-app>
    <st-app app="datepicker" id="range" :name="period" :range="true" :value="2026-10-12/2026-10-15"></st-app>
</form></st-app>
<st-app app="datepicker" id="inline" :inline="true"></st-app>`;

async function datepicker() {
    let page = await open(DATEPICKER, ['app', 'app/form', 'app/datepicker']);
    await page.evaluate(async () => {
        App.create(Form);
        App.create(Datepicker);
        window.changes = [];
        document.addEventListener('datepicker:change', e => changes.push([e.target.id, e.detail.value]));
        // Готов — когда отработал rendered: календари внутри формы монтируются после неё.
        await until(() => [...document.querySelectorAll('st-app[app=datepicker]')].every(el => el._mask));
        // Сетка без значения открывается на сегодняшнем месяце: листаем к октябрю 2026, чтобы тест не зависел от даты.
        for (let el of document.querySelectorAll('#single, #inline')) el.go((2026 - el.year) * 12 + 10 - el.month);
    });
    return page;
}

const form_data = page => page.evaluate(() => Object.fromEntries(new FormData(document.querySelector('form'))));

await test('datepicker: начальное значение, ISO в форме, сетка', async () => {
    let page = await datepicker();
    eq(await form_data(page), { date: '', period_from: '2026-10-12', period_to: '2026-10-15' }, 'скрытые поля с ISO, видимые без name');
    eq(await page.evaluate(() => [...document.querySelectorAll('#range .datepicker__input')].map(i => i.value)),
        ['12.10.2026', '15.10.2026'], 'видимые поля в ДД.ММ.ГГГГ');
    eq(await page.evaluate(() => [
        document.querySelector('#range .datepicker__caption').textContent,
        document.querySelectorAll('#range .datepicker__day--in-range').length,
        document.querySelector('label[for=d]').control?.matches('[datepicker-from]'),
    ]), ['Октябрь 2026', 2, true], 'месяц значения, диапазон в сетке, label for');
    eq(page.errors, [], 'без ошибок');
    await page.close();
});

await test('datepicker: набор с клавиатуры и проверка', async () => {
    let page = await datepicker();
    let check = () => page.evaluate(() => [document.querySelector('#d').validationMessage, document.querySelector('input[name=date]').value]);
    await page.type('#d', '31022026');
    eq(await check(), ['Такой даты нет', ''], '31.02 — ошибка, значения нет');
    await page.fill('#d', '');
    await page.type('#d', '18102025');
    eq(await check(), ['Дата не раньше 01.01.2026', ''], 'раньше min — ошибка');
    await page.fill('#d', '');
    await page.type('#d', '18102026');
    eq(await check(), ['', '2026-10-18'], 'верная дата — ISO в скрытом поле');
    eq(await page.evaluate(() => document.querySelector('#single .datepicker__day--selected')?.textContent), '18', 'и выбрана в сетке');
    eq(await page.evaluate(() => changes.filter(c => c[0] == 'single').at(-1)), ['single', '2026-10-18'], 'datepicker:change');
    await page.close();
});

await test('datepicker: выбор в сетке, диапазон, закрытие', async () => {
    let page = await datepicker();
    await page.click('#single .datepicker__toggle');
    eq(await page.evaluate(() => document.querySelector('#single .datepicker__popup').hidden), false, 'открыт по кнопке');
    await page.click('#single .datepicker__day[aria-label="5 октября 2026"]');
    eq(await page.evaluate(() => [document.querySelector('#d').value, document.querySelector('#single .datepicker__popup').hidden]),
        ['05.10.2026', true], 'одиночная дата: значение и закрытие');

    await page.click('#range .datepicker__toggle');
    await page.click('#range .datepicker__day[aria-label="20 октября 2026"]');
    eq(await page.evaluate(() => document.querySelector('#range .datepicker__popup').hidden), false, 'диапазон: после начала открыт');
    await page.click('#range .datepicker__day[aria-label="8 октября 2026"]');
    eq(await form_data(page), { date: '2026-10-05', period_from: '2026-10-08', period_to: '2026-10-20' }, 'конец раньше начала — меняются местами');

    await page.click('#range .datepicker__toggle');
    await page.keyboard.press('Escape');
    eq(await page.evaluate(() => [document.querySelector('#range .datepicker__popup').hidden, document.activeElement.className]),
        [true, 'datepicker__toggle'], 'Escape закрывает, фокус на кнопке');
    await page.click('#range .datepicker__toggle');
    await page.click('label[for=d]', { position: { x: 1, y: 1 } });
    eq(await page.evaluate(() => document.querySelector('#range .datepicker__popup').hidden), true, 'клик мимо закрывает');
    await page.close();
});

await test('datepicker: inline, reset формы, value из кода', async () => {
    let page = await datepicker();
    await page.click('#inline .datepicker__day[aria-label="10 октября 2026"]');
    eq(await page.evaluate(() => [document.querySelector('#inline').value, document.activeElement.getAttribute('aria-label')]),
        ['', '10 октября 2026'], 'inline: выбор ещё не значение, фокус на дне');
    await page.click('#inline .datepicker__apply');
    eq(await page.evaluate(() => document.querySelector('#inline').value), '2026-10-10', '"Выбрать" — значение');

    await page.click('#range .datepicker__toggle');
    await page.click('#range .datepicker__day[aria-label="20 октября 2026"]');
    await page.click('#range .datepicker__day[aria-label="22 октября 2026"]');
    await page.evaluate(() => document.querySelector('form').reset());
    await page.waitForFunction(() => document.querySelector('#range [datepicker-from]').value == '12.10.2026');
    eq(await form_data(page), { date: '', period_from: '2026-10-12', period_to: '2026-10-15' }, 'reset — начальное значение');

    await page.evaluate(() => { document.querySelector('#single').value = '2026-03-08'; });
    await page.waitForFunction(() => document.querySelector('#d').value == '08.03.2026');
    eq(await page.evaluate(() => document.querySelector('#single .datepicker__caption').textContent), 'Март 2026', 'value из кода перерисовывает');
    await page.close();
});

await browser.close();

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
