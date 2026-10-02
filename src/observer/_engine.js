// Чистая геометрия Observer: без DOM, на вход — прямоугольники { top, left, width, height }.
//
// Зона элемента — две линии, как в ScrollTrigger: start 'top bottom' — верх элемента встречает
// низ root, end 'bottom top' — низ элемента встречает верх root. По текущим rect считаются
// a = линия элемента − линия root для start и b — то же для end. Прокрутка уменьшает обе на одно
// и то же δ, поэтому a > 0 — зона впереди, b < 0 — позади, progress = −a / (b − a).

const KEYS = { top: 0, left: 0, center: 0.5, bottom: 1, right: 1 };
const ORDER = { before: 0, active: 1, after: 2 };

const amount = (num, unit) => unit == '%' ? { frac: num / 100, px: 0 } : { frac: 0, px: num };

// Край: 'top' | 'center' | 'bottom' | 'left' | 'right' | '80%' | '120px' | 120,
// со сдвигом: 'top+100px', 'bottom-10%'. Мусор — предупреждение и край 0
export function parse_edge(token) {
    if (typeof token == 'number') return { frac: 0, px: token };

    let m = /^(?:([a-z]+)|(-?\d*\.?\d+)(%|px)?)(?:([+-])(\d*\.?\d+)(%|px)?)?$/.exec(String(token).trim().toLowerCase());
    if (!m || m[1] && !(m[1] in KEYS)) {
        console.warn('Observer: некорректный край зоны', token);
        return { frac: 0, px: 0 };
    }

    let base = m[1] ? { frac: KEYS[m[1]], px: 0 } : amount(+m[2], m[3]);
    if (!m[4]) return base;

    let shift = amount(m[4] == '-' ? -m[5] : +m[5], m[6]);
    return { frac: base.frac + shift.frac, px: base.px + shift.px };
}

// Линия 'край_элемента край_root' → [edge, edge]; без второго токена root берёт root_default
export function parse_line(value, root_default) {
    let [el, root = root_default] = typeof value == 'number' ? ['top', value] : String(value).trim().split(/\s+/);
    return [parse_edge(el), parse_edge(root)];
}

export const parse_zone = (start, end) => ({ start: parse_line(start, 'bottom'), end: parse_line(end, 'top') });

const pos = (rect, edge, axis) => axis == 'x'
    ? rect.left + edge.frac * rect.width + edge.px
    : rect.top + edge.frac * rect.height + edge.px;

export const measure = (rect, root, zone, axis = 'y') => ({
    a: pos(rect, zone.start[0], axis) - pos(root, zone.start[1], axis),
    b: pos(rect, zone.end[0], axis) - pos(root, zone.end[1], axis),
});

export const state_of = (a, b) => a > 0 ? 'before' : b < 0 ? 'after' : 'active';

// Вырожденная зона (end не дальше start) — ступенька 0 → 1 на линии start
export function progress_of(a, b) {
    let length = b - a;
    if (length <= 0) return a > 0 ? 0 : 1;
    return Math.min(1, Math.max(0, -a / length));
}

export const intersects = (r1, r2) => !(r1.left + r1.width <= r2.left || r1.left >= r2.left + r2.width
    || r1.top + r1.height <= r2.top || r1.top >= r2.top + r2.height);

// Смена состояния → хуки в порядке вызова. Перескок зоны за кадр (before ↔ after) даёт
// вход и выход подряд, чтобы once и пары enter/leave не терялись на быстром скролле
export function steps(prev, next) {
    if (prev == next) return [];

    let direction = ORDER[next] > ORDER[prev] ? 'forward' : 'backward';
    let enter = { hook: 'on_enter', direction, state: 'active' };

    if (next == 'active') return [enter];
    if (prev == 'active') return [{ hook: 'on_leave', direction, state: next }];
    return [enter, { hook: 'on_leave', direction, state: next }];
}
