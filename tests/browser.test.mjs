// Браузерные автотесты App, Modal, Cookie и Route: node tests/browser.test.mjs
// Нужен Playwright с Chromium. Удобнее всего — в контейнере, см. tests/README.md.
// Модули грузятся из dist/ (IIFE-сборки), поэтому перед прогоном нужен npm run build.
// Страницы отдаются через page.route с фиктивного origin: History API и cookie работают.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const { chromium } = require('playwright');

const ORIGIN = 'http://st.test';

let failed = 0, passed = 0;

function eq(actual, expected, label) {
    let a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { passed++; return; }
    failed++;
    console.error(`FAIL: ${label}\n  ожидалось: ${e}\n  получено:  ${a}`);
}

const browser = await chromium.launch();
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

async function test(name, fn) {
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

await browser.close();

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
