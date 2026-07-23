import { element, elements, expose, find, own } from '../_traits/hasInstanceSymbol.js';
import { build, run, run_all, render, caret_for, cap, prepare, filler } from './_engine.js';

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
            flow: true,
            rewrite: false,
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

        let defs = this.#defs
            ?? (input.getAttribute('mask') ? build(input.getAttribute('mask'), this.#base()) : this.#default_for(coerced));
        if (!defs) {
            console.warn('Mask: для поля не задана маска (ни в params.mask, ни в атрибуте mask)', input);
            return;
        }

        let numeric = coerced == 'number' || this.#params.numeral != null;
        let st = { defs, def: null, stream: '', result: null, mask_id: null, rendered: '', run: null, composing: false, handled: false, coerced, max_raw, numeric };
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

            if (st.numeric) {
                let sign = st.defs.some(d => d.numeral?.sign);
                insert = [...insert].filter(c => c >= '0' && c <= '9' || sign && c == '-').join('');
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

        for (let c of prepare(def, insert, { input })) {
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
        let stream = cells.slice(0, last + 1).map((cell, i) => cell ?? filler(def, i)).join('');

        let pos = Math.min(run(def, stream.slice(0, k), { input }).stream.length, n);
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
        let ctx = { raw: st.result?.raw ?? '', value: input.value, input };
        let best = run_all(st.defs, stream_next, ctx);
        if (!best) return;

        let { result, def, mask_id } = best;

        if (st.max_raw != null && result.raw.length > st.max_raw) {
            best = run_all(st.defs, result.stream.slice(0, cap(result, st.max_raw)), ctx);
            ({ result, def, mask_id } = best);
        }

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
            progress: st.result?.raw.length ?? 0
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
