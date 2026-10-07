import { test, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';

import { setupDom, importFresh } from './helpers/env.js';

/**
 * jsdom no implementa <dialog> en absoluto: ni showModal ni close ni el
 * atributo open. Polyfill mínimo con la semántica que usa initBackup():
 * showModal abre, close cierra, y 'cancel' es lo que dispara Esc.
 */
function shimDialog(env) {
  const proto = env.window.HTMLDialogElement?.prototype;
  if (!proto || proto.showModal) return;

  // `open` refleja el atributo, igual que en el navegador: no se asigna a mano
  // (el atributo es lo que mantiene el estado).
  Object.defineProperty(proto, 'open', {
    configurable: true,
    get() { return this.hasAttribute('open'); },
  });
  proto.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  proto.close = function close() {
    this.removeAttribute('open');
    this.dispatchEvent(new env.window.Event('close'));
  };
}

function shimFileText(env) {
  if (env.window.File.prototype.text) return;
  Object.defineProperty(env.window.File.prototype, 'text', {
    configurable: true,
    writable: true,
    value: function text() {
      return new Promise((resolve, reject) => {
        const reader = new env.window.FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    },
  });
}

function stubDownloads(env) {
  const calls = [];
  const prevCreate = globalThis.URL.createObjectURL;
  const prevRevoke = globalThis.URL.revokeObjectURL;
  globalThis.URL.createObjectURL = (blob) => {
    calls.push({ blob });
    return `blob:mock/${calls.length}`;
  };
  globalThis.URL.revokeObjectURL = () => {};

  const originalClick = env.window.HTMLAnchorElement.prototype.click;
  env.window.HTMLAnchorElement.prototype.click = function click() {
    calls[calls.length - 1].href = this.href;
    calls[calls.length - 1].download = this.download;
  };

  return {
    calls,
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

// Módulo recién importado por cada beforeEach: el estado de `pending` es
// estado de módulo, así que hay que recargar el import para no arrastrarlo.
let ui;
let env;

/**
 * Espera a que onFileChosen termine. El FileReader de jsdom no resuelve en un
 * solo turno del event loop, así que un setTimeout(0) alcanza a veces y otras
 * no; se reintenta unas cuantas veces.
 */
async function waitForDialog() {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 5));
    if (ui.hasPendingImport()) return;
  }
}

/** Espera a que aparezca un aviso (para el camino de error). */
async function waitForToast() {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 5));
    if (env.el('toast').classList.contains('show')) return;
  }
}

describe('cableado de la UI del respaldo', () => {
  let dl;

  beforeEach(async () => {
    env = setupDom();
    shimDialog(env);
    shimFileText(env);
    dl = stubDownloads(env);
    ui = await importFresh('js/backup-ui.js');
    ui.initBackup();
  });

  afterEach(() => {
    dl.restore();
    env.restore();
  });

  const el = (id) => env.el(id);
  // La clave real de js/state.js. Si se escribe con otro nombre, el test escribe
  // en una clave que la app nunca lee y falla sin que se entienda por qué:
  // por eso todos los setItem de este archivo usan esta constante.
  const LS_KEY = 'tecnificha_v1';
  const stored = () => JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
  const toastText = () => env.el('toast-message')?.textContent ?? '';
  const toastVisible = () => env.el('toast')?.classList.contains('show');

  /** Simula que el usuario eligió un archivo en el input. */
  async function chooseFile(name, contents) {
    const input = el('backup-file-input');
    const file = new env.window.File([JSON.stringify(contents)], name, { type: 'application/json' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new env.window.Event('change'));
    // onFileChosen es async y lee el archivo con File.text(); en jsdom eso
    // pasa por el FileReader, que no resuelve en un solo turno del event loop.
    await waitForDialog();
  }

  const backupFile = (list) => ({ app: 'tecnoficha', schemaVersion: 1, exportedAt: '2026-10-07T00:00:00.000Z', count: list.length, data: list });

  test('la app lee los datos que este archivo escribe', async () => {
    // Guarda la clave en una sola constante: si alguien la escribe a mano con
    // otro nombre, el test escribe donde la app no mira y falla sin explicación
    // clara. Este test falla de inmediato y con un mensaje obvio.
    localStorage.setItem(LS_KEY, JSON.stringify([record()]));
    const { load } = await importFresh('js/state.js');
    assert.equal(load().length, 1);
  });

  test('el botón Exportar dispara la descarga', () => {
    localStorage.setItem(LS_KEY, JSON.stringify([record()]));

    el('backup-export-btn').click();

    assert.equal(dl.calls.length, 1);
    assert.match(dl.calls[0].download, /^tecnoficha-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('el botón Exportar sin datos avisa y no descarga', () => {
    localStorage.removeItem(LS_KEY);

    el('backup-export-btn').click();

    assert.equal(dl.calls.length, 0);
    assert.match(toastText(), /No hay registros/);
  });

  test('Importar abre el selector de archivos', () => {
    let clicked = 0;
    el('backup-file-input').click = () => { clicked++; };

    el('backup-import-btn').click();

    assert.equal(clicked, 1);
  });

  test('elegir un archivo válido abre el diálogo con el resumen', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify([record({ id: 'yaesta1', updatedAt: 1000 })]));

    await chooseFile('respaldo.json', backupFile([
      record({ id: 'yaesta1', updatedAt: 2000 }),
      record({ id: 'nuevo001', nombre: 'Ana Diaz' }),
    ]));

    assert.ok(el('import-dialog').open, 'el diálogo debería estar abierto');
    const texto = el('import-summary').textContent;
    assert.match(texto, /2 registros/);
    assert.match(texto, /1 nuevo/);
    assert.match(texto, /1 se actualizan/);
    assert.match(texto, /Reemplazar todo.*borra/);
  });

  /** Igual que chooseFile, pero con contenido crudo (no un respaldo válido). */
  async function chooseRawFile(name, contents) {
    const input = el('backup-file-input');
    const file = new env.window.File([contents], name);
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new env.window.Event('change'));
    await waitForToast();
  }

  test('elegir un archivo inválido avisa y no abre el diálogo', async () => {
    await chooseRawFile('roto.json', 'esto no es json');

    assert.equal(el('import-dialog').open, false);
    assert.match(toastText(), /JSON válido/);
  });

  test('elegir un archivo inválido no borra los datos', async () => {
    const previos = [record()];
    localStorage.setItem(LS_KEY, JSON.stringify(previos));

    await chooseRawFile('x.json', 'nope');

    assert.deepEqual(stored(), previos);
  });

  test('el input se limpia para poder elegir el mismo archivo otra vez', async () => {
    const input = el('backup-file-input');
    Object.defineProperty(input, 'value', { configurable: true, writable: true, value: 'algo' });

    await chooseFile('respaldo.json', backupFile([record()]));

    assert.equal(input.value, '');
  });

  test('elegir ningún archivo no rompe', async () => {
    const input = el('backup-file-input');
    Object.defineProperty(input, 'files', { configurable: true, value: [] });
    input.dispatchEvent(new env.window.Event('change'));
    await new Promise((r) => setTimeout(r, 5));

    assert.equal(el('import-dialog').open, false);
    assert.equal(toastVisible(), false);
  });

  test('Combinar suma los registros y cierra el diálogo', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify([record({ id: 'mio000001' })]));
    await chooseFile('respaldo.json', backupFile([record({ id: 'nuevo001', nombre: 'Ana Diaz' })]));

    el('import-merge-btn').click();

    assert.equal(el('import-dialog').open, false);
    assert.deepEqual(stored().map((r) => r.id).sort(), ['mio000001', 'nuevo001']);
    assert.match(toastText(), /Importación lista/);
  });

  test('Reemplazar deja solo lo del archivo', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify([
      record({ id: 'mio1' }), record({ id: 'mio2' }), record({ id: 'mio3' }),
    ]));
    await chooseFile('respaldo.json', backupFile([record({ id: 'dell1' })]));

    el('import-replace-btn').click();

    assert.deepEqual(stored().map((r) => r.id), ['dell1']);
  });

  test('Cancelar no toca los datos', async () => {
    const previos = [record({ id: 'mio1' })];
    localStorage.setItem(LS_KEY, JSON.stringify(previos));
    await chooseFile('respaldo.json', backupFile([record({ id: 'nuevo1' })]));

    el('import-cancel-btn').click();

    assert.equal(el('import-dialog').open, false);
    assert.deepEqual(stored(), previos);
    assert.equal(toastVisible(), false);
  });

  test('cerrar con Esc (evento cancel) descarta lo preparado', async () => {
    const previos = [record({ id: 'mio1' })];
    localStorage.setItem(LS_KEY, JSON.stringify(previos));
    await chooseFile('respaldo.json', backupFile([record({ id: 'nuevo1' })]));
    assert.ok(el('import-dialog').open, 'el diálogo debería estar abierto');

    el('import-dialog').dispatchEvent(new env.window.Event('cancel'));
    el('import-dialog').close();

    // Si el 'cancel' no hubiera limpiado el estado, esto importaría de nuevo.
    assert.equal(ui.hasPendingImport(), false);
  });

  test('tras combinar, el contador y el filtro quedan al día', async () => {
    await chooseFile('respaldo.json', backupFile([
      record({ id: 'a1', provincia: 'Cordoba' }),
      record({ id: 'a2', provincia: 'Mendoza', nombre: 'Ana Diaz' }),
    ]));

    el('import-merge-btn').click();

    assert.equal(el('topbar-count').textContent, '2 registros');
    const opciones = [...el('filter-prov').options].map((o) => o.value);
    assert.deepEqual(opciones.sort(), ['', 'Cordoba', 'Mendoza']);
  });

  test('el resumen del diálogo se arma como texto, no como HTML', async () => {
    // Un nombre con HTML no puede terminar inyectando nodos en el diálogo.
    await chooseFile('respaldo.json', backupFile([record({ nombre: '<b>Juan</b>', problema: 'No enciende' })]));

    const resumen = el('import-summary');
    assert.equal(resumen.children.length, 0, 'el resumen no debería tener elementos');
    assert.ok(!resumen.innerHTML.includes('<b>'));
  });

  test('los botones de respaldo sobreviven a abrir el Resumen', () => {
    // renderStats() reescribe #stats-container; los botones están fuera.
    localStorage.setItem(LS_KEY, JSON.stringify([record()]));
    el('nav-stats').click();
    // No hace falta navigate: lo que importa es que el botón siga en el DOM.
    assert.ok(env.document.getElementById('backup-export-btn'));
  });

  test('exportar funciona incluso después de haber importado', async () => {
    await chooseFile('respaldo.json', backupFile([record({ id: 'a1' })]));
    el('import-merge-btn').click();

    el('backup-export-btn').click();

    assert.equal(dl.calls.length, 1);
    const json = JSON.parse(await dl.calls[0].blob.text());
    assert.equal(json.count, 1);
    assert.equal(json.data[0].id, 'a1');
  });
});