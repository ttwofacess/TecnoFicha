import { repairs, persist, setRepairs, uid, load } from '../state.js';
import {
  FIELDS, toast, updateProvinceFilter,
  sanitizeNameInput, validateName,
  sanitizeCityInput, validateCity,
  sanitizeProvinceInput, validateProvince,
  sanitizeFechaInput, validateFecha,
  sanitizeTelInput, validateTel,
  sanitizeMarcaInput, validateMarca,
  sanitizeModeloInput, validateModelo,
  sanitizeCpuInput, validateCpu,
  sanitizeGpuInput, validateGpu,
  sanitizeRamInput, validateRam,
  sanitizeDiscosInput, validateDiscos,
  sanitizeProblemaInput, validateProblema,
  sanitizeTareasInput,   validateTareas,
  sanitizeCobradoInput,  validateCobrado,
} from '../utils.js';
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

  // ── Live validation: nombre ──────────────────────────────────────────────
  wireTextInput('f-nombre', sanitizeNameInput, validateName, setNameError);

  // ── Live validation: ciudad ──────────────────────────────────────────────
  wireTextInput('f-ciudad', sanitizeCityInput, validateCity, setCityError);

  // ── Live validation: provincia ───────────────────────────────────────────
  wireTextInput('f-provincia', sanitizeProvinceInput, validateProvince, setProvinceError);

  // ── Live validation: fecha de consulta ────────────────────────────────────
  const fechaInput = document.getElementById('f-fecha');
  if (fechaInput) {
    fechaInput.addEventListener('blur', () => {
      setFechaError(validateFecha(fechaInput.value));
    });
  }

  // ── Live validation: teléfono ─────────────────────────────────────────────
  wireTextInput('f-tel', sanitizeTelInput, validateTel, setTelError);

  // ── Live validation: marca ────────────────────────────────────────────────
  wireTextInput('f-marca', sanitizeMarcaInput, validateMarca, setMarcaError);

  // ── Live validation: modelo ───────────────────────────────────────────────
  wireTextInput('f-modelo', sanitizeModeloInput, validateModelo, setModeloError);
  wireTextInput('f-cpu', sanitizeCpuInput, validateCpu, setCpuError);
  wireTextInput('f-gpu', sanitizeGpuInput, validateGpu, setGpuError);

  // Live validation: RAM
  wireRamInput();

  // Live validation: discos
  wireTextInput('f-discos', sanitizeDiscosInput, validateDiscos, setDiscosError);

  // Live validation: problema (textarea)
  wireTextareaInput('f-problema', sanitizeProblemaInput, validateProblema, setProblemaError);

  // Live validation: tareas (textarea)
  wireTextareaInput('f-tareas', sanitizeTareasInput, validateTareas, setTareasError);

  // Live validation: cobrado
  wireCobradoInput();
}

/**
 * Attaches input + blur validation to a text field.
 * Replaces the node to drop any previously-attached listeners.
 */
function wireTextInput(id, sanitize, validate, setError) {
  const el = document.getElementById(id);
  if (!el) return;
  const fresh = el.cloneNode(true);
  el.parentNode.replaceChild(fresh, el);

  fresh.addEventListener('input', () => {
    const sanitized = sanitize(fresh.value);
    if (fresh.value !== sanitized) {
      const pos = fresh.selectionStart;
      fresh.value = sanitized;
      fresh.setSelectionRange(pos, pos);
    }
    setError(validate(sanitized));
  });

  fresh.addEventListener('blur', () => {
    setError(validate(fresh.value));
  });
}

function wireTextareaInput(id, sanitize, validate, setError) {
  const el = document.getElementById(id);
  if (!el) return;
  const fresh = el.cloneNode(true);
  el.parentNode.replaceChild(fresh, el);

  fresh.addEventListener('input', () => {
    setError(validate(fresh.value));
  });

  fresh.addEventListener('blur', () => {
    const sanitized = sanitize(fresh.value);
    if (fresh.value !== sanitized) fresh.value = sanitized;
    setError(validate(fresh.value));
  });
}

function wireCobradoInput() {
  const el = document.getElementById('f-cobrado');
  if (!el) return;
  const fresh = el.cloneNode(true);
  el.parentNode.replaceChild(fresh, el);

  fresh.addEventListener('input', () => {
    setCobradoError(validateCobrado(fresh.value));
  });

  fresh.addEventListener('blur', () => {
    const sanitized = sanitizeCobradoInput(fresh.value);
    if (fresh.value !== sanitized) fresh.value = sanitized;
    setCobradoError(validateCobrado(fresh.value));
  });
}

/**
 * Attaches input + blur validation to the RAM (number) field.
 */
function wireRamInput() {
  const el = document.getElementById('f-ram');
  if (!el) return;
  const fresh = el.cloneNode(true);
  el.parentNode.replaceChild(fresh, el);

  fresh.addEventListener('input', () => {
    const sanitized = sanitizeRamInput(fresh.value);
    if (fresh.value !== sanitized) {
      fresh.value = sanitized;
    }
    setRamError(validateRam(sanitized));
  });

  fresh.addEventListener('blur', () => {
    setRamError(validateRam(fresh.value));
  });
}

// ── Error display helpers ────────────────────────────────────────────────────

function setFieldError(fieldId, msg) {
  const errEl   = document.getElementById(fieldId + '-error');
  const inputEl = document.getElementById(fieldId);
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

const setNameError     = msg => setFieldError('f-nombre',    msg);
const setCityError     = msg => setFieldError('f-ciudad',    msg);
const setProvinceError = msg => setFieldError('f-provincia', msg);
const setFechaError    = msg => setFieldError('f-fecha',     msg);
const setTelError      = msg => setFieldError('f-tel',       msg);
const setMarcaError    = msg => setFieldError('f-marca',     msg);
const setModeloError   = msg => setFieldError('f-modelo',    msg);
const setCpuError      = msg => setFieldError('f-cpu',       msg);
const setGpuError      = msg => setFieldError('f-gpu',       msg);
const setRamError      = msg => setFieldError('f-ram',       msg);
const setDiscosError   = msg => setFieldError('f-discos',    msg);
const setProblemaError = msg => setFieldError('f-problema',  msg);
const setTareasError   = msg => setFieldError('f-tareas',    msg);
const setCobradoError  = msg => setFieldError('f-cobrado',   msg);

// ── Field reader ─────────────────────────────────────────────────────────────

export function getField(id) {
  return (document.getElementById('f-' + id)?.value || '').trim();
}

// ── Save ─────────────────────────────────────────────────────────────────────

export function saveRepair() {
  let hasError = false;

  // nombre
  const rawNombre   = document.getElementById('f-nombre')?.value ?? '';
  const cleanNombre = sanitizeNameInput(rawNombre);
  const nameError   = validateName(cleanNombre);
  setNameError(nameError);
  if (nameError) {
    document.getElementById('f-nombre')?.focus();
    toast(nameError);
    hasError = true;
  } else {
    const nombreEl = document.getElementById('f-nombre');
    if (nombreEl) nombreEl.value = cleanNombre;
  }

  // ciudad
  const rawCiudad   = document.getElementById('f-ciudad')?.value ?? '';
  const cleanCiudad = sanitizeCityInput(rawCiudad);
  const cityError   = validateCity(cleanCiudad);
  setCityError(cityError);
  if (cityError && !hasError) {
    document.getElementById('f-ciudad')?.focus();
    toast(cityError);
    hasError = true;
  } else if (!cityError) {
    const ciudadEl = document.getElementById('f-ciudad');
    if (ciudadEl) ciudadEl.value = cleanCiudad;
  }

  // provincia
  const rawProvincia   = document.getElementById('f-provincia')?.value ?? '';
  const cleanProvincia = sanitizeProvinceInput(rawProvincia);
  const provError      = validateProvince(cleanProvincia);
  setProvinceError(provError);
  if (provError && !hasError) {
    document.getElementById('f-provincia')?.focus();
    toast(provError);
    hasError = true;
  } else if (!provError) {
    const provinciaEl = document.getElementById('f-provincia');
    if (provinciaEl) provinciaEl.value = cleanProvincia;
  }

  // fecha de consulta
  const rawFecha   = document.getElementById('f-fecha')?.value ?? '';
  const cleanFecha = sanitizeFechaInput(rawFecha);
  const fechaError = validateFecha(cleanFecha);
  setFechaError(fechaError);
  if (fechaError && !hasError) {
    document.getElementById('f-fecha')?.focus();
    toast(fechaError);
    hasError = true;
  } else if (!fechaError) {
    const fechaInput = document.getElementById('f-fecha');
    if (fechaInput) fechaInput.value = cleanFecha;
  }

  // teléfono (opcional)
  const rawTel   = document.getElementById('f-tel')?.value ?? '';
  const cleanTel = sanitizeTelInput(rawTel);
  const telError = validateTel(cleanTel);
  setTelError(telError);
  if (telError && !hasError) {
    document.getElementById('f-tel')?.focus();
    toast(telError);
    hasError = true;
  } else if (!telError) {
    const telEl = document.getElementById('f-tel');
    if (telEl) telEl.value = cleanTel;
  }

  // marca
  const rawMarca   = document.getElementById('f-marca')?.value ?? '';
  const cleanMarca = sanitizeMarcaInput(rawMarca);
  const marcaError = validateMarca(cleanMarca);
  setMarcaError(marcaError);
  if (marcaError && !hasError) {
    document.getElementById('f-marca')?.focus();
    toast(marcaError);
    hasError = true;
  } else if (!marcaError) {
    const marcaEl = document.getElementById('f-marca');
    if (marcaEl) marcaEl.value = cleanMarca;
  }

  // modelo (opcional)
  const rawModelo   = document.getElementById('f-modelo')?.value ?? '';
  const cleanModelo = sanitizeModeloInput(rawModelo);
  const modeloError = validateModelo(cleanModelo);
  setModeloError(modeloError);
  if (modeloError && !hasError) {
    document.getElementById('f-modelo')?.focus();
    toast(modeloError);
    hasError = true;
  } else if (!modeloError) {
    const modeloEl = document.getElementById('f-modelo');
    if (modeloEl) modeloEl.value = cleanModelo;
  }

  // CPU (opcional)
  const rawCpu   = document.getElementById('f-cpu')?.value ?? '';
  const cleanCpu = sanitizeCpuInput(rawCpu);
  const cpuError = validateCpu(cleanCpu);
  setCpuError(cpuError);
  if (cpuError && !hasError) {
    document.getElementById('f-cpu')?.focus();
    toast(cpuError);
    hasError = true;
  } else if (!cpuError) {
    const cpuEl = document.getElementById('f-cpu');
    if (cpuEl) cpuEl.value = cleanCpu;
  }

  // GPU (opcional)
  const rawGpu   = document.getElementById('f-gpu')?.value ?? '';
  const cleanGpu = sanitizeGpuInput(rawGpu);
  const gpuError = validateGpu(cleanGpu);
  setGpuError(gpuError);
  if (gpuError && !hasError) {
    document.getElementById('f-gpu')?.focus();
    toast(gpuError);
    hasError = true;
  } else if (!gpuError) {
    const gpuEl = document.getElementById('f-gpu');
    if (gpuEl) gpuEl.value = cleanGpu;
  }

  // RAM (opcional)
  const rawRam   = document.getElementById('f-ram')?.value ?? '';
  const cleanRam = sanitizeRamInput(rawRam);
  const ramError = validateRam(cleanRam);
  setRamError(ramError);
  if (ramError && !hasError) {
    document.getElementById('f-ram')?.focus();
    toast(ramError);
    hasError = true;
  } else if (!ramError) {
    const ramEl = document.getElementById('f-ram');
    if (ramEl) ramEl.value = cleanRam;
  }

  // Discos (opcional)
  const rawDiscos   = document.getElementById('f-discos')?.value ?? '';
  const cleanDiscos = sanitizeDiscosInput(rawDiscos);
  const discosError = validateDiscos(cleanDiscos);
  setDiscosError(discosError);
  if (discosError && !hasError) {
    document.getElementById('f-discos')?.focus();
    toast(discosError);
    hasError = true;
  } else if (!discosError) {
    const discosEl = document.getElementById('f-discos');
    if (discosEl) discosEl.value = cleanDiscos;
  }

  // problema (required)
  const rawProblema   = document.getElementById('f-problema')?.value ?? '';
  const cleanProblema = sanitizeProblemaInput(rawProblema);
  const problemaError = validateProblema(cleanProblema);
  setProblemaError(problemaError);
  if (problemaError && !hasError) {
    document.getElementById('f-problema')?.focus();
    toast(problemaError);
    hasError = true;
  } else if (!problemaError) {
    const problemaEl = document.getElementById('f-problema');
    if (problemaEl) problemaEl.value = cleanProblema;
  }

  // tareas (optional)
  const rawTareas   = document.getElementById('f-tareas')?.value ?? '';
  const cleanTareas = sanitizeTareasInput(rawTareas);
  const tareasError = validateTareas(cleanTareas);
  setTareasError(tareasError);
  if (tareasError && !hasError) {
    document.getElementById('f-tareas')?.focus();
    toast(tareasError);
    hasError = true;
  } else if (!tareasError) {
    const tareasEl = document.getElementById('f-tareas');
    if (tareasEl) tareasEl.value = cleanTareas;
  }

  // cobrado (optional)
  const rawCobrado   = document.getElementById('f-cobrado')?.value ?? '';
  const cleanCobrado = sanitizeCobradoInput(rawCobrado);
  const cobradoError = validateCobrado(cleanCobrado);
  setCobradoError(cobradoError);
  if (cobradoError && !hasError) {
    document.getElementById('f-cobrado')?.focus();
    toast(cobradoError);
    hasError = true;
  } else if (!cobradoError) {
    const cobradoEl = document.getElementById('f-cobrado');
    if (cobradoEl) cobradoEl.value = cleanCobrado;
  }

  if (hasError) return;

  const r = {
    id:        editId || uid(),
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
    cobrado:   parseFloat(sanitizeCobradoInput(getField('cobrado'))) || 0,
    createdAt: editId ? (repairs.find(x => x.id === editId)?.createdAt || Date.now()) : Date.now(),
    updatedAt: Date.now(),
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

// ── Delete ────────────────────────────────────────────────────────────────────

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

window.initForm    = initForm;
window.saveRepair  = saveRepair;
window.deleteRepair = deleteRepair;
window.editRepair  = editRepair;
