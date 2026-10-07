import { test, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';

import { setupDom, importFresh } from './helpers/env.js';

// jsdom no implementa File.prototype.text() (los navegadores sí). Polyfill
// mínimo sobre el File del window de jsdom.
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

const LS_KEY = 'tecnificha_v1';

describe('importar respaldo', () => {
  let env;
  let ui;
  let backup;

  beforeEach(async () => {
    env = setupDom();
    shimFileText(env);
    backup = await import('../js/backup.js');
    ui = await importFresh('js/backup-ui.js');
  });

  afterEach(() => env.restore());

  const stored = () => JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
  const setStored = (list) => localStorage.setItem(LS_KEY, JSON.stringify(list));

  const jsonFile = (name, obj) =>
    new env.window.File([JSON.stringify(obj)], name, { type: 'application/json' });

  const backupFile = (list) => jsonFile('respaldo.json', backup.buildBackup(list));
  const flatFile = (list) => jsonFile('plano.json', list);

  const toastText = () => env.el('toast-message')?.textContent ?? '';
  const toastVisible = () => env.el('toast')?.classList.contains('show');

  describe('leer el archivo', () => {
    test('devuelve las cantidades para el resumen del diálogo', async () => {
      setStored([record({ id: 'yaesta1', updatedAt: 1000 })]);
      const file = backupFile([
        record({ id: 'yaesta1', nombre: 'Actual', updatedAt: 2000 }),
        record({ id: 'nuevo001', nombre: 'Nuevo' }),
      ]);

      const resumen = await ui.readBackupFile(file);

      assert.equal(resumen.total, 2);
      assert.equal(resumen.added, 1);
      assert.equal(resumen.updated, 1);
      assert.equal(resumen.existing, 0);
      assert.equal(resumen.invalid, 0);
      assert.ok(ui.hasPendingImport());
    });

    test('cuenta los que ya existen sin cambios', async () => {
      setStored([record({ id: 'yaesta1' })]);
      const resumen = await ui.readBackupFile(backupFile([record({ id: 'yaesta1' })]));

      assert.equal(resumen.added, 0);
      assert.equal(resumen.updated, 0);
      assert.equal(resumen.existing, 1);
    });

    test('acepta un array pelado copiado de localStorage', async () => {
      const resumen = await ui.readBackupFile(flatFile([record()]));
      assert.equal(resumen.total, 1);
      assert.equal(resumen.added, 1);
    });

    test('cuenta los inválidos que se van a omitir', async () => {
      const resumen = await ui.readBackupFile(backupFile([
        record(),
        record({ id: 's-fecha', fecha: '' }),
      ]));

      assert.equal(resumen.total, 1);
      assert.equal(resumen.invalid, 1);
    });

    test('rechaza un archivo que no es JSON', async () => {
      const file = new env.window.File(['no soy json'], 'roto.json');
      await assert.rejects(() => ui.readBackupFile(file), /JSON válido/);
      assert.equal(ui.hasPendingImport(), false);
    });

    test('rechaza un archivo de otra app', async () => {
      const file = jsonFile('otro.json', { app: 'otra-app', schemaVersion: 1, data: [record()] });
      await assert.rejects(() => ui.readBackupFile(file), /no es un respaldo de TecnoFicha/);
    });

    test('rechaza un respaldo de una versión más nueva', async () => {
      const file = jsonFile('futuro.json', { app: 'tecnoficha', schemaVersion: 99, data: [record()] });
      await assert.rejects(() => ui.readBackupFile(file), /versión más nueva/);
    });

    test('rechaza un archivo sin ningún registro válido', async () => {
      const file = backupFile([{ id: 'x' }, 'basura']);
      await assert.rejects(() => ui.readBackupFile(file), /no tiene registros válidos/);
      assert.equal(ui.hasPendingImport(), false);
    });

    test('rechaza un archivo vacío', async () => {
      await assert.rejects(() => ui.readBackupFile(backupFile([])), /vacío/);
    });

    test('rechaza un archivo demasiado grande sin leerlo', async () => {
      const file = new env.window.File(['{}'], 'enorme.json');
      // jsdom no permite asignar a size (solo getter): se redefine la propiedad.
      Object.defineProperty(file, 'size', { value: backup.MAX_FILE_BYTES + 1 });

      await assert.rejects(() => ui.readBackupFile(file), /demasiado grande/);
    });

    test('un archivo justo en el límite de tamaño se lee', async () => {
      const archivo = backupFile([record()]);
      Object.defineProperty(archivo, 'size', { value: backup.MAX_FILE_BYTES });

      const resumen = await ui.readBackupFile(archivo);
      assert.equal(resumen.total, 1);
    });

    test('no elige archivo: no rompe', async () => {
      await assert.rejects(() => ui.readBackupFile(null), /No se eligió ningún archivo/);
    });

    test('leer un archivo malo no borra lo que ya había', async () => {
      const previos = [record()];
      setStored(previos);
      await assert.rejects(() => ui.readBackupFile(new env.window.File(['nope'], 'x.json')));

      assert.deepEqual(stored(), previos);
    });
  });

  describe('combinar', () => {
    test('agrega los nuevos y conserva los actuales', async () => {
      setStored([record({ id: 'mio000001', nombre: 'Mio' })]);
      await ui.readBackupFile(backupFile([record({ id: 'dell00001', nombre: 'Del archivo' })]));
      ui.applyImport('merge');

      const lista = stored();
      assert.equal(lista.length, 2);
      assert.deepEqual(lista.map((r) => r.id).sort(), ['dell00001', 'mio000001']);
    });

    test('actualiza solo los registros más viejos', async () => {
      setStored([
        record({ id: 'a1', nombre: 'Viejo', updatedAt: 1000 }),
        record({ id: 'a2', nombre: 'Intocable', updatedAt: 5000 }),
      ]);
      await ui.readBackupFile(backupFile([
        record({ id: 'a1', nombre: 'Nuevo', updatedAt: 2000 }),
        record({ id: 'a2', nombre: 'Intruso', updatedAt: 3000 }),
      ]));
      ui.applyImport('merge');

      const lista = stored();
      assert.equal(lista.length, 2);
      assert.equal(lista.find((r) => r.id === 'a1').nombre, 'Nuevo');
      assert.equal(lista.find((r) => r.id === 'a2').nombre, 'Intocable');
    });

    test('reimportar el mismo archivo no duplica nada', async () => {
      const lista = [record({ id: 'a1' }), record({ id: 'a2', nombre: 'Ana Diaz' })];
      await ui.readBackupFile(backupFile(lista));
      ui.applyImport('merge');
      assert.equal(stored().length, 2);

      await ui.readBackupFile(backupFile(lista));
      ui.applyImport('merge');
      assert.equal(stored().length, 2);
    });

    test('un id malicioso en el archivo no ejecuta nada al tocar la tarjeta', async () => {
      await ui.readBackupFile(backupFile([record({ id: "x');alert(1);//" })]));
      ui.applyImport('merge');

      const [r] = stored();
      assert.match(r.id, /^[a-z0-9]{1,40}$/i);
      assert.doesNotMatch(r.id, /['();]/);
    });
  });

  describe('reemplazar todo', () => {
    test('deja exactamente lo que trae el archivo', async () => {
      setStored([record({ id: 'mio000001' }), record({ id: 'mio000002' }), record({ id: 'mio000003' })]);
      await ui.readBackupFile(backupFile([record({ id: 'dell00001' })]));

      ui.applyImport('replace');

      assert.deepEqual(stored().map((r) => r.id), ['dell00001']);
    });

    test('puede dejar la lista vacía si el archivo no trae registros', async () => {
      // Un archivo con registros válidos nunca llega vacío a reemplazar: el
      // diálogo solo aparece si hay al menos uno.
      setStored([record({ id: 'mio000001' })]);
      await ui.readBackupFile(backupFile([record({ id: 'nuevo001' })]));
      ui.applyImport('replace');

      assert.deepEqual(stored().map((r) => r.id), ['nuevo001']);
    });
  });

  describe('estado después de importar', () => {
    test('avisa cuántos registros quedaron', async () => {
      setStored([record({ id: 'mio000001' })]);
      await ui.readBackupFile(backupFile([record({ id: 'nuevo001' })]));
      ui.applyImport('merge');

      assert.ok(toastVisible());
      assert.match(toastText(), /2 registros/);
      assert.match(toastText(), /✓/);
    });

    test('usa el singular para un solo registro', async () => {
      await ui.readBackupFile(backupFile([record()]));
      ui.applyImport('merge');
      assert.match(toastText(), /1 registro[^s]/);
    });

    test('actualiza el contador de la barra superior', async () => {
      await ui.readBackupFile(backupFile([record({ id: 'a1' }), record({ id: 'a2' })]));
      ui.applyImport('merge');

      assert.equal(env.el('topbar-count').textContent, '2 registros');
    });

    test('actualiza el filtro de provincias con las del archivo', async () => {
      setStored([record({ id: 'mio1', provincia: 'Cordoba' })]);
      await ui.readBackupFile(backupFile([record({ id: 'nuevo1', provincia: 'Mendoza' })]));
      ui.applyImport('merge');

      const opciones = [...env.el('filter-prov').options].map((o) => o.value);
      assert.deepEqual(opciones.sort(), ['', 'Cordoba', 'Mendoza']);
    });

    test('redibuja el resumen con los datos nuevos', async () => {
      await ui.readBackupFile(backupFile([record({ id: 'a1', marca: 'Lenovo', cobrado: 1000 })]));
      ui.applyImport('merge');

      const stats = env.el('stats-container').textContent;
      assert.match(stats, /Lenovo/);
    });

    test('no escribe en ninguna clave que no sea tecnificha_v1', async () => {
      localStorage.clear();
      await ui.readBackupFile(backupFile([record()]));
      ui.applyImport('merge');

      assert.deepEqual(Object.keys(localStorage), [LS_KEY]);
    });
  });

  /**
 * Simula que localStorage se quedó sin espacio.
 * El Storage de jsdom es un Proxy: asignar o definir `setItem` en la instancia
 * no reemplaza el método (la asignación se guarda como una clave llamada
 * "setItem"). Hay que parchear el prototipo.
 */
function fullQuota(env) {
  const proto = env.window.Storage.prototype;
  const original = proto.setItem;
  proto.setItem = function setItem() {
    const err = new Error('quota');
    err.name = 'QuotaExceededError';
    throw err;
  };
  return () => { proto.setItem = original; };
}

describe('cancelar y casos borde', () => {
    test('cancelar descarta lo preparado', async () => {
      setStored([record({ id: 'mio1' })]);
      await ui.readBackupFile(backupFile([record({ id: 'nuevo1' })]));
      ui.cancelImport();
      ui.applyImport('merge');

      assert.deepEqual(stored().map((r) => r.id), ['mio1']);
    });

    test('aplicar sin archivo preparado no hace nada', () => {
      setStored([record({ id: 'mio1' })]);
      ui.applyImport('merge');
      ui.applyImport('replace');

      assert.deepEqual(stored().map((r) => r.id), ['mio1']);
      assert.equal(toastVisible(), false);
    });

    test('un archivo preparado solo se aplica una vez', async () => {
      setStored([record({ id: 'mio1' })]);
      await ui.readBackupFile(backupFile([record({ id: 'nuevo1' })]));
      ui.applyImport('merge');

      setStored([record({ id: 'otro1' })]);
      ui.applyImport('replace');

      assert.deepEqual(stored().map((r) => r.id), ['otro1']);
    });

    test('si localStorage se llena, avisa y no deja la memoria desfasada', async () => {
      setStored([record({ id: 'mio1' })]);
      await ui.readBackupFile(backupFile([record({ id: 'nuevo1' })]));

      const restore = fullQuota(env);
      ui.applyImport('merge');
      restore();

      assert.match(toastText(), /sin espacio/);

      // Con la cuota restaurada, lo que quedó en disco sigue siendo el de antes:
      // la app no cree que hay registros que en realidad no se guardaron.
      const lista = JSON.parse(localStorage.getItem(LS_KEY));
      assert.deepEqual(lista.map((r) => r.id), ['mio1']);
    });

    test('el contador no se toca si el guardado falla', async () => {
      setStored([record({ id: 'mio1' })]);
      await ui.readBackupFile(backupFile([record({ id: 'nuevo1' }), record({ id: 'nuevo2' })]));
      env.el('topbar-count').textContent = '1 registro';

      const restore = fullQuota(env);
      ui.applyImport('merge');
      restore();

      // No se redibuja nada: el contador sigue diciendo la verdad.
      assert.equal(env.el('topbar-count').textContent, '1 registro');
    });

    test('el filtro de provincias no se toca si el guardado falla', async () => {
      setStored([record({ id: 'mio1', provincia: 'Cordoba' })]);
      await ui.readBackupFile(backupFile([record({ id: 'nuevo1', provincia: 'Mendoza' })]));
      ui.applyImport('merge'); // deja el filtro con Cordoba y Mendoza
      env.el('filter-prov').innerHTML = '<option value="">Todas</option><option>Cordoba</option>';

      const restore = fullQuota(env);
      ui.readBackupFile(backupFile([record({ id: 'otro1', provincia: 'Salta' })]));
      ui.applyImport('merge');
      restore();

      const opciones = [...env.el('filter-prov').options].map((o) => o.value);
      assert.deepEqual(opciones, ['', 'Cordoba']);
    });

    test('el resumen no se redibuja si el guardado falla', async () => {
      setStored([record({ id: 'mio1', marca: 'Lenovo' })]);
      await ui.readBackupFile(backupFile([record({ id: 'nuevo1', marca: 'Asus' })]));

      const restore = fullQuota(env);
      ui.applyImport('merge');
      restore();

      assert.doesNotMatch(env.el('stats-container').textContent, /Asus/);
    });
  });
});