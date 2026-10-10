// Группы маски поверх раскладки фиксированного шаблона: какие слоты к какой группе относятся
// и как группа ведёт себя при наборе в режиме edit: 'whole' (как поле <input type=date>).
// Чистые функции без DOM. Ячейки группы - массив символов, пустая ячейка - null

const OPTIONS = ['edit', 'pad', 'align', 'min', 'max'];

// Группы по порядку слотов: подряд идущие слоты с одним именем - одна группа. Слоты вне
// именованных групп собираются в неявные группы (имя null); у шаблона без групп это всё поле.
// Настройки группы - параметры верхнего уровня, переопределённые params.groups[имя]
export function spans(layout, params) {
    let list = [];

    layout.slots.forEach((slot, i) => {
        let name = slot.node.group ?? null, g = list.at(-1);
        if (!g || g.name !== name) {
            let opts = Object.fromEntries(OPTIONS.map(key => [key, params[key]]));
            if (name != null) Object.assign(opts, params.groups?.[name]);
            list.push(g = { name, first: i, fmts: [], digits: true, opts });
        }
        g.fmts.push(slot.fmt);
        g.last = i;
        g.digits &&= slot.node.test.test('0') && !slot.node.test.test('a');
    });

    for (let g of list) [g.start, g.end] = [g.fmts[0], g.fmts.at(-1) + 1];
    return list;
}

// Текст группы → ячейки: выравнивание по align, недостающие ячейки - pad или пусто
export function fit(g, text) {
    let n = g.fmts.length, chars = [...text].slice(-n);
    let rest = Array(n - chars.length).fill(g.opts.pad ?? null);
    return g.opts.align == 'right' ? [...rest, ...chars] : [...chars, ...rest];
}

// Набор символа в группу с буфером, начатым при входе в неё: '1' → 01, '2' → 12.
// Число выше max зажимается; переход дальше - когда буфер полон или следующая цифра
// гарантированно вывела бы за max (4 в дне: 40 > 31 - значит, 04)
export function type_ahead(g, buffer, char) {
    let { max } = g.opts, ranged = g.digits && max != null;
    buffer += char;
    if (ranged && +buffer > max) buffer = String(max);

    return {
        buffer,
        cells: fit(g, buffer),
        advance: buffer.length >= g.fmts.length || ranged && +buffer * 10 > max
    };
}

// При уходе из группы: заполненное число ниже min поднимается до min (00 в дне → 01)
export function settle(g, cells) {
    let { min } = g.opts, n = g.fmts.length;
    if (!g.digits || min == null || cells.includes(null) || +cells.join('') >= min) return cells;
    return fit(g, String(min).padStart(n, '0'));
}

// ↑/↓: шаг по кругу в пределах min…max (без них - 0…99…9). Пустая группа: ↑ → min, ↓ → max.
// У нецифровой группы шага нет - null
export function step(g, cells, dir) {
    if (!g.digits) return null;

    let n = g.fmts.length, text = cells.join('');
    let { min = null, max = null } = g.opts;
    min ??= 0;
    max ??= 10 ** n - 1;

    let v = text === '' ? (dir > 0 ? min : max) : +text + dir;
    if (v > max) v = min;
    else if (v < min) v = max;

    return fit(g, String(v).padStart(n, '0'));
}

// Укладывается ли значение каждой группы в её min/max. Незаполненная или нецифровая
// группа диапазон не нарушает - за полноту отвечает сама маска
export function in_range(names, values, params) {
    return (names.length ? names : [null]).every(name => {
        let o = { min: params.min, max: params.max, ...(name != null && params.groups?.[name]) };
        let v = values[name];
        if (o.min == null && o.max == null || !/^\d+$/.test(v ?? '')) return true;
        return (o.min == null || +v >= o.min) && (o.max == null || +v <= o.max);
    });
}
