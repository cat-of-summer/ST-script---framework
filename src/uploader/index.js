class st_uploader {
    static #instance = Symbol();

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

        let input_name = params.input_name.replace(/\[\]$/, '');

        params.input_name = input_name + (params.limits.files != 1 ? '[]' : '');
        params.delete_name = (params.delete_name ? params.delete_name.replace(/\[\]$/, '')  : input_name + '_to_delete') + (params.limits.files != 1 ? '[]' : '');

        document.querySelectorAll(params.target).forEach(target => {
            if (target[st_uploader.#instance])
                throw new Error("Already inited");

            target[st_uploader.#instance] = this;

            for (let [key, value] of Object.entries(params))
                if (typeof value == "function")
                    target[key] = value.bind(target);

            target.before_init(params);

            const handleException = (file, message, code = null) => {
                if (params.handle_exception)
                    return target.handle_exception(Object.assign(
                        new Error(message),{
                            file,
                            code
                        }
                    ));
                else
                    alert(message);

                return false;
            }

            let files_list = target.querySelector('*[files-list]');
            let entry_template = null;

            target.files = new Map();
            target.total_size = 0;

            const createFileEntry = (file) => {
                let entry = (new DOMParser()).parseFromString(entry_template, 'text/html').body.firstElementChild;

                file._id = crypto.randomUUID();

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
                    f.textContent = st_uploader.formatSize(file.size);
                    f.setAttribute('size', file.size);
                });

                delete_button.forEach(b => b.addEventListener('click', () => {
                    if (target.before_file_delete(file) === false) return;

                    target.total_size = Math.max(0, target.total_size - parseInt(file.size));
                    target.files.delete(file._id);
                    entry.remove();

                    target.on_file_delete(file)
                }));

                let hidden = Object.assign(document.createElement('input'), {
                    type: 'file',
                    name: params.input_name.replace(/\[\]$/, '') + (params.limits.files != 1 ? '[]' : ''),
                    multiple: params.limits.files != 1,
                    hidden: true,
                });

                let dt = new DataTransfer();
                dt.items.add(file);
                hidden.files = dt.files;

                entry.appendChild(hidden);

                return entry;
            }

            const createDeleteEntry = (entry) => {
                let input = entry.querySelector(`input[name^="${input_name}"]`) ?? entry.querySelector(`input[type='hidden'][value]`) ?? entry.querySelector(`input[value]`);
                let preview = entry.querySelectorAll('img[preview]');
                let filename = entry.querySelectorAll('*[filename]');
                let fileweight = entry.querySelectorAll('*[fileweight]');
                let delete_button = entry.querySelectorAll('*[delete-button]');

                if (input) {
                    let file = {
                        _id: crypto.randomUUID(),
                        preview: preview?.src || '',
                        value: input.value,
                        name: filename?.innerText || '',
                        size: parseFloat(fileweight?.innerText || 0)
                    };

                    target.files.set(file._id, file);

                    delete_button.forEach(b => b.addEventListener('click', () => {
                        if (target.before_file_delete(file) === false) return;

                        let hidden = Object.assign(document.createElement('input'), {
                            type: 'hidden',
                            name: params.delete_name,
                            hidden: true,
                            value: input.value
                        });
                        target.appendChild(hidden);

                        target.files.delete(file._id);
                        target.on_file_delete(file);

                        entry.remove();
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
                    return handleException(file, `Файл "${file.name}" слишком большой! Максимум ${st_uploader.formatSize(params.limits.file_size)}.`, 1);
    
                if (params.limits.total_size > 0 && target.total_size + file.size > params.limits.total_size)
                    return handleException(file, `Превышен общий лимит! Максимальная сумма всех файлов ${st_uploader.formatSize(params.limits.total_size)}.`, 2);

                if (params.limits.mimes.length > 0) {
                    let type = file.type.trim();
                    let base_type = type.split(';')[0].trim().toLowerCase();

                    for (let condition of params.limits.mimes) {
                        if (condition.endsWith('/*') && !/[\\^$.*+?()[\]{}|]/.test(condition.slice(0, -2))) {
                            if (base_type.startsWith(condition.slice(0, -1).toLowerCase())) return true;

                            continue;
                        }

                        if (/^[\^$.*+?()[\]{}|\\]/.test(condition) || /[\\^$.*+?()[\]{}|]/.test(condition)) {
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
            };
            
            try {
                let existing = target.querySelectorAll(params.entry);

                if (existing .length > 0) {
                    existing.forEach(i => {
                        let temp_node = createDeleteEntry(i);

                        if (!entry_template)
                            entry_template = temp_node.outerHTML;
                    });
                }
            } catch (e) {
                entry_template = params.entry;
            }
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

            target.querySelectorAll('*[add-button]').forEach(b => b.addEventListener('click', () => {
                let hidden = Object.assign(document.createElement('input'), {
                    type: 'file',
                    name: params.input_name.replace(/\[\]$/, '') + (params.limits.files != 1 ? '[]' : ''),
                    multiple: params.limits.files != 1,
                    hidden: true,
                });

                hidden.addEventListener('change', () => {
                    handleFiles(hidden.files);
                });

                document.body.appendChild(hidden);
                hidden.click();
            }));

            target.on_init(params);
        });
    }
}

export default st_uploader;
