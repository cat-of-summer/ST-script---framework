// Universal JS build script (esbuild).
//
// Every `src/**/index.js` is an entry ("bundle"). Its folder path relative to
// src/ is the bundle name (`src/index.js` → "index"). Any path segment starting
// with "_" is shared content (a partial / partials folder) and is never treated
// as an entry. For each bundle two minified outputs are produced:
//
//   dist/<name>.esm.min.js  — ES module  (import / npm / <script type="module">)
//   dist/<name>.min.js      — IIFE global (CDN <script defer>); the module's
//                             default export is exposed as window.<lastSegment>.
//
// Drop a new `src/<name>/index.js` and it is picked up automatically — no edits
// here needed. Run with `--watch` to rebuild on change.

import * as esbuild from 'esbuild';
import { readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = 'src';
const OUT = 'dist';
const watch = process.argv.includes('--watch');

function findEntries(dir = SRC) {
  const entries = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.name.startsWith('_')) continue;
    const full = join(dir, item.name);
    if (item.isDirectory()) {
      entries.push(...findEntries(full));
    } else if (item.name === 'index.js') {
      const rel = relative(SRC, dir).split(sep).join('/');
      entries.push({ name: rel === '' ? 'index' : rel, entry: full });
    }
  }
  return entries;
}

const globalNameFor = (name) => name.split('/').pop();

async function buildAll() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const entries = findEntries();
  if (entries.length === 0) {
    console.warn(`No entries found in ${SRC}/`);
    return;
  }

  for (const { name, entry } of entries) {
    // ES module — for `import` (npm bundlers, <script type="module">).
    await esbuild.build({
      entryPoints: [entry],
      outfile: `${OUT}/${name}.esm.min.js`,
      bundle: true,
      format: 'esm',
      minify: true,
      logLevel: 'warning',
    });

    // IIFE global — for a plain CDN <script defer>. Unwrap the default export
    // so `window.<lastSegment>` is the class itself, not the { default } object.
    const g = globalNameFor(name);
    await esbuild.build({
      entryPoints: [entry],
      outfile: `${OUT}/${name}.min.js`,
      bundle: true,
      format: 'iife',
      globalName: g,
      minify: true,
      logLevel: 'warning',
      footer: {
        js: `if(typeof ${g}!=="undefined"&&${g}&&${g}.default)globalThis.${g}=${g}.default;`,
      },
    });

    console.log(`built ${name}`);
  }
}

await buildAll();

if (watch) {
  const { watch: fsWatch } = await import('node:fs');
  console.log(`watching ${SRC}/ for changes...`);
  let timer = null;
  fsWatch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      buildAll().catch((err) => console.error(err.message));
    }, 50);
  });
}
