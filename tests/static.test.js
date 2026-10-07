import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

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

  test('todo módulo js/ está en la precache del service worker', () => {
    // El test anterior solo verifica que lo listado exista. El riesgo real es
    // al revés: olvidar un módulo nuevo en la precache rompe el modo offline
    // sin dar ningún error visible.
    const sw = read('sw.js');
    const block = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
    assert.ok(block, 'no se encontró el array PRECACHE en sw.js');
    const urls = new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));

    const orphans = [];
    for (const dir of ['js', 'js/views']) {
      for (const name of readdirSync(new URL(dir, ROOT))) {
        if (name.endsWith('.js') && !urls.has(`./${dir}/${name}`)) orphans.push(`./${dir}/${name}`);
      }
    }
    assert.deepEqual(orphans, [], `módulos js ausentes de la precache: ${orphans.join(', ')}`);
  });

  test('el index.html tiene los ids que espera js/backup-ui.js', () => {
    const html = read('index.html');
    for (const id of [
      'backup-export-btn', 'backup-import-btn', 'backup-file-input',
      'import-dialog', 'import-summary', 'import-merge-btn', 'import-replace-btn', 'import-cancel-btn',
    ]) {
      assert.match(html, new RegExp(`id="${id}"`), `falta el id ${id} en index.html`);
    }
  });

  test('los botones de respaldo están fuera de #stats-container', () => {
    // renderStats() reescribe #stats-container con innerHTML en cada visita:
    // un botón dentro desaparecería al abrir el Resumen. Se chequea con el
    // DOM real, no con una expresión regular sobre el HTML.
    const dom = new JSDOM(read('index.html'), { url: 'https://example.test/' });
    const container = dom.window.document.getElementById('stats-container');

    assert.ok(container, 'no se encontró #stats-container en index.html');
    assert.equal(container.querySelector('#backup-export-btn'), null);
    assert.equal(container.querySelector('#backup-import-btn'), null);
    assert.equal(container.querySelector('#backup-file-input'), null);

    // Y los botones tienen que estar en la misma página que el contenedor.
    const page = dom.window.document.getElementById('page-stats');
    assert.ok(page.contains(dom.window.document.getElementById('backup-export-btn')));
    assert.ok(page.contains(dom.window.document.getElementById('backup-import-btn')));
    dom.window.close();
  });

  test('el diálogo de importación existe y está bien armado', () => {
    const dom = new JSDOM(read('index.html'), { url: 'https://example.test/' });
    const doc = dom.window.document;
    const dlg = doc.getElementById('import-dialog');

    assert.ok(dlg, 'falta el diálogo de importación');
    assert.match(dlg.outerHTML, /<dialog/);
    // Reutiliza el estilo del diálogo de iOS.
    assert.ok(dlg.classList.contains('pwa-dialog'));
    // Los tres botones, y el que reemplaza todo tiene que verse destructivo.
    assert.ok(doc.getElementById('import-replace-btn').classList.contains('btn-danger'));
    assert.ok(doc.getElementById('import-merge-btn').classList.contains('btn-primary'));
    // El resumen arranca vacío: se arma con textContent al importar.
    assert.equal(doc.getElementById('import-summary').textContent.trim(), '');
    dom.window.close();
  });

  test('el input de archivo del respaldo está oculto y acepta json', () => {
    const html = read('index.html');
    const input = html.match(/<input[^>]*id="backup-file-input"[^>]*>/);
    assert.ok(input, 'falta el input de archivo del respaldo');
    assert.match(input[0], /type="file"/);
    assert.match(input[0], /hidden/);
    assert.match(input[0], /accept="[^"]*json/);
  });

  test('css/pages/stats.css define las clases del respaldo', () => {
    const css = read('css/pages/stats.css');
    for (const selector of ['.backup-wrap', '.backup-hint', '.backup-actions', '#import-summary']) {
      assert.ok(css.includes(selector), `falta ${selector} en css/pages/stats.css`);
    }
  });
});