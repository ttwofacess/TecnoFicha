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
    .trim()
    .replace(/[<>"'`\\\x00]/g, '')   // strip dangerous / encoding chars
    .replace(/\s+/g, ' ')             // collapse whitespace
    .slice(0, MAX_LEN);
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
