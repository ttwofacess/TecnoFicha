import { repairs } from '../state.js';
import { esc, formatDate, updateTopbarCount } from '../utils.js';
import { showDetail } from './detail.js';

export function renderList() {
  const q = (document.getElementById('search-input')?.value || '').toLowerCase();
  const prov = document.getElementById('filter-prov')?.value || '';

  const filtered = repairs.filter(r => {
    const matchQ = !q || [r.nombre, r.ciudad, r.provincia, r.marca, r.modelo]
      .some(v => (v || '').toLowerCase().includes(q));
    const matchP = !prov || r.provincia === prov;
    return matchQ && matchP;
  }).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

  const meta = document.getElementById('list-meta');
  if (meta) {
    meta.textContent = filtered.length
      ? `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`
      : '';
  }

  updateTopbarCount(repairs.length);

  const container = document.getElementById('list-container');
  if (!container) return;
  
  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔧</div>
        <p>${repairs.length ? 'No hay resultados para esa búsqueda.' : 'No hay reparaciones registradas.<br>Tocá ➕ para agregar la primera.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(r => `
    <div class="repair-card" onclick="showDetail('${r.id}')">
      <div class="rc-top">
        <span class="rc-name">${esc(r.nombre)}</span>
        <span class="rc-price${!r.cobrado ? ' empty-price' : ''}">${r.cobrado ? '$' + r.cobrado.toLocaleString('es-AR') : '—'}</span>
      </div>
      <div class="rc-model">${esc(r.marca)}${r.modelo ? ' · ' + esc(r.modelo) : ''}</div>
      <div class="rc-bottom">
        <span class="rc-loc">📍 ${esc(r.ciudad)}, ${esc(r.provincia)}</span>
        <span class="rc-date">${formatDate(r.fecha)}</span>
      </div>
    </div>
  `).join('');
}

window.renderList = renderList;
window.showDetail = showDetail;
