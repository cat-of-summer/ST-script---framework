import { element, elements, expose, find, own } from '../_traits/hasInstanceSymbol.js';
import { build, run, run_all, render, caret_for, cap, prepare } from './_engine.js';
import { spans, type_ahead, settle, step, in_range } from './_groups.js';

const CALLBACKS = ['before_init', 'on_init', 'before_char', 'before_slot', 'before_input',
    'on_input', 'before_paste', 'on_paste', 'on_accept', 'on_complete', 'on_incomplete', 'on_mask_change'];

export default class Mask {

    static #CONFIG = ['target', 'mask'];
    static #SELECTABLE = ['text', 'search', 'tel', 'url', 'password'];

    static #layout(def) {
        let layout = run(def, ''), part = 0;
        layout.slots = layout.ph_slots;
        layout.parts = layout.slots.map((slot, i) =>
            i && slot.fmt > layout.slots[i - 1].fmt + 1 ? ++part : part);
        layout.template = render(layout, 'always');
        return layout;
    }

    // Атрибут mask="" — строка-шаблон либо JSON: массив строк или словарь { ключ: строка | [строки] }.
    // Шаблоны тоже начинаются с '[' и '{' ('{*;0-}', '[0]'), поэтому JSON берётся только
    // подходящей формы, всё остальное остаётся шаблоном
    static #from_attr(attr) {
        if (!/^\s*[[{]/.test(attr)) return attr;
        let strings = v => typeof v == 'string' || Array.isArray(v) && v.every(m => typeof m == 'string');
        try {
            let v = JSON.parse(attr);
            if (Array.isArray(v) ? strings(v) : v && typeof v == 'object' && Object.values(v).every(strings))
                return v;
        } catch {}
        return attr;
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
        return new Mask({ ...this.#params, ...this.#methods, ...params, parent: this });
    }

    constructor(params) {
        params = {
            target: 'input[mask]',
            mask: null,
            numeral: null,
            filler: '_',
            placeholder: true,
            edit: 'free',
            pad: null,
            align: 'left',
            min: null,
            max: null,
            groups: {},
            caret: true,
            coerce_type: true,
            max_raw: null,
            validate: null,
            validation_message: null,
            ...Object.fromEntries(CALLBACKS.map(k => [k, () => {}])),
            ...params
        };

        for (let [key, value] of Object.entries(params))
            if (typeof value == "function" && !Mask.#CONFIG.includes(key)) {
                this[key] = value.bind(this);
                this.#methods[key] = value;
            } else
                this.#params[key] = value;

        this.before_init(this.#params);

        if (this.#params.numeral != null)
            this.#defs = build({ numeral: this.#params.numeral }, this.#base());
        else if (this.#params.mask != null)
            this.#defs = build(this.#params.mask, this.#base());

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
        let defs = build(mask, this.#base());
        if (!target) this.#defs = defs;

        for (let input of (target ? elements(target) : this.#inputs)) {
            let st = this.#states.get(input);
            if (!st) continue;
            st.defs = defs;
            st.seg = null;
            this.#reconcile(input, st.stream, {});
        }
    }

    #base() {
        return {
            filler: this.#params.filler,
            groups: this.#params.groups,
            before_char: this.before_char,
            before_slot: this.before_slot
        };
    }

    #default_for(coerced) {
        if (coerced == 'email')
            return build({ filter: /[a-z0-9@._%+-]/i, valid: /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/ }, this.#base());
        if (coerced == 'number')
            return build({ numeral: {} }, this.#base());
        return null;
    }

    #bind(input) {
        if (find(input)) throw new Error("Маска уже привязана к этому полю");
        own(input, this);

        let coerced = null;
        if (this.#params.coerce_type !== false && (input.type == 'number' || input.type == 'email')) {
            coerced = input.type;
            input.inputMode = coerced == 'number' ? 'numeric' : 'email';
            input.type = 'text';
        }

        if (!Mask.#SELECTABLE.includes(input.type))
            console.warn(`Mask: поле type="${input.type}" не поддерживает управление кареткой — используйте type="text" или "tel"`, input);

        let ml = input.getAttribute('maxlength');
        if (ml != null) input.removeAttribute('maxlength');
        let max_raw = this.#params.max_raw ?? (ml != null ? +ml : null);

        let attr = input.getAttribute('mask');
        let defs = this.#defs
            ?? (attr ? build(Mask.#from_attr(attr), this.#base()) : this.#default_for(coerced));
        if (!defs) {
            console.warn('Mask: для поля не задана маска (ни в params.mask, ни в атрибуте mask)', input);
            return;
        }

        let numeric = coerced == 'number' || this.#params.numeral != null;
        let st = { defs, def: null, stream: '', result: null, mask_id: null, rendered: '', seg: null, composing: false, handled: false, coerced, max_raw, numeric };
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

        let edits = [this.#params.edit, ...Object.values(this.#params.groups ?? {}).map(g => g?.edit)];
        if (edits.includes('whole') && (this.#params.placeholder != 'always' || defs.some(d => !d.fixed && !d.fn)))
            console.warn("Mask: edit: 'whole' работает с фиксированной маской и placeholder: 'always' - иначе ведёт себя как 'end'", input);

        if (edits.some(edit => edit && edit != 'free')) {
            let pin = event => this.#pin(input, event.type == 'click');
            for (let event of ['selectionchange', 'click', 'keyup', 'select'])
                input.addEventListener(event, pin);
            input.addEventListener('keydown', event => this.#key(input, event));
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

        input.addEventListener('focus', event => {
            hide();
            this.#reconcile(input, st.stream, { prefix: st.stream, silent: true });
            this.#enter(input, event.relatedTarget);
        });
        input.addEventListener('blur', () => {
            this.#settle(input);
            st.seg = null;
            this.#reconcile(input, st.stream, { silent: true });
        });

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
        let { g, edit } = this.#mode(st, start, end);

        if (edit == 'end' && st.result && !(start == 0 && end == input.value.length)
            && !(g && start == g.start && end == g.end))
            start = end = this.#tail_of(input, st, g);

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

            if (st.numeric) {
                let sign = st.defs.some(d => d.numeral?.sign);
                insert = [...insert].filter(c => c >= '0' && c <= '9' || sign && c == '-').join('');
            }
        }

        if (this.before_input(input, { type, insert, start, end }) === false) return;

        let was = input.value;

        if (edit == 'whole') this.#segment(input, type, is_delete ? '' : insert);
        else if (this.#layout_of(st)) this.#grid(input, type, start, end, is_delete ? '' : insert);
        else this.#edit(input, start, end, is_delete ? '' : insert, type);

        if (type == 'insertFromPaste') this.on_paste(input, this.#state_of(input, st));

        if (event.defaultPrevented && input.value !== was)
            input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: type, data: insert || null }));
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
        let layout = this.#layout_of(st);
        let { slots, parts } = layout, n = slots.length;

        let cells = this.#cells(st, layout);

        let at = fmt => { let k = slots.findIndex(slot => slot.fmt >= fmt); return k < 0 ? n : k; };
        let gap = i => layout.template.slice(slots[i - 1].fmt + 1, slots[i].fmt);
        let k;

        if (fmt_start != fmt_end) {
            k = at(fmt_start);
            for (let i = k; i < n && slots[i].fmt < fmt_end; i++) cells[i] = null;
        } else if (!insert && type.startsWith('delete')) {
            if (type.includes('Forward')) {
                k = at(fmt_start);
                while (k < n && cells[k] == null) k++;
                if (k >= n) return;
            } else {
                k = -1;
                for (let i = 0; i < n; i++) if (slots[i].fmt < fmt_start) k = i;
                while (k >= 0 && cells[k] == null) k--;
                if (k < 0) return;
            }
            cells[k] = null;
        } else {
            k = at(fmt_start);
            if (k >= n && (k = cells.indexOf(null)) < 0) k = n;
        }

        for (let c of prepare(def, insert, { input })) {
            if (k >= n) break;

            if (!slots[k].node.test.test(c)) {
                // Разделитель следующего блока переводит набор в этот блок
                let end = parts.lastIndexOf(parts[k]);
                if (end + 1 < n && gap(end + 1).includes(c)) k = end + 1;
                continue;
            }

            cells[k++] = c;
        }

        let stream = this.#stream(layout, cells);
        let pos = Math.min(run(def, stream.slice(0, k), { input }).stream.length, n);
        this.#reconcile(input, stream, { caret_fmt: pos < n ? slots[pos].fmt : slots[n - 1].fmt + 1 });
    }

    // edit: 'whole' - набор в выделенную группу как в <input type=date>: буфер группы
    // начинается с нуля при входе в неё, заполненная группа передаёт набор следующей,
    // разделитель закрывает группу досрочно, удаление очищает группу целиком
    #segment(input, type, insert) {
        let st = this.#states.get(input), layout = this.#layout_of(st), groups = layout.spans;
        let seg = this.#seg(input, st);
        let cells = this.#cells(st, layout);
        let part = g => cells.slice(g.first, g.last + 1);
        let put = (g, values) => cells.splice(g.first, values.length, ...values);
        let g = groups[seg.gi];

        if (type.startsWith('delete')) {
            if (part(g).every(cell => cell == null)) {
                if (type.includes('Backward') && seg.gi > 0) this.#select(input, seg.gi - 1);
                return;
            }
            put(g, part(g).fill(null));
            seg.buffer = '';
        } else {
            if (type == 'insertFromPaste') seg.buffer = '';

            for (let c of prepare(st.def, insert, { input })) {
                g = groups[seg.gi];
                let next = groups[seg.gi + 1];

                if (next && layout.template.slice(g.end, next.start).includes(c)) {
                    if (seg.buffer) {
                        put(g, settle(g, part(g)));
                        seg.gi++;
                        seg.buffer = '';
                    }
                    continue;
                }

                let slot = layout.slots[g.first + Math.min(seg.buffer.length, g.fmts.length - 1)];
                if (!slot.node.test.test(c)) continue;

                let typed = type_ahead(g, seg.buffer, c);
                put(g, typed.cells);
                seg.buffer = typed.buffer;

                if (typed.advance) {
                    put(g, settle(g, part(g)));
                    seg.buffer = '';
                    if (next) seg.gi++;
                }
            }
        }

        this.#reconcile(input, this.#stream(layout, cells), {});
        this.#select(input, seg.gi, false);
    }

    // Клавиши режима 'whole': ←/→, Home/End и Tab/Shift+Tab ходят по группам (Tab с крайней
    // группы уводит из поля как обычно), ↑/↓ меняют значение группы по кругу
    #key(input, event) {
        let st = this.#states.get(input);
        if (event.altKey || event.ctrlKey || event.metaKey || !st?.result) return;

        let { g, edit } = this.#mode(st, input.selectionStart ?? 0, input.selectionEnd ?? 0);
        if (edit != 'whole') return;

        let groups = this.#layout_of(st).spans, last = groups.length - 1;
        let gi = this.#seg(input, st).gi, to;

        switch (event.key) {
            case 'ArrowLeft':  to = gi - 1; break;
            case 'ArrowRight': to = gi + 1; break;
            case 'Home':       to = 0; break;
            case 'End':        to = last; break;
            case 'Tab':
                to = gi + (event.shiftKey ? -1 : 1);
                if (to < 0 || to > last) return;
                break;
            case 'ArrowUp':
            case 'ArrowDown': {
                event.preventDefault();
                let layout = this.#layout_of(st), cells = this.#cells(st, layout);
                let next = step(groups[gi], cells.slice(groups[gi].first, groups[gi].last + 1),
                    event.key == 'ArrowUp' ? 1 : -1);
                if (!next) return;

                cells.splice(groups[gi].first, next.length, ...next);
                let was = input.value;
                this.#reconcile(input, this.#stream(layout, cells), {});
                this.#select(input, gi);
                if (input.value !== was) {
                    st.handled = true;
                    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
                }
                return;
            }
            default: return;
        }

        event.preventDefault();
        this.#select(input, Math.max(0, Math.min(to, last)));
    }

    // Выделить группу gi целиком. Уход из группы, в которой набирали, - сначала дотянуть её
    // до min; новая группа (или reset) начинает набор с пустого буфера
    #select(input, gi, reset = true) {
        let st = this.#states.get(input);
        if (st.seg && st.seg.gi !== gi) this.#settle(input);
        if (reset || st.seg?.gi !== gi) st.seg = { gi, buffer: '' };

        let g = this.#layout_of(st).spans[gi];
        if (document.activeElement === input) input.setSelectionRange(g.start, g.end);
    }

    // Группа набора - та, что выделена сейчас; сменилась (выделение поставили программно,
    // а selectionchange ещё не пришёл) - буфер начинается заново
    #seg(input, st) {
        let { g } = this.#mode(st, input.selectionStart ?? 0, input.selectionEnd ?? 0);
        let gi = this.#layout_of(st).spans.indexOf(g);
        if (st.seg?.gi !== gi) {
            this.#settle(input);
            st.seg = { gi, buffer: '' };
        }
        return st.seg;
    }

    #settle(input) {
        let st = this.#states.get(input), layout = this.#layout_of(st);
        if (!st.seg?.buffer || !layout) return;

        let g = layout.spans[st.seg.gi], cells = this.#cells(st, layout);
        let part = cells.slice(g.first, g.last + 1), next = settle(g, part);
        st.seg.buffer = '';
        if (next === part) return;

        cells.splice(g.first, next.length, ...next);
        this.#reconcile(input, this.#stream(layout, cells), {});
    }

    // Фокус в поле с группами 'whole': Tab выделяет первую группу, Shift+Tab (фокус пришёл
    // от следующего элемента) - последнюю. Клик дальше сам выделит группу под курсором
    #enter(input, from) {
        let st = this.#states.get(input), layout = this.#layout_of(st);
        if (!layout || this.#mode(st, 0).edit != 'whole') return;

        let back = from && input.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_FOLLOWING;
        this.#select(input, back ? layout.spans.length - 1 : 0);
    }

    #pin(input, clicked = false) {
        let st = this.#states.get(input);
        if (document.activeElement !== input || !st?.result) return;

        let start = input.selectionStart, end = input.selectionEnd;
        if (start == null) return;

        let { g, edit } = this.#mode(st, start, end);

        if (edit == 'whole') {
            let gi = this.#layout_of(st).spans.indexOf(g);
            if (!clicked && st.seg?.gi === gi && start == g.start && end == g.end) return;
            return this.#select(input, gi, clicked || st.seg?.gi !== gi);
        }

        if (edit != 'end') return;

        // Писать в середину нельзя - значит, и выделять её: частичное выделение расширяется
        // до группы под кареткой (без групп - до всего значения)
        if (start !== end) {
            let [from, to] = g ? [g.start, g.end] : [0, input.value.length];
            if ((start != 0 || end != input.value.length) && (start != from || end != to))
                input.setSelectionRange(from, to);
            return;
        }

        if (start === st.caret) return;

        let target = this.#tail_of(input, st, g);
        if (start !== target) input.setSelectionRange(target, target);
        st.caret = target;
    }

    // Куда прижата каретка в режиме 'end': первая пустая ячейка начиная с группы (заполненная
    // группа отдаёт набор дальше, а не перезаписывает соседнюю); без раскладки - конец набранного
    #tail_of(input, st, g) {
        if (g) {
            let slots = this.#layout_of(st).slots;
            for (let i = g.first; i < slots.length; i++)
                if (st.result.cells?.[i] == null) return slots[i].fmt;
            return slots.at(-1).fmt + 1;
        }
        return Math.min(st.result.stop_fmt, input.value.length);
    }

    // Раскладка фиксированной маски со скелетом: позиции слотов, блоки между разделителями
    // и группы. Без placeholder: 'always' или у маски переменной длины раскладки нет
    #layout_of(st) {
        let def = st.def;
        if (this.#params.placeholder != 'always' || !def?.fixed) return null;

        let layout = def.layout ??= Mask.#layout(def);
        layout.spans ??= spans(layout, this.#params);
        return layout;
    }

    // Группа под выделением и её режим: выделенная целиком группа, иначе группа под началом.
    // Позиция сразу за группой относится к ней ('12|.03' - ДД), так что каретка в конце
    // группы её не покидает
    #mode(st, start, end = start) {
        let groups = this.#layout_of(st)?.spans ?? [];
        let g = groups.find(g => start != end && g.start == start && g.end == end)
            ?? groups.find(g => start <= g.end) ?? groups.at(-1) ?? null;
        let edit = g ? g.opts.edit : this.#params.edit;
        return { g, edit: edit == 'whole' && !g ? 'end' : edit };
    }

    #cells(st, layout) {
        return layout.slots.map((_, i) => st.result?.cells?.[i] ?? null);
    }

    #stream(layout, cells) {
        let last = cells.reduce((acc, cell, i) => cell != null ? i : acc, -1);
        return cells.slice(0, last + 1).map((cell, i) => cell ?? layout.slots[i].fill).join('');
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

        st.seg = null;
        let sel = input.selectionStart ?? input.value.length;
        this.#reconcile(input, input.value, { prefix: input.value.slice(0, sel) });
    }

    #reconcile(input, stream_next, { prefix = null, caret_fmt = null, silent = false } = {}) {
        let st = this.#states.get(input);
        let ctx = { raw: st.result?.raw ?? '', value: input.value, input };
        let best = run_all(st.defs, stream_next, ctx);
        if (!best) return;

        let { result, def, mask_id } = best;

        if (st.max_raw != null && result.raw.length > st.max_raw) {
            best = run_all(st.defs, result.stream.slice(0, cap(result, st.max_raw)), ctx);
            ({ result, def, mask_id } = best);
        }

        if (!def.numeral && !in_range(def.names, { ...result.groups, null: result.raw }, this.#params))
            result.complete = false;

        let text = this.#text_for(input, result);

        if (input.value !== text) input.value = text;
        st.rendered = text;

        if (caret_fmt == null && prefix != null && document.activeElement === input)
            caret_fmt = caret_for(result, run(def, prefix, { input }).stream.length);
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

        if (this.#validate_on(st) && input.setCustomValidity)
            input.setCustomValidity(!result.stream || result.complete ? '' : this.#validation_message(input, st));

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
            if (this.#params.placeholder == 'always') return render(result, 'always');
            return this.#params.placeholder == false ? '' : render(result, true);
        }
        return render(result, this.#params.placeholder);
    }

    #state_of(input, st) {
        return {
            raw: st.result?.raw ?? '',
            formatted: input.value,
            complete: st.result?.complete ?? false,
            mask_id: st.mask_id,
            progress: st.result?.raw.length ?? 0,
            groups: { ...st.result?.groups }
        };
    }

    #validate_on(st) {
        let v = this.#params.validate;
        return v === true || (v == null && st.coerced != null);
    }

    #validation_message(input, st) {
        let custom = typeof this.validation_message == 'function'
            ? this.validation_message
            : (this.#params.validation_message ?? st.def?.message);
        if (typeof custom == 'function') return custom(input, this.#state_of(input, st)) || '';
        if (typeof custom == 'string')   return custom;

        if (st.coerced == 'email')                     return 'Введите корректный адрес электронной почты';
        if (st.coerced == 'number' || st.def?.numeral) return 'Введите число в допустимом диапазоне';
        return 'Заполните поле полностью';
    }
}
