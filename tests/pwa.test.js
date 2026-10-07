import { test, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, fireLoad, importFresh } from './helpers/env.js';

/** Stub de un ServiceWorker en estado 'installed' / 'waiting'. */
function fakeWorker({ state = 'installed' } = {}) {
  const listeners = {};
  return {
    state,
    messages: [],
    postMessage(msg) { this.messages.push(msg); },
    addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
    setState(next) { this.state = next; (listeners.statechange || []).forEach((f) => f()); },
  };
}

function fakeRegistration(overrides = {}) {
  const listeners = {};
  return {
    waiting: null,
    updates: 0,
    addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
    emit(ev) { (listeners[ev] || []).forEach((f) => f()); },
    async update() { this.updates += 1; },
    ...overrides,
  };
}

function setup({ registration, controller = {} } = {}) {
  const containerListeners = {};
  const container = {
    controller,
    registrations: [],
    async register(url, opts) {
      container.registered = { url, opts };
      return registration;
    },
    getRegistration: async () => registration,
    addEventListener(ev, fn) { (containerListeners[ev] ||= []).push(fn); },
    emit(ev) { (containerListeners[ev] || []).forEach((f) => f()); },
  };
  return { container, containerListeners };
}

describe('pwa: aviso de nueva versión', () => {
  let env;
  let registration;

  const boot = async ({ container } = {}) => {
    // Primero el 'load' real de jsdom: si no, el que disparamos a mano se le
    // suma y js/pwa.js registra sus listeners dos veces.
    await env.loaded;
    if (container) env.setServiceWorker(container);
    const { initPWA } = await importFresh('js/pwa.js');
    initPWA();
    fireLoad(env.window);
    await new Promise((r) => setTimeout(r, 0)); // deja correr el register() async
  };

  beforeEach(() => {
    env = setupDom();
    registration = fakeRegistration();
  });

  afterEach(() => env.restore());

  const ui = () => ({
    box: env.el('toast'),
    msg: env.el('toast-message'),
    btn: env.el('toast-action-btn'),
  });

  test('registra el service worker sin caché HTTP', async () => {
    const { container } = setup({ registration });
    await boot({ container });

    assert.equal(container.registered.url, './sw.js');
    assert.equal(container.registered.opts.updateViaCache, 'none');
  });

  test('muestra el toast persistente si ya había una versión esperando', async () => {
    const worker = fakeWorker();
    registration = fakeRegistration({ waiting: worker });
    const { container } = setup({ registration });
    await boot({ container });

    const { box, msg, btn } = ui();
    assert.equal(msg.textContent, 'Nueva versión disponible');
    assert.equal(btn.textContent, 'Actualizar');
    assert.equal(btn.hidden, false);
    assert.ok(box.classList.contains('persistent'));
  });

  test('no avisa en la primera instalación (no hay controller previo)', async () => {
    registration = fakeRegistration({ waiting: fakeWorker() });
    const { container } = setup({ registration, controller: null });
    await boot({ container });

    assert.equal(env.el('toast').classList.contains('show'), false);
  });

  test('el botón "Actualizar" envía SKIP_WAITING al worker', async () => {
    const worker = fakeWorker();
    registration = fakeRegistration({ waiting: worker });
    const { container } = setup({ registration });
    await boot({ container });

    ui().btn.click();

    assert.deepEqual(worker.messages, [{ type: 'SKIP_WAITING' }]);
  });

  test('si el worker quedó redundante, activa el que está esperando', async () => {
    // Llegó una v3 mientras el usuario decidía: el worker del aviso quedó
    // redundante y su SKIP_WAITING no haría nada.
    const viejo = fakeWorker();
    registration = fakeRegistration({ waiting: viejo });
    const { container } = setup({ registration });
    await boot({ container });

    const nuevo = fakeWorker();
    registration.waiting = nuevo;
    viejo.state = 'redundant';

    ui().btn.click();

    assert.deepEqual(viejo.messages, [], 'no hay que ACTIVAR un worker redundante');
    assert.deepEqual(nuevo.messages, [{ type: 'SKIP_WAITING' }]);
    assert.equal(env.el('toast-message').textContent, 'Actualizando…');
  });

  test('si no queda ningún worker esperando, avisa que no pudo actualizar', async () => {
    const viejo = fakeWorker();
    registration = fakeRegistration({ waiting: viejo });
    const { container } = setup({ registration });
    await boot({ container });

    viejo.state = 'redundant';
    registration.waiting = null;

    ui().btn.click();

    assert.deepEqual(viejo.messages, []);
    assert.equal(env.el('toast-message').textContent, 'No se pudo actualizar. Recargá la app.');
    assert.equal(env.el('toast').classList.contains('persistent'), false);
  });

  test('avisa cuando termina de instalar una versión nueva (updatefound)', async () => {
    const { container } = setup({ registration });
    await boot({ container });

    // reg.installing es el worker en curso; debe existir cuando se emite updatefound
    const installing = fakeWorker({ state: 'installing' });
    Object.defineProperty(registration, 'installing', { value: installing, configurable: true });
    registration.emit('updatefound');

    assert.equal(env.el('toast').classList.contains('show'), false, 'aún no terminó de instalar');

    installing.setState('installed');

    const { msg, btn } = ui();
    assert.equal(msg.textContent, 'Nueva versión disponible');
    assert.equal(btn.textContent, 'Actualizar');
  });

  test('recarga una sola vez cuando el nuevo worker toma el control', async () => {
    const { container } = setup({ registration });
    await boot({ container });

    container.emit('controllerchange');
    container.emit('controllerchange');

    assert.equal(env.reloads(), 1, 'debe recargar una sola vez');
  });

  test('busca actualizaciones al volver a primer plano', async () => {
    const { container } = setup({ registration });
    await boot({ container });

    Object.defineProperty(env.window.document, 'visibilityState', { value: 'visible', configurable: true });
    env.document.dispatchEvent(new env.window.Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(registration.updates, 1);
  });

  test('no rompe si el registro falla', async () => {
    const { container } = setup({ registration });
    container.register = async () => { throw new Error('boom'); };
    await boot({ container });

    assert.equal(env.el('toast').classList.contains('show'), false);
  });

  test('sin soporte de service worker no falla', async () => {
    const { initPWA } = await importFresh('js/pwa.js');
    env.setServiceWorker(undefined);
    delete env.window.navigator.serviceWorker;
    initPWA();
    assert.ok(true);
  });
});