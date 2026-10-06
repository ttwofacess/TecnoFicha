import { toast } from './utils.js';

const $ = (id) => document.getElementById(id);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true; // iOS

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS

let deferredPrompt = null;

export function initPWA() {
  setupInstall();
  registerServiceWorker();
}

/* ---------- Instalación ---------- */
function setupInstall() {
  const btn = $('install-btn');
  if (!btn || isStandalone()) return; // ya instalada: no ofrecer nada

  // Chrome / Edge / Android / Samsung Internet
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();      // evitamos el mini-infobar automático
    deferredPrompt = e;      // guardamos el evento para dispararlo con nuestro botón
    btn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    btn.hidden = true;
    toast('TecnoFicha instalada ✓');
  });

  // iOS Safari: no hay evento; mostramos el botón y damos instrucciones
  if (isIOS()) btn.hidden = false;

  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice; // { outcome: 'accepted' | 'dismissed' }
      deferredPrompt = null;
      btn.hidden = true;
    } else if (isIOS()) {
      $('ios-install-dialog')?.showModal();
    }
  });

  $('ios-install-close')?.addEventListener('click', () => $('ios-install-dialog')?.close());
}

/* ---------- Service worker + actualizaciones ---------- */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');

      // Ya había una versión nueva esperando
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdate(worker);
          }
        });
      });

      // Buscar actualizaciones cuando la app vuelve a primer plano
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch (err) {
      console.error('No se pudo registrar el service worker:', err);
    }
  });

  // Cuando el nuevo SW toma control, recargar una sola vez
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function showUpdate(worker) {
  const banner = $('update-banner');
  const btn = $('update-btn');
  if (!banner || !btn) return;
  banner.hidden = false;
  btn.onclick = () => {
    btn.disabled = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
}
