export const FIELDS = ['nombre','tel','ciudad','provincia','fecha','marca','modelo','cpu','gpu','ram','discos','problema','tareas','cobrado'];

export function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

/**
 * Sanitizes a free-text search query.
 * - Trims whitespace
 * - Strips characters that have no place in a name/city search
 *   (<, >, ", ', `, \, null bytes)
 * - Collapses runs of whitespace to a single space
 * - Enforces a maximum length to prevent DoS-style long inputs
 */
export function sanitizeSearchInput(raw) {
  const MAX_LEN = 100;
  return String(raw ?? '')
    .replace(/[<>"'`\\\x00]/g, '')   // strip dangerous / encoding chars
    .replace(/\s+/g, ' ')             // collapse whitespace
    .slice(0, MAX_LEN);
}

/**
 * Sanitizes a full-name input.
 * - Strips characters that are not letters (including accented Spanish),
 *   spaces, hyphens, apostrophes, or dots (for abbreviations like "Jr.")
 * - Collapses runs of whitespace to a single space
 * - Enforces a maximum length
 */
export function sanitizeNameInput(raw) {
  const MAX_LEN = 80;
  return String(raw ?? '')
    .replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s\-'.]/g, '') // keep only valid name chars
    .replace(/\s+/g, ' ')                              // collapse whitespace
    .slice(0, MAX_LEN);
}

/**
 * Validates a sanitized full name.
 * Returns a string with the error message, or null if the value is valid.
 */
export function validateName(value) {
  const sanitized = sanitizeNameInput(value).trim();
  if (!sanitized) {
    return 'El nombre es obligatorio.';
  }
  if (sanitized.length < 2) {
    return 'El nombre debe tener al menos 2 caracteres.';
  }
  // Must contain at least one letter (not just punctuation/spaces)
  if (!/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(sanitized)) {
    return 'El nombre debe contener letras.';
  }
  // Reject names that are all the same character repeated (e.g. "aaaaaaa")
  if (/^(.)\1+$/.test(sanitized.replace(/\s/g, ''))) {
    return 'Ingresá un nombre válido.';
  }
  return null;
}

/**
 * Sanitizes a city (ciudad) input.
 * - Keeps letters (including accented Spanish), spaces, hyphens, dots,
 *   and parentheses — enough for names like "Gral. Roca" or "San Martín (GBA)"
 * - Collapses runs of whitespace to a single space
 * - Enforces a maximum length
 */
export function sanitizeCityInput(raw) {
  const MAX_LEN = 80;
  return String(raw ?? '')
    .replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s\-'.()]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LEN);
}

/**
 * Validates a sanitized city name.
 * Returns an error string or null if valid.
 */
export function validateCity(value) {
  const sanitized = sanitizeCityInput(value).trim();
  if (!sanitized) return 'La ciudad es obligatoria.';
  if (sanitized.length < 2) return 'La ciudad debe tener al menos 2 caracteres.';
  if (!/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(sanitized)) return 'La ciudad debe contener letras.';
  return null;
}

/**
 * Sanitizes a province (provincia) input.
 * - Keeps letters (including accented Spanish), spaces, and hyphens
 *   — sufficient for all 24 Argentine province names
 * - Collapses runs of whitespace to a single space
 * - Enforces a maximum length
 */
export function sanitizeProvinceInput(raw) {
  const MAX_LEN = 60;
  return String(raw ?? '')
    .replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s\-]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LEN);
}

/**
 * Validates a sanitized province name.
 * Returns an error string or null if valid.
 */
export function validateProvince(value) {
  const sanitized = sanitizeProvinceInput(value).trim();
  if (!sanitized) return 'La provincia es obligatoria.';
  if (sanitized.length < 2) return 'La provincia debe tener al menos 2 caracteres.';
  if (!/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(sanitized)) return 'La provincia debe contener letras.';
  return null;
}

/**
 * Sanitizes a device brand (marca) input.
 * - Keeps letters, numbers, spaces, and common brand punctuation
 * - Removes HTML/control characters
 * - Collapses runs of whitespace to a single space
 * - Enforces a maximum length
 */
export function sanitizeMarcaInput(raw) {
  const MAX_LEN = 50;
  return String(raw ?? '')
    .replace(/[^\p{L}\p{N}\s&.+/#()\-]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LEN);
}

/**
 * Validates a sanitized device brand.
 * Returns an error string or null if valid.
 */
export function validateMarca(value) {
  const sanitized = sanitizeMarcaInput(value).trim();
  if (!sanitized) return 'La marca es obligatoria.';
  if (sanitized.length < 2) return 'La marca debe tener al menos 2 caracteres.';
  if (!/[\p{L}\p{N}]/u.test(sanitized)) return 'La marca debe contener letras o numeros.';
  if (/^(.)\1+$/.test(sanitized.replace(/\s/g, ''))) return 'Ingresa una marca valida.';
  return null;
}

/**
 * Sanitizes a device model input.
 * - Keeps letters, numbers, spaces, and common model punctuation
 * - Removes HTML/control characters
 * - Collapses runs of whitespace to a single space
 * - Enforces a maximum length
 */
export function sanitizeModeloInput(raw) {
  const MAX_LEN = 80;
  return String(raw ?? '')
    .replace(/[^\p{L}\p{N}\s&.+/#()_\-]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LEN);
}

/**
 * Validates a sanitized device model.
 * Returns an error string or null if valid. The field is optional.
 */
export function validateModelo(value) {
  const sanitized = sanitizeModeloInput(value).trim();
  if (!sanitized) return null;
  if (!/[\p{L}\p{N}]/u.test(sanitized)) return 'El modelo debe contener letras o numeros.';
  return null;
}

/**
 * Sanitizes a CPU input.
 * - Keeps letters, numbers, spaces, and common processor punctuation
 * - Removes HTML/control characters
 * - Collapses runs of whitespace to a single space
 * - Enforces a maximum length
 */
export function sanitizeCpuInput(raw) {
  const MAX_LEN = 80;
  return String(raw ?? '')
    .replace(/[^\p{L}\p{N}\s&.+/#()_\-]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LEN);
}

/**
 * Validates a sanitized CPU value.
 * Returns an error string or null if valid. The field is optional.
 */
export function validateCpu(value) {
  const sanitized = sanitizeCpuInput(value).trim();
  if (!sanitized) return null;
  if (!/[\p{L}\p{N}]/u.test(sanitized)) return 'El CPU debe contener letras o numeros.';
  return null;
}

/**
 * Sanitizes a GPU input.
 * - Keeps letters, numbers, spaces, and common graphics-card punctuation
 * - Removes HTML/control characters
 * - Collapses runs of whitespace to a single space
 * - Enforces a maximum length
 */
export function sanitizeGpuInput(raw) {
  const MAX_LEN = 80;
  return String(raw ?? '')
    .replace(/[^\p{L}\p{N}\s&.+/#()_\-]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LEN);
}

/**
 * Validates a sanitized GPU value.
 * Returns an error string or null if valid. The field is optional.
 */
export function validateGpu(value) {
  const sanitized = sanitizeGpuInput(value).trim();
  if (!sanitized) return null;
  if (!/[\p{L}\p{N}]/u.test(sanitized)) return 'El GPU debe contener letras o numeros.';
  return null;
}

function isValidISODate(value) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(value);
  return date instanceof Date && !Number.isNaN(date.valueOf()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day;
}

export function sanitizeFechaInput(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidISODate(value) ? value : '';
}

export function validateFecha(value) {
  const sanitized = sanitizeFechaInput(value).trim();
  if (!sanitized) return 'La fecha de consulta es obligatoria.';
  if (!isValidISODate(sanitized)) return 'La fecha de consulta no es válida.';
  return null;
}

/**
 * Sanitizes a telephone input.
 * - Keeps digits and a single leading +.
 * - Removes all other characters.
 * - Enforces a maximum length.
 */
export function sanitizeTelInput(raw) {
  const MAX_LEN = 20;
  const value = String(raw ?? '');
  const cleaned = value.replace(/[^\d+]/g, '');
  const hasPlus = cleaned.startsWith('+');
  const digitsOnly = cleaned.replace(/\+/g, '');
  return (hasPlus ? '+' : '') + digitsOnly.slice(0, MAX_LEN - (hasPlus ? 1 : 0));
}

/**
 * Validates a sanitized telephone number.
 * Returns an error string or null if valid. The field is optional.
 */
export function validateTel(value) {
  const sanitized = sanitizeTelInput(value).trim();
  if (!sanitized) return null;
  if (!/^\+?\d{8,15}$/.test(sanitized)) {
    return 'Teléfono inválido. Debe contener entre 8 y 15 dígitos y puede iniciar con +.';
  }
  return null;
}

/**
 * Sanitizes the province filter value.
 * Accepts only values that consist of letters (including accented Spanish
 * letters), spaces, and hyphens — exactly what Argentine province names
 * require. Any value that does not match is replaced with '' (show all).
 */
export function sanitizeProvinceFilter(raw) {
  const value = String(raw ?? '').trim();
  // Allow letters (a-z, A-Z, accented Spanish vowels), spaces, and hyphens
  return /^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s\-]{0,50}$/.test(value) ? value : '';
}

export function formatDate(d) {
  if (!d) return '';
  const [y,m,day] = d.split('-');
  return `${day}/${m}/${y}`;
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

export function updateTopbarCount(count) {
  const el = document.getElementById('topbar-count');
  if (el) {
    el.textContent = count ? count + ' registro' + (count !== 1 ? 's' : '') : '';
  }
}

export function updateProvinceFilter(repairs) {
  const sel = document.getElementById('filter-prov');
  if (!sel) return;
  const cur = sel.value;
  const provList = [...new Set(repairs.map(r => r.provincia).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todas</option>' +
    provList.map(p => `<option value="${esc(p)}"${p === cur ? ' selected' : ''}>${esc(p)}</option>`).join('');
}
