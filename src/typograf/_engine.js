// Чистая типографика Typograf: без DOM, на вход — строки.
//
// glue(parts) получает тексты подряд идущих текстовых узлов одного «прогона» (абзац, строка до <br>,
// кусок между пропускаемыми элементами) и возвращает массив той же длины. Части склеиваются в одну
// строку, поэтому «в <b>доме</b>» клеится так же, как «в доме». Правка одна: пробельный промежуток
// между двумя кусками текста заменяется одним неразрывным пробелом. Остальной текст не меняется.

const NBSP = ' ';

export const RULES = {
    words: true,        // предлог, союз, частица — к следующему слову: «в доме»
    particles: true,    // же, ли, бы — к предыдущему слову: «он же»
    numbers: true,      // число — к следующему слову: «2024 год», «10 000»
    dash: true,         // слово — к тире после него: «Москва — столица»
    abbr: true,         // сокращение — к следующему слову: «т. е.», «№ 5», «г. Москва»
    initials: true,     // инициалы — к фамилии: «А. С. Пушкин», «Пушкин А. С.»
    last_word: true,    // последнее слово прогона не остаётся на строке одно
    max_chain: 14,      // склеенная цепочка не длиннее стольких символов; 0 — без предела
};

const WORDS = new Set([
    'в','во','на','по','с','со','к','ко','у','о','об','обо','за','из','изо','до','от','при',
    'под','подо','над','надо','без','для','про','через','сквозь','между','меж','перед','передо',
    'около','среди','кроме','вокруг','вдоль','против','ради','вместо','внутри','сверху',
    'снизу','возле','напротив','благодаря','согласно','вопреки',
    'и','а','но','да','или','либо','что','чтоб','чтобы','как','если','ибо','хотя','пока',
    'когда','куда','откуда','зачем','почему',
    'ведь','лишь','уж','аж','то','ни','не','ну','вон','вот',
]);

const PARTICLES = new Set(['же', 'ж', 'ли', 'ль', 'бы', 'б']);

const ABBR = new Set([
    'т.', 'тыс.', 'млн', 'млн.', 'млрд', 'млрд.', 'г.', 'гг.', 'ул.', 'пр.', 'пер.', 'кв.',
    'стр.', 'рис.', 'табл.', 'им.', 'см.', 'ок.', 'св.', '№', '§',
]);

const DASHES = new Set(['—', '–', '-']);

// открывающая пунктуация перед словом и закрывающая после
const OPEN = /^[(«„"'“‘\[]+/;
const CLOSE = /[)»"'”’\].,:;!?…]+$/;

const core = chunk => chunk.replace(OPEN, '').replace(CLOSE, '').toLowerCase();
const bare = chunk => chunk.replace(OPEN, '').toLowerCase();

const INITIAL = /^[A-ZА-ЯЁ]\.$/;
const CAPITAL = /^[(«„"'“‘\[]*[A-ZА-ЯЁ]/;

// Промежуток, где разрыва и так нет, оставляется как написал автор: «10&nbsp;000», узкий пробел
const UNBREAKABLE = /^[   ]+$/;

// Склеить ли промежуток между кусками left и right (куски — без пробелов, с пунктуацией)
function joins(left, right, rules) {
    let l = bare(left);

    if (rules.words && !CLOSE.test(left) && WORDS.has(l)) return true;
    if (rules.particles && PARTICLES.has(core(right))) return true;
    if (rules.numbers && /\d$/.test(left)) return true;
    if (rules.dash && DASHES.has(right)) return true;
    if (rules.abbr && ABBR.has(l)) return true;
    if (rules.initials && (INITIAL.test(left) && CAPITAL.test(right)
                           || INITIAL.test(right) && CAPITAL.test(left))) return true;
    return false;
}

// Короткий предлог, союз или частица (до SHORT букв) висит в конце строки заметнее всего: его
// связь со следующим словом max_chain не рвёт — «в~Ростове-на-Дону», «а~прямой».
const SHORT = 3;

const hard = (left, rules) => {
    let l = bare(left);
    return rules.words && !CLOSE.test(left) && WORDS.has(l) && l.length <= SHORT;
};

export function glue(parts, rules = RULES) {
    rules = { ...RULES, ...rules };

    let source = parts.join('');
    let tokens = [...source.matchAll(/\s+|\S+/g)];
    // по кодовым единицам UTF-16, как индексы matchAll: пробелы все в BMP, суррогаты не задеваются
    let out = source.split('');

    // индексы кусков текста среди токенов
    let words = [];
    tokens.forEach((t, i) => { if (!/^\s/.test(t[0])) words.push(i); });

    // join[w] — судьба промежутка перед куском w: true — клеить, false — нет, 'kept' — уже неразрывный
    let word = w => tokens[words[w]][0];
    let join = words.map((_, w) => {
        if (!w) return false;
        if (UNBREAKABLE.test(tokens[words[w] - 1][0])) return 'kept';
        return rules.last_word && w == words.length - 1 || joins(word(w - 1), word(w), rules);
    });

    // Цепочка длиннее max_chain не влезет в узкую колонку. Справа налево: отпускается самая
    // дальняя связь, ближние («над~городом») остаются. Авторские неразрывные — в длине, но не рвутся.
    // Связь короткого предлога (hard) тоже не рвётся: если из-за неё цепочка длиннее предела,
    // отпускаются обычные связи правее, от ближней: «А~когда наступал», а не «А когда~наступал».
    // Нечего отпустить — цепочка остаётся длиннее предела: висящий предлог хуже.
    if (rules.max_chain > 0 && words.length) {
        // длина куска цепочки от слова a до слова b включительно, промежутки по одному символу
        let span = (a, b) => { let n = b - a; for (let k = a; k <= b; k++) n += word(k).length; return n; };

        for (let w = words.length - 1, end = w, chain = word(w).length; w > 0; w--) {
            let next = chain + 1 + word(w - 1).length;

            if (join[w] === true && next > rules.max_chain) {
                if (!hard(word(w - 1), rules)) join[w] = false;
                else
                    for (let v = w + 1; v <= end && next > rules.max_chain; v++)
                        if (join[v] === true && !hard(word(v - 1), rules)) {
                            join[v] = false;
                            end = v - 1;
                            next = span(w - 1, end);
                        }
            }

            if (join[w]) chain = next;
            else { chain = word(w - 1).length; end = w - 1; }
        }
    }

    join.forEach((glued, w) => {
        if (glued !== true) return;
        // промежуток целиком → один NBSP; символы-хвосты удаляются, длина частей может сократиться
        let gap = tokens[words[w] - 1];
        out[gap.index] = NBSP;
        for (let k = 1; k < gap[0].length; k++) out[gap.index + k] = '';
    });

    // обратно по границам частей
    let at = 0;
    return parts.map(part => out.slice(at, at += part.length).join(''));
}

export const text = (str, rules) => glue([str], rules)[0];
