import { repairs, load } from '../state.js';
import { esc } from '../utils.js';

export function renderStats() {
  load();
  const total = repairs.length;
  const ingresos = repairs.reduce((s,r) => s + (r.cobrado || 0), 0);
  const promedio = total ? Math.round(ingresos / total) : 0;

  const marcas = {};
  const provs = {};
  repairs.forEach(r => {
    if (r.marca) marcas[r.marca] = (marcas[r.marca] || 0) + 1;
    if (r.provincia) provs[r.provincia] = (provs[r.provincia] || 0) + 1;
  });

  const topMarcas = Object.entries(marcas).sort((a,b) => b[1]-a[1]).slice(0,6);
  const topProvs = Object.entries(provs).sort((a,b) => b[1]-a[1]).slice(0,6);
  const maxM = topMarcas[0]?.[1] || 1;
  const maxP = topProvs[0]?.[1] || 1;

  const barRows = (data, max) => data.map(([name, count]) => `
    <div class="bar-row">
      <span class="bar-name" title="${esc(name)}">${esc(name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(count/max*100)}%"></div></div>
      <span class="bar-count">${count}</span>
    </div>
  `).join('');

  const container = document.getElementById('stats-container');
  if (!container) return;

  container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">TRABAJOS</div>
        <div class="stat-val">${total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">INGRESOS</div>
        <div class="stat-val green">$${ingresos.toLocaleString('es-AR')}</div>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">PROMEDIO</div>
        <div class="stat-val" style="font-size:20px">$${promedio.toLocaleString('es-AR')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">PROVINCIAS</div>
        <div class="stat-val">${Object.keys(provs).length}</div>
      </div>
    </div>

    ${topMarcas.length ? `
      <div class="section-label">Marcas frecuentes</div>
      <div class="info-block">${barRows(topMarcas, maxM)}</div>
    ` : ''}

    ${topProvs.length ? `
      <div class="section-label">Por provincia</div>
      <div class="info-block">${barRows(topProvs, maxP)}</div>
    ` : ''}

    ${!total ? '<div class="empty-state"><div class="empty-icon">📊</div><p>Sin datos aún.<br>Cargá reparaciones para ver estadísticas.</p></div>' : ''}

    <div style="height:16px"></div>
  `;
}

window.renderStats = renderStats;
