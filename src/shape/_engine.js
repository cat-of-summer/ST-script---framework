// Фигура по пути из Figma → путь под реальный размер элемента. Чистые функции без DOM.
//
// Значение атрибута — "ширина высота | d": размер фрейма в px макета и путь Figma как есть
// (абсолютные M L H V C S Q Z). Кривые — скругления углов в пару px — заменяются отрезком
// до конечной точки.

export const parse = (value) => {
    let [size, d] = String(value ?? '').split('|');
    let [w, h] = (size ?? '').trim().split(/\s+/).map(Number);
    if (!(w > 0 && h > 0) || !d) return null;

    let points = [], x = 0, y = 0;

    for (let [, cmd, args] of d.matchAll(/([MLHVZCSQ])([^MLHVZCSQ]*)/gi)) {
        let nums = (args.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
        switch (cmd.toUpperCase()) {
            case 'M':
            case 'L':
                for (let i = 0; i + 1 < nums.length; i += 2) points.push([x = nums[i], y = nums[i + 1]]);
                break;
            case 'H':
                for (let n of nums) points.push([x = n, y]);
                break;
            case 'V':
                for (let n of nums) points.push([x, y = n]);
                break;
            case 'C':
                for (let i = 0; i + 5 < nums.length; i += 6) points.push([x = nums[i + 4], y = nums[i + 5]]);
                break;
            case 'S':
            case 'Q':
                for (let i = 0; i + 3 < nums.length; i += 4) points.push([x = nums[i + 2], y = nums[i + 3]]);
                break;
        }
    }

    return points.length > 2 ? { w, h, points } : null;
};

// Каждая точка привязывается к ближнему краю: x левее середины фрейма считается от левого
// края, правее — от правого; так же по y. Вырезы сохраняют размер, прямые участки тянутся
// под реальный размер. k — px экрана на px макета (rem / scale): вырезы масштабируются
// вместе с вёрсткой на rem.
export const build = (shape, width, height, k = 1) => 'M' + shape.points.map(([x, y]) => {
    let px = x <= shape.w / 2 ? x * k : width - (shape.w - x) * k;
    let py = y <= shape.h / 2 ? y * k : height - (shape.h - y) * k;
    return `${+px.toFixed(2)} ${+py.toFixed(2)}`;
}).join('L') + 'Z';

// Фигура для ширины окна: самый широкий брейкпоинт, чей min не больше width и для которого
// задана своя фигура; иначе — base. variants: { base, md: shape, … }, breakpoints: { md: 768, … }.
export const pick = (variants, breakpoints, width) => {
    let best = variants.base, min = -1;
    for (let [bp, shape] of Object.entries(variants)) {
        let from = breakpoints[bp];
        if (bp == 'base' || !shape || from == null || from > width || from < min) continue;
        best = shape;
        min = from;
    }
    return best;
};
