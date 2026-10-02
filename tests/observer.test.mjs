// Автотесты геометрии Observer: node tests/observer.test.mjs
// Ненулевой exit-код при провале. DOM не нужен — движок src/observer/_engine.js
// считает по прямоугольникам { top, left, width, height }.

import { parse_edge, parse_line, parse_zone, measure, state_of, progress_of, intersects, steps } from '../src/observer/_engine.js';

let failed = 0, passed = 0;

function eq(actual, expected, label) {
    let a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { passed++; return; }
    failed++;
    console.error(`FAIL: ${label}\n  ожидалось: ${e}\n  получено:  ${a}`);
}

// ---------------------------------------------------------------------------
// Разбор краёв и линий
// ---------------------------------------------------------------------------

eq(parse_edge('top'), { frac: 0, px: 0 }, 'top');
eq(parse_edge('center'), { frac: 0.5, px: 0 }, 'center');
eq(parse_edge('BOTTOM'), { frac: 1, px: 0 }, 'регистр не важен');
eq(parse_edge('right'), { frac: 1, px: 0 }, 'right для оси x');
eq(parse_edge('80%'), { frac: 0.8, px: 0 }, 'проценты');
eq(parse_edge('120px'), { frac: 0, px: 120 }, 'пиксели');
eq(parse_edge('-20'), { frac: 0, px: -20 }, 'число без единиц — пиксели');
eq(parse_edge(40), { frac: 0, px: 40 }, 'number');
eq(parse_edge('top+100px'), { frac: 0, px: 100 }, 'сдвиг в пикселях');
eq(parse_edge('bottom-10%'), { frac: 0.9, px: 0 }, 'сдвиг в процентах');
eq(parse_edge('50%+20px'), { frac: 0.5, px: 20 }, 'процент + пиксели');

{   // мусор не роняет разбор
    let warn = console.warn; console.warn = () => {};
    eq(parse_edge('middle'), { frac: 0, px: 0 }, 'неизвестное слово → 0');
    eq(parse_edge('10em'), { frac: 0, px: 0 }, 'неизвестная единица → 0');
    console.warn = warn;
}

eq(parse_line('top 80%', 'bottom'), [{ frac: 0, px: 0 }, { frac: 0.8, px: 0 }], 'линия из двух токенов');
eq(parse_line('center', 'bottom'), [{ frac: 0.5, px: 0 }, { frac: 1, px: 0 }], 'одна сторона → root по умолчанию');
eq(parse_line('  top   center ', 'bottom'), [{ frac: 0, px: 0 }, { frac: 0.5, px: 0 }], 'лишние пробелы');

// ---------------------------------------------------------------------------
// Измерение: viewport 1000px, элемент 200px, зона по умолчанию 'top bottom' → 'bottom top'
// ---------------------------------------------------------------------------

const root = { top: 0, left: 0, width: 800, height: 1000 };
const zone = parse_zone('top bottom', 'bottom top');
const at = (top, z = zone) => {
    let { a, b } = measure({ top, left: 0, width: 800, height: 200 }, root, z);
    return { state: state_of(a, b), progress: progress_of(a, b) };
};

eq(at(1500), { state: 'before', progress: 0 }, 'ниже экрана — before');
eq(at(1000), { state: 'active', progress: 0 }, 'верх на линии низа экрана — active, 0');
eq(at(400), { state: 'active', progress: 0.5 }, 'середина пути — 0.5');
eq(at(-200), { state: 'active', progress: 1 }, 'низ на линии верха экрана — active, 1');
eq(at(-201), { state: 'after', progress: 1 }, 'выше экрана — after');
eq(at(-5000), { state: 'after', progress: 1 }, 'далеко выше — прогресс зажат в 1');

// узкая зона: от 'top 80%' до 'top 20%'
const narrow = parse_zone('top 80%', 'top 20%');
eq(at(900, narrow).state, 'before', 'узкая зона: ещё не дошли');
eq(at(500, narrow), { state: 'active', progress: 0.5 }, 'узкая зона: середина');
eq(at(100, narrow).state, 'after', 'узкая зона: прошли');

// вырожденная зона: end раньше start → ступенька
const flat = parse_zone('top center', 'top center');
eq(at(501, flat), { state: 'before', progress: 0 }, 'нулевая зона: до линии');
eq(at(500, flat), { state: 'active', progress: 1 }, 'нулевая зона: на линии');

// ось x: горизонтальная лента
{
    let z = parse_zone('left right', 'right left');
    let m = measure({ top: 0, left: 300, width: 200, height: 100 }, root, z, 'x');
    eq({ state: state_of(m.a, m.b), progress: progress_of(m.a, m.b) }, { state: 'active', progress: 0.5 }, 'ось x');
}

// root-контейнер со смещением: линии считаются от его прямоугольника
{
    let box = { top: 100, left: 0, width: 800, height: 400 };
    let m = measure({ top: 500, left: 0, width: 800, height: 50 }, box, zone);
    eq(state_of(m.a, m.b), 'active', 'контейнер: верх элемента на его нижней границе');
}

// ---------------------------------------------------------------------------
// Пересечение
// ---------------------------------------------------------------------------

const r = (top, left, height = 10, width = 10) => ({ top, left, height, width });
eq(intersects(r(0, 0), r(5, 5)), true, 'перекрытие');
eq(intersects(r(0, 0), r(10, 0)), false, 'касание по краю — не пересечение');
eq(intersects(r(0, 0), r(0, 20)), false, 'разнесены по x');
eq(intersects(r(0, 0, 100, 100), r(40, 40)), true, 'вложенный');

// ---------------------------------------------------------------------------
// Переходы → хуки
// ---------------------------------------------------------------------------

const hooks = (prev, next) => steps(prev, next).map(s => `${s.hook}:${s.direction}:${s.state}`);

eq(hooks('before', 'before'), [], 'без смены — тишина');
eq(hooks('before', 'active'), ['on_enter:forward:active'], 'вход сверху вниз');
eq(hooks('active', 'after'), ['on_leave:forward:after'], 'выход вниз');
eq(hooks('after', 'active'), ['on_enter:backward:active'], 'вход обратно');
eq(hooks('active', 'before'), ['on_leave:backward:before'], 'выход обратно');
eq(hooks('before', 'after'), ['on_enter:forward:active', 'on_leave:forward:after'], 'перескок вперёд');
eq(hooks('after', 'before'), ['on_enter:backward:active', 'on_leave:backward:before'], 'перескок назад');

console.log(`Пройдено: ${passed}, провалено: ${failed}`);
if (failed) process.exit(1);
