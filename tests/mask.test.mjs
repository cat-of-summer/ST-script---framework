// Автотесты чистого движка масок: node tests/mask.test.mjs
// Ненулевой exit-код при провале. Зависимостей нет, DOM не нужен —
// движок это модуль src/mask/_engine.js с плоскими экспортами.

import { compile, build, run, run_all, render, caret_for, cap } from '../src/mask/_engine.js';

let failed = 0, passed = 0;

function eq(actual, expected, label) {
    let a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { passed++; return; }
    failed++;
    console.error(`FAIL: ${label}\n  ожидалось: ${e}\n  получено:  ${a}`);
}

const def = (mask, base) => build(mask, base)[0];

// ---------------------------------------------------------------------------
// Компилятор
// ---------------------------------------------------------------------------

eq(compile('00.00').map(n => n.type), ['slot', 'slot', 'literal', 'slot', 'slot'], 'токены и литералы');
eq(compile('\\0\\a\\*\\[\\{').map(n => n.char), ['0', 'a', '*', '[', '{'], 'экранирование литералов');
eq(compile('{{[0-9a-f]}}').map(n => n.type), ['slot'], '{{regex}} — один слот');
eq(compile('{0;1-4}')[0], { ...compile('{0;1-4}')[0], type: 'repeat', min: 1, max: 4 }, 'повторитель min-max');
eq(compile('{0;2-}')[0].max === Infinity, true, 'повторитель до бесконечности');
eq(compile('{0;-3}')[0].min, 0, 'повторитель 0..max');
eq(compile('{8=>+7}')[0], { type: 'transform', from: '8', to: '+7' }, 'трансформация');
eq(compile('{{{[0-9a-f]}};2}')[0].type, 'repeat', '{{{re}};N} — повторитель regex-класса');
eq(compile('{{{[0-9a-f]}};2}')[0].children.map(n => n.type), ['slot'], '…его unit — regex-слот');
eq(compile('[ 00:00]')[0].type, 'optional', 'опциональный блок');

{   // fail-soft: некорректный блок превращается в литералы, а не роняет компиляцию
    let warn = console.warn; console.warn = () => {};
    eq(compile('{oops}').every(n => n.type == 'literal'), true, 'fail-soft: мусорный блок → литералы');
    console.warn = warn;
}

// ---------------------------------------------------------------------------
// Матчер: базовое поведение
// ---------------------------------------------------------------------------

const date = def('00.00.0000');

eq(run(date, '12032026').formatted, '12.03.2026', 'дата: разделители сами');
eq(run(date, '12.03.2026').formatted, '12.03.2026', 'дата: с разделителями во входе');
eq(run(date, '12').formatted + run(date, '12').tail, '12.', 'авто-разделитель после блока');
eq(run(date, '12032026').complete, true, 'дата заполнена');
eq(run(date, '1203').complete, false, 'дата не заполнена');
eq(run(date, '12x03..2026').formatted, '12.03.2026', 'мусор выбрасывается');
eq(run(date, '12032026').raw, '12032026', 'raw — только пользовательские символы');

// идемпотентность: повторный прогон канонического потока ничего не меняет
for (let value of ['12', '12.03', '12032026', '1']) {
    let first = run(date, value);
    eq(run(date, first.stream).stream, first.stream, `идемпотентность stream("${value}")`);
    eq(run(date, first.stream).formatted, first.formatted, `идемпотентность formatted("${value}")`);
}

// ---------------------------------------------------------------------------
// Трансформация {8=>+7}
// ---------------------------------------------------------------------------

const phone8 = def('{8=>+7} (000) 000-00-00');

eq(run(phone8, '89123456789').formatted, '+7 (912) 345-67-89', 'трансформация: набран 8');
eq(run(phone8, '+79123456789').formatted, '+7 (912) 345-67-89', 'трансформация: вставлен +7');
eq(run(phone8, '89123456789').complete, true, 'телефон заполнен');
{
    let first = run(phone8, '89123456789');
    eq(run(phone8, first.stream).formatted, first.formatted, 'идемпотентность трансформации');
    eq(first.units[0].stream_end - first.units[0].stream_start, 2, 'юнит трансформации атомарен (+7)');
}

// умная вставка: мусор вокруг номера отфильтровывается
eq(run(phone8, 'тел: 8 (912) 345-67-89').formatted, '+7 (912) 345-67-89', 'умная вставка с мусором');

// ---------------------------------------------------------------------------
// Повторители
// ---------------------------------------------------------------------------

const ip = def('{0;1-3}.{0;1-3}.{0;1-3}.{0;1-3}');

eq(run(ip, '192168001').formatted, '192.168.001', 'IPv4: жадное заполнение октетов');
eq(run(ip, '10.0.0.1').formatted, '10.0.0.1', 'IPv4: точки закрывают октеты досрочно');
eq(run(ip, '10.0.0.1').complete, true, 'IPv4 заполнен');
eq(run(ip, '10.0').complete, false, 'IPv4 не заполнен');

const money = def('{0;1-} ₽');
eq(run(money, '1234').formatted + run(money, '1234').tail, '1234 ₽', 'бесконечный повторитель + суффикс');
eq(run(money, '1234').stop_fmt, 4, 'точка вставки — перед суффиксом');
eq(run(money, '1234').complete, true, 'бесконечный повторитель: минимум набран');

// ---------------------------------------------------------------------------
// Опциональные блоки
// ---------------------------------------------------------------------------

const datetime = def('00.00.0000[ 00:00]');

eq(run(datetime, '12032026').complete, true, 'дата без времени — заполнено');
eq(run(datetime, '12032026').stop_fmt, 10, 'точка вставки на границе блока');
eq(run(datetime, '120320261430').formatted, '12.03.2026 14:30', 'вход в опциональный блок по цифре');
eq(run(datetime, '1203202614').complete, false, 'начатый блок обязан дозаполниться');
eq(run(datetime, '12.03.2026 14:30').formatted, '12.03.2026 14:30', 'опциональный блок из отформатированного входа');

const ext = def('+7 (000) 000-00-00[ доб. {0;1-5}]');
eq(run(ext, '912345678912').formatted, '+7 (912) 345-67-89 доб. 12', 'блок «доб.» появляется по вводу');
eq(run(ext, '9123456789').formatted, '+7 (912) 345-67-89', 'без лишних цифр блока нет');

const gps = def('[-]{0;1-2}.{0;1-6}');
eq(run(gps, '-55.75').formatted, '-55.75', 'литеральный опциональный блок: знак минус');
eq(run(gps, '55.75').formatted, '55.75', 'знак минус можно опустить');
eq(run(gps, '-55.75').stream, '-55.75', 'знак попадает в канонический поток');

// ---------------------------------------------------------------------------
// Динамический best-match (массив масок)
// ---------------------------------------------------------------------------

const inn = build(['0000000000', '000000000000']);

eq(run_all(inn, '1234567890').mask_id, 0, 'ИНН: 10 цифр — короткая маска');
eq(run_all(inn, '12345678901').mask_id, 1, 'ИНН: 11-я цифра переключает на длинную');
eq(run_all(inn, '123456789012').mask_id, 1, 'ИНН: 12 цифр');

const phones = build(['{8=>+7} (000) 000-00-00', '+7 (000) 000-00-00']);
eq(run_all(phones, '89123456789').result.formatted, '+7 (912) 345-67-89', 'массив: ввод с 8');
eq(run_all(phones, '9123456789').result.formatted, '+7 (912) 345-67-89', 'массив: ввод без кода');

// ---------------------------------------------------------------------------
// before_slot: автодополнение и автоисправление
// ---------------------------------------------------------------------------

const date_fix = def({
    pattern: '00.00.0000',
    before_slot: (input, { char, slot }) => {
        if (slot == 0 && char > '3') return '0' + char;     // день: 4 → 04
        if (slot == 2 && char > '1') return '0' + char;     // месяц: 3 → 03
    }
});

eq(run(date_fix, '4').formatted, '04', 'автодополнение дня: 4 → 04');
eq(run(date_fix, '431').formatted, '04.03.1', 'автодополнение каскадом (день и месяц)');
{
    let first = run(date_fix, '4');
    eq(run(date_fix, first.stream).formatted, '04', 'идемпотентность после before_slot');
}

const reject = def({ pattern: '00', before_slot: (input, { char, slot }) => slot == 0 && char == '9' ? false : undefined });
eq(run(reject, '91').formatted, '1', 'before_slot может отклонить символ');

// cells: заполненные ячейки по порядковым номерам слотов — не сбиваются дырками,
// в отличие от raw (в нём пропущенных позиций нет)
const date_full = def({
    pattern: '00.00.0000',
    before_slot: (input, { char, slot, cells }) => {
        if (slot == 0 && char > '3') return '0' + char;
        if (slot == 1 && (cells[0] == '3' && char > '1' || cells[0] == '0' && char == '0')) return false;
        if (slot == 2 && char > '1') return '0' + char;
        if (slot == 3 && (cells[2] == '1' && char > '2' || cells[2] == '0' && char == '0')) return false;
    }
});

eq(run(date_full, '3912').formatted, '31.02', 'день 39 невозможен');
eq(run(date_full, '0000').formatted, '0', 'день 00 невозможен');
eq(run(date_full, '0119').formatted, '01.1', 'месяц 19 невозможен');
eq(run(date_full, '0112').formatted, '01.12', 'месяц 12 проходит');
eq(run(date_full, '4').formatted, '04', 'автодополнение однозначной цифры');
eq(run(date_full, '1').formatted, '1', 'неоднозначная цифра ждёт второй разряд');
eq(run(date_full, '311220').formatted, '31.12.20', 'полная дата');

eq(run(date, '__.03').cells, [undefined, undefined, '0', '3'], 'cells: дырки не сдвигают индексы');

// ---------------------------------------------------------------------------
// before_char: нормализация символов
// ---------------------------------------------------------------------------

const mac = def({ pattern: '{{{[0-9A-F]}};2}:{{{[0-9A-F]}};2}', before_char: (input, { char }) => char.toUpperCase() });
eq(run(mac, 'ab1f').formatted, 'AB:1F', 'before_char: верхний регистр');

const lat = def({
    pattern: 'a000',
    before_char: (input, { char }) => ({ a: 'А', b: 'В', e: 'Е' })[char.toLowerCase()] ?? char
});
eq(run(lat, 'b123').formatted, 'В123', 'before_char: латиница → кириллица');

const drop_spaces = def({ pattern: '0000', before_char: (input, { char }) => char == ' ' ? '' : char });
eq(run(drop_spaces, '1 2 3 4').formatted, '1234', 'before_char: пустая строка выбрасывает символ');

// ---------------------------------------------------------------------------
// Функциональная маска: видит набираемый поток (разряды по три)
// ---------------------------------------------------------------------------

const money_group = build(({ stream }) => {
    let n = Math.min((stream.match(/\d/g) ?? []).length, 12) || 1;
    return '0'.repeat((n - 1) % 3 + 1) + ' 000'.repeat((n - 1) / 3 | 0) + ' ₽';
});

for (let [input, expected] of [['1', '1'], ['1234', '1 234'], ['1234567', '1 234 567'], ['123456789', '123 456 789']])
    eq(run_all(money_group, input).result.formatted, expected, `разряды: ${input}`);

eq(run_all(money_group, '1234').result.stop_fmt, 5, 'разряды: каретка перед суффиксом');
eq(render(run_all(money_group, '1234').result, true), '1 234 ₽', 'разряды: суффикс в выводе');

// ---------------------------------------------------------------------------
// Фильтр-режим (email, URL и т.п.)
// ---------------------------------------------------------------------------

const email = def({ filter: /[a-z0-9@._%+-]/i, valid: /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/ });

eq(run(email, 'user@mail.ru').formatted, 'user@mail.ru', 'фильтр: валидные символы проходят');
eq(run(email, 'user @mail.ru!!').formatted, 'user@mail.ru', 'фильтр: мусор отфильтрован');
eq(run(email, 'user@mail.ru').complete, true, 'фильтр: valid → complete');
eq(run(email, 'user@').complete, false, 'фильтр: не валидно — не complete');

// ---------------------------------------------------------------------------
// valid: общая валидация значения (не только для фильтр-режима)
// ---------------------------------------------------------------------------

const octet = def({ pattern: '{0;1-3}', valid: /^(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])$/ });
eq(run(octet, '255').complete, true, 'valid: 255 — валидный октет');
eq(run(octet, '299').complete, false, 'valid: 299 — маска полна, но значение невалидно');

// ---------------------------------------------------------------------------
// Числовой форматтер { numeral }: заполнение справа, группировка, дробная часть
// ---------------------------------------------------------------------------

const cash = def({ numeral: { fraction: 2, group: ' ', decimal: ',', suffix: ' ₽' } });

eq(run(cash, '1').formatted,       '0,01 ₽',      'numeral: одна цифра → младший разряд');
eq(run(cash, '123').formatted,     '1,23 ₽',      'numeral: заполнение дробной справа');
eq(run(cash, '1234567').formatted, '12 345,67 ₽', 'numeral: группировка целой части');
eq(run(cash, '1234567').raw,       '1234567',     'numeral: raw — только значащие цифры');
eq(run(cash, '1234567').stop_fmt,  9,             'numeral: каретка перед суффиксом');
eq(run(cash, '1234567').units.length, 7,          'numeral: по юниту на значащую цифру');
eq(run(cash, '1').units.length,    1,             'numeral: паддинг-нули — не юниты');
eq(run(cash, '').formatted,        '',            'numeral: пусто → пусто (formatted)');
eq(run(cash, '').complete,         false,         'numeral: пусто не complete');
eq(run(cash, '1').complete,        true,          'numeral: есть значение → complete');

// ноль — это число, а не пустота
eq(run(cash, '0').formatted,   '0,00 ₽', 'numeral: ноль → 0,00');
eq(run(cash, '0').raw,         '0',      'numeral: raw ноля');
eq(run(cash, '0').complete,    true,     'numeral: ноль complete');
eq(run(cash, '00').formatted,  '0,00 ₽', 'numeral: нули каноникализируются в 0');
eq(run(cash, '05').formatted,  '0,05 ₽', 'numeral: ведущий ноль не мешает');

// скелет плейсхолдера (для placeholder:'always') строится из filler
eq(run(cash, '').ph, '_,__ ₽', 'numeral: скелет по умолчанию (filler _)');
const cash_ph = def({ numeral: { fraction: 2, decimal: ',', suffix: ' ₽' }, filler: '000' });
eq(render(run(cash_ph, ''), 'always'), '0,00 ₽', 'numeral: always-скелет из filler "000"');

// идемпотентность и по потоку, и по отформатированному виду
for (let value of ['0', '1', '123', '1234567']) {
    let r = run(cash, value);
    eq(run(cash, r.stream).formatted, r.formatted, `numeral: идемпотентность stream("${value}")`);
    eq(run(cash, r.formatted).formatted, r.formatted, `numeral: идемпотентность formatted("${value}")`);
}

// set-стиль: вход с десятичной точкой трактуется как реальное число (с округлением)
const money2 = def({ numeral: { fraction: 2, group: ' ', decimal: ',' } });
eq(run(money2, '1234.5').formatted, '1 234,50', 'numeral: десятичный вход как число (набор нулей)');
eq(run(money2, '1,239').formatted,  '1,24',     'numeral: округление лишних знаков дробной');

// знак
const signed = def({ numeral: { fraction: 2, decimal: ',', sign: true } });
eq(run(signed, '-1234').formatted, '-12,34',  'numeral: ведущий минус');
eq(run(signed, '-1234').raw,       '-1234',   'numeral: знак в raw');

// диапазон min/max → complete
const ranged = def({ numeral: { fraction: 0, min: 1, max: 100 } });
eq(run(ranged, '50').complete,  true,  'numeral: 50 в диапазоне');
eq(run(ranged, '150').complete, false, 'numeral: 150 вне диапазона');

// numeral как форма build (не спутан со словарём именованных масок)
eq(build({ numeral: { fraction: 2 } }).length, 1, 'numeral: одна маска, не словарь');
eq(run_all(build({ numeral: { fraction: 2, suffix: ' ₽' } }), '999').result.formatted, '9,99 ₽', 'numeral: через run_all');

// ---------------------------------------------------------------------------
// cap: ограничение по длине raw (maxlength / max_raw)
// ---------------------------------------------------------------------------

{
    let r = run(email, 'user@mail.ru');
    eq(cap(r, 5), 5, 'cap: позиция после 5-й raw-цифры');
    eq(run(email, r.stream.slice(0, cap(r, 5))).raw, 'user@', 'cap: усечённый raw');
    eq(cap(r, 100), r.stream.length, 'cap: лимит больше длины — без обрезки');
}

// ---------------------------------------------------------------------------
// Словарь именованных масок: ключ в mask_id
// ---------------------------------------------------------------------------

const countries = build({
    ru: ['{8=>+7} (000) 000-00-00', '+7 (000) 000-00-00'],
    by: '+375 (00) 000-00-00'
});

eq(countries.map(d => d.key), ['ru', 'ru', 'by'], 'словарь: ключи у def-ов');
eq(run_all(countries, '89123456789').mask_id, 'ru', 'словарь: 8… → ru');
eq(run_all(countries, '375291234567').mask_id, 'by', 'словарь: 375… → by');
eq(run_all(countries, '375291234567').result.formatted, '+375 (29) 123-45-67', 'словарь: формат by');

// ---------------------------------------------------------------------------
// Фиксированность и раскладка частей
// ---------------------------------------------------------------------------

eq(build('00.00.0000')[0].fixed, true, 'fixed: дата');
eq(build('{{{[0-9A-F]}};2}:{{{[0-9A-F]}};2}')[0].fixed, true, 'fixed: повторитель min==max');
eq(build('000[0]')[0].fixed, false, 'fixed: опциональный блок — нет');
eq(build('{8=>+7} (000)')[0].fixed, false, 'fixed: трансформация — нет');
eq(build('{0;1-}')[0].fixed, false, 'fixed: открытый повторитель — нет');
eq(build(/[a-z]/)[0].fixed, false, 'fixed: фильтр — нет');

eq(run(date, '').ph_slots.map(s => s.fmt), [0, 1, 3, 4, 6, 7, 8, 9], 'раскладка: позиции слотов даты');

// ---------------------------------------------------------------------------
// Дырки: пропущенные позиции (обособленные части в режиме 'always')
// ---------------------------------------------------------------------------

{
    let r = run(date, '__.03');                   // день пропущен, месяц заполнен
    eq(r.formatted, '__.03', 'дырки: пропуск дня');
    eq(r.raw, '03', 'дырки: raw без заполнителей');
    eq(r.complete, false, 'дырки: не complete');
    eq(render(r, 'always'), '__.03.____', 'дырки: рендер скелета');
    eq(run(date, r.stream).stream, r.stream, 'дырки: идемпотентность');
}

// ---------------------------------------------------------------------------
// Рендер и плейсхолдер
// ---------------------------------------------------------------------------

eq(render(run(date, '12'), true), '12.', 'true: только введённое + авто-разделитель');
eq(render(run(date, '12'), false), '12', 'false: без хвостового разделителя');
eq(render(run(date, '12'), 'always'), '12.__.____', 'always: полный скелет');
eq(render(run(def('+7 (000) 000-00-00'), ''), true), '+7 (', 'true: ведущие литералы пустого значения');

const positional = def({ pattern: '00.00.0000', filler: 'ДДММГГГГ' });
eq(render(run(positional, ''), 'always'), 'ДД.ММ.ГГГГ', 'позиционный filler');
eq(render(run(positional, '12'), 'always'), '12.ММ.ГГГГ', 'позиционный filler после ввода');

// ---------------------------------------------------------------------------
// Каретка
// ---------------------------------------------------------------------------

{
    let r = run(date, '12');
    eq(r.stop_fmt, 3, 'каретка после «12» — за точкой');
    eq(caret_for(r, 2), 3, 'caret_for в конце потока → точка вставки');
    eq(caret_for(r, 1), 1, 'caret_for в середине потока');
    eq(caret_for(r, 0), 0, 'caret_for в начале');
}
{
    let r = run(date, '12.3');            // stream с разделителем: юниты 0,1,3
    eq(caret_for(r, 3), 3, 'caret_for перескакивает разделитель в потоке');
}
{
    let r = run(phone8, '89');
    eq(caret_for(r, 0), 0, 'каретка перед трансформацией');
    eq(caret_for(r, 1), 0, 'внутри юнита «+7» — прижата к началу (атомарность)');
    eq(r.stop_fmt, 5, 'точка вставки «+7 (9|»');
}

// ---------------------------------------------------------------------------

console.log(`\nПройдено: ${passed}, провалено: ${failed}`);
process.exit(failed ? 1 : 0);
