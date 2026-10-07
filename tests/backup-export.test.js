import { test, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';

import { setupDom, importFresh } from './helpers/env.js';

// jsdom no implementa la descarga por blob: registramos lo que se habría
// descargado en lugar de dejarlo pasar.
function stubDownloads(env) {
  const calls = [];
  const revoked = [];

  // El módulo usa el `URL` global (Node no lo implementa, y setupDom solo
  // expone un puñado de globals del window), así que el stub va en globalThis.
  const prevCreate = globalThis.URL.createObjectURL;
  const prevRevoke = globalThis.URL.revokeObjectURL;
  globalThis.URL.createObjectURL = (blob) => {
    calls.push({ blob });
    return `blob:mock/${calls.length}`;
  };
  globalThis.URL.revokeObjectURL = (url) => revoked.push(url);

  const originalClick = env.window.HTMLAnchorElement.prototype.click;
  env.window.HTMLAnchorElement.prototype.click = function click() {
    const call = calls[calls.length - 1];
    call.href = this.href;
    call.download = this.download;
  };

  return {
    calls,
    revoked,
    restore() {
      globalThis.URL.createObjectURL = prevCreate;
      globalThis.URL.revokeObjectURL = prevRevoke;
      env.window.HTMLAnchorElement.prototype.click = originalClick;
    },
  };
}

const record = (over = {}) => ({
  id: 'abc123def456',
  nombre: 'Juan Perez',
  tel: '+541112345678',
  ciudad: 'Buenos Aires',
  provincia: 'CABA',
  fecha: '2026-10-01',
  marca: 'HP',
  modelo: 'Pavilion 15',
  cpu: 'i5-1135G7',
  gpu: 'Integrada',
  ram: '8',
  discos: '256GB SSD',
  problema: 'No enciende',
  tareas: 'Cambio de fuente',
  cobrado: 25000,
  createdAt: 1790000000000,
  updatedAt: 1790000000000,
  ...over,
});

const readBlob = async (blob) => blob.text();

describe('exportar respaldo', () => {
  let env;
  let dl;
  let ui;
  let state;

  beforeEach(async () => {
    env = setupDom();
    dl = stubDownloads(env);
    ui = await importFresh('js/backup-ui.js');
    state = await importFresh('js/state.js');
  });

  afterEach(() => {
    dl.restore();
    env.restore();
  });

  const toastText = () => env.el('toast-message')?.textContent ?? '';
  const toastVisible = () => env.el('toast')?.classList.contains('show');

  test('descarga un archivo .json con los registros guardados', async () => {
    state.setRepairs([record(), record({ id: 'segundo1', nombre: 'Ana Diaz', cobrado: 0 })]);
    ui.exportBackup();

    assert.equal(dl.calls.length, 1);
    assert.equal(dl.calls[0].download, `tecnoficha-backup-${new Date().toLocaleDateString('sv-SE')}.json`);
    assert.ok(dl.calls[0].href.startsWith('blob:'));

    const json = JSON.parse(await readBlob(dl.calls[0].blob));
    assert.equal(json.app, 'tecnoficha');
    assert.equal(json.schemaVersion, 1);
    assert.equal(json.count, 2);
    assert.equal(json.data.length, 2);
    assert.equal(json.data[0].nombre, 'Juan Perez');
  });

  test('el blob es application/json', () => {
    state.setRepairs([record()]);
    ui.exportBackup();
    assert.equal(dl.calls[0].blob.type, 'application/json');
  });

  test('el archivo importable de vuelta conserva los registros', async () => {
    const lista = [record(), record({ id: 'segundo1', nombre: 'Ana Diaz' })];
    state.setRepairs(lista);
    ui.exportBackup();

    const { parseBackup } = await import('../js/backup.js');
    const { records, invalid } = parseBackup(await readBlob(dl.calls[0].blob));

    assert.equal(invalid, 0);
    assert.deepEqual(records, lista);
  });

  test('el nombre del archivo lleva la fecha local en AAAA-MM-DD', () => {
    assert.equal(
      ui.backupFileName(new Date(2026, 0, 5)),
      'tecnoficha-backup-2026-01-05.json'
    );
    assert.equal(
      ui.backupFileName(new Date(2026, 11, 31)),
      'tecnoficha-backup-2026-12-31.json'
    );
  });

  test('sin registros avisa y no descarga nada', () => {
    state.setRepairs([]);
    ui.exportBackup();

    assert.equal(dl.calls.length, 0);
    assert.ok(toastVisible());
    assert.match(toastText(), /No hay registros/);
  });

  test('avisa cuántos registros se exportaron', () => {
    state.setRepairs([record(), record({ id: 'segundo1' }), record({ id: 'tercero1' })]);
    ui.exportBackup();

    assert.ok(toastVisible());
    assert.match(toastText(), /3/);
    assert.match(toastText(), /✓/);
  });

  test('relee localStorage por si otra pestaña guardó cambios', () => {
    // En memoria no hay nada, pero sí en localStorage: tiene que exportarlo.
    localStorage.setItem('tecnificha_v1', JSON.stringify([record()]));
    ui.exportBackup();

    assert.equal(dl.calls.length, 1);
  });

  test('no deja el ancla en el DOM ni el blob url colgado para siempre', async () => {
    state.setRepairs([record()]);
    ui.exportBackup();

    assert.equal(env.document.querySelectorAll('a[download]').length, 0);
    assert.deepEqual(dl.revoked, []);
  });

  test('libera el blob url después de la descarga', async () => {
    state.setRepairs([record()]);
    ui.exportBackup();
    await new Promise((r) => setTimeout(r, 1100));

    assert.deepEqual(dl.revoked, [dl.calls[0].href]);
  });

  test('no escribe nada en localStorage al exportar', () => {
    state.setRepairs([record()]);
    localStorage.clear();
    ui.exportBackup();

    assert.deepEqual(Object.keys(localStorage), []);
  });

  test('el texto exportado es JSON legible con indentación', async () => {
    state.setRepairs([record()]);
    ui.exportBackup();

    const text = await readBlob(dl.calls[0].blob);
    assert.ok(text.includes('\n  "app"'), 'esperaba JSON indentado');
    assert.doesNotThrow(() => JSON.parse(text));
  });

  test('backupJson envuelve la lista sin inventarse datos', () => {
    const lista = [record()];
    const json = JSON.parse(ui.backupJson(lista));

    assert.equal(json.count, 1);
    assert.deepEqual(json.data, lista);
    assert.ok(json.exportedAt);
  });

  test('el botón todavía no existe en el HTML (llega en la fase de UI)', () => {
    assert.equal(env.el('backup-export-btn'), null);
  });
});