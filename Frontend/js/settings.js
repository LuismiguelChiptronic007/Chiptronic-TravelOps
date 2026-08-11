import { clearSession } from './api.js';
import { mountShell } from './layout.js';
import { getStoredTheme, toggleTheme } from './theme.js';

async function load() {
  await mountShell({ active: '' });
  updateThemeBtn();
}

function updateThemeBtn() {
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) {
    btn.textContent = getStoredTheme() === 'dark' ? 'Usar tema claro' : 'Usar tema escuro';
  }
}

document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
  toggleTheme();
  updateThemeBtn();
});

document.getElementById('btn-logout-settings')?.addEventListener('click', () => {
  clearSession();
  location.href = 'login.html';
});

load();
