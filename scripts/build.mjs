// Universal JS build script (esbuild).
//
// Every nested `src/<name>/index.js` is an entry ("bundle"). Its folder path
// relative to src/ is the bundle name (`src/modal/index.js` → "modal"). The
// top-level `src/index.js` aggregate is NOT built — consumers import specific
// modules. Any path segment starting with "_" is shared content (a partial /
// partials folder) and is never treated as an entry. For each bundle two
// minified outputs are produced:
//
//   dist/<name>.esm.min.js  — ES module  (import / npm / <script type="module">)
//   dist/<name>.min.js      — IIFE global (CDN <script defer>); the module's
//                             default export is exposed as window.<ExportName>,
//                             where <ExportName> is the name of the class in the
//                             source (`export default class Modal` → window.Modal).
//
// Drop a new `src/<name>/index.js` and it is picked up automatically — no edits
// here needed. Run with `--watch` to rebuild on change.

import * as esbuild from 'esbuild';
import { readdirSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
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
      if (rel === '') continue; // skip the top-level aggregate — not a bundle
      entries.push({ name: rel, entry: full });
    }
  }
  return entries;
}

// Pick the IIFE global name from the module's own `export default`, so
// `window.<Name>` matches the class name in the source (`Modal`, `st_mask`, …).
// Falls back to the capitalized last path segment when the default export is
// anonymous (e.g. `export default { … }`).
function globalNameFor(name, entry) {
  const src = readFileSync(entry, 'utf8');
  const m =
    src.match(/export\s+default\s+(?:async\s+)?(?:class|function\*?)\s+([A-Za-z_$][\w$]*)/) ||
    src.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;/) ||
    src.match(/export\s*\{[^}]*?\b([A-Za-z_$][\w$]*)\s+as\s+default\b[^}]*\}/);
  if (m) return m[1];
  const seg = name.split('/').pop();
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

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
      legalComments: 'none',
      logLevel: 'warning',
    });

    // IIFE global — for a plain CDN <script defer>. Unwrap the default export
    // so `window.<lastSegment>` is the class itself, not the { default } object.
    const g = globalNameFor(name, entry);
    await esbuild.build({
      entryPoints: [entry],
      outfile: `${OUT}/${name}.min.js`,
      bundle: true,
      format: 'iife',
      globalName: g,
      minify: true,
      legalComments: 'none',
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
