import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, importFresh } from './helpers/env.js';
// Import plano (no fresh) a propósito: es la MISMA instancia de state.js que
// usa js/views/form.js, así que desde el test podemos resetear su estado.
import * as sharedState from '../js/state.js';

const LS_KEY = 'tecnificha_v1';

// Campos obligatorios: nombre, ciudad, provincia, fecha, marca y problema.
const VALID = {
  nombre: 'Juan Pérez',
  ciudad: 'Rosario',
  provincia: 'Santa Fe',
  fecha: '2024-03-05',
  marca: 'HP',
  problema: 'No prende la pantalla',
};

describe('form: guardar, editar y borrar reparaciones', () => {
  let env;
  let form;
  let showPage;

  beforeEach(async () => {
    env = setupDom();
    // navigation.js asigna window.showPage al importarse: tiene que ser con el
    // DOM ya montado. El import es plano para compartir instancia con form.js.
    ({ showPage } = await import('../js/navigation.js'));
    form = await importFresh('js/views/form.js');
    // form.js carga sus datos desde esta instancia compartida de state.js:
    // sin resetear, cada test heredaría los registros del anterior.
    sharedState.setRepairs([]);
    globalThis.confirm = () => false; // por defecto, el usuario no confirma
  });

  afterEach(() => {
    delete globalThis.confirm;
    env.restore();
  });

  // form.js llama a confirm() como identificador global, no como window.confirm
  const answering = (value) => {
    globalThis.confirm = () => value;
  };

  const fill = (values) => {
    for (const [field, value] of Object.entries(values)) {
      const el = env.el('f-' + field);
      if (el) el.value = value;
    }
  };

  const stored = () => JSON.parse(env.window.localStorage.getItem(LS_KEY) || '[]');
  const toastMessage = () => env.el('toast-message').textContent;

  const fillValid = (extra = {}) => {
    fill({ ...VALID, ...extra });
    form.saveRepair();
  };

  test('guarda una reparación válida y vuelve al listado', () => {
    showPage('new');
    fillValid({ tel: '+5491122334455', ram: '16', cobrado: '1500.50' });

    const saved = stored();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].nombre, 'Juan Pérez');
    assert.equal(saved[0].ciudad, 'Rosario');
    assert.equal(saved[0].tel, '+5491122334455');
    assert.equal(saved[0].ram, '16');
    assert.equal(saved[0].cobrado, 1500.5, 'cobrado se guarda como número');
    assert.ok(saved[0].id, 'debe tener id');
    assert.ok(saved[0].createdAt > 0);
    assert.ok(saved[0].updatedAt > 0);

    assert.equal(toastMessage(), 'Reparación guardada ✓');
    assert.ok(env.el('page-list').classList.contains('active'), 'debe volver al listado');
    assert.ok(env.el('nav-list').classList.contains('active'));
  });

  test('los campos opcionales vacíos no rompen el guardado', () => {
    showPage('new');
    fill(VALID);
    form.saveRepair();

    const saved = stored();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].tel, '');
    assert.equal(saved[0].cobrado, 0, 'sin monto, 0');
  });

  test('un campo obligatorio vacío no guarda nada y avisa', () => {
    showPage('new');
    fill({ ...VALID, nombre: '' });
    form.saveRepair();

    assert.deepEqual(stored(), [], 'no debe guardar un registro inválido');
    assert.equal(toastMessage(), 'El nombre es obligatorio.');
    assert.equal(env.el('f-nombre-error').textContent, 'El nombre es obligatorio.');
    assert.notEqual(env.el('f-nombre-error').style.display, 'none', 'el error debe verse');
    assert.ok(env.el('page-new').classList.contains('active'), 'no debe navegar si falla');
    assert.equal(env.el('f-nombre').value, '', 'el foco va al campo con error');
  });

  test('acumula los errores de todos los obligatorios vacíos', () => {
    showPage('new');
    form.saveRepair(); // todo vacío

    assert.deepEqual(stored(), []);
    assert.equal(env.el('f-nombre-error').textContent, 'El nombre es obligatorio.');
    assert.equal(env.el('f-ciudad-error').textContent, 'La ciudad es obligatoria.');
    assert.equal(env.el('f-provincia-error').textContent, 'La provincia es obligatoria.');
    assert.equal(env.el('f-marca-error').textContent, 'La marca es obligatoria.');
    assert.equal(env.el('f-problema-error').textContent, 'El problema es obligatorio.');
  });

  test('limpia los caracteres no permitidos al guardar', () => {
    showPage('new');
    fillValid({ nombre: 'Juan<b>Pérez</b>', problema: 'No prende "nada"' });

    const saved = stored();
    assert.equal(saved[0].nombre, 'JuanbPérezb', 'el sanitizador deja las letras, saca el marcado y la barra');
    assert.doesNotMatch(saved[0].problema, /[<>"`]/);
  });

  test('editar actualiza el registro sin crear otro ni perder createdAt', () => {
    showPage('new');
    fillValid();
    const original = stored()[0];

    form.editRepair(original.id); // el mismo camino que el botón "Editar"
    fill({ nombre: 'Juan Pérez Editado' });
    form.saveRepair();

    const saved = stored();
    assert.equal(saved.length, 1, 'no debe duplicar el registro');
    assert.equal(saved[0].id, original.id, 'debe conservar el id');
    assert.equal(saved[0].nombre, 'Juan Pérez Editado');
    assert.equal(saved[0].createdAt, original.createdAt, 'createdAt no se toca al editar');
    assert.ok(saved[0].updatedAt >= original.updatedAt);
    assert.equal(toastMessage(), 'Cambios guardados ✓');
  });

  test('initForm precarga los datos del registro que se edita', () => {
    form.initForm();
    fillValid({ tel: '1122334455' });
    const id = stored()[0].id;

    form.initForm(id);

    assert.equal(env.el('f-nombre').value, 'Juan Pérez');
    assert.equal(env.el('f-tel').value, '1122334455');
    assert.equal(env.el('save-btn').textContent, 'Guardar cambios');
    assert.notEqual(env.el('delete-btn').style.display, 'none');
  });

  test('initForm sin id deja el formulario limpio y en modo crear', () => {
    form.initForm();
    fillValid();
    form.initForm();

    assert.equal(env.el('f-nombre').value, '');
    assert.equal(env.el('save-btn').textContent, 'Guardar reparación');
    assert.equal(env.el('delete-btn').style.display, 'none');
    assert.match(env.el('f-fecha').value, /^\d{4}-\d{2}-\d{2}$/, 'debe poner la fecha de hoy por defecto');
  });

  describe('borrar', () => {
    const seed = () => {
      showPage('new');
      fillValid();
      return stored()[0].id;
    };

    test('con confirmación borra el registro', () => {
      const id = seed();
      answering(true);
      form.editRepair(id);

      form.deleteRepair();

      assert.deepEqual(stored(), []);
      assert.equal(toastMessage(), 'Registro eliminado');
    });

    test('sin confirmación no borra nada', () => {
      const id = seed();
      answering(false);
      form.editRepair(id);

      form.deleteRepair();

      assert.equal(stored().length, 1, 'el usuario dijo que no');
    });

    test('borrar fuera de un registro abierto no hace nada', () => {
      seed();
      showPage('new'); // sin id: no estamos editando
      answering(true);

      form.deleteRepair();

      assert.equal(stored().length, 1);
    });

    test('borra solo el registro indicado', () => {
      showPage('new');
      fillValid({ nombre: 'Uno' });
      showPage('new');
      fillValid({ nombre: 'Dos' });
      assert.equal(stored().length, 2);

      answering(true);
      // lo más nuevo se guarda primero: [Dos, Uno]
      form.editRepair(stored().find((r) => r.nombre === 'Dos').id);
      form.deleteRepair();

      const left = stored();
      assert.equal(left.length, 1);
      assert.equal(left[0].nombre, 'Uno');
    });
  });
});