import { load } from './js/state.js';
import { updateProvinceFilter, updateTopbarCount } from './js/utils.js';
import { renderList } from './js/views/list.js';

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', () => {
  const repairs = load();
  updateProvinceFilter(repairs);
  updateTopbarCount(repairs.length);
  renderList();
});
