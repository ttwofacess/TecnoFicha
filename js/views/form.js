import { repairs, persist, setRepairs, uid, load } from '../state.js';
import { FIELDS, toast, updateProvinceFilter, sanitizeNameInput, validateName } from '../utils.js';
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

  // Live validation for nombre
  const nombreEl = document.getElementById('f-nombre');
  if (nombreEl) {
    // Remove any previous listener by cloning the node
    const fresh = nombreEl.cloneNode(true);
    nombreEl.parentNode.replaceChild(fresh, nombreEl);
    fresh.addEventListener('input', () => {
      const sanitized = sanitizeNameInput(fresh.value);
      // Silently apply sanitization while the user types
      if (fresh.value !== sanitized) {
        const pos = fresh.selectionStart;
        fresh.value = sanitized;
        fresh.setSelectionRange(pos, pos);
      }
      const error = validateName(sanitized);
      setNameError(error);
    });
    fresh.addEventListener('blur', () => {
      // On blur, always show the error if the field is invalid
      const error = validateName(fresh.value);
      setNameError(error);
    });
  }
}

function setNameError(msg) {
  const errEl = document.getElementById('f-nombre-error');
  const inputEl = document.getElementById('f-nombre');
  if (!errEl || !inputEl) return;
  if (msg) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
    inputEl.setAttribute('aria-invalid', 'true');
  } else {
    errEl.textContent = '';
    errEl.style.display = 'none';
    inputEl.removeAttribute('aria-invalid');
  }
}

export function getField(id) {
  return (document.getElementById('f-' + id)?.value || '').trim();
}

export function saveRepair() {
  // Validate and sanitize nombre first
  const rawNombre = document.getElementById('f-nombre')?.value ?? '';
  const cleanNombre = sanitizeNameInput(rawNombre);
  const nameError = validateName(cleanNombre);
  if (nameError) {
    setNameError(nameError);
    document.getElementById('f-nombre')?.focus();
    toast(nameError);
    return;
  }
  setNameError(null);
  // Write the sanitized value back so getField() picks it up
  const nombreEl = document.getElementById('f-nombre');
  if (nombreEl) nombreEl.value = cleanNombre;

  if (!getField('ciudad') || !getField('provincia') || !getField('fecha') || !getField('marca')) {
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
