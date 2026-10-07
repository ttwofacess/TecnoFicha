// Capa del navegador del respaldo: las acciones que tocan el DOM.
// La lógica de armar y validar el archivo vive en js/backup.js, sin DOM.

import { repairs, load } from './state.js';
import { toast } from './utils.js';
import { buildBackup } from './backup.js';

// Las descargas por blob: no pasan por el service worker (sw.js solo intercepta
// GET del mismo origen), así que no hace falta tocar el precache por esto.
const DOWNLOAD_PREFIX = 'tecnoficha-backup-';

/** Nombre del archivo con la fecha local en AAAA-MM-DD. */
export function backupFileName(date = new Date()) {
  return `${DOWNLOAD_PREFIX}${date.toLocaleDateString('sv-SE')}.json`;
}

/** Serializa una lista al texto del archivo de respaldo. */
export function backupJson(list) {
  return JSON.stringify(buildBackup(list), null, 2);
}

/**
 * Descarga un texto como archivo. Se separa de exportBackup para poder
 * probarla sin tocar la descarga real.
 */
export function downloadText(text, filename, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();

  // revokeObjectURL inmediato puede cancelar la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exporta los registros guardados. Relee de localStorage antes de armar el
 * archivo por si otra pestaña los modificó.
 */
export function exportBackup() {
  load();
  const lista = repairs;
  if (!lista.length) {
    toast('No hay registros para exportar');
    return;
  }

  downloadText(backupJson(lista), backupFileName());
  toast(`Respaldo exportado (${lista.length}) ✓`);
}