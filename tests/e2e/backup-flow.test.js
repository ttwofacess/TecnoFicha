import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchBrowser, skipReason } from '../helpers/browser.js';
import { createSite } from '../helpers/site.js';

/**
 * El flujo de respaldo en Chromium de verdad: la descarga por <a download>, el
 * <input type="file">, y el <dialog> nativo. Nada de esto existe en jsdom, así
 * que es la única forma de cubrir de verdad que el archivo sale y vuelve a
 * entrar.
 */
describe('e2e: exportar e importar un respaldo', { skip: skipReason }, () => {
  let browser;
  let site;
  let server;
  let context;
  let page;
  let tmp;

  before(async () => {
    browser = await launchBrowser();
    tmp = mkdtempSync(join(tmpdir(), 'tecnoficha-backup-'));
  });

  after(async () => {
    await browser?.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  beforeEach(async () => {
    site = createSite();
    server = await site.start();
    context = await browser.newContext({ acceptDownloads: true });
    page = await context.newPage();
    page.on('pageerror', (err) => console.error('  [page error]', err.message));
    await page.goto(server.url);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
  });

  afterEach(async () => {
    await context?.close();
    await server?.close();
    site?.cleanup();
  });

  /** Carga una reparación por la UI, como haría el usuario. */
  const addRepair = async (values) => {
    await page.click('#nav-new');
    await page.waitForSelector('#page-new.active');
    for (const [field, value] of Object.entries(values)) await page.fill('#f-' + field, value);
    await page.click('#save-btn');
    await page.waitForSelector('#page-list.active');
  };

  const gotoStats = async () => {
    await page.click('#nav-stats');
    await page.waitForSelector('#page-stats.active');
  };

  /** Escribe un archivo .json en disco y lo sube por el input de la app. */
  const importFile = async (contents, name = 'respaldo.json') => {
    const path = join(tmp, name);
    writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents));
    await page.setInputFiles('#backup-file-input', path);
  };

  const record = (over = {}) => ({
    id: 'abc123def456',
    nombre: 'Juan Pérez',
    tel: '+541112345678',
    ciudad: 'Buenos Aires',
    provincia: 'CABA',
    fecha: '2024-03-05',
    marca: 'HP',
    modelo: 'Pavilion 15',
    cpu: 'i5-1135G7',
    gpu: 'Integrada',
    ram: '8',
    discos: '256GB SSD',
    problema: 'No prende la pantalla',
    tareas: 'Cambio de fuente',
    cobrado: 15000,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
    ...over,
  });

  const backupOf = (list) => ({
    app: 'tecnoficha',
    schemaVersion: 1,
    exportedAt: '2026-10-07T21:30:00.000Z',
    count: list.length,
    data: list,
  });

  // La clave real de js/state.js, en una sola constante: escrita a mano con
  // otro nombre, los helpers leerían una clave que la app nunca escribe y los
  // tests afirmarían 0 sin explicar por qué.
  const LS_KEY = 'tecnificha_v1';
  const storedCount = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]').length, LS_KEY);
  const storedNames = () =>
    page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]').map((r) => r.nombre).sort(), LS_KEY);

  test('exportar descarga un .json con los registros', async () => {
    await addRepair({ nombre: 'Juan Pérez', ciudad: 'Rosario', provincia: 'Santa Fe', fecha: '2024-03-05', marca: 'HP', problema: 'No prende la pantalla' });
    await addRepair({ nombre: 'Ana Díaz', ciudad: 'Córdoba', provincia: 'Córdoba', fecha: '2024-04-10', marca: 'Dell', problema: 'Se mojó el teclado' });
    await gotoStats();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#backup-export-btn'),
    ]);

    assert.match(download.suggestedFilename(), /^tecnoficha-backup-\d{4}-\d{2}-\d{2}\.json$/);
    assert.match(await page.textContent('#toast-message'), /2/);

    const path = join(tmp, 'descargado.json');
    await download.saveAs(path);
    const json = JSON.parse(readFileSync(path, 'utf8'));

    assert.equal(json.app, 'tecnoficha');
    assert.equal(json.schemaVersion, 1);
    assert.equal(json.count, 2);
    assert.equal(json.data.length, 2);
    assert.ok(json.data.some((r) => r.nombre === 'Juan Pérez'));
    assert.ok(json.data.some((r) => r.nombre === 'Ana Díaz'));
  });

  test('exportar sin registros avisa y no descarga nada', async () => {
    await gotoStats();

    let descargado = false;
    page.on('download', () => { descargado = true; });
    await page.click('#backup-export-btn');
    await page.waitForSelector('#toast.show');

    assert.match(await page.textContent('#toast-message'), /No hay registros/);
    await page.waitForTimeout(300);
    assert.equal(descargado, false, 'no debería descargar nada sin datos');
  });

  test('importar en un navegador vacío recupera los registros', async () => {
    const lista = [record(), record({ id: 'segundo99', nombre: 'Ana Díaz', provincia: 'Córdoba', cobrado: 22000 })];
    await gotoStats();
    await importFile(backupOf(lista));

    // Aparece el diálogo con el resumen antes de tocar nada
    await page.waitForSelector('#import-dialog[open]');
    const resumen = await page.textContent('#import-summary');
    assert.match(resumen, /2 registros/);
    assert.match(resumen, /2 nuevos/);
    assert.equal(await storedCount(), 0, 'todavía no se importó nada');

    await page.click('#import-merge-btn');
    await page.waitForFunction(() => document.getElementById('import-dialog').open === false);

    assert.equal(await storedCount(), 2);
    assert.match(await page.textContent('#toast-message'), /Importación lista: 2 registros/);
    assert.equal(await page.textContent('#topbar-count'), '2 registros');

    // Y siguen ahí después de recargar
    await page.reload();
    await page.click('#nav-list');
    await page.waitForSelector('.repair-card');
    assert.equal(await page.locator('.repair-card').count(), 2);
    assert.match(await page.textContent('.repair-card'), /Juan Pérez/);
  });

  test('combinar no borra lo que ya había ni duplica al reimportar', async () => {
    await addRepair({ nombre: 'Preexistente', ciudad: 'Salta', provincia: 'Salta', fecha: '2024-03-05', marca: 'HP', problema: 'No arranca' });
    await gotoStats();

    // El mismo archivo dos veces
    const archivo = backupOf([record(), record({ id: 'nuevo001', nombre: 'Del archivo' })]);
    await importFile(archivo, 'a.json');
    await page.waitForSelector('#import-dialog[open]');
    await page.click('#import-merge-btn');
    await page.waitForSelector('#toast.show');

    await importFile(archivo, 'b.json');
    await page.waitForSelector('#import-dialog[open]');
    await page.click('#import-merge-btn');
    await page.waitForTimeout(200);

    assert.equal(await storedCount(), 3, 'no debe duplicar al reimportar lo mismo');
    assert.deepEqual(await storedNames(), ['Del archivo', 'Juan Pérez', 'Preexistente']);
  });

  test('combinar se queda con el registro más reciente cuando el id coincide', async () => {
    await addRepair({ nombre: 'Original', ciudad: 'Salta', provincia: 'Salta', fecha: '2024-03-05', marca: 'HP', problema: 'No arranca' });
    await gotoStats();

    // Mismo id que el guardado, pero con updatedAt más nuevo y otro nombre.
    const idOriginal = await page.evaluate(() => JSON.parse(localStorage.getItem('tecnificha_v1'))[0].id);
    const entrante = record({ id: idOriginal, nombre: 'Actualizado', updatedAt: 1890000000000 });
    await importFile(backupOf([entrante]), 'nuevo.json');

    await page.waitForSelector('#import-dialog[open]');
    assert.match(await page.textContent('#import-summary'), /se actualizan/);
    await page.click('#import-merge-btn');
    await page.waitForTimeout(200);

    assert.equal(await storedCount(), 1, 'no debe crear un registro nuevo');
    assert.deepEqual(await storedNames(), ['Actualizado']);
  });

  test('reemplazar todo deja solo lo que trae el archivo', async () => {
    await addRepair({ nombre: 'Se va 1', ciudad: 'Salta', provincia: 'Salta', fecha: '2024-03-05', marca: 'HP', problema: 'No arranca' });
    await addRepair({ nombre: 'Se va 2', ciudad: 'Jujuy', provincia: 'Jujuy', fecha: '2024-03-06', marca: 'HP', problema: 'Otro problema' });
    await gotoStats();

    await importFile(backupOf([record({ id: 'quedaneste', nombre: 'Del archivo' })]), 'reemplazo.json');
    await page.waitForSelector('#import-dialog[open]');
    await page.click('#import-replace-btn');
    await page.waitForTimeout(200);

    assert.equal(await storedCount(), 1);
    assert.deepEqual(await storedNames(), ['Del archivo']);
  });

  test('cancelar no cambia nada', async () => {
    await addRepair({ nombre: 'Intocable', ciudad: 'Salta', provincia: 'Salta', fecha: '2024-03-05', marca: 'HP', problema: 'No arranca' });
    await gotoStats();

    await importFile(backupOf([record({ id: 'otro9999', nombre: 'No debe entrar' })]), 'cancelar.json');
    await page.waitForSelector('#import-dialog[open]');
    await page.click('#import-cancel-btn');
    await page.waitForFunction(() => !document.getElementById('import-dialog').open);

    assert.equal(await storedCount(), 1);
    assert.deepEqual(await storedNames(), ['Intocable']);
  });

  test('cerrar el diálogo con Esc tampoco importa', async () => {
    await addRepair({ nombre: 'Intocable', ciudad: 'Salta', provincia: 'Salta', fecha: '2024-03-05', marca: 'HP', problema: 'No arranca' });
    await gotoStats();

    await importFile(backupOf([record({ id: 'otro9999', nombre: 'No debe entrar' })]), 'esc.json');
    await page.waitForSelector('#import-dialog[open]');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('import-dialog').open);
    await page.waitForTimeout(200);

    assert.equal(await storedCount(), 1);
    assert.deepEqual(await storedNames(), ['Intocable']);
  });

  test('un archivo inválido avisa y deja los datos como estaban', async () => {
    await addRepair({ nombre: 'Intocable', ciudad: 'Salta', provincia: 'Salta', fecha: '2024-03-05', marca: 'HP', problema: 'No arranca' });
    await gotoStats();

    for (const [nombre, contenido] of [
      ['roto.json', 'esto no es un json'],
      ['ajeno.json', JSON.stringify({ app: 'otra-app', schemaVersion: 1, data: [record()] })],
      ['futuro.json', JSON.stringify({ app: 'tecnoficha', schemaVersion: 99, data: [record()] })],
      ['vacio.json', JSON.stringify(backupOf([]))],
    ]) {
      await importFile(contenido, nombre);
      await page.waitForSelector('#toast.show');
      assert.equal(await page.locator('#import-dialog[open]').count(), 0, `${nombre} no debe abrir el diálogo`);
      assert.equal(await storedCount(), 1, `${nombre} no debe cambiar los datos`);
    }
  });

  test('un id malicioso en el archivo no ejecuta nada al tocar la tarjeta', async () => {
    await gotoStats();
    await importFile(backupOf([record({ id: "x');alert(1);//", nombre: 'Atacante' })]), 'xss.json');
    await page.waitForSelector('#import-dialog[open]');
    await page.click('#import-merge-btn');
    await page.waitForTimeout(200);

    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('tecnificha_v1'))[0].id);
    assert.match(id, /^[a-z0-9]{1,40}$/i, 'el id debería haberse regenerado');

    // Tocar la tarjeta no debe ejecutar nada: si el onclick quedó inyectado,
    // el alert saltaría y el test se caería.
    let alertado = false;
    page.on('dialog', async (d) => { alertado = true; await d.dismiss(); });

    await page.click('#nav-list');
    await page.click('.repair-card');
    await page.waitForTimeout(300);

    assert.equal(alertado, false, 'el id inyectado no debe ejecutar código');
    await page.waitForSelector('#page-detail.active');
    assert.match(await page.textContent('#detail-container'), /Atacante/);
  });

  test('el resumen del diálogo con un nombre con HTML no inyecta nodos', async () => {
    await gotoStats();
    // El nombre va al diálogo solo como texto del resumen.
    await importFile(backupOf([record({ nombre: '<img src=x onerror=alert(1)>' })]), 'html.json');
    await page.waitForSelector('#import-dialog[open]');

    assert.equal(await page.locator('#import-summary img').count(), 0, 'no debe crear elementos');
    await page.click('#import-cancel-btn');
  });

  test('el respaldo funciona sin red', async () => {
    await addRepair({ nombre: 'Sin red', ciudad: 'Salta', provincia: 'Salta', fecha: '2024-03-05', marca: 'HP', problema: 'No arranca' });

    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('#page-list.active', { timeout: 20000 });

    await gotoStats();

    // Exportar offline
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#backup-export-btn'),
    ]);
    const path = join(tmp, 'offline.json');
    await download.saveAs(path);
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).count, 1);

    // Importar offline
    await importFile(backupOf([record({ id: 'offline1', nombre: 'También offline' })]), 'offline-in.json');
    await page.waitForSelector('#import-dialog[open]');
    await page.click('#import-merge-btn');
    await page.waitForTimeout(200);

    assert.equal(await storedCount(), 2);
    await context.setOffline(false);
  });

  test('exportar y reimportar el propio archivo conserva todo', async () => {
    await addRepair({ nombre: 'Ida', ciudad: 'Rosario', provincia: 'Santa Fe', fecha: '2024-03-05', marca: 'HP', modelo: 'Pavilion 15', cpu: 'i5-1135G7', ram: '8', discos: '256GB SSD', gpu: 'Integrada', problema: 'No prende la pantalla', tareas: 'Cambio de fuente', cobrado: '15000' });
    await addRepair({ nombre: 'Vuelta', ciudad: 'Córdoba', provincia: 'Córdoba', fecha: '2024-04-10', marca: 'Dell', problema: 'Se mojó el teclado', cobrado: '22000' });
    await gotoStats();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#backup-export-btn'),
    ]);
    const antes = join(tmp, 'ida-y-vuelta.json');
    await download.saveAs(antes);
    const original = JSON.parse(readFileSync(antes, 'utf8'));

    // Se borra todo y se restaura desde el archivo
    await page.evaluate(() => localStorage.removeItem('tecnificha_v1'));
    await page.reload();
    await gotoStats();
    assert.equal(await storedCount(), 0);

    await importFile(original, 'restaurar.json');
    await page.waitForSelector('#import-dialog[open]');
    await page.click('#import-merge-btn');
    await page.waitForTimeout(200);

    const restaurado = await page.evaluate(() => JSON.parse(localStorage.getItem('tecnificha_v1')));
    assert.equal(restaurado.length, 2);

    // Todos los campos de un registro tienen que volver idénticos
    const porNombre = (lista, nombre) => lista.find((r) => r.nombre === nombre);
    const originalA = porNombre(original.data, 'Ida');
    const restauradoA = porNombre(restaurado, 'Ida');
    for (const campo of Object.keys(originalA)) {
      assert.deepEqual(restauradoA[campo], originalA[campo], `el campo ${campo} no volvió igual`);
    }
  });
});