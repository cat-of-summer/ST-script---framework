export default class st_typograf {
    static #marker    = Symbol();
    static #originals = new WeakMap();
    static #observers = new WeakMap();

    static #SHORT_WORDS = new Set([
        'в','во','на','по','с','со','к','ко','у','о','об','обо','за','из','изо','до','от','при',
        'под','подо','над','надо','без','для','про','через','сквозь','между','меж','перед','передо',
        'около','среди','кроме','вокруг','вдоль','против','ради','вместо','внутри','сверху',
        'снизу','возле','напротив','благодаря','согласно','вопреки',
        'и','а','но','да','или','либо','что','чтоб','чтобы','как','если','ибо','хотя','пока',
        'когда','куда','откуда','зачем','почему',
        'же','ли','бы','б','ведь','лишь','уж','аж','то','ни','не','ну','вон','вот',
    ]);

    static #SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','TEXTAREA','KBD','SAMP']);

    static #word_regex = (() => {
        const escaped = [...this.#SHORT_WORDS]
            .sort((a, b) => b.length - a.length)
            .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|');

        return new RegExp(`(?<=^|[\\s(«„"'\\[])(${escaped})(\\s+)(?=\\S)`, 'gi');
    })();

    static #digit_regex = /(\d) +(?=\S)/g;
    static #dash_regex  = / +(?=[—–] )/g;

    static #find_element(param) {
        try {
            return param instanceof Element
                ? param
                : document.querySelector(param);
        } catch {
            return undefined;
        }
    }

    static preventWidows(entity) {
        const root = st_typograf.#find_element(entity);
        if (!root) return;
        if (root[st_typograf.#marker]) return;

        st_typograf.#mark_subtree(root);

        const nodes = st_typograf.#collect_text_nodes(root);
        for (const node of nodes) {
            st_typograf.#originals.set(node, node.nodeValue);
            node[st_typograf.#marker] = true;
            st_typograf.#apply(node);
        }

        st_typograf.#attach_observers(root);
    }

    static #typograf(text) {
        return text
            .replace(st_typograf.#word_regex,  (m, word) => word + ' ')
            .replace(st_typograf.#digit_regex, '$1 ')
            .replace(st_typograf.#dash_regex,  ' ');
    }

    static #apply(node) {
        if (!st_typograf.#originals.has(node))
            st_typograf.#originals.set(node, node.nodeValue);

        const fresh = st_typograf.#typograf(st_typograf.#originals.get(node));
        if (node.nodeValue !== fresh) node.nodeValue = fresh;
    }

    static #mark_subtree(root) {
        root[st_typograf.#marker] = true;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        let el;
        while ((el = walker.nextNode())) el[st_typograf.#marker] = true;
    }

    static #collect_text_nodes(root) {
        const nodes = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (!node.nodeValue || !node.nodeValue.trim())
                    return NodeFilter.FILTER_REJECT;

                for (let p = node.parentElement; p && p !== root.parentElement; p = p.parentElement) {
                    if (st_typograf.#SKIP_TAGS.has(p.tagName))
                        return NodeFilter.FILTER_REJECT;

                    const ce = p.getAttribute && p.getAttribute('contenteditable');
                    if (ce === '' || ce === 'true')
                        return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
            }
        });

        let n;
        while ((n = walker.nextNode())) nodes.push(n);
        return nodes;
    }

    static #reapply_all(root) {
        const nodes = st_typograf.#collect_text_nodes(root);
        for (const node of nodes) {
            if (!node[st_typograf.#marker]) {
                st_typograf.#originals.set(node, node.nodeValue);
                node[st_typograf.#marker] = true;
            }
            st_typograf.#apply(node);
        }
    }

    static #mutating_run(state, fn) {
        state.mutating = true;
        try { fn(); } finally {
            if (state.mutation) state.mutation.takeRecords();
            state.mutating = false;
        }
    }

    static #flush_queue(root, state) {
        const idle = window.requestIdleCallback
            ? window.requestIdleCallback.bind(window)
            : (cb) => setTimeout(cb, 0);

        if (state.flush_scheduled) return;
        state.flush_scheduled = true;

        idle(() => {
            state.flush_scheduled = false;

            st_typograf.#mutating_run(state, () => {
                for (const node of state.queue) {
                    if (!node.parentNode) continue;
                    if (!st_typograf.#originals.has(node))
                        st_typograf.#originals.set(node, node.nodeValue);
                    node[st_typograf.#marker] = true;
                    st_typograf.#apply(node);
                }
                state.queue.clear();
            });
        });
    }

    static #attach_observers(root) {
        const state = {
            mutation: null, intersection: null, resize: null,
            mutating: false, visible: false,
            pending_resize: false, flush_scheduled: false,
            queue: new Set(),
        };
        st_typograf.#observers.set(root, state);

        state.mutation = new MutationObserver(records => {
            if (state.mutating) return;

            for (const r of records) {
                if (r.type === 'characterData') {
                    if (r.target.parentNode && r.target.nodeValue && r.target.nodeValue.trim())
                        state.queue.add(r.target);
                    continue;
                }

                if (r.type === 'childList') {
                    for (const added of r.addedNodes) {
                        if (added.nodeType === Node.TEXT_NODE) {
                            if (added.nodeValue && added.nodeValue.trim())
                                state.queue.add(added);
                        } else if (added.nodeType === Node.ELEMENT_NODE) {
                            st_typograf.#mark_subtree(added);
                            for (const tn of st_typograf.#collect_text_nodes(added))
                                state.queue.add(tn);
                        }
                    }
                }
            }

            if (state.visible && state.queue.size)
                st_typograf.#flush_queue(root, state);
        });
        state.mutation.observe(root, { subtree: true, childList: true, characterData: true });

        state.intersection = new IntersectionObserver(entries => {
            for (const e of entries) {
                state.visible = e.isIntersecting;
                if (!e.isIntersecting) continue;

                if (state.queue.size)
                    st_typograf.#flush_queue(root, state);

                if (state.pending_resize) {
                    state.pending_resize = false;
                    st_typograf.#mutating_run(state, () => st_typograf.#reapply_all(root));
                }
            }
        }, { rootMargin: '200px' });
        state.intersection.observe(root);

        state.resize = new ResizeObserver(() => {
            if (state.mutating) return;
            if (!state.visible) { state.pending_resize = true; return; }
            st_typograf.#mutating_run(state, () => st_typograf.#reapply_all(root));
        });
        state.resize.observe(root);
    }
}
