// Автотесты сборки: node tests/build.test.mjs (после npm run build)
// ESM-сборка модуля не вшивает другие модули, а импортирует их ESM-файлы: в проекте класс один,
// и Mask.find видит маски, которые поставил app/datepicker. IIFE для CDN — самодостаточная.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const read = file => fs.readFileSync(path.join(dist, file), 'utf8');
const imports = file => [...read(file).matchAll(/from"(\.[^"]+)"/g)].map(m => m[1]);

let failed = 0, passed = 0;

function eq(actual, expected, label) {
    let a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { passed++; return; }
    failed++;
    console.error(`FAIL: ${label}\n  ожидалось: ${e}\n  получено:  ${a}`);
}

eq(imports('app/datepicker.esm.min.js'), ['../mask.esm.min.js'], 'app/datepicker импортирует mask, а не вшивает');
eq(imports('app/form.esm.min.js'), ['../core.esm.min.js'], 'app/form импортирует core');
eq(imports('loader.esm.min.js'), ['./core.esm.min.js'], 'путь от модуля верхнего уровня');
eq(imports('mask.esm.min.js'), [], 'модуль без зависимостей — без импортов');

eq(read('app/datepicker.min.js').includes('insertReplacementText'), true, 'IIFE app/datepicker — с Mask внутри');
eq(/from"\./.test(read('app/datepicker.min.js')), false, 'IIFE — без импортов');

for (const file of ['app/datepicker.esm.min.js', 'app/form.esm.min.js', 'loader.esm.min.js']) {
    let error = null;
    try { await import(path.join(dist, file).replace(/\\/g, '/').replace(/^(?=[A-Za-z]:)/, 'file:///')); }
    catch (e) { error = e.message; }
    eq(error, null, `${file}: импорты разрешаются`);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
