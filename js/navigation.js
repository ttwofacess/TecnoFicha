import { load } from './state.js';
import { renderList } from './views/list.js';
import { initForm } from './views/form.js';
import { renderStats } from './views/stats.js';

export function showPage(p) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  
  const pageEl = document.getElementById('page-' + p);
  if (pageEl) pageEl.classList.add('active');
  
  const navEl = document.getElementById('nav-' + p);
  if (navEl) navEl.classList.add('active');
  
  window.scrollTo(0, 0);
  
  if (p === 'list') { 
    load(); 
    renderList(); 
  }
  if (p === 'new') {
    initForm();
  }
  if (p === 'stats') {
    renderStats();
  }
}

// Hacerlo disponible globalmente para los onclick del HTML por ahora
window.showPage = showPage;
