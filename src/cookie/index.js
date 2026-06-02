export default class Cookie {
    static set(name, value, params = {}) {
        params = {
            path: '/',
            expires: 3600,
    
            ...params
        };
    
        if (!(params.expires instanceof Date)) {
            let expires = params.expires;

            params.expires = new Date((typeof expires === "number")
                ? Date.now() + expires * 1000
                : Date.parse(expires) || Date.parse(expires.replace(/-/g, '/'))
            );
        }

        document.cookie = encodeURIComponent(name) + "=" + encodeURIComponent(value) + "; expires=" + params.expires.toUTCString() + "; path=" + params.path + (params.domain ? "; domain=" + params.domain : '') + (params.secure ? "; secure" : '') + (params.sameSite ? "; samesite=" + params.sameSite : '');
    }

    static get(name) {
        name = encodeURIComponent(name);
        let cookies_array = document.cookie.split(';');

        for (let i = 0; i < cookies_array.length; i++) {
            let cookie = cookies_array[i].trim();

            if (cookie.startsWith(name + '=')) {
                let value = decodeURIComponent(cookie.substring(name.length + 1));
                
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            }
        }

        return null;
    }

    static delete(name, params = {}) {
        Cookie.set(name, '', {
            expires: 0,
            ...params
        });
    }

    static callback(name, callback, params = {}) {
        params = {
            interval: 0,
            delay: 0,
            value: true,
    
            ...params
        };

        let interval = setInterval(() => {
            if (Cookie.get(name) === null) {
                Cookie.set(name, params.value, params);

                setTimeout(() => {
                    callback(name);
                }, params.delay * 1000);
            }
            if (!params.interval) clearInterval(interval);
        }, params.interval * 1000);
    }

    static consent(params) {
        params = {
            content: `<div><span>Этот сайт использует файлы cookies и сервисы сбора технических данных посетителей (данные об IP-адресе, местоположении и т.д.) для обеспечения работоспособности и улучшения качества обслуживания.</span><div><button action='accept'>Принять</button><button action='decline'>Отклонить</button></div></div>`,
            container: 'body',
            location: 'bottom',
            zIndex: 1000,
            name: 'cookie_consent',
            interval: 5,

            ...params
        };

        let container = document.createElement('container');

        if (params.container == 'body')
            Object.assign(container.style, {
                position: 'absolute',
                overflow: 'hidden',
                width: 'max-content',
                height: 'max-content',
                maxWidth: '100vw',
                maxHeight: '100vh',
                zIndex: params.zIndex,
                transition: 'inherit',
                pointerEvents: 'all',
                display: 'none',

                ...(() => {
                    let location = (params.location || '').toLowerCase().split(/\s+/);

                    let style = {
                        top: location.includes('top') ? 0 : location.includes('bottom') ? undefined : '50%',
                        bottom: location.includes('bottom') ? 0 : undefined,
                        left: location.includes('left') ? 0 : location.includes('right') ? undefined : '50%',
                        right: location.includes('right') ? 0 : undefined,
                    };

                    let tx = style.left === '50%' ? 'translateX(-50%)' : '';
                    let ty = style.top === '50%' ? 'translateY(-50%)' : '';

                    if (tx || ty) style.transform = `${tx} ${ty}`.trim();

                    return style;
                })()
            });

        document.querySelector(params.container).append(container);

        if (!(params.content instanceof Element)) {
            let content = params.content;

            params.content = content.trim().startsWith('<')
                ? (new DOMParser()).parseFromString(content, 'text/html').body.firstElementChild
                : document.querySelector(content) ?? (() => { throw new Error("Селектор не найден") })();
        }

        container.append(params.content);
    
        Cookie.callback(params.name, e => {
            ['accept', 'decline'].forEach(action => {
                container.querySelectorAll(`[action=${action}]`).forEach(t => {
                    t.addEventListener('click', e => {
                        Cookie.set(params.name, action == 'accept', params);
                        container.style.display = 'none';
                    });
                });
            });
            container.style.display = '';
        }, {...params, value: null});
    }
}