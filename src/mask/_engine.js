const SLOTS = { '0': /^[0-9]$/, 'a': /^\p{L}$/u, '*': /^[^\n]$/ };

const unesc = str => str.replace(/\\(.)/g, '$1');
const no_g = re => re.global ? new RegExp(re.source, re.flags.replace('g', '')) : re;

function scan(str, from) {
    let open = str[from], close = open == '{' ? '}' : ']', depth = 0;
    for (let i = from; i < str.length; i++) {
        let c = str[i];
        if (c == '\\') { i++; continue; }
        if (open == '[' && c == '{') {
            if ((i = scan(str, i)) < 0) return -1;
        } else if (c == open) depth++;
        else if (c == close && --depth == 0) return i;
    }
    return -1;
}

function last_top(body, needle) {
    let depth = 0, found = -1;
    for (let i = 0; i < body.length; i++) {
        if (body[i] == '\\') { i++; continue; }
        if (body[i] == '{' || body[i] == '[') depth++;
        else if (body[i] == '}' || body[i] == ']') depth--;
        else if (depth == 0 && body.startsWith(needle, i)) found = i;
    }
    return found;
}

function classify(body) {
    let fail = () => {
        console.warn('Некорректный блок маски', `{${body}}`);
        return [...`{${body}}`].map(char => ({ type: 'literal', char }));
    };

    let semi = last_top(body, ';');
    if (semi > 0) {
        let range = body.slice(semi + 1);
        if (/^(\d+|\d*-\d*)$/.test(range) && range != '-') {
            let [min, max] = /^\d+$/.test(range)
                ? [+range, +range]
                : range.split('-').map((n, i) => n === '' ? (i ? Infinity : 0) : +n);
            return max < min ? fail()
                : [{ type: 'repeat', children: compile(body.slice(0, semi)), min, max }];
        }
    }

    if (body[0] == '{' && body.at(-1) == '}')
        try {
            return [{ type: 'slot', test: new RegExp(`^(?:${body.slice(1, -1)})$`, 'u') }];
        } catch { return fail(); }

    let arrow = last_top(body, '=>');
    if (arrow > 0) {
        let from = unesc(body.slice(0, arrow)), to = unesc(body.slice(arrow + 2));
        return from.length != 1 || !to ? fail() : [{ type: 'transform', from, to }];
    }

    return fail();
}

export function compile(pattern) {
    let nodes = [];

    for (let i = 0; i < pattern.length; i++) {
        let char = pattern[i], end;

        if (char == '\\')
            nodes.push({ type: 'literal', char: pattern[++i] ?? '\\' });
        else if (char == '[' && (end = scan(pattern, i)) >= 0) {
            nodes.push({ type: 'optional', children: compile(pattern.slice(i + 1, end)) });
            i = end;
        } else if (char == '{' && (end = scan(pattern, i)) >= 0) {
            nodes.push(...classify(pattern.slice(i + 1, end)));
            i = end;
        } else
            nodes.push(SLOTS[char] ? { type: 'slot', test: SLOTS[char] } : { type: 'literal', char });
    }

    return nodes;
}

function is_fixed(nodes) {
    return nodes.every(node =>
        node.type == 'literal' || node.type == 'slot'
        || node.type == 'repeat' && node.min == node.max && is_fixed(node.children));
}

export function build(mask, base = {}) {
    if (mask && typeof mask == 'object' && !Array.isArray(mask) && !(mask instanceof RegExp)
        && mask.pattern == null && mask.filter == null && mask.numeral == null)
        return Object.entries(mask).flatMap(([key, m]) =>
            build(m, base).map(def => ({ ...def, key })));

    let defs = (Array.isArray(mask) ? mask : [mask]).map(m => {
        if (typeof m == 'function') return { fn: m, base };
        if (m instanceof RegExp) m = { filter: m };
        if (typeof m == 'string') m = { pattern: m };

        if (m.numeral) {
            let o = { fraction: 0, group: ' ', decimal: ',', prefix: '', suffix: '', sign: false, ...m.numeral };
            return { numeral: o, fixed: false, valid: null, message: m.message ?? o.message,
                filler: m.filler ?? base.filler, before_char: null, before_slot: null };
        }

        let nodes = m.pattern != null
            ? compile(m.pattern)
            : [{ type: 'repeat', min: 0, max: m.max_length ?? Infinity, greedy: true,
                 children: [{ type: 'slot', test: no_g(m.filter) }] }];

        return {
            nodes,
            fixed: m.pattern != null && is_fixed(nodes),
            valid: m.valid ? no_g(m.valid) : (m.filter ? /./ : null),
            message: m.message,
            filler: m.filler ?? base.filler,
            before_char: m.before_char ?? base.before_char,
            before_slot: m.before_slot ?? base.before_slot
        };
    });

    defs.forEach((def, i) => def.key ??= i);
    return defs;
}

export function filler(def, ordinal) {
    let f = def.filler ?? '_';
    return f[ordinal] ?? f.at(-1) ?? '_';
}

export function prepare(def, input_string, ctx) {
    let chars = [...String(input_string ?? '')];
    if (!def.before_char) return chars;

    return chars.flatMap(char => {
        let out = def.before_char(ctx?.input, { char });
        if (out === false || out === '' || out === null) return [];
        return typeof out == 'string' ? [...out] : [char];
    });
}

function takes(node, c, s) {
    if (node.type == 'slot')      return node.test.test(c);
    if (node.type == 'transform') return node.from === c || s.input.slice(s.ip, s.ip + node.to.length).join('') === node.to;
    if (node.type == 'repeat')    return consumes(node.children, c, s);
    return false;
}

function consumes(nodes, c, s, entry) {
    for (let node of nodes) {
        if (node.type == 'literal') {
            if (!entry && node.char === c) return true;
            continue;
        }
        if (node.type == 'optional' || node.type == 'repeat' && node.min == 0) {
            if (consumes(node.children, c, s, entry)) return true;
            continue;
        }
        return takes(node, c, s);
    }
    return entry ? nodes.some(node => node.type == 'literal' && node.char === c) : false;
}

function accept(s, text, fmt_text, kind = 'char', ordinal = null) {
    s.units.push({
        kind, ordinal,
        stream_start: s.stream.length, stream_end: s.stream.length + text.length,
        fmt_start: s.formatted.length, fmt_end: s.formatted.length + fmt_text.length
    });
    s.stream += text;
    if (kind == 'char') s.raw += text;
    if (ordinal != null) s.cells[ordinal] = kind == 'char' ? text : null;
    s.formatted += fmt_text;
}

function stop(s) {
    if (s.stop_fmt < 0) s.stop_fmt = s.formatted.length + s.tail.length;
}

function exhaust(s) {
    s.complete = false;
    s.done = true;
    stop(s);
}

function walk(nodes, s, def) {
    for (let i = 0; i < nodes.length; i++) {
        let node = nodes[i];

        if (node.type == 'literal') {
            if (s.done) s.ph += node.char;
            else if (s.ip < s.input.length) {
                if (s.input[s.ip] === node.char) {
                    s.ip++;
                    s.consumed++;
                    accept(s, node.char, node.char, 'literal');
                } else
                    s.formatted += node.char;
            } else s.tail += node.char;

        } else if (node.type == 'slot') {
            let ordinal = s.ordinal++, fill = filler(def, ordinal);
            if (s.done) {
                s.ph_slots.push({ fmt: s.formatted.length + s.tail.length + s.ph.length, node });
                s.ph += fill;
                continue;
            }
            let no_fix = false;
            for (;;) {
                if (s.ip >= s.input.length) {
                    exhaust(s);
                    s.ph_slots.push({ fmt: s.formatted.length + s.tail.length, node });
                    s.ph += fill;
                    break;
                }
                let c = s.input[s.ip];
                if (node.test.test(c)) {
                    if (def.before_slot && !no_fix) {
                        let out = def.before_slot(s.ctx?.input,
                            { char: c, slot: ordinal, cells: s.cells, raw: s.raw, node });
                        if (out === false) { s.ip++; continue; }
                        if (typeof out == 'string' && out !== c) {
                            s.input.splice(s.ip, 1, ...out);
                            no_fix = true;
                            continue;
                        }
                    }
                    accept(s, c, c, 'char', ordinal);
                } else if (c === fill) {
                    s.complete = false;
                    accept(s, c, c, 'hole', ordinal);
                } else { s.ip++; continue; }
                s.ip++;
                s.consumed++;
                break;
            }

        } else if (node.type == 'transform') {
            if (s.done) { s.ph += node.to; continue; }
            for (;;) {
                if (s.ip >= s.input.length) {
                    exhaust(s);
                    s.ph += node.to;
                    break;
                }
                if (s.input.slice(s.ip, s.ip + node.to.length).join('') === node.to)
                    s.ip += node.to.length, s.consumed += node.to.length;
                else if (s.input[s.ip] === node.from)
                    s.ip++, s.consumed++;
                else { s.ip++; continue; }
                accept(s, node.to, node.to);
                break;
            }

        } else if (node.type == 'repeat') {
            if (s.done) {
                for (let k = 0; k < node.min; k++) walk(node.children, s, def);
                continue;
            }
            let count = 0;
            while (count < node.max) {
                if (s.ip >= s.input.length) {
                    if (count < node.min) {
                        exhaust(s);
                        for (let k = count; k < node.min; k++) walk(node.children, s, def);
                    } else stop(s);
                    break;
                }
                if (!consumes(node.children, s.input[s.ip], s)) {
                    if (!node.greedy && count >= node.min) break;
                    s.ip++;
                    continue;
                }
                let before = s.ip;
                walk(node.children, s, def);
                if (s.done) {
                    for (let k = count + 1; k < node.min; k++) walk(node.children, s, def);
                    break;
                }
                if (s.ip === before) break;
                count++;
            }

        } else if (node.type == 'optional') {
            if (s.done) continue;
            let rest = nodes.slice(i + 1), entered = false;
            while (s.ip < s.input.length) {
                let c = s.input[s.ip];
                if (consumes(node.children, c, s, true)) {
                    entered = true;
                    walk(node.children, s, def);
                    break;
                }
                if (consumes(rest, c, s)) break;
                s.ip++;
            }
            if (!entered && s.ip >= s.input.length) stop(s);
        }
    }
}

function numeral(def, input_string) {
    let o = def.numeral;
    let str = String(input_string ?? '');
    let neg = o.sign && str.includes('-');

    let digits;
    if (o.decimal && (str.includes(o.decimal) || str.includes('.'))) {
        let esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let num = str.replace(new RegExp(`[^0-9${esc(o.decimal)}.]`, 'g'), '').replace(o.decimal, '.');
        let val = parseFloat(num);
        digits = Number.isFinite(val) ? String(Math.round(val * 10 ** o.fraction)) : '';
    } else {
        let ds = str.replace(/\D/g, '');
        digits = ds === '' ? '' : (ds.replace(/^0+/, '') || '0');
    }
    
    if (!digits) {
        let body = o.prefix + filler(def, 0);
        if (o.fraction) {
            body += o.decimal;
            for (let i = 1; i <= o.fraction; i++) body += filler(def, i);
        }
        return { stream: '', raw: '', formatted: '', tail: '', ph: body + o.suffix,
            ph_slots: [], complete: false, consumed: 0, units: [], cells: [], stop_fmt: body.length };
    }

    let f = o.fraction;
    let padded = digits.padStart(f + 1, '0');
    let int = (f ? padded.slice(0, -f) : padded).replace(/^0+(?=\d)/, '');
    let frac = f ? padded.slice(-f) : '';
    let first_sig = int.length + frac.length - digits.length;

    let raw = (neg ? '-' : '') + digits;
    let formatted = '', units = [], si = 0, gi = 0;
    let lit = txt => { formatted += txt; };
    let chr = ch => {
        units.push({ kind: 'char', ordinal: null,
            stream_start: si, stream_end: si + 1,
            fmt_start: formatted.length, fmt_end: formatted.length + 1 });
        formatted += ch; si++;
    };

    lit(o.prefix);
    if (neg) chr('-');
    for (let idx = 0; idx < int.length; idx++, gi++) {
        if (idx && (int.length - idx) % 3 == 0) lit(o.group);
        gi >= first_sig ? chr(int[idx]) : lit(int[idx]);
    }
    if (f) {
        lit(o.decimal);
        for (let idx = 0; idx < frac.length; idx++, gi++)
            gi >= first_sig ? chr(frac[idx]) : lit(frac[idx]);
    }
    let stop_fmt = formatted.length;
    lit(o.suffix);

    let value = (neg ? -1 : 1) * parseFloat(int + (f ? '.' + frac : ''));
    let complete = (o.min == null || value >= o.min) && (o.max == null || value <= o.max);

    return { stream: raw, raw, formatted, tail: '', ph: '', ph_slots: [],
        complete, consumed: raw.length, units, cells: [], stop_fmt };
}

export function run(def, input_string, ctx) {
    if (def.numeral) return numeral(def, input_string);

    let s = {
        input: prepare(def, input_string, ctx),
        ctx,
        ip: 0,
        stream: '', raw: '', formatted: '', tail: '', ph: '',
        ph_slots: [], units: [], cells: [],
        consumed: 0, ordinal: 0,
        complete: true, done: false, stop_fmt: -1
    };

    walk(def.nodes, s, def);
    if (s.stop_fmt < 0) s.stop_fmt = s.formatted.length;
    if (def.valid) s.complete = s.complete && def.valid.test(s.raw);

    return {
        stream: s.stream, raw: s.raw, formatted: s.formatted, tail: s.tail,
        ph: s.ph, ph_slots: s.ph_slots, complete: s.complete, consumed: s.consumed,
        units: s.units, cells: s.cells, stop_fmt: s.stop_fmt
    };
}

export function run_all(defs, input_string, ctx = {}) {
    let resolved = [];
    ctx = { ...ctx, stream: String(input_string ?? '') };
    for (let def of defs)
        def.fn ? resolved.push(...build(def.fn(ctx), def.base).map(d => ({ ...d, key: def.key ?? d.key })))
               : resolved.push(def);

    let best = null;
    for (let def of resolved) {
        let result = run(def, input_string, ctx);
        if (!best
            || result.consumed > best.result.consumed
            || result.consumed == best.result.consumed && result.complete && !best.result.complete)
            best = { result, def, mask_id: def.key };
    }
    return best;
}

export function render(result, placeholder) {
    if (placeholder == 'always') return result.formatted + result.tail + result.ph;
    if (placeholder === false)   return result.formatted;
    return result.formatted + result.tail;
}

export function caret_for(result, stream_pos) {
    for (let unit of result.units) {
        if (unit.kind == 'literal') continue;
        if (stream_pos <= unit.stream_start || stream_pos < unit.stream_end)
            return unit.fmt_start;
    }
    return result.stop_fmt;
}

export function cap(result, n) {
    let chars = result.units.filter(u => u.kind == 'char');
    return chars.length > n ? chars[n - 1].stream_end : result.stream.length;
}
