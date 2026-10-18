// Календарное ядро datepicker: сетка месяца, выбор даты и диапазона, разбор и формат.
// Чистые функции без DOM — общее для st-app (app/datepicker) и для обёрток в других фреймворках.
//
// Дата везде — строка ISO 'YYYY-MM-DD': сравнивается как строка, не зависит от часового пояса.
// Месяц — число 1–12.

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const pad = (n, len = 2) => String(n).padStart(len, '0');

export const days_in_month = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// Настоящая дата: 31.02 и 29.02 невисокосного года — нет.
export const valid = (year, month, day) =>
    Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)
    && year >= 1 && year <= 9999 && month >= 1 && month <= 12
    && day >= 1 && day <= days_in_month(year, month);

export const iso = (year, month, day) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

export const parse_iso = (value) => {
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
    if (!m) return null;
    let [year, month, day] = m.slice(1).map(Number);
    return valid(year, month, day) ? { year, month, day } : null;
};

export const today = (now = new Date()) => iso(now.getFullYear(), now.getMonth() + 1, now.getDate());

// 'ДД.ММ.ГГГГ' ↔ ISO. Неполная или несуществующая дата — null.
export const from_display = (value) => {
    let m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value ?? '').trim());
    if (!m) return null;
    let [day, month, year] = m.slice(1).map(Number);
    return valid(year, month, day) ? iso(year, month, day) : null;
};

export const to_display = (value) => {
    let d = parse_iso(value);
    return d ? `${pad(d.day)}.${pad(d.month)}.${pad(d.year, 4)}` : '';
};

// '18 октября 2026' — подпись дня для скринридера.
export const label = (value) => {
    let d = parse_iso(value);
    return d ? `${d.day} ${MONTHS_GENITIVE[d.month - 1]} ${d.year}` : '';
};

export const title = (year, month) => `${MONTHS[month - 1]} ${year}`;

export const shift = (year, month, delta) => {
    let index = year * 12 + (month - 1) + delta;
    return { year: Math.floor(index / 12), month: index % 12 + 1 };
};

// Пустые границы не ограничивают.
export const in_bounds = (value, min, max) => !(min && value < min) && !(max && value > max);

// Причина, по которой дату нельзя выбрать: 'invalid' | 'min' | 'max' | null.
export const problem = (value, min, max) => {
    if (!parse_iso(value)) return 'invalid';
    if (min && value < min) return 'min';
    if (max && value > max) return 'max';
    return null;
};

// Сетка месяца: 6 недель с понедельника, 42 ячейки; дни соседних месяцев помечены other.
export const month_grid = (year, month, { from = null, to = null, min = null, max = null, now = today() } = {}) => {
    let first = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    let cells = [];

    for (let i = 0; i < 42; i++) {
        let date = new Date(Date.UTC(year, month - 1, 1 - first + i));
        let value = iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
        let range = !!(from && to);

        cells.push({
            iso: value,
            day: date.getUTCDate(),
            label: label(value),
            other: date.getUTCMonth() + 1 != month,
            today: value == now,
            disabled: !in_bounds(value, min, max),
            selected: value == from || value == to,
            in_range: range && value > from && value < to,
            range_from: range && value == from,
            range_to: range && value == to,
        });
    }

    return cells;
};

// Следующий выбор по клику. Одиночная дата — заменяется. Диапазон: первый клик — начало,
// второй — конец (раньше начала — меняются местами), третий начинает заново.
export const choose = ({ from = null, to = null }, value, range = false) => {
    if (!range || !from || to) return { from: value, to: null };
    return value < from ? { from: value, to: from } : { from, to: value };
};

// Значение value: одиночная дата — 'YYYY-MM-DD', диапазон — 'YYYY-MM-DD/YYYY-MM-DD'
// (интервал ISO 8601). Пустые и несуществующие даты — null.
export const split = (value) => {
    let [from, to] = String(value ?? '').split('/');
    return { from: parse_iso(from) ? from.trim() : null, to: parse_iso(to) ? to.trim() : null };
};

export const join = ({ from, to }, range = false) =>
    range ? (from || to ? `${from ?? ''}/${to ?? ''}` : '') : from ?? '';
