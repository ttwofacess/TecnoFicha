const LS_KEY = 'tecnificha_v1';
export let repairs = [];

export function load() {
  try { 
    const data = localStorage.getItem(LS_KEY);
    repairs = data ? JSON.parse(data) : []; 
  } catch(e) { 
    repairs = []; 
  }
  return repairs;
}

export function persist() {
  localStorage.setItem(LS_KEY, JSON.stringify(repairs));
}

export function setRepairs(newRepairs) {
  repairs = newRepairs;
  persist();
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}
