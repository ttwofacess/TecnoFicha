import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, importFresh } from './helpers/env.js';

// La clave está documentada en PWA.md: si cambia, los usuarios pierden sus registros.
const LS_KEY = 'tecnificha_v1';

describe('state: persistencia en localStorage', () => {
  let env;
  let state;

  beforeEach(async () => {
    env = setupDom();
    state = await importFresh('js/state.js');
  });

  afterEach(() => env.restore());

  const stored = () => JSON.parse(env.window.localStorage.getItem(LS_KEY));

  test('empieza vacío si no hay nada guardado', () => {
    assert.deepEqual(state.load(), []);
    assert.equal(env.window.localStorage.getItem(LS_KEY), null);
  });

  test('guarda y relee los registros', () => {
    const data = [{ id: 'a1', nombre: 'Juan', cobrado: 500 }];
    state.setRepairs(data);

    assert.deepEqual(stored(), data);
    assert.deepEqual(state.load(), data);
  });

  test('usa la clave tecnificha_v1 y ni una más', () => {
    state.setRepairs([{ id: 'a1' }]);

    const keys = Object.keys(env.window.localStorage).filter((k) => k !== LS_KEY);
    assert.deepEqual(keys, [], `llaves inesperadas: ${keys.join(', ')}`);
  });

  test('un JSON corrupto no rompe la app', () => {
    env.window.localStorage.setItem(LS_KEY, '{no es json');

    assert.deepEqual(state.load(), [], 'debe caer a una lista vacía, no lanzar');
  });

  test('lo guardado sobrevive a la recarga', async () => {
    state.setRepairs([{ id: 'a1', nombre: 'Juan Pérez' }]);

    // Recargar la app = mismo localStorage pero módulos nuevos desde cero.
    const reloaded = await importFresh('js/state.js');

    assert.deepEqual(reloaded.load(), [{ id: 'a1', nombre: 'Juan Pérez' }]);
  });

  test('uid() no repite', () => {
    const ids = new Set(Array.from({ length: 500 }, () => state.uid()));
    assert.equal(ids.size, 500, 'uid() está devolviendo ids repetidos');
  });

  test('uid() devuelve un string no vacío', () => {
    assert.equal(typeof state.uid(), 'string');
    assert.ok(state.uid().length > 0);
  });
});