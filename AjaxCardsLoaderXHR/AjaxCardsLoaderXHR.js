/**
 * AjaxCardsLoaderXHR
 * Чистый JS — делает запрос через XMLHttpRequest, парсит HTML-ответ и
 * вставляет/замещает карточки согласно маппингам.
 *
 * Constructor:
 *   new AjaxCardsLoaderXHR(mappings, options = {})
 *
 * mappings: Array of {
 *   method: 'replace' | 'append', // действие
 *   current: string,              // селектор в текущем документе (querySelectorAll)
 *   new?: string                  // селектор в пришедшем HTML (по умолчанию = current)
 * }
 *
 * options: Object {
 *   mutator?: function(nodes: Element[]) -> void  // вызывается с новыми нодами ДО вставки в документ
 *   on_paste?: function(nodes: Element[]) -> void // вызывается с вставленными нодами ПОСЛЕ вставки
 * }
 *
 * Public methods:
 *   load(urlOrOptions, extraOptions = {}) -> Promise(report)
 *     - urlOrOptions: строка URL или объект { url, method, headers, body, timeout, withCredentials }
 *     - extraOptions: дополнительные XHR опции, если передали строку в первом аргументе
 *   abort() -> void (прерывает текущий запрос)
 *   getLastXhr() -> XMLHttpRequest | null
 *
 * Notes:
 * - Ответ ожидается как HTML (text/html). Мы парсим responseText через DOMParser.
 * - Для фильтрации дубликатов используем id и outerHTML.
 * - mutator и on_paste применяются ко всем маппингам.
 */

class AjaxCardsLoaderXHR {
  /**
   * @param {Array<Object>} mappings
   * @param {Object} options
   * @param {Function} options.mutator - функция для преобразования новых нод перед вставкой
   * @param {Function} options.on_paste - функция для обработки вставленных нод
   */
  constructor(mappings = [], options = {}) {
    if (!Array.isArray(mappings)) throw new TypeError('mappings must be an array');
    this.mappings = mappings.map((m, i) => {
      if (!m || typeof m.current !== 'string') {
        throw new TypeError(`mapping[${i}].current is required and must be a selector string`);
      }
      const method = (m.method || 'replace').toLowerCase();
      if (!['replace', 'append'].includes(method)) {
        throw new TypeError(`mapping[${i}].method must be 'replace' or 'append'`);
      }
      return {
        method,
        currentSelector: m.current,
        newSelector: typeof m.new === 'string' ? m.new : m.current
      };
    });

    // Сохраняем mutator и on_paste
    if (options.mutator && typeof options.mutator !== 'function') {
      throw new TypeError('options.mutator must be a function');
    }
    if (options.on_paste && typeof options.on_paste !== 'function') {
      throw new TypeError('options.on_paste must be a function');
    }
    this.mutator = options.mutator || null;
    this.on_paste = options.on_paste || null;

    /** @type {XMLHttpRequest|null} */
    this._lastXhr = null;
  }

  /** Возвращает последний XHR объект (или null) */
  getLastXhr() {
    return this._lastXhr;
  }

  /** Прерывает последний запрос, если он запущен */
  abort() {
    if (this._lastXhr && this._lastXhr.readyState !== 4) {
      try { this._lastXhr.abort(); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Парсит HTML-строку в Document
   * @param {string} htmlString
   * @returns {Document}
   */
  parseHTML(htmlString) {
    const parser = new DOMParser();
    return parser.parseFromString(htmlString, 'text/html');
  }

  /**
   * Глубокий клон узла
   * @param {Node} node
   * @returns {Node}
   */
  cloneNodeDeep(node) {
    return node.cloneNode(true);
  }

  /**
   * Убирает дубликаты из массива узлов по id и outerHTML
   * @param {Element[]} nodes
   * @returns {Element[]}
   */
  uniqueByIdAndHTML(nodes) {
    const seenIds = new Set();
    const seenHTML = new Set();
    const result = [];
    for (const n of nodes) {
      const id = n.id ? String(n.id) : null;
      const html = n.outerHTML ? String(n.outerHTML).trim() : null;
      if (id && seenIds.has(id)) continue;
      if (html && seenHTML.has(html)) continue;
      if (id) seenIds.add(id);
      if (html) seenHTML.add(html);
      result.push(n);
    }
    return result;
  }

  /**
   * Вставляет новые элементы перед referenceNode (если referenceNode === null -> append)
   * @param {Node} parent
   * @param {Node|null} referenceNode
   * @param {Element[]} newNodes
   */
  insertNodesBefore(parent, referenceNode, newNodes) {
    for (const node of newNodes) {
      parent.insertBefore(node, referenceNode);
    }
  }

  /**
   * Вспомогательный XHR wrapper, возвращает Promise и сохраняет this._lastXhr
   * @param {Object} opts - { url, method, headers, body, timeout, withCredentials }
   * @returns {Promise<string>} - резолвится responseText
   */
  _xhrRequest(opts = {}) {
    const url = String(opts.url || '');
    if (!url) return Promise.reject(new TypeError('url is required in xhr options'));

    const method = (opts.method || 'GET').toUpperCase();
    const headers = opts.headers || {};
    const body = typeof opts.body !== 'undefined' ? opts.body : null; // string | FormData | null
    const timeout = Number(opts.timeout || 0); // ms, 0 = no timeout
    const withCredentials = !!opts.withCredentials;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this._lastXhr = xhr;

      xhr.open(method, url, true);
      xhr.withCredentials = withCredentials;

      // Установим таймаут только если > 0
      if (timeout > 0) {
        xhr.timeout = timeout;
      }

      // Set headers (don't set Content-Type if body is FormData)
      for (const name in headers) {
        if (!Object.prototype.hasOwnProperty.call(headers, name)) continue;
        // если body — FormData и имя заголовка Content-Type — пропускаем
        if (body instanceof FormData && name.toLowerCase() === 'content-type') continue;
        try { xhr.setRequestHeader(name, headers[name]); } catch (e) { /* ignore invalid header */ }
      }

      xhr.responseType = 'text'; // ожидаем html как текст

      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) return;
        // готово (success или error)
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText);
        } else {
          const msg = `XHR failed: status ${xhr.status} ${xhr.statusText}`;
          const err = new Error(msg);
          // attach low-level info
          err.status = xhr.status;
          err.statusText = xhr.statusText;
          err.xhr = xhr;
          reject(err);
        }
      };

      xhr.ontimeout = () => {
        const err = new Error('XHR timeout');
        err.code = 'ETIMEOUT';
        err.xhr = xhr;
        reject(err);
      };

      xhr.onerror = () => {
        const err = new Error('XHR network error');
        err.xhr = xhr;
        reject(err);
      };

      try {
        // Если тело не указано и метод GET/HEAD — отправляем null
        if (body === null || typeof body === 'undefined') {
          xhr.send(null);
        } else {
          xhr.send(body);
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Основной метод: делает XHR и применяет маппинги.
   * @param {string|Object} urlOrOptions - строка URL или объект { url, method, headers, body, timeout, withCredentials }
   * @param {Object} extraOptions - доп. опции если первый аргумент строка
   * @returns {Promise<Object>} report
   */
  load(urlOrOptions, extraOptions = {}) {
    const xhrOpts = {};
    if (typeof urlOrOptions === 'string') {
      xhrOpts.url = urlOrOptions;
      Object.assign(xhrOpts, extraOptions);
    } else if (typeof urlOrOptions === 'object' && urlOrOptions !== null) {
      Object.assign(xhrOpts, urlOrOptions);
    } else {
      return Promise.reject(new TypeError('First argument must be a URL string or options object'));
    }

    // Выполняем XHR
    return this._xhrRequest(xhrOpts).then((responseHtml) => {
      // Парсим ответ
      const remoteDoc = this.parseHTML(responseHtml);
      const mappingReports = [];

      this.mappings.forEach((map, idx) => {
        const { method, currentSelector, newSelector } = map;

        // Найдём новые ноды в ответе
        const foundNew = Array.from(remoteDoc.querySelectorAll(newSelector || currentSelector));
        // Клонируем (чтобы не отрывать из remoteDoc)
        const clonedNewNodes = foundNew.map(n => this.cloneNodeDeep(n));
        const uniqNewNodes = this.uniqueByIdAndHTML(clonedNewNodes);

        // Вызываем mutator перед вставкой узлов
        if (this.mutator) {
          this.mutator(uniqNewNodes);
        }

        // Найдём текущие ноды на странице
        const currentNodes = Array.from(document.querySelectorAll(currentSelector));

        const report = {
          mappingIndex: idx,
          method,
          currentSelector,
          newSelector,
          foundInResponse: foundNew.length,
          foundOnPage: currentNodes.length,
          added: 0,
          removed: 0,
          skipped: 0
        };

        if (uniqNewNodes.length === 0) {
          mappingReports.push(report);
          return;
        }

        if (method === 'replace') {
          if (currentNodes.length > 0) {
            const first = currentNodes[0];
            const parent = first.parentElement || document.body;
            const toInsert = uniqNewNodes.map(n => this.cloneNodeDeep(n));
            this.insertNodesBefore(parent, first, toInsert);
            currentNodes.forEach(n => n.remove());
            report.added = toInsert.length;
            report.removed = currentNodes.length;
            // Вызываем on_paste после вставки
            if (this.on_paste) {
              this.on_paste(toInsert);
            }
          } else {
            // fallback: append в body
            const toInsert = uniqNewNodes.map(n => this.cloneNodeDeep(n));
            toInsert.forEach(n => document.body.appendChild(n));
            report.added = toInsert.length;
            // Вызываем on_paste после вставки
            if (this.on_paste) {
              this.on_paste(toInsert);
            }
          }
        } else if (method === 'append') {
          if (currentNodes.length === 0) {
            const toInsert = uniqNewNodes.map(n => this.cloneNodeDeep(n));
            toInsert.forEach(n => document.body.appendChild(n));
            report.added = toInsert.length;
            // Вызываем on_paste после вставки
            if (this.on_paste) {
              this.on_paste(toInsert);
            }
          } else {
            // уникальные родители currentNodes
            const parents = [];
            const parentsSet = new Set();
            currentNodes.forEach(n => {
              const p = n.parentElement;
              if (!p) return;
              if (!parentsSet.has(p)) {
                parents.push(p);
                parentsSet.add(p);
              }
            });

            parents.forEach(parent => {
              const existingChildren = Array.from(parent.children);
              const existingIds = new Set(existingChildren.filter(c => c.id).map(c => c.id));
              const existingHTML = new Set(existingChildren.map(c => c.outerHTML.trim()));

              const nodesToAppend = [];
              uniqNewNodes.forEach(n => {
                const id = n.id ? String(n.id) : null;
                const html = n.outerHTML ? String(n.outerHTML).trim() : null;
                if (id && existingIds.has(id)) { report.skipped++; return; }
                if (html && existingHTML.has(html)) { report.skipped++; return; }
                nodesToAppend.push(this.cloneNodeDeep(n));
              });

              nodesToAppend.forEach(n => parent.appendChild(n));
              report.added += nodesToAppend.length;
              // Вызываем on_paste после вставки в каждого родителя
              if (this.on_paste && nodesToAppend.length > 0) {
                this.on_paste(nodesToAppend);
              }
            });
          }
        }

        mappingReports.push(report);
      });

      return { mappingReports };
    }).catch(err => {
      // прокидываем ошибку дальше (пользователь сможет catch)
      throw err;
    });
  }
}
