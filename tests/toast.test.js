import { test, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, sleep, importFresh } from './helpers/env.js';

describe('toast()', () => {
  let env;
  let toast;

  beforeEach(async () => {
    env = setupDom();
    ({ toast } = await importFresh('js/utils.js'));
  });

  afterEach(() => env.restore());

  const ui = () => ({
    box: env.el('toast'),
    msg: env.el('toast-message'),
    btn: env.el('toast-action-btn'),
  });

  describe('aviso temporal', () => {
    test('muestra el mensaje y se oculta solo', async () => {
      const { box, msg } = ui();
      toast('Hola');

      assert.equal(msg.textContent, 'Hola');
      assert.ok(box.classList.contains('show'));
      assert.equal(box.classList.contains('persistent'), false);

      await sleep(2500);
      assert.equal(box.classList.contains('show'), false);
    });

    test('respeta la duración indicada', async () => {
      const { box } = ui();
      toast('Corto', { duration: 30 });

      await sleep(10);
      assert.ok(box.classList.contains('show'));
      await sleep(60);
      assert.equal(box.classList.contains('show'), false);
    });

    test('no muestra el botón de acción', () => {
      const { btn } = ui();
      toast('Hola');
      assert.equal(btn.hidden, true);
    });

    test('el último aviso temporal gana y reinicia el timer', async () => {
      const { box, msg } = ui();
      toast('Primero');
      await sleep(30);
      toast('Segundo', { duration: 60 });

      assert.equal(msg.textContent, 'Segundo');
      await sleep(40);
      assert.ok(box.classList.contains('show'), 'el timer del primer aviso no debe apagarlo');
      await sleep(80);
      assert.equal(box.classList.contains('show'), false);
    });
  });

  describe('aviso persistente', () => {
    const showUpdate = (onAction = () => {}) =>
      toast('Nueva versión disponible', {
        persistent: true,
        actionText: 'Actualizar',
        onAction,
      });

    test('no se oculta solo y muestra el botón', async () => {
      const { box, msg, btn } = ui();
      showUpdate();

      assert.ok(box.classList.contains('show'));
      assert.ok(box.classList.contains('persistent'));
      assert.equal(msg.textContent, 'Nueva versión disponible');
      assert.equal(btn.hidden, false);
      assert.equal(btn.textContent, 'Actualizar');
      assert.equal(btn.disabled, false);

      await sleep(2600);
      assert.ok(box.classList.contains('show'), 'un aviso persistente no debe expirar');
    });

    test('el clic ejecuta onAction y cierra el aviso', () => {
      let calls = 0;
      const { box, btn } = ui();
      showUpdate(() => calls++);

      btn.click();
      assert.equal(calls, 1);
      assert.equal(box.classList.contains('show'), false);
      assert.equal(box.classList.contains('persistent'), false);
    });

    test('onAction puede mostrar otro aviso (flujo de actualización)', () => {
      const { box, msg, btn } = ui();
      showUpdate(() => toast('Actualizando…', { duration: 2000 }));

      btn.click();
      assert.equal(msg.textContent, 'Actualizando…');
      assert.ok(box.classList.contains('show'));
      assert.equal(box.classList.contains('persistent'), false);
      assert.equal(btn.hidden, true);
    });

    test('un aviso temporal no borra el persistente: lo restaura al expirar', async () => {
      const { box, msg, btn } = ui();
      showUpdate();

      toast('Registro eliminado', { duration: 40 });
      assert.equal(msg.textContent, 'Registro eliminado');
      assert.equal(btn.hidden, true);
      assert.equal(box.classList.contains('persistent'), false);

      await sleep(80);
      assert.equal(msg.textContent, 'Nueva versión disponible', 'el aviso de versión debe volver');
      assert.equal(btn.hidden, false);
      assert.ok(box.classList.contains('persistent'));
    });

    test('el botón sigue funcionando tras restaurar el aviso', async () => {
      let calls = 0;
      const { btn } = ui();
      showUpdate(() => calls++);
      toast('Registro eliminado', { duration: 20 });

      await sleep(60); // el temporal expira y se restaura el aviso de versión
      btn.click();
      assert.equal(calls, 1, 'no debe quedar un listener del aviso viejo');
    });

    test('varios avisos temporales seguidos no pierden el persistente', async () => {
      const { box, msg, btn } = ui();
      showUpdate();

      // Dos temporales que se pisan entre sí: el segundo no debe borrar el
      // aviso de versión que quedó apartado.
      toast('Reparación guardada ✓', { duration: 120 });
      toast('Registro eliminado', { duration: 60 });
      assert.equal(msg.textContent, 'Registro eliminado');

      await sleep(200);
      assert.equal(msg.textContent, 'Nueva versión disponible', 'el aviso de versión debe volver');
      assert.ok(box.classList.contains('persistent'));
      assert.equal(btn.hidden, false);
    });

    test('un persistente nuevo invalida el que estaba apartado', async () => {
      const { msg } = ui();
      showUpdate();
      toast('Registro eliminado', { duration: 20 });
      toast('Otra versión', { persistent: true, actionText: 'Actualizar', onAction: () => {} });

      await sleep(80);
      assert.equal(msg.textContent, 'Otra versión', 'no debe volver el aviso viejo');
    });

    test('no duplica listeners aunque se re-renderice', () => {
      let calls = 0;
      const { btn } = ui();
      showUpdate(() => calls++);
      showUpdate(() => calls++);
      showUpdate(() => calls++);

      btn.click();
      assert.equal(calls, 1, 'un clic debe disparar un solo callback');
    });

    test('un segundo aviso persistente reemplaza al primero', () => {
      const { msg } = ui();
      showUpdate();
      toast('Otra cosa', { persistent: true, actionText: 'Ir', onAction: () => {} });
      assert.equal(msg.textContent, 'Otra cosa');
    });
  });
});