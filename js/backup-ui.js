// Capa del navegador del respaldo: las acciones que tocan el DOM.
// La lógica de armar y validar el archivo vive en js/backup.js, sin DOM.

import { repairs, load, setRepairs } from './state.js';
import { toast, updateProvinceFilter, updateTopbarCount } from './utils.js';
import { buildBackup, parseBackup, mergeRepairs, MAX_FILE_BYTES } from './backup.js';
import { renderStats } from './views/stats.js';

// Las descargas por blob: no pasan por el service worker (sw.js solo intercepta
// GET del mismo origen), así que no hace falta tocar el precache por esto.
const DOWNLOAD_PREFIX = 'tecnoficha-backup-';

// Registros leídos de un archivo y a la espera de que el usuario decida qué
// hacer con ellos (combinar o reemplazar). Vive en el módulo: el usuario
// puede pasar por el diálogo antes de confirmar.
let pending = null;

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

/* ---------- Importar ---------- */

/**
 * Lee el archivo elegido y deja los registros preparados para aplicar.
 * Devuelve un resumen con las cantidades que el diálogo necesita mostrar.
 * Lanza Error si el archivo no sirve; no modifica nada.
 */
export async function readBackupFile(file) {
  if (!file) throw new Error('No se eligió ningún archivo.');

  if (file.size > MAX_FILE_BYTES) {
    throw new Error('El archivo es demasiado grande.');
  }

  const { records, invalid } = parseBackup(await file.text());
  if (!records.length) {
    throw new Error(
      invalid ? 'El archivo no tiene registros válidos.' : 'El archivo está vacío.'
    );
  }

  load();
  const { added, updated } = mergeRepairs(repairs, records);
  const existing = records.length - added - updated;

  pending = { records, invalid };
  return { total: records.length, added, updated, existing, invalid };
}

/** Descarta lo que había preparado para importar. */
export function cancelImport() {
  pending = null;
}

/** Hay un archivo esperando decisión. */
export function hasPendingImport() {
  return pending !== null;
}

/**
 * Aplica lo importado y deja la pantalla al día.
 * @param {'merge'|'replace'} mode
 */
export function applyImport(mode) {
  if (!pending) return;
  const { records } = pending;
  pending = null; // se limpia igual si el guardado falla

  load();
  const next = mode === 'replace' ? records : mergeRepairs(repairs, records).list;

  try {
    setRepairs(next);
  } catch {
    // setRepairs asigna en memoria antes de persistir: si localStorage lanza
    // (cuota llena), memoria y disco quedan desincronizados. load() lo arregla.
    load();
    toast('No se pudo guardar: sin espacio en el navegador');
    return;
  }

  updateProvinceFilter(repairs);
  updateTopbarCount(repairs.length);
  renderStats();

  const n = repairs.length;
  toast(`Importación lista: ${n} registro${n !== 1 ? 's' : ''} ✓`);
}

/* ---------- Cableado ---------- */

const $ = (id) => document.getElementById(id);

/** Texto del resumen del diálogo. Se arma con textContent: nunca es HTML. */
export function importSummaryText({ total, added, updated, existing, invalid }) {
  const partes = [`${total} registro${total !== 1 ? 's' : ''}: ${added} nuevo${added !== 1 ? 's' : ''}`];
  if (updated) partes.push(`${updated} se actualizan`);
  if (existing > 0) partes.push(`${existing} ya existen`);

  let msg = `El archivo trae ${partes.join(', ')}.`;
  if (invalid) msg += ` ${invalid} inválido${invalid !== 1 ? 's' : ''} se omitieron.`;
  msg += ' "Reemplazar todo" borra lo que tenés ahora.';
  return msg;
}

function openImportDialog(resumen) {
  const dlg = $('import-dialog');
  if (!dlg) return;
  $('import-summary').textContent = importSummaryText(resumen);
  dlg.showModal();
}

async function onFileChosen(e) {
  const input = e.target;
  const file = input.files?.[0];
  input.value = ''; // permite volver a elegir el mismo archivo después

  if (!file) return;

  try {
    openImportDialog(await readBackupFile(file));
  } catch (err) {
    toast(err.message || 'No se pudo leer el archivo');
  }
}

export function initBackup() {
  $('backup-export-btn')?.addEventListener('click', exportBackup);
  $('backup-import-btn')?.addEventListener('click', () => $('backup-file-input')?.click());
  $('backup-file-input')?.addEventListener('change', onFileChosen);

  const dlg = $('import-dialog');
  $('import-merge-btn')?.addEventListener('click', () => { dlg?.close(); applyImport('merge'); });
  $('import-replace-btn')?.addEventListener('click', () => { dlg?.close(); applyImport('replace'); });
  $('import-cancel-btn')?.addEventListener('click', () => { cancelImport(); dlg?.close(); });

  // Esc o el botón "atrás" del navegador: el diálogo se cierra solo, pero lo
  // que había preparado para importar tiene que descartarse igual.
  dlg?.addEventListener('cancel', cancelImport);
}