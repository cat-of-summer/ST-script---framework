// Автотесты календарного ядра datepicker: node tests/datepicker.test.mjs
// Ненулевой exit-код при провале. DOM не нужен — ядро это src/app/datepicker/_calendar.js.

import {
    valid, iso, parse_iso, from_display, to_display, label, title, shift, days_in_month,
    in_bounds, problem, month_grid, choose, split, join,
} from '../src/app/datepicker/_calendar.js';

let failed = 0, passed = 0;

function eq(actual, expected, label) {
    let a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { passed++; return; }
    failed++;
    console.error(`FAIL: ${label}\n  ожидалось: ${e}\n  получено:  ${a}`);
}

// ---------------------------------------------------------------------------
// Даты: проверка, разбор, формат
// ---------------------------------------------------------------------------

eq(valid(2026, 2, 28), true, '28.02 существует');
eq(valid(2026, 2, 29), false, '29.02 невисокосного года — нет');
eq(valid(2024, 2, 29), true, '29.02 високосного года');
eq(valid(1900, 2, 29), false, '1900 не високосный');
eq(valid(2026, 4, 31), false, '31.04 — нет');
eq(valid(2026, 13, 1), false, '13-й месяц');
eq(days_in_month(2026, 12), 31, 'дней в декабре');

eq(iso(2026, 3, 5), '2026-03-05', 'ISO с ведущими нулями');
eq(parse_iso('2026-10-18'), { year: 2026, month: 10, day: 18 }, 'разбор ISO');
eq(parse_iso('2026-02-31'), null, 'несуществующая дата ISO');
eq(parse_iso('18.10.2026'), null, 'не ISO');

eq(from_display('18.10.2026'), '2026-10-18', 'ДД.ММ.ГГГГ → ISO');
eq(from_display('31.02.2026'), null, '31.02 — null: маска такую дату пропускает');
eq(from_display('ДД.ММ.ГГГГ'), null, 'скелет маски — null');
eq(from_display('1.1.2026'), null, 'без ведущих нулей — не формат маски');
eq(to_display('2026-01-05'), '05.01.2026', 'ISO → ДД.ММ.ГГГГ');
eq(to_display(''), '', 'пустое → пустое');

eq(label('2026-10-18'), '18 октября 2026', 'подпись дня');
eq(title(2026, 10), 'Октябрь 2026', 'заголовок месяца');

eq(shift(2026, 12, 1), { year: 2027, month: 1 }, 'декабрь → январь');
eq(shift(2026, 1, -1), { year: 2025, month: 12 }, 'январь → декабрь');
eq(shift(2026, 5, -17), { year: 2024, month: 12 }, 'сдвиг больше года');

eq(in_bounds('2026-10-18', '2026-10-01', '2026-10-31'), true, 'в границах');
eq(in_bounds('2026-09-30', '2026-10-01', null), false, 'раньше min');
eq(in_bounds('2026-11-01', '', '2026-10-31'), false, 'позже max');
eq(problem('2026-02-31'), 'invalid', 'причина: нет такой даты');
eq(problem('2026-09-30', '2026-10-01'), 'min', 'причина: раньше min');
eq(problem('2026-10-18', '2026-10-01', '2026-10-31'), null, 'причины нет');

// ---------------------------------------------------------------------------
// Сетка месяца
// ---------------------------------------------------------------------------

let grid = month_grid(2026, 10, { now: '2026-10-18' });
eq(grid.length, 42, '42 ячейки');
eq(grid[0].iso, '2026-09-28', 'октябрь 2026 начинается с понедельника 28.09');
eq(grid[3].iso, '2026-10-01', '1 октября — четверг');
eq([grid[0].other, grid[3].other], [true, false], 'other — дни соседнего месяца');
eq(grid.filter(c => c.today).map(c => c.iso), ['2026-10-18'], 'today');

let june = month_grid(2026, 6);
eq(june[0].iso, '2026-06-01', 'месяц с понедельника — без хвоста прошлого');

let bounded = month_grid(2026, 10, { min: '2026-10-05', max: '2026-10-20' });
eq(bounded.find(c => c.iso == '2026-10-04').disabled, true, 'до min — disabled');
eq(bounded.find(c => c.iso == '2026-10-05').disabled, false, 'min включительно');
eq(bounded.find(c => c.iso == '2026-10-21').disabled, true, 'после max — disabled');

let ranged = month_grid(2026, 10, { from: '2026-10-10', to: '2026-10-13' });
let flags = c => [c.selected, c.in_range, c.range_from, c.range_to];
eq(flags(ranged.find(c => c.iso == '2026-10-10')), [true, false, true, false], 'начало диапазона');
eq(flags(ranged.find(c => c.iso == '2026-10-11')), [false, true, false, false], 'внутри диапазона');
eq(flags(ranged.find(c => c.iso == '2026-10-13')), [true, false, false, true], 'конец диапазона');
eq(month_grid(2026, 10, { from: '2026-10-10' }).find(c => c.iso == '2026-10-10').range_from, false,
    'одна дата — не диапазон');

// ---------------------------------------------------------------------------
// Выбор и значение
// ---------------------------------------------------------------------------

eq(choose({ from: '2026-10-10' }, '2026-10-12'), { from: '2026-10-12', to: null }, 'одиночная — заменяется');
eq(choose({}, '2026-10-12', true), { from: '2026-10-12', to: null }, 'диапазон: первый клик — начало');
eq(choose({ from: '2026-10-12' }, '2026-10-15', true), { from: '2026-10-12', to: '2026-10-15' }, 'второй клик — конец');
eq(choose({ from: '2026-10-12' }, '2026-10-01', true), { from: '2026-10-01', to: '2026-10-12' }, 'раньше начала — меняются местами');
eq(choose({ from: '2026-10-12', to: '2026-10-15' }, '2026-10-20', true), { from: '2026-10-20', to: null }, 'третий клик — заново');

eq(split('2026-10-12'), { from: '2026-10-12', to: null }, 'значение одиночной даты');
eq(split('2026-10-12/2026-10-15'), { from: '2026-10-12', to: '2026-10-15' }, 'интервал ISO');
eq(split('2026-02-31'), { from: null, to: null }, 'несуществующая дата — null');
eq(join({ from: '2026-10-12', to: null }), '2026-10-12', 'одиночная');
eq(join({ from: '2026-10-12', to: '2026-10-15' }, true), '2026-10-12/2026-10-15', 'диапазон');
eq(join({ from: null, to: null }, true), '', 'пустой диапазон');

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
