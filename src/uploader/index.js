import { find, own } from '../_traits/hasInstanceSymbol.js';

export default class Uploader {
    static find = find;

    #targets = [];

    // Убрать все файлы из всех загрузчиков этого экземпляра.
    clear() {
        this.#targets.forEach(target => target.clear());
    }

    static formatSize(size) {
        const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];

        let i = 0;

        while (size >= 1024 && i < units.length - 1) {
            size /= 1024;
            i++;
        }

        return size.toFixed(1) + ' ' + units[i];
    }

    constructor(params) {
        params = {
            target: null,
            input_name: null,
            entry: '*[file-item]',
            delete_name: null,

            before_init: () => {},
            on_init: () => {},
            before_files_add: () => {},
            on_files_add: () => {},
            before_file_delete: () => {},
            on_file_delete: () => {},
            before_drop: () => {},
            on_drop: () => {},
            handle_exception: null,

            ...params,

            limits: {
                files: 0,
                file_size: 0,
                total_size: 0,
                mimes: [],
                ...(params.limits ?? {}),
            },
        };

        if (!params.input_name)
            throw new Error('Uploader: не задан input_name');

        let input_name = params.input_name.replace(/\[\]$/, '');

        params.input_name = input_name + (params.limits.files != 1 ? '[]' : '');
        params.delete_name = (params.delete_name ? params.delete_name.replace(/\[\]$/, '')  : input_name + '_to_delete') + (params.limits.files != 1 ? '[]' : '');

        // target — селектор, элемент или список элементов.
        let targets = typeof params.target == 'string'
            ? document.querySelectorAll(params.target)
            : params.target instanceof Element ? [params.target] : Array.from(params.target ?? []);

        targets.forEach(target => {
            if (find(target))
                throw new Error("Already inited");

            own(target, this);
            this.#targets.push(target);

            // События на корне загрузчика, всплывают: uploader:add, uploader:delete, uploader:error.
            const emit = (name, detail, cancelable = false) => target.dispatchEvent(
                new CustomEvent(`uploader:${name}`, { bubbles: true, cancelable, detail })
            );

            for (let [key, value] of Object.entries(params))
                if (typeof value == "function")
                    target[key] = value.bind(target);

            target.before_init(params);

            // Ошибку получает handle_exception; без него — слушатели uploader:error, а если
            // никто не вызвал preventDefault() — alert.
            const handleException = (file, message, code = null) => {
                let error = Object.assign(new Error(message), { file, code });
                let unhandled = emit('error', { error }, true);

                if (params.handle_exception)
                    return target.handle_exception(error);
                else if (unhandled)
                    alert(message);

                return false;
            }

            const createFileInput = () => Object.assign(document.createElement('input'), {
                type: 'file',
                name: params.input_name,
                multiple: params.limits.files != 1,
                hidden: true,
            });

            let files_list = target.querySelector('*[files-list]');
            let entry_template = null;

            target.files = new Map();
            target.total_size = 0;
            let last_id = 0;
            // Удаление каждой записи по id файла: им пользуется clear().
            let removers = new Map();

            target.clear = () => [...removers.values()].forEach(remove => remove());

            const createFileEntry = (file) => {
                let entry = (new DOMParser()).parseFromString(entry_template, 'text/html').body.firstElementChild;

                file._id = ++last_id;

                target.files.set(file._id, file);
                target.total_size += file.size;

                let preview = entry.querySelectorAll('img[preview]');
                let filename = entry.querySelectorAll('*[filename]');
                let fileweight = entry.querySelectorAll('*[fileweight]');
                let delete_button = entry.querySelectorAll('*[delete-button]');

                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = e => preview.forEach(p => p.src = e.target.result);
                    reader.readAsDataURL(file);
                } else {
                    preview.forEach(p => p.remove());
                }

                filename.forEach(f => f.textContent = file.name);
                fileweight.forEach(f => {
                    f.textContent = Uploader.formatSize(file.size);
                    f.setAttribute('size', file.size);
                });

                const remove = () => {
                    target.total_size = Math.max(0, target.total_size - parseInt(file.size));
                    target.files.delete(file._id);
                    removers.delete(file._id);
                    entry.remove();

                    target.on_file_delete(file);
                    emit('delete', { file });
                };
                removers.set(file._id, remove);

                delete_button.forEach(b => b.addEventListener('click', () => {
                    if (target.before_file_delete(file) === false) return;
                    remove();
                }));

                let hidden = createFileInput();

                let dt = new DataTransfer();
                dt.items.add(file);
                hidden.files = dt.files;

                entry.appendChild(hidden);

                return entry;
            }

            const createDeleteEntry = (entry) => {
                let input = entry.querySelector(`input[name^="${input_name}"]`) ?? entry.querySelector(`input[type='hidden'][value]`) ?? entry.querySelector(`input[value]`);
                let delete_button = entry.querySelectorAll('*[delete-button]');

                if (input) {
                    let preview = entry.querySelector('img[preview]');
                    let filename = entry.querySelector('*[filename]');
                    let fileweight = entry.querySelector('*[fileweight]');

                    let file = {
                        _id: ++last_id,
                        preview: preview?.src || '',
                        value: input.value,
                        name: filename?.textContent || '',
                        size: parseFloat(fileweight?.getAttribute('size') ?? fileweight?.textContent ?? 0) || 0,
                    };

                    target.files.set(file._id, file);

                    const remove = () => {
                        let hidden = Object.assign(document.createElement('input'), {
                            type: 'hidden',
                            name: params.delete_name,
                            hidden: true,
                            value: input.value
                        });
                        target.appendChild(hidden);

                        target.files.delete(file._id);
                        removers.delete(file._id);
                        target.on_file_delete(file);
                        emit('delete', { file });

                        entry.remove();
                    };
                    removers.set(file._id, remove);

                    delete_button.forEach(b => b.addEventListener('click', () => {
                        if (target.before_file_delete(file) === false) return;
                        remove();
                    }));

                    input.remove();
                } else
                    entry.remove();

                return entry;
            }

            const checkFile = (file) => {
                if (params.limits.files > 0 && target.files.size >= params.limits.files)
                    return handleException(file, `Максимум файлов: ${params.limits.files}`, 0);

                if (params.limits.file_size > 0 && file.size > params.limits.file_size)
                    return handleException(file, `Файл "${file.name}" слишком большой! Максимум ${Uploader.formatSize(params.limits.file_size)}.`, 1);

                if (params.limits.total_size > 0 && target.total_size + file.size > params.limits.total_size)
                    return handleException(file, `Превышен общий лимит! Максимальная сумма всех файлов ${Uploader.formatSize(params.limits.total_size)}.`, 2);

                if (params.limits.mimes.length > 0) {
                    let type = file.type.trim();
                    let base_type = type.split(';')[0].trim().toLowerCase();

                    for (let condition of params.limits.mimes) {
                        if (condition.endsWith('/*') && !/[\\^$.*+?()[\]{}|]/.test(condition.slice(0, -2))) {
                            if (base_type.startsWith(condition.slice(0, -1).toLowerCase())) return true;

                            continue;
                        }

                        if (/[\\^$.*+?()[\]{}|]/.test(condition)) {
                            try {
                                let re = new RegExp(condition, 'i');

                                if (re.test(type) || re.test(base_type)) return true;
                            } catch (e) {}

                            continue;
                        }

                        if (base_type === condition.toLowerCase()) return true;
                    }

                    return handleException(file, `Файл "${file.name}" имеет недопустимый тип: ${base_type}.`, 3);
                }

                return true;
            }

            const handleFiles = (files) => {
                let file_array = Array.from(files);

                target.before_files_add(file_array);

                file_array = file_array.filter(checkFile);

                if (file_array.length > 0) {
                    let fragment = document.createDocumentFragment();

                    file_array.forEach(file => {
                        fragment.appendChild(createFileEntry(file));
                    });

                    files_list.appendChild(fragment);
                }

                target.on_files_add(file_array);
                if (file_array.length > 0)
                    emit('add', { files: file_array });
            };

            try {
                let existing = target.querySelectorAll(params.entry);

                if (existing.length > 0) {
                    existing.forEach(i => {
                        let temp_node = createDeleteEntry(i);

                        if (!entry_template)
                            entry_template = temp_node.outerHTML;
                    });
                }
            } catch (e) {
                entry_template = params.entry;
            }
            // Записей нет, а entry — селектор: шаблон берётся из <template entry> внутри.
            entry_template ??= target.querySelector('template[entry]')?.innerHTML;
            if (entry_template == null)
                throw new Error('Uploader: нет шаблона записи — ни существующих записей, ни <template entry>, ни HTML в entry');
            entry_template = entry_template.trim();

            target.querySelectorAll('*[drop-zone]').forEach(zone => {
                let wasDragOver = false;

                ['dragenter', 'dragover'].forEach(event_name => zone.addEventListener(event_name, e => {
                    e.preventDefault();
                    zone.setAttribute('dragover', '');
                    if (!wasDragOver) {
                        target.before_drop();
                        wasDragOver = true;
                    }
                }));

                ['dragleave', 'drop'].forEach(event_name => zone.addEventListener(event_name, e => {
                    e.preventDefault();
                    zone.removeAttribute('dragover');
                    wasDragOver = false;
                }));

                zone.addEventListener('drop', e => {
                    e.preventDefault();
                    target.on_drop();
                    handleFiles(e.dataTransfer.files);
                });
            });

            let picker = createFileInput();
            picker.removeAttribute('name');

            picker.addEventListener('change', () => {
                handleFiles(picker.files);
                picker.value = '';
            });

            target.appendChild(picker);

            target.querySelectorAll('*[add-button]').forEach(b => b.addEventListener('click', () => picker.click()));

            target.on_init(params);
        });
    }
}