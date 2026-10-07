import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, skipReason } from '../helpers/browser.js';
import { createSite } from '../helpers/site.js';

/**
 * Integración real: service worker de verdad, en Chromium, sobre HTTP.
 * Cubre el ciclo completo que jsdom no puede verificar — VERSION → install →
 * waiting → toast → SKIP_WAITING → activate → recarga con el shell nuevo.
 */
describe('e2e: ciclo de actualización con service worker real', { skip: skipReason }, () => {
  let browser;
  let site;
  let server;
  let context;
  let page;

  before(async () => {
    browser = await launchBrowser();
  });

  after(async () => {
    await browser?.close();
    site?.cleanup();
  });

  beforeEach(async () => {
    site = createSite();
    server = await site.start();
    context = await browser.newContext();
    // Cuenta navegaciones (incluidas las recargas) para poder afirmar cuántas
    // hubo. Va en sessionStorage porque window se reinicia en cada recarga.
    await context.addInitScript(() => {
      const n = Number(sessionStorage.getItem('__navs') || 0) + 1;
      sessionStorage.setItem('__navs', String(n));
      window.__navigations = n;
    });
    page = await context.newPage();
    page.on('pageerror', (err) => console.error('  [page error]', err.message));
  });

  const navigations = () => page.evaluate(() => window.__navigations);

  afterEach(async () => {
    await context?.close();
    await server?.close();
    site?.cleanup();
  });

  const waitForController = () =>
    page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });

  /**
   * Abre la app y espera a que se acomode. En la primera instalación el activate
   * hace clients.claim(), eso dispara controllerchange y js/pwa.js recarga la
   * página: hay que dejar pasar esa recarga antes de seguir evaluando.
   */
  const openApp = async () => {
    await page.goto(server.url);
    await waitForController();
    await page.waitForLoadState('load');
    await page.waitForTimeout(250);
    await waitForController();
  };

  // page.evaluate no reintenta solo y la recarga del primer install lo rompe
  const evaluate = async (fn, arg) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await page.evaluate(fn, arg);
      } catch (err) {
        if (attempt >= 2 || !/Execution context was destroyed/.test(err.message)) throw err;
        await page.waitForLoadState('load');
        await page.waitForTimeout(250);
      }
    }
  };

  const caches_ = () => evaluate(() => window.caches.keys());

  const toastState = () =>
    evaluate(() => {
      const box = document.getElementById('toast');
      return {
        shown: box.classList.contains('show'),
        persistent: box.classList.contains('persistent'),
        message: document.getElementById('toast-message').textContent,
        actionVisible: !document.getElementById('toast-action-btn').hidden,
        actionText: document.getElementById('toast-action-btn').textContent,
      };
    });

  test('instala el service worker y precachea el app shell completo', async () => {
    await openApp();

    // Instalar por primera vez no debe recargar la página: clients.claim()
    // dispara controllerchange y no hay nada nuevo que cargar.
    assert.equal(await navigations(), 1, 'la primera instalación no debe recargar');

    const keys = await caches_();
    assert.deepEqual(keys, [`tecnoficha-shell-${site.version()}`]);

    const cached = await page.evaluate(async () => {
      const cache = await window.caches.open((await window.caches.keys())[0]);
      return (await cache.keys()).map((r) => new URL(r.url).pathname);
    });
    assert.equal(cached.length, site.precacheCount(), 'la precache debe traer todos los archivos del shell');
    assert.ok(cached.some((p) => p.endsWith('/index.html')));
    assert.ok(cached.some((p) => p.endsWith('/js/utils.js')));
  });

  test('la app sigue abriendo sin red (offline)', async () => {
    await openApp();

    await context.setOffline(true);
    await page.reload();

    assert.equal(await page.locator('#toast').count(), 1, 'el shell debe renderizar desde la precache');
    assert.equal(await page.locator('.bottom-nav').count(), 1);
    assert.ok((await page.textContent('body')).length > 0);
    await context.setOffline(false);
  });

  test('avisa con un toast persistente y actualiza solo al confirmar', async () => {
    await openApp();

    const v1 = site.version();
    const marker = await site.deploy(); // "publicamos" la v2

    // El chequeo explícito que dispara la detección en el navegador
    await evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update();
    });

    await page.waitForSelector('#toast.show', { timeout: 20000 });
    assert.deepEqual(await toastState(), {
      shown: true,
      persistent: true,
      message: 'Nueva versión disponible',
      actionVisible: true,
      actionText: 'Actualizar',
    });

    // Persistente de verdad: no se apaga solo
    await page.waitForTimeout(3000);
    assert.equal((await toastState()).shown, true, 'el aviso no debe desaparecer solo');

    // Sigue siendo clickeable: nada lo tapa y recibe eventos
    const clickable = await page.evaluate(() => {
      const btn = document.getElementById('toast-action-btn');
      const box = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { isButton: hit === btn, insideViewport: box.bottom <= innerHeight && box.top >= 0, width: box.width, height: box.height };
    });
    assert.equal(clickable.isButton, true, 'el botón debe recibir el click');
    assert.equal(clickable.insideViewport, true, 'el toast debe verse completo en pantalla');
    assert.ok(clickable.width > 40 && clickable.height > 20, 'el botón no debe quedar achatado');

    // Antes de confirmar, seguimos en la versión vieja
    assert.equal(await page.getAttribute('html', 'data-build'), null);

    await page.click('#toast-action-btn');

    // El nuevo SW toma el control y la app recarga una sola vez
    await page.waitForFunction((m) => document.documentElement.dataset.build === m, marker, { timeout: 20000 });
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller.state), 'activated');

    // El caché viejo se limpió en activate
    assert.deepEqual(await caches_(), [`tecnoficha-shell-${site.version()}`]);
    assert.notEqual(site.version(), v1);

    // Una sola recarga, la del update (ya contada al abrir la app)
    assert.equal(await navigations(), 2, 'el update debe recargar exactamente una vez');

    // Y el toast no quedó pegado
    assert.equal((await toastState()).shown, false);
  });

  test('varios avisos temporales seguidos no borran el de nueva versión', async () => {
    await openApp();
    await site.deploy();

    await evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update();
    });
    await page.waitForSelector('#toast.persistent', { timeout: 20000 });

    // Mismo toast() que usa la app, ejecutado en la página. Dos avisos que se
    // pisan entre sí: el segundo no debe borrar el aviso de versión apartado.
    await evaluate(async () => {
      const { toast } = await import('./js/utils.js');
      toast('Reparación guardada ✓', { duration: 1200 });
      setTimeout(() => toast('Registro eliminado', { duration: 400 }), 200);
    });

    await page.waitForFunction(
      () => document.getElementById('toast-message').textContent === 'Registro eliminado',
      null,
      { timeout: 5000 },
    );
    let state = await toastState();
    assert.equal(state.persistent, false);
    assert.equal(state.actionVisible, false);

    await page.waitForFunction(
      () => document.getElementById('toast').classList.contains('persistent'),
      null,
      { timeout: 5000 },
    );
    state = await toastState();
    assert.equal(state.message, 'Nueva versión disponible', 'el aviso de versión tiene que volver');
    assert.equal(state.actionText, 'Actualizar');
  });

});