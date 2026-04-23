export const FIELDS = ['nombre','tel','ciudad','provincia','fecha','marca','modelo','cpu','gpu','ram','discos','problema','tareas','cobrado'];

export function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
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
