import Mask from '../../mask/index.js';
import {
    WEEKDAYS, month_grid, choose, title, shift, today, parse_iso, from_display, to_display,
    problem, split, join,
} from './_calendar.js';

// Маска поля: дата набирается целыми группами, как в нативном input type=date.
const MASK = {
    mask: '{dd:00}.{mm:00}.{yyyy:0000}',
    placeholder: 'always',
    edit: 'whole',
    align: 'right',
    pad: '0',
    validate: false,
    groups: {
        dd:   { filler: 'ДД',   min: 1, max: 31 },
        mm:   { filler: 'ММ',   min: 1, max: 12 },
        yyyy: { filler: 'ГГГГ', min: 1 },
    },
};

const ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';

// Календарь: поле с маской ДД.ММ.ГГГГ (или два — для диапазона), кнопка и всплывающая сетка
// месяца; inline — только сетка с кнопками "Сбросить" и "Выбрать". В форму уходит ISO из
// скрытых полей: name — одиночная дата, name_from и name_to — диапазон.
// Регистрация — App.create(datepicker); Mask входит в бандл, App — нет.
export default {
    app: 'datepicker',

    name: '',
    range: false,
    inline: false,
    required: false,
    // ISO 'YYYY-MM-DD'; диапазон — 'YYYY-MM-DD/YYYY-MM-DD'. Меняется при выборе.
    value: '',
    min: '',
    max: '',
    // id первого поля — для <label for>.
    inputId: '',

    messages: {
        required:   'Заполните поле',
        incomplete: 'Введите дату полностью',
        invalid:    'Такой даты нет',
        min:        'Дата не раньше {date}',
        max:        'Дата не позже {date}',
        order:      'Конец периода раньше начала',
    },

    // Выбор в сетке. В inline-режиме и на середине диапазона он ещё не значение.
    from: null,
    to: null,
    year: 0,
    month: 0,
    is_open: false,
    invalid: false,
    days: [],
    weekdays: WEEKDAYS,

    get caption() {
        return this.year ? title(this.year, this.month) : '';
    },

    template: `
<div class="datepicker" #class="{ 'datepicker--range': range, 'datepicker--inline': inline, 'datepicker--open': is_open, 'datepicker--invalid': invalid }">
    <div class="datepicker__field" #show="!inline">
        <input class="datepicker__input" datepicker-from type="text" inputmode="numeric" autocomplete="off" id="{{ inputId }}" required="{{ required }}">
        <span class="datepicker__dash" #show="range" aria-hidden="true">—</span>
        <input class="datepicker__input" datepicker-to type="text" inputmode="numeric" autocomplete="off" aria-label="Конец периода" #show="range" required="{{ required && range }}">
        <button class="datepicker__toggle" type="button" aria-label="Открыть календарь" aria-haspopup="dialog" aria-expanded="{{ is_open }}" @click="toggle()">${ICON}</button>
    </div>
    <input type="hidden" datepicker-value="from" name="{{ name ? (range ? name + '_from' : name) : '' }}">
    <input type="hidden" datepicker-value="to" name="{{ name && range ? name + '_to' : '' }}" disabled="{{ !range }}">
    <div class="datepicker__popup" role="dialog" aria-label="Выбор даты" hidden="{{ !inline && !is_open }}">
        <div class="datepicker__nav">
            <button class="datepicker__prev" type="button" aria-label="Предыдущий месяц" @click="go(-1)">‹</button>
            <span class="datepicker__caption" aria-live="polite">{{ caption }}</span>
            <button class="datepicker__next" type="button" aria-label="Следующий месяц" @click="go(1)">›</button>
        </div>
        <div class="datepicker__grid">
            <span class="datepicker__weekday" aria-hidden="true" #for="day in weekdays">{{ day }}</span>
            <button class="datepicker__day" type="button" #for="cell in days" #key="$index"
                #class="{ 'datepicker__day--other': cell.other, 'datepicker__day--today': cell.today, 'datepicker__day--selected': cell.selected, 'datepicker__day--in-range': cell.in_range, 'datepicker__day--range-from': cell.range_from, 'datepicker__day--range-to': cell.range_to }"
                disabled="{{ cell.disabled }}" aria-pressed="{{ cell.selected }}" aria-label="{{ cell.label }}"
                @click="pick(cell.iso)">{{ cell.day }}</button>
        </div>
        <div class="datepicker__buttons" #show="inline">
            <button class="datepicker__reset" type="button" @click="clear()">Сбросить</button>
            <button class="datepicker__apply" type="button" @click="apply()">Выбрать</button>
        </div>
    </div>
</div>`,

    setup() {
        // Свой массив на экземпляр: значение из конфига общее для всех <st-app app="datepicker">.
        this.days = Array.from({ length: 42 }, () => ({
            iso: '', day: 0, label: '', other: false, today: false, disabled: false,
            selected: false, in_range: false, range_from: false, range_to: false,
        }));
    },

    events: {
        rendered: function() {
            const self = this;

            self._abort?.abort();
            self._abort = new AbortController();
            const signal = self._abort.signal;

            self._inputs = [self.querySelector('[datepicker-from]'), self.querySelector('[datepicker-to]')];
            self._hidden = [self.querySelector('[datepicker-value="from"]'), self.querySelector('[datepicker-value="to"]')];
            self._mask = new Mask({ target: self._inputs, ...MASK });
            self._initial = self.value;

            for (const input of self._inputs) {
                input.addEventListener('input', () => self._typed(), { signal });
                input.addEventListener('blur', () => { self.invalid = !self._valid(); }, { signal });
                input.addEventListener('invalid', () => { self.invalid = true; }, { signal });
            }

            self.addEventListener('keydown', e => {
                if (e.key == 'Escape' && self.is_open) {
                    self.close();
                    self.querySelector('.datepicker__toggle')?.focus();
                }
            }, { signal });

            // Слушатель на document снимается сам, когда календарь пропал из DOM.
            document.addEventListener('click', e => {
                if (!self.isConnected) return self._abort.abort();
                if (self.is_open && !e.composedPath().includes(self)) self.close();
            }, { signal });

            // Нативный reset не трогает скрытые поля (их value — атрибут), а маска чистит видимые
            // в своей микрозадаче: начальное значение возвращаем следующей задачей, после неё.
            self.closest('form')?.addEventListener('reset', () => setTimeout(() => {
                self._load(self._initial);
                self.invalid = false;
            }), { signal });

            // Значение из кода или атрибута :value; своё _write совпадает с _value и пропускается.
            if (!self._watching) self._watching = self.watch('value', value => {
                if (value !== self._value) self._load(value);
            });

            self._load(self.value);
        }
    },

    // Перечитать значение из скрытых полей: после form.fill() или записи value из кода.
    refresh() {
        let [from, to] = this._hidden.map(input => input.value);
        this._load(this.range ? join({ from, to }, true) : from);
    },

    open() {
        if (this.inline || this.is_open) return;
        this._view(this.from);
        this.is_open = true;
        this.dispatchEvent('datepicker:open', null, { bubbles: true });
    },

    close() {
        if (this.inline || !this.is_open) return;
        this.is_open = false;
        // Незаконченный диапазон не остаётся висеть в сетке.
        this._select(split(this._value));
        this.dispatchEvent('datepicker:close', null, { bubbles: true });
    },

    toggle() {
        this.is_open ? this.close() : this.open();
    },

    go(delta) {
        let { year, month } = shift(this.year, this.month, delta);
        this.year = year;
        this.month = month;
        this._paint();
    },

    pick(date) {
        let next = choose({ from: this.from, to: this.to }, date, this.range);
        this._select(next);
        if (this.inline || (this.range && !next.to)) return;
        this._commit();
        this.close();
    },

    apply() {
        this._commit();
    },

    clear() {
        this._select({ from: null, to: null });
        this._commit();
        this.close();
    },

    // Значение → сетка, поля и скрытые поля, без событий изменения.
    _load(value) {
        let { from, to } = split(value);
        if (!this.range) to = null;
        this._select({ from, to });
        this._view(from);
        this._write({ from, to });
        this._emitted = this._value;
        this._check();
    },

    _select({ from, to }) {
        this.from = from;
        this.to = to;
        this._paint();
    },

    // Выбор → значение: поля, скрытые поля, value и события, как от пользователя.
    _commit() {
        let parts = { from: this.from, to: this.range ? this.to : null };
        this._write(parts);
        this._check();
        this.invalid = !this._valid();
        this._emit(parts);
    },

    _write({ from, to }, visible = true) {
        this._value = join({ from, to }, this.range);
        this.value = this._value;
        this._hidden[0].value = from ?? '';
        this._hidden[1].value = to ?? '';
        if (!visible) return;

        this._silent = true;
        this._inputs.forEach((input, i) => this._mask.set(input, to_display(i ? to : from).replace(/\D/g, '')));
        this._silent = false;
    },

    // События — только когда значение правда сменилось: набор по цифре даёт input на каждую.
    _emit(parts) {
        if (this._emitted === this._value) return;
        this._emitted = this._value;

        for (const input of this._hidden.filter(input => !input.disabled)) {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.dispatchEvent('datepicker:change', { ...parts, value: this._value }, { bubbles: true });
    },

    // Набор с клавиатуры: полная и существующая дата в границах становится значением сразу.
    _typed() {
        if (this._silent) return;

        let [from, to] = this._inputs.map(input => from_display(input.value));
        if (from && problem(from, this.min, this.max)) from = null;
        if (to && problem(to, this.min, this.max)) to = null;
        if (!this.range) to = null;

        this._write({ from, to }, false);
        this._select({ from, to });
        this._view(to ?? from);
        this._check();
        if (this.invalid) this.invalid = !this._valid();
        this._emit({ from, to });
    },

    // Сообщения проверки на видимые поля: их видит форма и reportValidity().
    _check() {
        let [first, second] = this._inputs;
        first.setCustomValidity(this._problem(first));
        second.setCustomValidity(this.range ? this._problem(second) : '');

        if (this.range && !first.validationMessage && !second.validationMessage) {
            let [from, to] = this._inputs.map(input => from_display(input.value));
            if (from && to && to < from) second.setCustomValidity(this.messages.order);
        }
    },

    _problem(input) {
        let state = this._mask.state(input);
        if (!state || state.empty) return this.required ? this.messages.required : '';
        if (!state.complete) return this.messages.incomplete;

        let date = from_display(input.value);
        let reason = date ? problem(date, this.min, this.max) : 'invalid';
        if (!reason) return '';
        return this.messages[reason].replace('{date}', to_display(reason == 'min' ? this.min : this.max));
    },

    _valid() {
        return this._inputs.every(input => !input.validationMessage);
    },

    // Месяц на экране: месяц даты, иначе сегодняшний, прижатый к min/max.
    _view(date) {
        let now = today();
        if (this.min && now < this.min) now = this.min;
        if (this.max && now > this.max) now = this.max;
        let { year, month } = parse_iso(date) ?? parse_iso(now);
        this.year = year;
        this.month = month;
        this._paint();
    },

    // Ячейки правятся на месте: #for с #key="$index" переиспользует кнопки, фокус не теряется.
    _paint() {
        if (!this.year || this.days.length != 42) return;
        let grid = month_grid(this.year, this.month, { from: this.from, to: this.to, min: this.min, max: this.max });
        grid.forEach((cell, i) => Object.assign(this.days[i], cell));
    },
};
