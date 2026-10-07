// Núcleo del respaldo de datos: armar, validar e interpretar el archivo .json.
// Todo lo de esta capa es puro (sin DOM ni localStorage) para poder testearlo.

import { uid } from './state.js';
import {
  sanitizeNameInput, sanitizeTelInput, sanitizeCityInput, sanitizeProvinceInput,
  sanitizeFechaInput, sanitizeMarcaInput, sanitizeModeloInput, sanitizeCpuInput,
  sanitizeGpuInput, sanitizeRamInput, sanitizeDiscosInput, sanitizeProblemaInput,
  sanitizeTareasInput, sanitizeCobradoInput, validateCobrado,
} from './utils.js';

export const BACKUP_APP = 'tecnoficha';
export const BACKUP_SCHEMA = 1;
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_RECORDS = 20000;
// Lista blanca de ids: se insertan sin escapar en onclick="showDetail('${r.id}')"
// (js/views/list.js y detail.js), así que cualquier id fuera de este patrón se
// regenera con uid(). Es la defensa principal contra XSS vía archivo importado.
const ID_RE = /^[a-z0-9]{1,40}$/i;

/** Envuelve una lista de registros en el formato de respaldo. */
export function buildBackup(list) {
  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    count: list.length,
    data: list,
  };
}

/**
 * Reconstruye un registro desde datos no confiables, campo por campo, con los
 * mismos sanitizadores que usa el formulario. Devuelve null si no sirve.
 */
export function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const now = Date.now();
  // sanitizeCobradoInput saca el signo '-', así que un cobrado negativo se
  // volvería positivo al sanearlo. Lo detectamos antes y lo dejamos en 0.
  const rawCobrado = raw.cobrado;
  const esNegativo = typeof rawCobrado === 'number'
    ? rawCobrado < 0
    : /^\s*-\d/.test(String(rawCobrado ?? ''));
  const cobradoClean = esNegativo ? '' : sanitizeCobradoInput(rawCobrado);
  const r = {
    id:        ID_RE.test(String(raw.id ?? '')) ? String(raw.id) : uid(),
    nombre:    sanitizeNameInput(raw.nombre).trim(),
    tel:       sanitizeTelInput(raw.tel),
    ciudad:    sanitizeCityInput(raw.ciudad).trim(),
    provincia: sanitizeProvinceInput(raw.provincia).trim(),
    fecha:     sanitizeFechaInput(raw.fecha),
    marca:     sanitizeMarcaInput(raw.marca).trim(),
    modelo:    sanitizeModeloInput(raw.modelo).trim(),
    cpu:       sanitizeCpuInput(raw.cpu).trim(),
    gpu:       sanitizeGpuInput(raw.gpu).trim(),
    ram:       sanitizeRamInput(raw.ram),
    discos:    sanitizeDiscosInput(raw.discos).trim(),
    problema:  sanitizeProblemaInput(raw.problema).trim(),
    tareas:    sanitizeTareasInput(raw.tareas).trim(),
    cobrado:   validateCobrado(cobradoClean) ? 0 : (parseFloat(cobradoClean) || 0),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };

  // Campos obligatorios: los mismos que exige el formulario al guardar.
  if (!r.nombre || !r.ciudad || !r.provincia || !r.marca || !r.fecha || !r.problema) return null;
  return r;
}

/**
 * Texto del archivo -> { records, invalid }.
 * Acepta el envoltorio de buildBackup y también un array pelado.
 * Lanza Error con un mensaje apto para mostrar al usuario.
 */
export function parseBackup(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }

  const isBareArray = Array.isArray(json);
  const list = isBareArray ? json : json?.data;
  if (!Array.isArray(list)) throw new Error('El archivo no tiene el formato de TecnoFicha.');

  if (!isBareArray) {
    if (json.app !== BACKUP_APP) throw new Error('Este archivo no es un respaldo de TecnoFicha.');
    if (Number(json.schemaVersion) > BACKUP_SCHEMA) {
      throw new Error('El respaldo es de una versión más nueva de la app. Actualizá TecnoFicha.');
    }
  }

  if (list.length > MAX_RECORDS) throw new Error('El archivo trae demasiados registros.');

  const byId = new Map();
  let invalid = 0;
  for (const raw of list) {
    const rec = normalizeRecord(raw);
    if (!rec) {
      invalid++;
      continue;
    }
    // Ids repetidos dentro del mismo archivo: gana el updatedAt más reciente.
    const prev = byId.get(rec.id);
    if (!prev || rec.updatedAt >= prev.updatedAt) byId.set(rec.id, rec);
  }

  return { records: [...byId.values()], invalid };
}

/**
 * Combina por id; gana el updatedAt más reciente. No borra nada y no muta
 * los arrays de entrada.
 */
export function mergeRepairs(current, incoming) {
  const byId = new Map(current.map((r) => [r.id, r]));
  let added = 0;
  let updated = 0;
  for (const r of incoming) {
    const prev = byId.get(r.id);
    if (!prev) {
      byId.set(r.id, r);
      added++;
    } else if (r.updatedAt > prev.updatedAt) {
      byId.set(r.id, r);
      updated++;
    }
  }
  return { list: [...byId.values()], added, updated };
}