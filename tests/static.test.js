import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const exists = (path) => existsSync(fileURLToPath(new URL(path, ROOT)));

// Es un sitio estático sin build: nada valida que la precache, los @import de
// CSS y los ids del HTML sigan pointing a archivos que existen.
describe('integridad del sitio estático', () => {
  test('todos los archivos de la precache del service worker existen', () => {
    const sw = read('sw.js');
    const block = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
    assert.ok(block, 'no se encontró el array PRECACHE en sw.js');

    const urls = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.ok(urls.length > 0, 'PRECACHE está vacío');

    const missing = urls.filter((u) => u !== './' && !exists(u));
    assert.deepEqual(missing, [], `archivos inexistentes en la precache: ${missing.join(', ')}`);
  });

  test('sw.js escucha SKIP_WAITING y no hace skipWaiting al instalar', () => {
    const sw = read('sw.js');
    assert.match(sw, /addEventListener\('message'[\s\S]*?SKIP_WAITING[\s\S]*?skipWaiting\(\)/);

    const install = sw.match(/addEventListener\('install'[\s\S]*?\n\}\);/);
    assert.ok(install);
    // sin comentarios: sw.js explica en uno por qué NO llama skipWaiting()
    const code = install[0].replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /skipWaiting/, 'skipWaiting en install actualizaría sin avisar al usuario');
  });

  test('VERSION del shell está declarada', () => {
    assert.match(read('sw.js'), /const VERSION = '\d+\.\d+\.\d+';/);
  });

  test('los @import de css/main.css existen', () => {
    const main = read('css/main.css');
    const imports = [...main.matchAll(/@import url\("([^"]+)"\)/g)].map((m) => m[1]);
    assert.ok(imports.length > 0);

    const missing = imports.filter((i) => !exists(new URL(i, ROOT.href + 'css/').href));
    assert.deepEqual(missing, [], `@import rotos: ${missing.join(', ')}`);
  });

  test('todo css/*.css está cargado por index.html o importado por main.css', () => {
    const html = read('index.html');
    const main = read('css/main.css');
    const linked = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]);

    const orphans = ['components/toast.css', 'pwa.css'].filter((name) => {
      const inHtml = linked.some((href) => href.endsWith(name));
      const inMain = main.includes(`./${name}`);
      return !inHtml && !inMain;
    });
    assert.deepEqual(orphans, [], `CSS nunca cargado: ${orphans.join(', ')}`);
  });

  test('el toast tiene los ids que espera js/utils.js', () => {
    const html = read('index.html');
    assert.match(html, /id="toast"/);
    assert.match(html, /id="toast-message"/);
    assert.match(html, /id="toast-action-btn"/);
  });

  test('no quedan referencias al banner de actualización eliminado', () => {
    const files = ['index.html', 'js/pwa.js', 'js/utils.js', 'css/pwa.css', 'css/components/toast.css', 'css/main.css'];
    const hits = files.filter((f) => /update-banner|update-btn/.test(read(f)));
    assert.deepEqual(hits, [], `referencias obsoletas en: ${hits.join(', ')}`);
  });

  test('toast.css define los estados que usa el JS', () => {
    const css = read('css/components/toast.css');
    for (const selector of ['#toast', '#toast.show', '#toast-message', '#toast-action-btn', '#toast.persistent']) {
      assert.ok(css.includes(selector), `falta el selector ${selector} en toast.css`);
    }
    assert.match(css, /pointer-events: auto/, 'el toast persistente necesita recibir clics');
  });

  test('package.json y sw.js declaran la misma versión', () => {
    const pkg = JSON.parse(read('package.json'));
    const sw = read('sw.js').match(/const VERSION = '([^']+)'/)[1];
    assert.equal(pkg.version, sw, 'package.json y sw.js están desincronizados');
  });
});