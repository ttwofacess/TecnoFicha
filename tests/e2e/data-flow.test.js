import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, skipReason } from '../helpers/browser.js';
import { createSite } from '../helpers/site.js';

/**
 * Integración del camino que el usuario no puede perder: cargar una reparación
 * y que siga ahí después de recargar, incluso sin red. Acá se juntan el
 * service worker, el shell cacheado y localStorage.
 */
describe('e2e: una reparación sobrevive a la recarga y al modo offline', { skip: skipReason }, () => {
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
  });

  beforeEach(async () => {
    site = createSite();
    server = await site.start();
    context = await browser.newContext();
    page = await context.newPage();
    page.on('dialog', (d) => d.accept());
    page.on('pageerror', (err) => console.error('  [page error]', err.message));
    await page.goto(server.url);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
  });

  afterEach(async () => {
    await context?.close();
    await server?.close();
    site?.cleanup();
  });

  const fill = async (values) => {
    for (const [field, value] of Object.entries(values)) {
      await page.fill('#f-' + field, value);
    }
  };

  const gotoNewForm = async () => {
    await page.click('#nav-new');
    await page.waitForSelector('#page-new.active');
  };

  test('guarda una reparación y la muestra en el listado', async () => {
    await gotoNewForm();
    await fill({
      nombre: 'Juan Pérez',
      ciudad: 'Rosario',
      provincia: 'Santa Fe',
      fecha: '2024-03-05',
      marca: 'HP',
      problema: 'No prende la pantalla',
      cobrado: '15000',
    });
    await page.click('#save-btn');

    // Volvió al listado con la confirmación
    await page.waitForSelector('#page-list.active');
    assert.equal(await page.textContent('#toast-message'), 'Reparación guardada ✓');

    // La card muestra nombre, monto, marca, ubicación y fecha
    const card = page.locator('.repair-card').first();
    await card.waitFor();
    const cardText = await card.textContent();
    assert.match(cardText, /Juan Pérez/);
    assert.match(cardText, /\$15\.000/, 'el cobrado se formatea a la argentina');
    assert.match(cardText, /HP/);
    assert.match(cardText, /Rosario, Santa Fe/);
    assert.match(cardText, /05\/03\/2024/);

    // El problema vive en el detalle
    await card.click();
    await page.waitForSelector('#page-detail.active');
    assert.match(await page.textContent('#detail-container'), /No prende la pantalla/);
  });

  test('el registro sigue ahí después de recargar y sin red', async () => {
    await gotoNewForm();
    await fill({
      nombre: 'Persistente',
      ciudad: 'Córdoba',
      provincia: 'Córdoba',
      fecha: '2024-03-05',
      marca: 'ASUS',
      problema: 'Se mojó el teclado',
    });
    await page.click('#save-btn');
    await page.waitForSelector('#page-list.active');

    // Recarga con red
    await page.reload();
    await page.waitForSelector('.repair-card');
    assert.match(await page.textContent('.repair-card'), /Persistente/);

    // Recarga sin red: el shell sale del caché y los datos de localStorage
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.repair-card', { timeout: 20000 });
    assert.match(await page.textContent('.repair-card'), /Persistente/);
    await context.setOffline(false);
  });

  test('un campo obligatorio vacío no guarda nada', async () => {
    await gotoNewForm();
    await fill({ nombre: '', ciudad: 'Rosario', provincia: 'Santa Fe', fecha: '2024-03-05', marca: 'HP', problema: 'No prende' });
    await page.click('#save-btn');

    assert.match(await page.textContent('#toast-message'), /nombre es obligatorio/i);
    await page.waitForSelector('#f-nombre-error:visible');
    assert.equal(await page.locator('.repair-card').count(), 0, 'no debe haber creado nada');
    assert.ok(await page.locator('#page-new.active').count(), 'debe seguir en el formulario');
  });

  test('editar y borrar funcionan desde la UI', async () => {
    await gotoNewForm();
    await fill({
      nombre: 'Editable',
      ciudad: 'La Plata',
      provincia: 'Buenos Aires',
      fecha: '2024-03-05',
      marca: 'Dell',
      problema: 'Batería dura poco',
    });
    await page.click('#save-btn');
    await page.waitForSelector('.repair-card');

    // Editar: card → detalle → botón Editar
    await page.click('.repair-card');
    await page.waitForSelector('#page-detail.active');
    await page.click('.edit-btn-sm');
    await page.waitForSelector('#page-new.active');
    await page.fill('#f-nombre', 'Editado');
    await page.click('#save-btn');
    await page.waitForSelector('#page-list.active');
    assert.equal(await page.textContent('#toast-message'), 'Cambios guardados ✓');
    assert.match(await page.textContent('.repair-card'), /Editado/);
    assert.equal(await page.locator('.repair-card').count(), 1, 'no debe duplicar');

    // Borrar (el confirm del navegador se acepta con el listener de arriba)
    await page.click('.repair-card');
    await page.waitForSelector('#page-detail.active');
    await page.click('.edit-btn-sm');
    await page.waitForSelector('#page-new.active');
    await page.click('#delete-btn');
    await page.waitForSelector('#page-list.active');
    assert.equal(await page.textContent('#toast-message'), 'Registro eliminado');
    assert.equal(await page.locator('.repair-card').count(), 0);
  });

  test('si el usuario cancela el borrado, el registro sigue ahí', async () => {
    await gotoNewForm();
    await fill({
      nombre: 'No se borra',
      ciudad: 'Salta',
      provincia: 'Salta',
      fecha: '2024-03-05',
      marca: 'HP',
      problema: 'Sigue roto',
    });
    await page.click('#save-btn');
    await page.waitForSelector('.repair-card');

    // En vez de aceptar el confirm, lo rechazamos
    page.removeAllListeners('dialog');
    page.on('dialog', (d) => d.dismiss());

    await page.click('.repair-card');
    await page.waitForSelector('#page-detail.active');
    await page.click('.edit-btn-sm');
    await page.waitForSelector('#page-new.active');
    await page.click('#delete-btn');

    await page.waitForTimeout(300);
    await page.click('#nav-list');
    await page.waitForSelector('#page-list.active');
    assert.equal(await page.locator('.repair-card').count(), 1, 'no debe haberse borrado');
    assert.match(await page.textContent('.repair-card'), /No se borra/);
  });

  test('los datos no se pierden al recargar durante la escritura', async () => {
    await gotoNewForm();
    await fill({ nombre: 'A medio camino', ciudad: 'Mendoza', provincia: 'Mendoza', fecha: '2024-03-05', marca: 'HP' });

    await page.reload();
    await page.waitForSelector('#page-list.active, #page-new.active');

    // El registro todavía no estaba guardado: no debe aparecer.
    assert.equal(await page.locator('.repair-card').count(), 0);
  });
});