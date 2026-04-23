import { repairs, persist, setRepairs, uid, load } from '../state.js';
import { FIELDS, toast, updateProvinceFilter } from '../utils.js';
import { showPage } from '../navigation.js';

let editId = null;

export function initForm(id) {
  editId = id || null;
  FIELDS.forEach(f => {
    const el = document.getElementById('f-' + f);
    if (el) el.value = '';
  });
  const fechaEl = document.getElementById('f-fecha');
  if (fechaEl) fechaEl.value = new Date().toISOString().slice(0,10);

  const isEdit = !!id;
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.textContent = isEdit ? 'Guardar cambios' : 'Guardar reparación';
  
  const deleteBtn = document.getElementById('delete-btn');
  if (deleteBtn) deleteBtn.style.display = isEdit ? 'block' : 'none';

  if (isEdit) {
    const r = repairs.find(x => x.id === id);
    if (r) FIELDS.forEach(f => {
      const el = document.getElementById('f-' + f);
      if (el && r[f] !== undefined && r[f] !== null) el.value = r[f];
    });
  }
}

export function getField(id) {
  return (document.getElementById('f-' + id)?.value || '').trim();
}

export function saveRepair() {
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
    setRepairs(repairs.map(x => x.id === editId ? r : x));
    toast('Cambios guardados ✓');
  } else {
    setRepairs([r, ...repairs]);
    toast('Reparación guardada ✓');
  }
  
  updateProvinceFilter(repairs);
  showPage('list');
}

export function deleteRepair() {
  if (!editId) return;
  if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
  setRepairs(repairs.filter(x => x.id !== editId));
  updateProvinceFilter(repairs);
  toast('Registro eliminado');
  showPage('list');
}

export function editRepair(id) {
  load();
  initForm(id);
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('page-new').classList.add('active');
  const nn = document.getElementById('nav-new');
  if (nn) nn.classList.add('active');
  window.scrollTo(0, 0);
}

window.initForm = initForm;
window.saveRepair = saveRepair;
window.deleteRepair = deleteRepair;
window.editRepair = editRepair;
