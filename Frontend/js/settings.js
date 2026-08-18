import { api, clearSession } from './api.js';
import { escapeHtml, mountShell } from './layout.js';
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

async function loadLeaderSettings() {
  const leaderSection = document.getElementById('leader-settings');
  if (!leaderSection) return;

  try {
    const userRes = await api.me();
    const user = userRes?.user;
    if (!user?.is_sector_leader) {
      leaderSection.classList.add('hidden');
      return;
    }

    leaderSection.classList.remove('hidden');
    await loadLeaderProjects();
    await loadLeaderWorkTypes();
  } catch {
    leaderSection.classList.add('hidden');
  }
}

async function loadLeaderProjects() {
  const list = document.getElementById('projects-list');
  if (!list) return;

  try {
    const data = await api.leaderProjects.list();
    const projects = data?.projects || [];
    list.innerHTML = projects.length
      ? projects
          .map(
            (p) => `
          <div class="list-item">
            <span>${escapeHtml(p.name)}</span>
            <button type="button" class="btn btn-danger btn-sm" data-remove-project="${p.id}">Remover</button>
          </div>
        `
          )
          .join('')
      : '<p class="text-muted">Nenhum projeto cadastrado.</p>';
  } catch {
    list.innerHTML = '<p class="text-muted">Erro ao carregar projetos.</p>';
  }
}

async function loadLeaderWorkTypes() {
  const list = document.getElementById('work-types-list');
  if (!list) return;

  try {
    const data = await api.leaderWorkTypes.list();
    const workTypes = data?.work_types || [];
    list.innerHTML = workTypes.length
      ? workTypes
          .map(
            (wt) => `
          <div class="list-item">
            <span>${escapeHtml(wt.name)}</span>
            <button type="button" class="btn btn-danger btn-sm" data-remove-work-type="${wt.id}">Remover</button>
          </div>
        `
          )
          .join('')
      : '<p class="text-muted">Nenhum tipo de trabalho personalizado cadastrado.</p>';
  } catch {
    list.innerHTML = '<p class="text-muted">Erro ao carregar tipos de trabalho.</p>';
  }
}

function setupLeaderListeners() {
  const addProjectBtn = document.getElementById('btn-add-project');
  const projectInput = document.getElementById('new-project-name');
  const projectsList = document.getElementById('projects-list');

  addProjectBtn?.addEventListener('click', async () => {
    const name = projectInput?.value?.trim();
    if (!name) return;

    try {
      await api.leaderProjects.create(name);
      projectInput.value = '';
      await loadLeaderProjects();
    } catch (err) {
      alert(err.message || 'Erro ao adicionar projeto.');
    }
  });

  projectsList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove-project]');
    if (!btn) return;
    const id = btn.dataset.removeProject;
    if (!confirm('Remover este projeto?')) return;
    await api.leaderProjects.remove(id);
    await loadLeaderProjects();
  });

  const addWorkTypeBtn = document.getElementById('btn-add-work-type');
  const workTypeInput = document.getElementById('new-work-type-name');
  const workTypesList = document.getElementById('work-types-list');

  addWorkTypeBtn?.addEventListener('click', async () => {
    const name = workTypeInput?.value?.trim();
    if (!name) return;

    try {
      await api.leaderWorkTypes.create(name);
      workTypeInput.value = '';
      await loadLeaderWorkTypes();
    } catch (err) {
      alert(err.message || 'Erro ao adicionar tipo de trabalho.');
    }
  });

  workTypesList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove-work-type]');
    if (!btn) return;
    const id = btn.dataset.removeWorkType;
    if (!confirm('Remover este tipo de trabalho?')) return;
    await api.leaderWorkTypes.remove(id);
    await loadLeaderWorkTypes();
  });
}

async function load() {
  await mountShell({ active: '' });
  updateThemeBtn();
  await loadLunchWindowConfig();
  await loadLeaderSettings();
  setupLeaderListeners();
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
  window.location.href = 'login.html';
});

load();
