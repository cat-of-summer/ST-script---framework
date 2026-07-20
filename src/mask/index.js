import { element, elements, expose, find, own } from '../_traits/hasInstanceSymbol.js';

export default class Mask {

    static #SLOTS = { '0': /^[0-9]$/, 'a': /^\p{L}$/u, '*': /^[^\n]$/ };
    static #CONFIG = ['target', 'mask'];
    static #SELECTABLE = ['text', 'search', 'tel', 'url', 'password'];

    static #unesc = str => str.replace(/\\(.)/g, '$1');
    static #no_g = re => re.global ? new RegExp(re.source, re.flags.replace('g', '')) : re;

    static #scan(str, from) {
        let open = str[from], close = open == '{' ? '}' : ']', depth = 0;
        for (let i = from; i < str.length; i++) {
            let c = str[i];
            if (c == '\\') { i++; continue; }
            if (open == '[' && c == '{') {
                if ((i = Mask.#scan(str, i)) < 0) return -1;
            } else if (c == open) depth++;
            else if (c == close && --depth == 0) return i;
        }
        return -1;
    }

    static #last_top(body, needle) {
        let depth = 0, found = -1;
        for (let i = 0; i < body.length; i++) {
            if (body[i] == '\\') { i++; continue; }
            if (body[i] == '{' || body[i] == '[') depth++;
            else if (body[i] == '}' || body[i] == ']') depth--;
            else if (depth == 0 && body.startsWith(needle, i)) found = i;
        }
        return found;
    }

    static #classify(body) {
        let fail = () => {
            console.warn('Некорректный блок маски', `{${body}}`);
            return [...`{${body}}`].map(char => ({ type: 'literal', char }));
        };

        let semi = Mask.#last_top(body, ';');
        if (semi > 0) {
            let range = body.slice(semi + 1);
            if (/^(\d+|\d*-\d*)$/.test(range) && range != '-') {
                let [min, max] = /^\d+$/.test(range)
                    ? [+range, +range]
                    : range.split('-').map((n, i) => n === '' ? (i ? Infinity : 0) : +n);
                return max < min ? fail()
                    : [{ type: 'repeat', children: Mask.compile(body.slice(0, semi)), min, max }];
            }
        }

        if (body[0] == '{' && body.at(-1) == '}')
            try {
                return [{ type: 'slot', test: new RegExp(`^(?:${body.slice(1, -1)})$`, 'u') }];
            } catch { return fail(); }

        let arrow = Mask.#last_top(body, '=>');
        if (arrow > 0) {
            let from = Mask.#unesc(body.slice(0, arrow)), to = Mask.#unesc(body.slice(arrow + 2));
            return from.length != 1 || !to ? fail() : [{ type: 'transform', from, to }];
        }

        return fail();
    }

    static compile(pattern) {
        let nodes = [];

        for (let i = 0; i < pattern.length; i++) {
            let char = pattern[i], end;

            if (char == '\\')
                nodes.push({ type: 'literal', char: pattern[++i] ?? '\\' });
            else if (char == '[' && (end = Mask.#scan(pattern, i)) >= 0) {
                nodes.push({ type: 'optional', children: Mask.compile(pattern.slice(i + 1, end)) });
                i = end;
            } else if (char == '{' && (end = Mask.#scan(pattern, i)) >= 0) {
                nodes.push(...Mask.#classify(pattern.slice(i + 1, end)));
                i = end;
            } else
                nodes.push(Mask.#SLOTS[char] ? { type: 'slot', test: Mask.#SLOTS[char] } : { type: 'literal', char });
        }

        return nodes;
    }

    static #is_fixed(nodes) {
        return nodes.every(node =>
            node.type == 'literal' || node.type == 'slot'
            || node.type == 'repeat' && node.min == node.max && Mask.#is_fixed(node.children));
    }

    static build(mask, base = {}) {
        if (mask && typeof mask == 'object' && !Array.isArray(mask) && !(mask instanceof RegExp)
            && mask.pattern == null && mask.filter == null)
            return Object.entries(mask).flatMap(([key, m]) =>
                Mask.build(m, base).map(def => ({ ...def, key })));

        let defs = (Array.isArray(mask) ? mask : [mask]).map(m => {
            if (typeof m == 'function') return { fn: m, base };
            if (m instanceof RegExp) m = { filter: m };
            if (typeof m == 'string') m = { pattern: m };

            let nodes = m.pattern != null
                ? Mask.compile(m.pattern)
                : [{ type: 'repeat', min: 0, max: m.max_length ?? Infinity, greedy: true,
                     children: [{ type: 'slot', test: Mask.#no_g(m.filter) }] }];

            return {
                nodes,
                fixed: m.pattern != null && Mask.#is_fixed(nodes),
                valid: m.valid ? Mask.#no_g(m.valid) : (m.filter ? /./ : null),
                filler: m.filler ?? base.filler,
                before_char: m.before_char ?? base.before_char,
                before_slot: m.before_slot ?? base.before_slot
            };
        });

        defs.forEach((def, i) => def.key ??= i);
        return defs;
    }

    static #filler(def, ordinal) {
        let filler = def.filler ?? '_';
        return filler[ordinal] ?? filler[filler.length - 1] ?? '_';
    }

    static #prepare(def, input_string, ctx) {
        let chars = [...String(input_string ?? '')];
        if (!def.before_char) return chars;

        return chars.flatMap(char => {
            let out = def.before_char(ctx?.input, { char });
            if (out === false || out === '' || out === null) return [];
            return typeof out == 'string' ? [...out] : [char];
        });
    }

    static #takes(node, c, s) {
        if (node.type == 'slot')      return node.test.test(c);
        if (node.type == 'transform') return node.from === c || s.input.slice(s.ip, s.ip + node.to.length).join('') === node.to;
        if (node.type == 'repeat')    return Mask.#consumes(node.children, c, s);
        return false;
    }

    static #consumes(nodes, c, s, entry) {
        for (let node of nodes) {
            if (node.type == 'literal') {
                if (!entry && node.char === c) return true;
                continue;
            }
            if (node.type == 'optional' || node.type == 'repeat' && node.min == 0) {
                if (Mask.#consumes(node.children, c, s, entry)) return true;
                continue;
            }
            return Mask.#takes(node, c, s);
        }
        return entry ? nodes.some(node => node.type == 'literal' && node.char === c) : false;
    }

    static #accept(s, text, fmt_text, kind = 'char', ordinal = null) {
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

    static #stop(s) {
        if (s.stop_fmt < 0) s.stop_fmt = s.formatted.length + s.tail.length;
    }

    static #walk(nodes, s, def) {
        for (let i = 0; i < nodes.length; i++) {
            let node = nodes[i];

            if (node.type == 'literal') {
                if (s.done) s.ph += node.char;
                else if (s.ip < s.input.length) {
                    if (s.input[s.ip] === node.char) {
                        s.ip++;
                        s.consumed++;
                        Mask.#accept(s, node.char, node.char, 'literal');
                    } else
                        s.formatted += node.char;
                } else s.tail += node.char;

            } else if (node.type == 'slot') {
                let ordinal = s.ordinal++, filler = Mask.#filler(def, ordinal);
                if (s.done) {
                    s.ph_slots.push({ fmt: s.formatted.length + s.tail.length + s.ph.length, node });
                    s.ph += filler;
                    continue;
                }
                let no_fix = false;
                for (;;) {
                    if (s.ip >= s.input.length) {
                        s.complete = false;
                        s.done = true;
                        Mask.#stop(s);
                        s.ph_slots.push({ fmt: s.formatted.length + s.tail.length, node });
                        s.ph += filler;
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
                        Mask.#accept(s, c, c, 'char', ordinal);
                    } else if (c === filler) {
                        s.complete = false;
                        Mask.#accept(s, c, c, 'hole', ordinal);
                    } else { s.ip++; continue; }
                    s.ip++;
                    s.consumed++;
                    break;
                }

            } else if (node.type == 'transform') {
                if (s.done) { s.ph += node.to; continue; }
                for (;;) {
                    if (s.ip >= s.input.length) {
                        s.complete = false;
                        s.done = true;
                        Mask.#stop(s);
                        s.ph += node.to;
                        break;
                    }
                    if (s.input.slice(s.ip, s.ip + node.to.length).join('') === node.to)
                        s.ip += node.to.length, s.consumed += node.to.length;
                    else if (s.input[s.ip] === node.from)
                        s.ip++, s.consumed++;
                    else { s.ip++; continue; }
                    Mask.#accept(s, node.to, node.to);
                    break;
                }

            } else if (node.type == 'repeat') {
                if (s.done) {
                    for (let k = 0; k < node.min; k++) Mask.#walk(node.children, s, def);
                    continue;
                }
                let count = 0;
                while (count < node.max) {
                    if (s.ip >= s.input.length) {
                        if (count < node.min) {
                            s.complete = false;
                            s.done = true;
                            Mask.#stop(s);
                            for (let k = count; k < node.min; k++) Mask.#walk(node.children, s, def);
                        } else Mask.#stop(s);
                        break;
                    }
                    if (!Mask.#consumes(node.children, s.input[s.ip], s)) {
                        if (!node.greedy && count >= node.min) break;
                        s.ip++;
                        continue;
                    }
                    let before = s.ip;
                    Mask.#walk(node.children, s, def);
                    if (s.done) {
                        for (let k = count + 1; k < node.min; k++) Mask.#walk(node.children, s, def);
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
                    if (Mask.#consumes(node.children, c, s, true)) {
                        entered = true;
                        Mask.#walk(node.children, s, def);
                        break;
                    }
                    if (Mask.#consumes(rest, c, s)) break;
                    s.ip++;
                }
                if (!entered && s.ip >= s.input.length) Mask.#stop(s);
            }
        }
    }

    static run(def, input_string, ctx) {
        let s = {
            input: Mask.#prepare(def, input_string, ctx),
            ctx,
            ip: 0,
            stream: '', raw: '', formatted: '', tail: '', ph: '',
            ph_slots: [], units: [], cells: [],
            consumed: 0, ordinal: 0,
            complete: true, done: false, stop_fmt: -1
        };

        Mask.#walk(def.nodes, s, def);
        if (s.stop_fmt < 0) s.stop_fmt = s.formatted.length;
        if (def.valid) s.complete = s.complete && def.valid.test(s.raw);

        return {
            stream: s.stream, raw: s.raw, formatted: s.formatted, tail: s.tail,
            ph: s.ph, ph_slots: s.ph_slots, complete: s.complete, consumed: s.consumed,
            units: s.units, cells: s.cells, stop_fmt: s.stop_fmt
        };
    }

    static run_all(defs, input_string, ctx = {}) {
        let resolved = [];
        ctx = { ...ctx, stream: String(input_string ?? '') };
        for (let def of defs)
            def.fn ? resolved.push(...Mask.build(def.fn(ctx), def.base).map(d => ({ ...d, key: def.key ?? d.key })))
                   : resolved.push(def);

        let best = null;
        for (let def of resolved) {
            let result = Mask.run(def, input_string, ctx);
            if (!best
                || result.consumed > best.result.consumed
                || result.consumed == best.result.consumed && result.complete && !best.result.complete)
                best = { result, def, mask_id: def.key };
        }
        return best;
    }

    static render(result, placeholder) {
        if (placeholder == 'always') return result.formatted + result.tail + result.ph;
        if (placeholder === false)   return result.formatted;
        return result.formatted + result.tail;
    }

    static caret_for(result, stream_pos) {
        for (let unit of result.units) {
            if (unit.kind == 'literal') continue;
            if (stream_pos <= unit.stream_start || stream_pos < unit.stream_end)
                return unit.fmt_start;
        }
        return result.stop_fmt;
    }

    static #layout(def) {
        let layout = Mask.run(def, ''), part = 0;
        layout.slots = layout.ph_slots;
        layout.parts = layout.slots.map((slot, i) =>
            i && slot.fmt > layout.slots[i - 1].fmt + 1 ? ++part : part);
        layout.template = Mask.render(layout, 'always');
        return layout;
    }

    #params = {};
    #methods = {};
    #defs = null;
    #states = new WeakMap();
    #inputs = [];

    static find = find;

    get params() { return this.#params; }

    get value() { return this.#inputs.map(input => input.value); }

    clone(params) {
        return new Mask({
            ...this.#params,
            ...this.#methods,
            ...params,
            parent: this
        });
    }

    constructor(params) {
        params = {
            target: 'input[mask]',
            mask: null,
            filler: '_',
            placeholder: true,
            flow: true,
            rewrite: false,
            caret: true,

            before_init:  () => {},
            on_init:      () => {},
            before_char:  () => {},
            before_slot:  () => {},
            before_input: () => {},
            on_input:     () => {},
            before_paste: () => {},
            on_paste:     () => {},
            on_accept:      () => {},
            on_complete:    () => {},
            on_incomplete:  () => {},
            on_mask_change: () => {},

            ...params
        };

        for (let [key, value] of Object.entries(params))
            if (typeof value == "function" && !Mask.#CONFIG.includes(key)) {
                this[key] = value.bind(this);

                this.#methods[key] = value;
            } else
                this.#params[key] = value;

        this.before_init(this.#params);

        if (this.#params.mask != null)
            this.#defs = Mask.build(this.#params.mask, this.#base());

        for (let input of elements(this.#params.target))
            this.#bind(input);

        this.on_init(this.#params);
    }

    raw(target = this.#only()) {
        return this.#states.get(element(target))?.result?.raw ?? '';
    }

    state(target = this.#only()) {
        let input = element(target), st = this.#states.get(input);
        return st?.result ? this.#state_of(input, st) : null;
    }

    set(target, value) {
        if (arguments.length < 2) [target, value] = [this.#only(), target];

        for (let input of elements(target))
            if (this.#states.has(input))
                this.#reconcile(input, String(value ?? ''), { prefix: String(value ?? '') });
    }

    clear(target = this.#inputs) { this.set(target, ''); }

    #only() {
        if (this.#inputs.length != 1)
            throw new Error(`Mask: маска привязана к ${this.#inputs.length} полям — укажите поле явно`);

        return this.#inputs[0];
    }

    set_mask(mask, target = null) {
        let defs = Mask.build(mask, this.#base());
        if (!target) this.#defs = defs;

        for (let input of (target ? elements(target) : this.#inputs)) {
            let st = this.#states.get(input);
            if (!st) continue;
            st.defs = defs;
            st.run = null;
            this.#reconcile(input, st.stream, {});
        }
    }

    #base() {
        return {
            filler: this.#params.filler,
            before_char: this.before_char,
            before_slot: this.before_slot
        };
    }

    #bind(input) {
        if (find(input)) throw new Error("Маска уже привязана к этому полю");
        own(input, this);

        if (!Mask.#SELECTABLE.includes(input.type))
            console.warn(`Mask: поле type="${input.type}" не поддерживает управление кареткой — используйте type="text" или "tel"`, input);

        let defs = this.#defs ?? (input.getAttribute('mask') ? Mask.build(input.getAttribute('mask'), this.#base()) : null);
        if (!defs) {
            console.warn('Mask: для поля не задана маска (ни в params.mask, ни в атрибуте mask)', input);
            return;
        }

        let st = { defs, def: null, stream: '', result: null, mask_id: null, rendered: '', run: null, composing: false, handled: false };
        this.#states.set(input, st);
        this.#inputs.push(input);

        expose(input, {
            raw:      () => this.raw(input),
            state:    () => this.state(input),
            set:      value => this.set(input, value),
            clear:    () => this.clear(input),
            set_mask: mask => this.set_mask(mask, input)
        });

        let hide = () => this.#params.caret == 'hide'
            && input.style.setProperty('caret-color', 'transparent', 'important');
        hide();

        input.addEventListener('beforeinput', event => this.#before(input, event));

        if (this.#params.caret !== true) {
            let pin = () => this.#pin(input);
            for (let event of ['selectionchange', 'click', 'keyup', 'select'])
                input.addEventListener(event, pin);
        }

        let refresh = () => {
            if (st.handled) { st.handled = false; return; }
            if (st.composing) return;
            this.#refresh(input);
        };
        input.addEventListener('input', refresh);
        input.addEventListener('change', refresh);

        input.addEventListener('compositionstart', () => st.composing = true);
        input.addEventListener('compositionend', () => { st.composing = false; this.#refresh(input); });

        input.addEventListener('focus', () => {
            hide();
            this.#reconcile(input, st.stream, { prefix: st.stream, silent: true });
        });
        input.addEventListener('blur',  () => { st.run = null; this.#reconcile(input, st.stream, { silent: true }); });

        input.closest('form')?.addEventListener('reset', () => queueMicrotask(() => this.#refresh(input)));

        this.#reconcile(input, input.value, { silent: true });
    }

    #before(input, event) {
        let st = this.#states.get(input);
        let type = event.inputType ?? 'insertText';

        if (event.isComposing || type == 'insertCompositionText' || type == 'deleteCompositionText') {
            st.composing = true;
            return;
        }

        if (type == 'historyUndo' || type == 'historyRedo') return;

        let start = input.selectionStart ?? 0, end = input.selectionEnd ?? start;

        if (this.#params.caret !== true && st.result && !(start == 0 && end == input.value.length))
            start = end = this.#tail_of(input, st, start);

        event.preventDefault();
        st.handled = true;

        let is_delete = type.startsWith('delete');
        let insert = '';

        if (!is_delete) {
            if (type == 'insertLineBreak' || type == 'insertParagraph') return;
            insert = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';

            if (type == 'insertFromPaste') {
                let out = this.before_paste(input, insert);
                if (out === false) return;
                if (typeof out == 'string') insert = out;
            }
        }

        if (this.before_input(input, { type, insert, start, end }) === false) return;

        this.#params.placeholder == 'always' && st.def?.fixed
            ? this.#grid(input, type, start, end, is_delete ? '' : insert)
            : this.#edit(input, start, end, is_delete ? '' : insert, type);

        if (type == 'insertFromPaste') this.on_paste(input, this.#state_of(input, st));
    }

    #edit(input, fmt_start, fmt_end, insert, type) {
        let st = this.#states.get(input);
        let units = st.result?.units ?? [];
        let del_start, del_end, unit;

        if (fmt_start != fmt_end) {
            let hit = units.filter(u => u.fmt_start < fmt_end && u.fmt_end > fmt_start);
            del_start = hit.length ? hit[0].stream_start : this.#stream_pos(units, fmt_start);
            del_end = hit.length ? hit.at(-1).stream_end : del_start;
        } else if (!type.startsWith('delete'))
            del_start = del_end = this.#stream_pos(units, fmt_start);
        else {
            if (type.includes('Forward'))
                unit = units.find(u => u.fmt_end > fmt_start && u.kind != 'literal')
                    ?? units.find(u => u.fmt_end > fmt_start);
            else {
                let literal;
                for (let u of units)
                    if (u.fmt_start < fmt_start) u.kind == 'literal' ? literal = u : unit = u;
                unit ??= literal;
            }
            if (!unit) return;
            del_start = unit.stream_start;
            del_end = unit.stream_end;
        }

        let prefix = st.stream.slice(0, del_start) + insert;
        this.#reconcile(input, prefix + st.stream.slice(del_end), { prefix });
    }

    #grid(input, type, fmt_start, fmt_end, insert) {
        let st = this.#states.get(input), def = st.def;
        let layout = def.layout ??= Mask.#layout(def);
        let slots = layout.slots, parts = layout.parts, n = slots.length;
        let flow = this.#params.flow, rewrite = this.#params.rewrite;

        let cells = Array.from({ length: n }, (_, i) => st.result?.cells?.[i] ?? null);

        let at = fmt => { let k = slots.findIndex(slot => slot.fmt >= fmt); return k < 0 ? n : k; };
        let gap = i => layout.template.slice(slots[i - 1].fmt + 1, slots[i].fmt);
        let k, anchor = null, restart = null;

        if (fmt_start != fmt_end) {
            k = at(fmt_start);
            for (let i = k; i < n && slots[i].fmt < fmt_end; i++) cells[i] = null;
            st.run = null;
        } else if (!insert && type.startsWith('delete')) {
            if (type.includes('Forward')) {
                if ((k = at(fmt_start)) >= n) return;
                let limit = parts[k];
                while (k < n && cells[k] == null) k++;
                if (k >= n || !flow && parts[k] != limit) return;
            } else {
                let edge = -1;
                for (let i = 0; i < n; i++) if (slots[i].fmt < fmt_start) edge = i;
                if (edge < 0) return;
                k = edge;
                while (k >= 0 && cells[k] == null) k--;
                if (k < 0 || !flow && (parts[k] != parts[edge] || fmt_start > slots[edge].fmt + 1)) return;
            }
            cells[k] = null;
        } else {
            k = at(fmt_start);
            if (k >= n && (k = cells.indexOf(null)) < 0) k = n;
            anchor = this.#anchor_at(layout, k, fmt_start);

            if (rewrite) {
                let part = anchor ?? parts[Math.min(k, n - 1)];
                if (st.run?.part !== part || st.run.k !== k || parts[k] !== part) restart = part;
            }
        }

        anchor ??= k < n ? parts[k] : null;
        let crossed = null;

        for (let c of Mask.#prepare(def, insert, { input })) {
            if (k >= n) {
                if (restart == null) break;
                k = parts.indexOf(restart);
            }

            if (!flow && parts[k] != anchor) {
                if (gap(k).includes(c)) {
                    anchor = parts[k];
                    crossed = k;
                    restart = rewrite ? parts[k] : null;
                    continue;
                }
                if (restart == null) continue;
                k = parts.indexOf(restart);
            }

            if (!slots[k].node.test.test(c)) {
                let end = parts.lastIndexOf(parts[k]);
                if (end + 1 < n && gap(end + 1).includes(c)) {
                    k = end + 1;
                    anchor = parts[k];
                    crossed = k;
                    restart = rewrite ? parts[k] : null;
                }
                continue;
            }

            if (restart != null) {
                for (let i = 0; i < n; i++) if (parts[i] == restart) cells[i] = null;
                k = parts.indexOf(restart);
                anchor = restart;
                restart = null;
            }

            cells[k++] = c;
        }

        let last = cells.reduce((acc, cell, i) => cell != null ? i : acc, -1);
        let stream = cells.slice(0, last + 1).map((cell, i) => cell ?? Mask.#filler(def, i)).join('');

        let pos = Math.min(Mask.run(def, stream.slice(0, k), { input }).stream.length, n);
        let caret = pos < n ? slots[pos].fmt : slots[n - 1].fmt + 1;
        if (!flow && insert && pos > 0 && pos < n && parts[pos] != parts[pos - 1])
            caret = slots[pos - 1].fmt + 1;
        if (crossed != null && k == crossed) caret = slots[crossed].fmt;

        let kn = at(caret);
        st.run = crossed != null ? null
            : { part: this.#anchor_at(layout, kn, caret) ?? parts[Math.min(kn, n - 1)], k: kn };
        this.#reconcile(input, stream, { caret_fmt: caret });
    }

    #pin(input) {
        let st = this.#states.get(input);
        if (document.activeElement !== input || !st?.result) return;

        let start = input.selectionStart, end = input.selectionEnd;
        if (start == null) return;

        if (start !== end) {
            if (start != 0 || end != input.value.length) input.setSelectionRange(0, input.value.length);
            return;
        }

        if (start === st.caret) return;

        let target = this.#tail_of(input, st, start);
        if (start !== target) input.setSelectionRange(target, target);
        st.caret = target;
    }

    #tail_of(input, st, fmt) {
        let def = st.def;

        if (this.#params.placeholder == 'always' && def?.fixed && !this.#params.flow) {
            let layout = def.layout ??= Mask.#layout(def);
            let { slots, parts } = layout;
            let k = slots.findIndex(slot => slot.fmt >= fmt);
            if (k < 0) k = slots.length - 1;

            let part = this.#anchor_at(layout, k, fmt) ?? parts[k];
            let first = parts.indexOf(part), last = parts.lastIndexOf(part);
            for (let i = first; i <= last; i++)
                if (st.result.cells?.[i] == null) return slots[i].fmt;

            return slots[last].fmt + 1;
        }

        return Math.min(st.result.stop_fmt, input.value.length);
    }

    #anchor_at(layout, k, fmt) {
        let { slots, parts } = layout;
        return !this.#params.flow && k > 0 && k < slots.length
            && parts[k] != parts[k - 1] && fmt == slots[k - 1].fmt + 1 ? parts[k - 1] : null;
    }

    #stream_pos(units, fmt) {
        let pos = 0;
        for (let unit of units)
            if (unit.fmt_end <= fmt || unit.fmt_start < fmt) pos = unit.stream_end;
        return pos;
    }

    #refresh(input) {
        let st = this.#states.get(input);
        if (input.value === st.rendered) return;

        st.run = null;
        let sel = input.selectionStart ?? input.value.length;
        this.#reconcile(input, input.value, { prefix: input.value.slice(0, sel) });
    }

    #reconcile(input, stream_next, { prefix = null, caret_fmt = null, silent = false } = {}) {
        let st = this.#states.get(input);
        let best = Mask.run_all(st.defs, stream_next, { raw: st.result?.raw ?? '', value: input.value, input });
        if (!best) return;

        let { result, def, mask_id } = best;
        let text = this.#text_for(input, result);

        if (input.value !== text) input.value = text;
        st.rendered = text;

        if (caret_fmt == null && prefix != null && document.activeElement === input)
            caret_fmt = Mask.caret_for(result, Mask.run(def, prefix, { input }).stream.length);
        if (caret_fmt != null && document.activeElement === input) {
            caret_fmt = Math.min(caret_fmt, text.length);
            input.setSelectionRange(caret_fmt, caret_fmt);
            st.caret = caret_fmt;
        }

        let prev = st.result, prev_id = st.mask_id;
        st.result = result;
        st.stream = result.stream;
        st.def = def;
        st.mask_id = mask_id;

        input.setAttribute('mask_id', mask_id);
        input.setAttribute('progress', result.raw.length);
        input.setAttribute('is_complete', result.complete);

        if (silent) return;

        let state = this.#state_of(input, st);
        this.on_input(input, state);
        if (result.raw !== (prev?.raw ?? ''))   this.on_accept(input, state);
        if (result.complete && !prev?.complete) this.on_complete(input, state);
        if (!result.complete && prev?.complete) this.on_incomplete(input, state);
        if (prev && mask_id !== prev_id)        this.on_mask_change(input, state);
    }

    #text_for(input, result) {
        if (!result.stream) {
            if (document.activeElement !== input) return '';
            if (this.#params.placeholder == 'always') return Mask.render(result, 'always');
            return this.#params.placeholder == false ? '' : Mask.render(result, true);
        }
        return Mask.render(result, this.#params.placeholder);
    }

    #state_of(input, st) {
        return {
            raw: st.result?.raw ?? '',
            formatted: input.value,
            complete: st.result?.complete ?? false,
            mask_id: st.mask_id,
            progress: st.result?.raw.length ?? 0
        };
    }
}
