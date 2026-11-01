// Build: esbuild bundle -> docs/ (GitHub Pages "main /docs"). Output is committed on purpose.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'docs');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const result = await build({
  entryPoints: { app: join(root, 'src/main.tsx') },
  bundle: true,
  format: 'esm',
  target: ['es2022', 'safari15'],
  minify: true,
  sourcemap: false,
  outdir: out,
  entryNames: '[name]-[hash]',
  jsx: 'automatic',
  external: ['*.ttf'],
  define: { 'process.env.NODE_ENV': '"production"', __BUILD_ID__: 'BUILD_ID_PLACEHOLDER' },
  metafile: true,
  logLevel: 'warning',
});

cpSync(join(root, 'public'), out, { recursive: true });
const files = Object.keys(result.metafile.outputs).map((f) => relative(out, f));
const js = files.find((f) => f.endsWith('.js'));
const css = files.find((f) => f.endsWith('.css'));
if (!js || !css) throw new Error('bundle missing js/css');

const buildId = createHash('sha256')
  .update(readFileSync(join(out, js)))
  .update(readFileSync(join(out, css)))
  .digest('hex')
  .slice(0, 10);
// stamp build id into the bundle
const jsPath = join(out, js);
writeFileSync(jsPath, readFileSync(jsPath, 'utf8').replaceAll('BUILD_ID_PLACEHOLDER', JSON.stringify(`${pkg.version ?? '1.0.0'}+${buildId}`)).replace(/"("[^"]*\+[0-9a-f]{10}")"/g, '$1'));

const html = readFileSync(join(root, 'src/pwa/index.template.html'), 'utf8').replace('__CSS__', css).replace('__JS__', js);
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, '.nojekyll'), '');

function walk(d) {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [relative(out, p)];
  });
}
const precache = ['./', ...walk(out).filter((f) => !['sw.js', '.nojekyll'].includes(f))].map((f) => (f === './' ? f : `./${f}`));
writeFileSync(
  join(out, 'sw.js'),
  readFileSync(join(root, 'src/pwa/sw.template.js'), 'utf8').replace('__BUILD_ID__', buildId).replace('__PRECACHE__', JSON.stringify(precache, null, 2)),
);
if (process.env.ROOT_COPY) {
  // Optional: also publish the app at the repo root so Pages works with either "/ (root)" or "/docs".
  for (const f of readdirSync(root)) if (/^app-.*\.(js|css)$/.test(f)) rmSync(join(root, f));
  for (const f of readdirSync(out)) cpSync(join(out, f), join(root, f), { recursive: true });
}
console.log(`built docs/ — build ${buildId}, ${precache.length} precached files`);
