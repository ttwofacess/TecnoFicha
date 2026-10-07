import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = new URL('../../', import.meta.url);
const indexHtml = readFileSync(new URL('index.html', ROOT), 'utf8');

/**
 * Monta el index.html real en un DOM de jsdom y lo expone como global,
 * para poder importar los módulos de la app como si fuera el navegador.
 * Usar el HTML real hace fallar los tests si se borra o renombra un id.
 */
export function setupDom() {
  // jsdom no implementa window.location.reload (propiedad inmutable). Lo detectamos
  // por el error de navegación que emite, así podemos contar las recargas.
  const jsdomErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => jsdomErrors.push(e.message));

  const dom = new JSDOM(indexHtml, { url: 'https://example.test/', virtualConsole });
  const { window } = dom;

  // 'load' real de jsdom. Se captura acá (no después) porque jsdom pone
  // readyState='complete' antes de despacharlo: esperar por readyState deja
  // pasar el load y los listeners quedan registrados dos veces.
  const loaded = new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));

  // jsdom no implementa scrollTo (navigation.js lo llama en cada cambio de página)
  window.scrollTo = () => {};

  // jsdom no implementa matchMedia (lo usa js/pwa.js)
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });

  const nav = window.navigator;
  Object.defineProperty(nav, 'serviceWorker', { value: undefined, configurable: true, writable: true });

  // Los módulos usan setTimeout global (timeouts de toast). Los rastreamos para
  // cancelarlos al terminar el test: si no, un timer pendientehide el toast
  // del test siguiente.
  const realSetTimeout = globalThis.setTimeout;
  const pending = new Set();
  const trackedSetTimeout = (fn, ms, ...rest) => {
    const id = realSetTimeout(fn, ms, ...rest);
    pending.add(id);
    return id;
  };
  Object.defineProperty(globalThis, 'setTimeout', { value: trackedSetTimeout, configurable: true, writable: true });

  const prev = {};
  for (const key of ['window', 'document', 'navigator', 'matchMedia', 'localStorage', 'CustomEvent', 'Event', 'HTMLElement']) {
    prev[key] = globalThis[key];
    // Node 24 define `navigator` como getter: hay que redefinir la propiedad.
    Object.defineProperty(globalThis, key, {
      value: window[key],
      configurable: true,
      writable: true,
    });
  }

  return {
    window,
    loaded,
    document: window.document,
    el: (id) => window.document.getElementById(id),
    setServiceWorker: (value) => Object.defineProperty(nav, 'serviceWorker', { value, configurable: true, writable: true }),
    reloads: () => jsdomErrors.filter((m) => /navigation/i.test(m)).length,
    restore() {
      for (const id of pending) clearTimeout(id);
      pending.clear();
      Object.defineProperty(globalThis, 'setTimeout', { value: realSetTimeout, configurable: true, writable: true });
      for (const [key, value] of Object.entries(prev)) {
        if (value === undefined) delete globalThis[key];
        else Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
      }
      window.close();
    },
  };
}

/** Instala listeners de load y dispara el evento, como hace el navegador. */
export function fireLoad(window) {
  window.dispatchEvent(new window.Event('load'));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let bust = 0;
/** Importa un módulo con estado fresco (el estado del toast es a nivel de módulo). */
export function importFresh(relativePath) {
  bust += 1;
  return import(new URL(`../../${relativePath}?fresh=${bust}`, import.meta.url).href);
}