import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BACKUP_APP, BACKUP_SCHEMA, MAX_RECORDS,
  buildBackup, normalizeRecord, parseBackup, mergeRepairs,
} from '../js/backup.js';

const ID_RE = /^[a-z0-9]{1,40}$/i;

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

describe('buildBackup', () => {
  test('arma el envoltorio con app, schema, count y data', () => {
    const lista = [record(), record({ id: 'otro9999' })];
    const backup = buildBackup(lista);

    assert.equal(backup.app, BACKUP_APP);
    assert.equal(backup.schemaVersion, BACKUP_SCHEMA);
    assert.equal(backup.count, 2);
    assert.deepEqual(backup.data, lista);
    assert.ok(!Number.isNaN(Date.parse(backup.exportedAt)));
  });

  test('una lista vacía es un respaldo válido con count 0', () => {
    const backup = buildBackup([]);
    assert.equal(backup.count, 0);
    assert.deepEqual(backup.data, []);
  });
});

describe('normalizeRecord', () => {
  test('devuelve un registro limpio con los mismos valores', () => {
    const r = normalizeRecord(record());
    assert.deepEqual(r, record());
  });

  test('rechaza valores que no son objetos', () => {
    for (const bad of [null, undefined, 'texto', 42, [], true]) {
      assert.equal(normalizeRecord(bad), null, `debía rechazar ${JSON.stringify(bad)}`);
    }
  });

  test('regenera un id fuera de la lista blanca (XSS en onclick)', () => {
    const r = normalizeRecord(record({ id: "x');alert(1);//" }));

    assert.notEqual(r.id, "x');alert(1);//");
    assert.ok(ID_RE.test(r.id), `id regenerado inválido: ${r.id}`);
    assert.doesNotMatch(r.id, /['\\();]/);
  });

  test('regenera un id ausente o vacío', () => {
    for (const id of [undefined, null, '', 'con espacios', 'a'.repeat(41)]) {
      const r = normalizeRecord(record({ id }));
      assert.ok(ID_RE.test(r.id), `id inválido tras normalizar: ${r.id}`);
    }
  });

  test('respeta un id válido tal cual', () => {
    assert.equal(normalizeRecord(record({ id: 'lq3x9k2ab12cd' })).id, 'lq3x9k2ab12cd');
  });

  test('saca HTML de los textos libres', () => {
    const r = normalizeRecord(record({
      nombre: '<script>alert(1)</script>Juan',
      problema: 'No enciende <img src=x onerror=alert(1)>',
      tareas: 'Cambio "fuente"',
    }));

    assert.doesNotMatch(r.nombre, /[<>]/);
    assert.doesNotMatch(r.problema, /[<>]/);
    assert.doesNotMatch(r.tareas, /["'<>\\]/);
    assert.ok(r.nombre.includes('Juan'));
    assert.ok(r.problema.includes('No enciende'));
  });

  test('normaliza cobrado: basura y negativos a 0', () => {
    assert.equal(normalizeRecord(record({ cobrado: 'abc' })).cobrado, 0);
    assert.equal(normalizeRecord(record({ cobrado: -5 })).cobrado, 0);
    assert.equal(normalizeRecord(record({ cobrado: null })).cobrado, 0);
    assert.equal(normalizeRecord(record({ cobrado: 999_999_999_999 })).cobrado, 0);
    assert.equal(normalizeRecord(record({ cobrado: '25000.50' })).cobrado, 25000.5);
  });

  test('descarta fechas imposibles o mal formadas', () => {
    assert.equal(normalizeRecord(record({ fecha: '2026-13-45' })), null);
    assert.equal(normalizeRecord(record({ fecha: '01/10/2026' })), null);
    assert.equal(normalizeRecord(record({ fecha: '' })), null);
  });

  test('descarta registros sin campos obligatorios', () => {
    for (const field of ['nombre', 'ciudad', 'provincia', 'marca', 'fecha', 'problema']) {
      assert.equal(normalizeRecord(record({ [field]: '' })), null, `debía descartar sin ${field}`);
    }
  });

  test('campos opcionales vacíos no impiden el registro', () => {
    const r = normalizeRecord(record({ tel: '', modelo: '', cpu: '', gpu: '', ram: '', discos: '', tareas: '', cobrado: 0 }));
    assert.ok(r);
    assert.equal(r.tel, '');
    assert.equal(r.ram, '');
    assert.equal(r.cobrado, 0);
  });

  test('createdAt/updatedAt inválidos caen a la fecha actual', () => {
    const r = normalizeRecord(record({ createdAt: 'ayer', updatedAt: null }));
    assert.ok(Number.isFinite(r.createdAt));
    assert.ok(Number.isFinite(r.updatedAt));
  });

  test('ignora campos extra que no están en el esquema', () => {
    const r = normalizeRecord({ ...record(), hack: '<script>', toString: 'x' });
    assert.equal(r.hack, undefined);
    assert.deepEqual(Object.keys(r), Object.keys(record()));
  });
});

describe('parseBackup', () => {
  test('ida y vuelta: exportar y volver a importar da lo mismo', () => {
    const lista = [record(), record({ id: 'segundo1', nombre: 'Ana Diaz', cobrado: 0, updatedAt: 1790000000001 })];
    const { records, invalid } = parseBackup(JSON.stringify(buildBackup(lista)));

    assert.equal(invalid, 0);
    assert.deepEqual(records, lista);
  });

  test('acepta un array pelado (contenido copiado de localStorage)', () => {
    const { records, invalid } = parseBackup(JSON.stringify([record()]));
    assert.equal(invalid, 0);
    assert.deepEqual(records, [record()]);
  });

  test('rechaza JSON roto', () => {
    assert.throws(() => parseBackup('{no es json'), /JSON válido/);
  });

  test('rechaza un objeto sin data', () => {
    assert.throws(() => parseBackup(JSON.stringify({ hola: 'mundo' })), /formato de TecnoFicha/);
  });

  test('rechaza un archivo de otra app', () => {
    assert.throws(
      () => parseBackup(JSON.stringify({ app: 'otra-app', schemaVersion: 1, data: [] })),
      /no es un respaldo de TecnoFicha/
    );
  });

  test('rechaza un schema más nuevo que el soportado', () => {
    assert.throws(
      () => parseBackup(JSON.stringify(buildBackup([record()])) && JSON.stringify({ ...buildBackup([record()]), schemaVersion: BACKUP_SCHEMA + 1 })),
      /versión más nueva/
    );
  });

  test('rechaza demasiados registros', () => {
    const many = Array.from({ length: MAX_RECORDS + 1 }, (_, i) => record({ id: `id${i}` }));
    assert.throws(() => parseBackup(JSON.stringify(many)), /demasiados registros/);
  });

  test('cuenta los inválidos pero sigue con los válidos', () => {
    const { records, invalid } = parseBackup(JSON.stringify([
      record(),
      record({ id: 'sinfecha', fecha: '' }),
      'basura',
      record({ id: 'segundo1', nombre: 'Ana Diaz' }),
    ]));

    assert.equal(invalid, 2);
    assert.deepEqual(records.map((r) => r.id), ['abc123def456', 'segundo1']);
  });

  test('un archivo sin registros válidos devuelve records vacío', () => {
    const { records, invalid } = parseBackup(JSON.stringify([{ id: 'x' }, 'basura']));
    assert.deepEqual(records, []);
    assert.equal(invalid, 2);
  });

  test('ids repetidos en el archivo: gana el updatedAt mayor', () => {
    const { records } = parseBackup(JSON.stringify([
      record({ nombre: 'Viejo', updatedAt: 1000 }),
      record({ nombre: 'Nuevo', updatedAt: 2000 }),
      record({ nombre: 'Medio', updatedAt: 1500 }),
    ]));

    assert.equal(records.length, 1);
    assert.equal(records[0].nombre, 'Nuevo');
  });

  test('un id malicioso repetido genera registros distintos, no duplica por unsafe', () => {
    const { records } = parseBackup(JSON.stringify([
      record({ id: "x');alert(1);//" }),
      record({ id: "x');alert(1);//" }),
    ]));

    assert.equal(records.length, 2);
    for (const r of records) assert.ok(ID_RE.test(r.id));
  });
});

describe('mergeRepairs', () => {
  test('agrega los nuevos sin tocar los actuales', () => {
    const actual = [record({ id: 'a1', nombre: 'Actual' })];
    const nuevo = [record({ id: 'b2', nombre: 'Nuevo' })];
    const { list, added, updated } = mergeRepairs(actual, nuevo);

    assert.equal(added, 1);
    assert.equal(updated, 0);
    assert.equal(list.length, 2);
    assert.ok(list.some((r) => r.nombre === 'Actual'));
    assert.ok(list.some((r) => r.nombre === 'Nuevo'));
  });

  test('reemplaza cuando el entrante tiene updatedAt mayor', () => {
    const actual = [record({ id: 'a1', nombre: 'Actual', updatedAt: 1000 })];
    const entrante = [record({ id: 'a1', nombre: 'Del archivo', updatedAt: 2000 })];
    const { list, added, updated } = mergeRepairs(actual, entrante);

    assert.equal(added, 0);
    assert.equal(updated, 1);
    assert.equal(list.length, 1);
    assert.equal(list[0].nombre, 'Del archivo');
  });

  test('no pisa si el entrante es igual o más viejo', () => {
    const actual = [record({ id: 'a1', nombre: 'Actual', updatedAt: 2000 })];
    const igual = mergeRepairs(actual, [record({ id: 'a1', nombre: 'Empate', updatedAt: 2000 })]);
    const viejo = mergeRepairs(actual, [record({ id: 'a1', nombre: 'Viejo', updatedAt: 1000 })]);

    assert.equal(igual.updated, 0);
    assert.equal(igual.list[0].nombre, 'Actual');
    assert.equal(viejo.updated, 0);
    assert.equal(viejo.list[0].nombre, 'Actual');
  });

  test('nunca borra: lo que no viene en el archivo se queda', () => {
    const actual = [record({ id: 'a1' }), record({ id: 'a2' }), record({ id: 'a3' })];
    const { list } = mergeRepairs(actual, [record({ id: 'b1' })]);
    assert.deepEqual(list.map((r) => r.id).sort(), ['a1', 'a2', 'a3', 'b1']);
  });

  test('no muta los arrays de entrada', () => {
    const actual = [record({ id: 'a1', updatedAt: 1000 })];
    const entrante = [record({ id: 'a1', nombre: 'Entrante', updatedAt: 2000 })];
    const copiaActual = structuredClone(actual);
    const copiaEntrante = structuredClone(entrante);

    mergeRepairs(actual, entrante);

    assert.deepEqual(actual, copiaActual);
    assert.deepEqual(entrante, copiaEntrante);
  });

  test('actualizar todo con un respaldo propio no cambia nada', () => {
    const lista = [record({ id: 'a1', updatedAt: 1000 }), record({ id: 'a2', updatedAt: 1000 })];
    const { list, added, updated } = mergeRepairs(lista, lista);
    assert.equal(added, 0);
    assert.equal(updated, 0);
    assert.deepEqual(list, lista);
  });
});

describe('integridad con la app', () => {
  test('el estado que genera el import pasa los sanitizadores del formulario', () => {
    const { records } = parseBackup(JSON.stringify(buildBackup([record()])));
    const r = records[0];

    // Los campos que rompen el render si no son del tipo correcto.
    assert.equal(typeof r.cobrado, 'number');
    assert.ok(Number.isFinite(r.cobrado));
    assert.match(r.fecha, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof r.nombre, 'string');
    assert.equal(typeof r.provincia, 'string');
    assert.ok(ID_RE.test(r.id));
  });

  test('normalizeRecord no guarda la referencia original', () => {
    const original = record();
    const r = normalizeRecord(original);
    r.nombre = 'Cambiado';
    assert.equal(original.nombre, 'Juan Perez');
  });

  test('el nombre de archivo del respaldo se deriva de la fecha local', () => {
    // Solo verifica que el formato de la fecha sea utilizable en el nombre.
    const stamp = new Date().toLocaleDateString('sv-SE');
    assert.match(stamp, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(`tecnoficha-backup-${stamp}.json`.endsWith('.json'));
  });

  test('la capa pura no importa DOM ni toca localStorage', () => {
    // Estos tests corren sin jsdom ni localStorage globales: si el núcleo los
    // tocara, ya fallarían al importar. El chequeo extra es sobre los imports.
    for (const global of ['document', 'window', 'localStorage']) {
      assert.equal(typeof globalThis[global], 'undefined', `${global} no debería estar definido`);
    }

    const src = readFileSync(new URL('../js/backup.js', import.meta.url), 'utf8');
    const imports = [...src.matchAll(/^import\s.*?from\s+'([^']+)';/gms)].map((m) => m[1]);
    assert.deepEqual(imports, ['./state.js', './utils.js']);
  });
});