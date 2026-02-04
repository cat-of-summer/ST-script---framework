class st_uploader {
    #params = {};

    get params() { return this.#params; }

    static formatSize(size) {
        const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];

        let i = 0;

        while (size >= 1024 && i < units.length - 1)
            size /= 1024; i++;

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
            before_files_add: () => {},
            on_files_delete: () => {},
            before_files_drop: () => {},
            on_files_drop: () => {},
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
        params.delete_name = (params.delete_name ? params.delete_name.replace(/\[\]$/, '')  : input_name) + (params.limits.files != 1 ? '[]' : '');

        this.#params = params;

        for (let [key, value] of Object.entries(params))
            if (typeof value == "function")
                this[key] = value.bind(this);

        this.before_init(params);

        const handleException = (file, message, code = null) => {
            if (params.handle_exception)
                return this.handle_exception(Object.assign(
                    new Error(message),{
                        file,
                        code
                    }
                ));
            else
                alert(message);

            return false;
        }

        document.querySelectorAll(params.target).forEach(target => {
            let files_list = target.querySelector('*[files-list]');
            let entry_template = null;

            target.files_count = 0;
            target.total_size = 0;

            const createFileEntry = (file) => {
                let entry = (new DOMParser()).parseFromString(entry_template, 'text/html').body.firstElementChild;

                entry.file = file;

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
                    if (this.before_file_delete(file) === false) return;

                    target.files_count = Math.max(0, target.files_count - 1);
                    target.total_size = Math.max(0, target.total_size - parseInt(entry.file.size));
                    entry.remove();

                    this.on_file_delete(file)
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
                let input = entry.querySelector(`input[name^="${input_name}"]`);
                let delete_button = entry.querySelectorAll('*[delete-button]');

                if (input) {
                    let input_value = input.value;

                    delete_button.forEach(b => b.addEventListener('click', () => {
                        if (this.before_file_delete(entry) === false) return;

                        let hidden = Object.assign(document.createElement('input'), {
                            type: 'hidden',
                            name: params.delete_name,
                            hidden: true,
                            value: input_value,
                        });
                        target.appendChild(hidden);

                        target.files_count = Math.max(0, target.files_count - 1);
                        this.on_file_delete(entry);

                        entry.remove();
                    }));
                    
                    input.remove();
                    target.files_count++;
                    return entry;
                }

                entry.remove();
                return false;
            }

            const checkFile = (file) => {
                if (params.limits.files > 0 && target.files_count >= params.limits.files)
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

                this.before_files_add(file_array);

                file_array = file_array.filter(checkFile);

                if (file_array.length > 0) {
                    let fragment = document.createDocumentFragment();

                    file_array.forEach(file => {
                        fragment.appendChild(createFileEntry(file));

                        target.files_count++;
                        target.total_size += file.size;
                    });

                    files_list.appendChild(fragment);
                }

                this.on_files_add(file_array);
            };
            
            try {
                let existing = target.querySelectorAll(params.entry);
                if (existing .length > 0) {
                    let temp_node = null;
  
                    existing.forEach(i => {
                        if (!(temp_node = createDeleteEntry(i))) return;

                        if (!entry_template) entry_template = temp_node.outerHTML;
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
                        this.before_drop();
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
                    this.on_drop();
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
        });

        this.on_init(params);
    }
}