const LS_KEY = 'tecnificha_v1';
let repairs = [];
let editId = null;

/* ── STORAGE ── */
function load() {
  try { repairs = JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch(e) { repairs = []; }
}
function persist() {
  localStorage.setItem(LS_KEY, JSON.stringify(repairs));
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

/* ── NAVIGATION ── */
function showPage(p) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  const nb = document.getElementById('nav-' + p);
  if (nb) nb.classList.add('active');
  window.scrollTo(0, 0);
  if (p === 'list') { load(); renderList(); }
  if (p === 'new') initForm();
  if (p === 'stats') renderStats();
}

/* ── FORM ── */
const FIELDS = ['nombre','tel','ciudad','provincia','fecha','marca','modelo','cpu','gpu','ram','discos','problema','tareas','cobrado'];

function initForm(id) {
  editId = id || null;
  FIELDS.forEach(f => {
    const el = document.getElementById('f-' + f);
    if (el) el.value = '';
  });
  document.getElementById('f-fecha').value = new Date().toISOString().slice(0,10);

  const isEdit = !!id;
  document.getElementById('save-btn').textContent = isEdit ? 'Guardar cambios' : 'Guardar reparación';
  document.getElementById('delete-btn').style.display = isEdit ? 'block' : 'none';

  if (isEdit) {
    const r = repairs.find(x => x.id === id);
    if (r) FIELDS.forEach(f => {
      const el = document.getElementById('f-' + f);
      if (el && r[f] !== undefined && r[f] !== null) el.value = r[f];
    });
  }
}

function getField(id) {
  return (document.getElementById('f-' + id)?.value || '').trim();
}

function saveRepair() {
  if (!getField('nombre') || !getField('ciudad') || !getField('provincia') || !getField('fecha') || !getField('marca')) {
    toast('Completá los campos obligatorios (*)');
    return;
  }
  const r = {
    id: editId || uid(),
    nombre:    getField('nombre'),
    tel:       getField('tel'),
    ciudad:    getField('ciudad'),
    provincia: getField('provincia'),
    fecha:     getField('fecha'),
    marca:     getField('marca'),
    modelo:    getField('modelo'),
    cpu:       getField('cpu'),
    gpu:       getField('gpu'),
    ram:       getField('ram'),
    discos:    getField('discos'),
    problema:  getField('problema'),
    tareas:    getField('tareas'),
    cobrado:   parseFloat(getField('cobrado')) || 0,
    createdAt: editId ? (repairs.find(x => x.id === editId)?.createdAt || Date.now()) : Date.now(),
    updatedAt: Date.now()
  };

  if (editId) {
    repairs = repairs.map(x => x.id === editId ? r : x);
    toast('Cambios guardados ✓');
  } else {
    repairs.unshift(r);
    toast('Reparación guardada ✓');
  }
  persist();
  updateProvinceFilter();
  showPage('list');
}

function deleteRepair() {
  if (!editId) return;
  if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
  repairs = repairs.filter(x => x.id !== editId);
  persist();
  updateProvinceFilter();
  toast('Registro eliminado');
  showPage('list');
}

/* ── LIST ── */
function renderList() {
  const q = (document.getElementById('search-input')?.value || '').toLowerCase();
  const prov = document.getElementById('filter-prov')?.value || '';

  const filtered = repairs.filter(r => {
    const matchQ = !q || [r.nombre, r.ciudad, r.provincia, r.marca, r.modelo]
      .some(v => (v || '').toLowerCase().includes(q));
    const matchP = !prov || r.provincia === prov;
    return matchQ && matchP;
  }).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

  const meta = document.getElementById('list-meta');
  meta.textContent = filtered.length
    ? `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`
    : '';

  updateTopbarCount();

  const container = document.getElementById('list-container');
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

/* ── DETAIL ── */
function showDetail(id) {
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

  document.getElementById('detail-container').innerHTML = `
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
  document.getElementById('nav-list').classList.add('active');
  window.scrollTo(0, 0);
}

function editRepair(id) {
  load();
  initForm(id);
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('page-new').classList.add('active');
  document.getElementById('nav-new').classList.add('active');
  window.scrollTo(0, 0);
}

/* ── STATS ── */
function renderStats() {
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

  document.getElementById('stats-container').innerHTML = `
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

/* ── HELPERS ── */
function updateProvinceFilter() {
  const sel = document.getElementById('filter-prov');
  const cur = sel.value;
  const provList = [...new Set(repairs.map(r => r.provincia).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todas</option>' +
    provList.map(p => `<option value="${esc(p)}"${p === cur ? ' selected' : ''}>${esc(p)}</option>`).join('');
}

function updateTopbarCount() {
  const el = document.getElementById('topbar-count');
  el.textContent = repairs.length ? repairs.length + ' registro' + (repairs.length !== 1 ? 's' : '') : '';
}

function formatDate(d) {
  if (!d) return '';
  const [y,m,day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ── INIT ── */
load();
updateProvinceFilter();
updateTopbarCount();
renderList();
