import { repairs, load } from '../state.js';
import { esc, formatDate } from '../utils.js';
import { showPage } from '../navigation.js';
import { editRepair } from './form.js';

export function showDetail(id) {
  load();
  const r = repairs.find(x => x.id === id);
  if (!r) return;

  const rows = [
    ['Teléfono', r.tel],
    ['Ciudad', r.ciudad],
    ['Provincia', r.provincia],
    ['Fecha', formatDate(r.fecha)],
    ['Marca', r.marca],
    ['Modelo', r.modelo],
    ['CPU', r.cpu],
    ['GPU', r.gpu],
    ['RAM', r.ram ? r.ram + ' GB' : ''],
    ['Almacenamiento', r.discos],
  ].filter(([,v]) => v);

  const container = document.getElementById('detail-container');
  if (!container) return;

  container.innerHTML = `
    <button class="back-btn" onclick="showPage('list')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
      Volver
    </button>

    <div class="detail-header">
      <div>
        <div class="detail-client-name">${esc(r.nombre)}</div>
        <div class="detail-client-sub">${esc(r.ciudad)}, ${esc(r.provincia)}${r.tel ? ' · ' + esc(r.tel) : ''}</div>
      </div>
      <button class="edit-btn-sm" onclick="editRepair('${r.id}')">Editar</button>
    </div>

    <div class="section-label">Equipo y datos</div>
    <div class="info-block">
      ${rows.map(([k,v]) => `<div class="info-row"><span class="info-key">${esc(k)}</span><span class="info-val">${esc(v)}</span></div>`).join('')}
    </div>

    ${r.problema ? `
      <div class="section-label">Problema reportado</div>
      <div class="text-block">${esc(r.problema)}</div>
    ` : ''}

    ${r.tareas ? `
      <div class="section-label">Tareas realizadas</div>
      <div class="text-block">${esc(r.tareas)}</div>
    ` : ''}

    <div class="section-label">Cobrado</div>
    <div class="price-block">
      <div class="price-label">TOTAL</div>
      <div class="price-amount">${r.cobrado ? '$' + r.cobrado.toLocaleString('es-AR') : '—'}</div>
    </div>
    <div style="height: 16px"></div>
  `;

  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('page-detail').classList.add('active');
  const nl = document.getElementById('nav-list');
  if (nl) nl.classList.add('active');
  window.scrollTo(0, 0);
}

window.showDetail = showDetail;
window.editRepair = editRepair;
