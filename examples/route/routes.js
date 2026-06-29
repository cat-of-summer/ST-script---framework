// Общий роутинг для всех страниц демо examples/route/*.
// Подключается обычным <script defer> на каждой странице.
// IIFE-сборка (../../dist/route.min.js) кладёт класс в window.route.
//
// Один и тот же файл подключён на нескольких страницах — ровно сценарий из CMS:
// скрипт грузится везде, а реакции выбираются по текущему URL.

(function () {
  const Route = window.route;

  // point — каталог текущей страницы. Маршруты пишем относительно него, поэтому
  // демо одинаково работает и по file://, и с локального сервера, где бы ни лежал репозиторий.
  const point = location.pathname.replace(/[^/]*$/, '');

  // Маленький вывод на страницу (чтобы видеть реакции без открытия консоли).
  const out = (msg) => {
    const pre = document.getElementById('log');
    if (pre) pre.textContent += msg + '\n';
    console.log('[route]', msg);
  };

  const router = new Route({
    point,
    match_all: true,                 // выполняем и глобальные, и страничные реакции
  });

  // --- Глобальная реакция: срабатывает на каждой странице (wildcard '*') ---
  // Алиас не нужен — для wildcard хватает события по uri (route::*).
  router.get('*', function () {
    const file = this.path.split('/').pop() || 'index.html';
    document.querySelectorAll('nav a').forEach((a) =>
      a.classList.toggle('active', a.getAttribute('href') === file)
    );
    out("global '*': активная ссылка навигации выставлена");
  });

  // --- Главная ---
  router.get('index.html', () => out('index.html: реакция главной страницы'), 'home');
  router.get('', () => out('"" : реакция, если каталог открыт без имени файла'));

  // --- Каталог: читаем GET-параметр ?category= через this.query ---
  router.get('catalog.html', function () {
    const cat = this.query.category || 'все';
    out(`catalog.html: фильтр категории = "${cat}"`);
    document.querySelectorAll('[data-category]').forEach((el) => {
      el.hidden = cat !== 'все' && el.dataset.category !== cat;
    });
  }, 'catalog');

  // --- Карточка товара: {id} приходит ПОЗИЦИОННЫМ аргументом, алиас 'product' ---
  // Перед обработчиком — middleware-гард: пускаем только известные id.
  // middleware получает те же позиционные аргументы, что и обработчик.
  const known = ['1', '2'];
  router
    .middleware((id) => known.includes(id))
    .get('product-{id}.html', function (id) {
      const title = document.getElementById('title');
      if (title) title.textContent = `Товар #${id}`;
      out(`product-{id}.html: id=${id} (позиционный аргумент)`);
    }, 'product');

  // --- События на document (без шины): любой модуль реагирует без ссылки на router. ---

  // Предвестник матчинга: один раз, ДО сопоставления uri. Имя пустое → 'route'.
  document.addEventListener('route', (e) =>
    out(`document → route (предвестник): страница ${e.detail.path}, сейчас будет матчинг`)
  );

  // Совпадение по алиасу. Имя пустое → двойное двоеточие: route::product.
  document.addEventListener('route::product', (e) =>
    out(`document → route::product : карточка товара #${e.detail.params.id}`)
  );

  // Совпадение по uri.
  document.addEventListener('route::catalog.html', () =>
    out('document → route::catalog.html : каталог открыт')
  );
})();
