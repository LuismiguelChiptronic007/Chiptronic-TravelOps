import { api, clearSession } from './api.js';
import { mountShell } from './layout.js';
import { getStoredTheme, toggleTheme } from './theme.js';

const LUNCH_START_KEY = 'cto_lunch_window_start';
const LUNCH_END_KEY = 'cto_lunch_window_end';
const DEFAULT_LUNCH_START = '11:00';
const DEFAULT_LUNCH_END = '14:00';

function getLunchWindowConfig() {
  const start = localStorage.getItem(LUNCH_START_KEY) || DEFAULT_LUNCH_START;
  const end = localStorage.getItem(LUNCH_END_KEY) || DEFAULT_LUNCH_END;
  return { start, end };
}

function hydrateLunchWindowForm(config = getLunchWindowConfig()) {
  const startInput = document.getElementById('lunch-window-start');
  const endInput = document.getElementById('lunch-window-end');
  if (!startInput || !endInput) return;

  startInput.value = config.start || DEFAULT_LUNCH_START;
  endInput.value = config.end || DEFAULT_LUNCH_END;
}

async function loadLunchWindowConfig() {
  try {
    const data = await api.lunchConfig();
    const config = {
      start: data?.config?.janelaAlmocoInicio || DEFAULT_LUNCH_START,
      end: data?.config?.janelaAlmocoFim || DEFAULT_LUNCH_END,
    };
    localStorage.setItem(LUNCH_START_KEY, config.start);
    localStorage.setItem(LUNCH_END_KEY, config.end);
    hydrateLunchWindowForm(config);
    return;
  } catch (_err) {
    hydrateLunchWindowForm(getLunchWindowConfig());
  }
}

async function saveLunchWindowConfig() {
  const startInput = document.getElementById('lunch-window-start');
  const endInput = document.getElementById('lunch-window-end');
  if (!startInput || !endInput) return;

  const start = startInput.value || DEFAULT_LUNCH_START;
  const end = endInput.value || DEFAULT_LUNCH_END;

  try {
    const data = await api.saveLunchConfig({ janelaAlmocoInicio: start, janelaAlmocoFim: end });
    const config = data?.config || { janelaAlmocoInicio: start, janelaAlmocoFim: end };

    localStorage.setItem(LUNCH_START_KEY, config.janelaAlmocoInicio || start);
    localStorage.setItem(LUNCH_END_KEY, config.janelaAlmocoFim || end);

    const alertBox = document.getElementById('alert');
    if (alertBox) {
      alertBox.textContent = 'Janela de almoço salva com sucesso.';
      alertBox.classList.remove('hidden');
      alertBox.classList.add('alert-success');
      alertBox.classList.remove('alert-error');
    }
  } catch (err) {
    const alertBox = document.getElementById('alert');
    if (alertBox) {
      alertBox.textContent = err.message || 'Não foi possível salvar a janela de almoço.';
      alertBox.classList.remove('hidden');
      alertBox.classList.add('alert-error');
      alertBox.classList.remove('alert-success');
    }
  }
}

async function load() {
  await mountShell({ active: '' });
  updateThemeBtn();
  await loadLunchWindowConfig();
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

document.getElementById('btn-save-lunch-window')?.addEventListener('click', () => {
  saveLunchWindowConfig();
});

document.getElementById('btn-logout-settings')?.addEventListener('click', () => {
  clearSession();
  location.href = 'login.html';
});

load();
