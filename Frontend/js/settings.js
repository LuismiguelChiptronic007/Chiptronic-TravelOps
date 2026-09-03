import { api, clearSession, showAlert } from './api.js';
import { escapeHtml, mountShell } from './layout.js';
import { confirmDialog } from './ui.js';

const LUNCH_START_KEY = 'cto_lunch_window_start';
const LUNCH_END_KEY = 'cto_lunch_window_end';
const DEFAULT_LUNCH_START = '11:00';
const DEFAULT_LUNCH_END = '14:00';

function setupSettingsPanelToggles() {
  document.querySelectorAll('main.container > .panel, #leader-settings > .panel').forEach((panel) => {
    const button = panel.querySelector(':scope > .panel-header .panel-toggle');
    const content = panel.querySelector(':scope > .panel-content');
    if (!button || !content || button.dataset.settingsToggleBound === 'true') return;

    button.dataset.settingsToggleBound = 'true';
    button.addEventListener('click', () => {
      const collapsed = content.classList.toggle('collapsed');
      button.classList.toggle('collapsed', collapsed);
      button.setAttribute('aria-expanded', String(!collapsed));
      const title = panel.querySelector(':scope > .panel-header h2')?.textContent.trim() || 'painel';
      button.setAttribute('aria-label', `${collapsed ? 'Expandir' : 'Minimizar'} quadro ${title}`);
      button.setAttribute('title', `${collapsed ? 'Expandir' : 'Minimizar'} quadro ${title}`);
    });
  });
}

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
            <div>
              <button type="button" class="btn btn-secondary btn-sm" data-project-fields="${p.id}">Campos</button>
              <button type="button" class="btn btn-secondary btn-sm" data-edit-project="${p.id}" data-project-name="${escapeHtml(p.name)}">Editar</button>
              <button type="button" class="btn btn-danger btn-sm" data-remove-project="${p.id}">Remover</button>
            </div>
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
            <div>
              <button type="button" class="btn btn-secondary btn-sm" data-work-type-fields="${encodeURIComponent(wt.name)}">Campos</button>
              <button type="button" class="btn btn-secondary btn-sm" data-edit-work-type="${wt.id}" data-work-type-name="${escapeHtml(wt.name)}" title="Editar tipo de trabalho">Editar</button>
              <button type="button" class="btn btn-danger btn-sm" data-remove-work-type="${wt.id}">Remover</button>
            </div>
          </div>
        `
          )
          .join('')
      : '<p class="text-muted">Nenhum tipo de trabalho personalizado cadastrado.</p>';
  } catch {
    list.innerHTML = '<p class="text-muted">Erro ao carregar tipos de trabalho.</p>';
  }
}

async function loadEquipmentCatalog() {
  const typeSelect = document.getElementById('new-equipment-type');
  const filterSelect = document.getElementById('equipment-catalog-filter');
  const list = document.getElementById('equipment-catalog-list');
  if (!typeSelect || !filterSelect || !list) return;
  try {
    const data = await api.sectorEquipment.list();
    const types = data.equipment_types || [];
    const previousType = typeSelect.value;
    const previousFilter = filterSelect.value;
    typeSelect.innerHTML = types.length
      ? types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('')
      : '<option value="">Nenhum tipo cadastrado</option>';
    if (types.includes(previousType)) typeSelect.value = previousType;
    filterSelect.innerHTML = `<option value="">Todos os tipos</option>${types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('')}`;
    if (types.includes(previousFilter)) filterSelect.value = previousFilter;
    const equipment = data.equipment || [];
    const visibleEquipment = filterSelect.value
      ? equipment.filter((item) => item.equipment_type === filterSelect.value)
      : equipment;
    list.innerHTML = visibleEquipment.length
      ? visibleEquipment.map((item) => `
          <div class="list-item">
            <span><strong>${escapeHtml(item.equipment_type)}</strong> · ${escapeHtml(item.name)}</span>
            <button type="button" class="btn btn-danger btn-sm" data-remove-equipment-catalog="${item.id}">Remover</button>
          </div>`).join('')
      : `<p class="text-muted">Nenhum equipamento cadastrado${filterSelect.value ? ' neste tipo' : ' para este setor'}.</p>`;
  } catch (err) {
    list.innerHTML = `<p class="text-muted">${escapeHtml(err.message || 'Erro ao carregar equipamentos.')}</p>`;
  }
}

async function loadLeaderSettings() {
  const leaderSection = document.getElementById('leader-settings');
  if (!leaderSection) return;

  try {
    const userRes = await api.me();
    const user = userRes?.user;
    if (!user?.is_sector_leader && !user?.is_admin_master) {
      leaderSection.classList.add('hidden');
      return;
    }

    leaderSection.classList.remove('hidden');
    await loadLeaderProjects();
    await loadLeaderWorkTypes();
    await loadEquipmentCatalog();
  } catch {
    leaderSection.classList.add('hidden');
  }
}

function setupLeaderListeners() {
  ['project-fields-modal', 'work-type-fields-modal'].forEach((modalId) => {
    const modal = document.getElementById(modalId);
    if (modal && modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
  });

  const addProjectBtn = document.getElementById('btn-add-project');
  const projectInput = document.getElementById('new-project-name');
  const projectsList = document.getElementById('projects-list');

  projectsList?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-project]');
    if (!editBtn) return;
    await openEditNameModal({
      kind: 'project',
      id: editBtn.dataset.editProject,
      name: editBtn.dataset.projectName || '',
    });
  });

  const addProject = async () => {
    const name = projectInput?.value?.trim();
    if (!name) return;

    try {
      await api.leaderProjects.create(name);
      projectInput.value = '';
      await loadLeaderProjects();
    } catch (err) {
      showAlert(document.getElementById('alert'), err.message || 'Erro ao adicionar projeto.');
    }
  };

  addProjectBtn?.addEventListener('click', addProject);
  projectInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addProject();
  });

  projectsList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove-project]');
    if (btn) {
      const id = btn.dataset.removeProject;
      const confirmed = await confirmDialog({
        title: 'Remover projeto',
        message: 'Remover este projeto?',
        confirmLabel: 'Remover',
        confirmTone: 'danger',
        tone: 'danger',
      });
      if (!confirmed) return;
      await api.leaderProjects.remove(id);
      await loadLeaderProjects();
      return;
    }

    const fieldsBtn = e.target.closest('[data-project-fields]');
    if (fieldsBtn) {
      const projectId = fieldsBtn.dataset.projectFields;
      await openProjectFieldsModal(projectId);
    }
  });

  const addWorkTypeBtn = document.getElementById('btn-add-work-type');
  const workTypeInput = document.getElementById('new-work-type-name');
  const workTypesList = document.getElementById('work-types-list');
  const addEquipmentTypeBtn = document.getElementById('btn-add-equipment-type');
  const equipmentTypeInput = document.getElementById('new-equipment-type-name');

  const addEquipmentType = async () => {
    const name = equipmentTypeInput?.value?.trim();
    if (!name) return;
    try {
      await api.sectorEquipment.createType(name);
      equipmentTypeInput.value = '';
      await loadEquipmentCatalog();
      const typeSelect = document.getElementById('new-equipment-type');
      if (typeSelect) typeSelect.value = name;
    } catch (err) {
      showAlert(document.getElementById('alert'), err.message || 'Erro ao criar tipo de equipamento.');
    }
  };

  addEquipmentTypeBtn?.addEventListener('click', addEquipmentType);
  equipmentTypeInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addEquipmentType();
  });

  document.getElementById('equipment-catalog-filter')?.addEventListener('change', loadEquipmentCatalog);

  document.getElementById('btn-add-equipment-catalog')?.addEventListener('click', async () => {
    const type = document.getElementById('new-equipment-type')?.value || '';
    const nameInput = document.getElementById('new-equipment-name');
    const name = nameInput?.value?.trim();
    if (!type || !name) return;
    try {
      await api.sectorEquipment.create({ equipment_type: type, name });
      nameInput.value = '';
      await loadEquipmentCatalog();
    } catch (err) {
      showAlert(document.getElementById('alert'), err.message || 'Erro ao adicionar equipamento.');
    }
  });

  document.getElementById('equipment-catalog-list')?.addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-remove-equipment-catalog]');
    if (!remove) return;
    const confirmed = await confirmDialog({ title: 'Remover equipamento', message: 'Remover este equipamento do catálogo?', confirmLabel: 'Remover', confirmTone: 'danger', tone: 'danger' });
    if (!confirmed) return;
    try {
      await api.sectorEquipment.remove(remove.dataset.removeEquipmentCatalog);
      await loadEquipmentCatalog();
    } catch (err) {
      showAlert(document.getElementById('alert'), err.message || 'Erro ao remover equipamento.');
    }
  });

  const addWorkType = async () => {
    const name = workTypeInput?.value?.trim();
    if (!name) return;

    try {
      await api.leaderWorkTypes.create(name);
      workTypeInput.value = '';
      await loadLeaderWorkTypes();
    } catch (err) {
      showAlert(document.getElementById('alert'), err.message || 'Erro ao adicionar tipo de trabalho.');
    }
  };

  addWorkTypeBtn?.addEventListener('click', addWorkType);
  workTypeInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addWorkType();
  });

  workTypesList?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-work-type]');
    if (editBtn) {
      const currentName = editBtn.dataset.workTypeName || '';
      await openEditNameModal({
        kind: 'work-type',
        id: editBtn.dataset.editWorkType,
        name: currentName,
      });
      return;
    }

    const btn = e.target.closest('[data-remove-work-type]');
    if (btn) {
      const id = btn.dataset.removeWorkType;
      const confirmed = await confirmDialog({
        title: 'Remover tipo de trabalho',
        message: 'Remover este tipo de trabalho?',
        confirmLabel: 'Remover',
        confirmTone: 'danger',
        tone: 'danger',
      });
      if (!confirmed) return;
      await api.leaderWorkTypes.remove(id);
      await loadLeaderWorkTypes();
      return;
    }

    const fieldsBtn = e.target.closest('[data-work-type-fields]');
    if (fieldsBtn) {
      const workTypeName = decodeURIComponent(fieldsBtn.dataset.workTypeFields);
      await openWorkTypeFieldsModal(workTypeName);
    }
  });

  document.getElementById('btn-add-project-field')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('new-project-field-name');
    const requiredInput = document.getElementById('new-project-field-required');
    const name = nameInput?.value?.trim();
    if (!name || !currentProjectFieldsId) return;

    try {
      await api.leaderProjects.fields.add(currentProjectFieldsId, {
        field_name: name,
        is_required: requiredInput?.checked || false,
      });
      nameInput.value = '';
      if (requiredInput) requiredInput.checked = false;
      await loadProjectFields(currentProjectFieldsId);
    } catch (err) {
      showAlert(document.getElementById('alert'), err.message || 'Erro ao adicionar campo.');
    }
  });

  document.getElementById('btn-add-work-type-field')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('new-work-type-field-name');
    const requiredInput = document.getElementById('new-work-type-field-required');
    const name = nameInput?.value?.trim();
    if (!name || !currentWorkTypeFieldsName) return;

    try {
      await api.leaderWorkTypes.fields.add(currentWorkTypeFieldsName, {
        field_name: name,
        is_required: requiredInput?.checked || false,
      });
      nameInput.value = '';
      if (requiredInput) requiredInput.checked = false;
      await loadWorkTypeFields(currentWorkTypeFieldsName);
    } catch (err) {
      showAlert(document.getElementById('alert'), err.message || 'Erro ao adicionar campo.');
    }
  });

  document.getElementById('project-fields-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove-project-field]');
    if (!btn) return;
    const fieldName = decodeURIComponent(btn.dataset.removeProjectField);
    const confirmed = await confirmDialog({
      title: 'Remover campo',
      message: `Remover campo "${fieldName}"?`,
      confirmLabel: 'Remover',
      confirmTone: 'danger',
      tone: 'danger',
    });
    if (!confirmed) return;
    if (!currentProjectFieldsId) return;
    await api.leaderProjects.fields.remove(currentProjectFieldsId, fieldName);
    await loadProjectFields(currentProjectFieldsId);
  });

  document.getElementById('work-type-fields-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove-work-type-field]');
    if (!btn) return;
    const fieldName = decodeURIComponent(btn.dataset.removeWorkTypeField);
    const confirmed = await confirmDialog({
      title: 'Remover campo',
      message: `Remover campo "${fieldName}"?`,
      confirmLabel: 'Remover',
      confirmTone: 'danger',
      tone: 'danger',
    });
    if (!confirmed) return;
    if (!currentWorkTypeFieldsName) return;
    await api.leaderWorkTypes.fields.remove(currentWorkTypeFieldsName, fieldName);
    await loadWorkTypeFields(currentWorkTypeFieldsName);
  });

  document.getElementById('btn-clear-project-fields')?.addEventListener('click', async () => {
    if (!currentProjectFieldsId) return;
    const confirmed = await confirmDialog({
      title: 'Remover campos do projeto',
      message: 'Remover TODOS os campos customizados deste projeto?',
      confirmLabel: 'Remover todos',
      confirmTone: 'danger',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const data = await api.leaderProjects.fields.list(currentProjectFieldsId);
      for (const field of (data?.fields || [])) {
        await api.leaderProjects.fields.remove(currentProjectFieldsId, field.field_name);
      }
      await loadProjectFields(currentProjectFieldsId);
    } catch (err) {
      showAlert(document.getElementById('alert'), err.message || 'Erro ao limpar campos.');
    }
  });

  document.getElementById('btn-clear-work-type-fields')?.addEventListener('click', async () => {
    if (!currentWorkTypeFieldsName) return;
    const confirmed = await confirmDialog({
      title: 'Remover campos do tipo de trabalho',
      message: 'Remover TODOS os campos customizados deste tipo de trabalho?',
      confirmLabel: 'Remover todos',
      confirmTone: 'danger',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const data = await api.leaderWorkTypes.fields.list(currentWorkTypeFieldsName);
      for (const field of (data?.fields || [])) {
        await api.leaderWorkTypes.fields.remove(currentWorkTypeFieldsName, field.field_name);
      }
      await loadWorkTypeFields(currentWorkTypeFieldsName);
    } catch (err) {
      showAlert(document.getElementById('alert'), err.message || 'Erro ao limpar campos.');
    }
  });

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.close;
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.add('hidden');
    });
  });

  const editModal = document.getElementById('edit-name-modal');
  const editInput = document.getElementById('edit-name-input');
  const closeEditNameModal = () => editModal?.classList.add('hidden');
  document.getElementById('btn-close-edit-name')?.addEventListener('click', closeEditNameModal);
  document.getElementById('btn-cancel-edit-name')?.addEventListener('click', closeEditNameModal);
  document.getElementById('btn-save-edit-name')?.addEventListener('click', async () => {
    const name = editInput?.value?.trim();
    if (!name || !editingName) return;
    try {
      if (editingName.kind === 'project') await api.leaderProjects.update(editingName.id, name);
      else await api.leaderWorkTypes.update(editingName.id, name);
      closeEditNameModal();
      await loadLeaderProjects();
      await loadLeaderWorkTypes();
    } catch (err) {
      showAlert(document.getElementById('alert'), err.message || 'Erro ao editar.');
    }
  });
}

let currentProjectFieldsId = null;
let currentWorkTypeFieldsName = null;
let editingName = null;

async function openEditNameModal({ kind, id, name }) {
  const modal = document.getElementById('edit-name-modal');
  const input = document.getElementById('edit-name-input');
  const title = document.getElementById('edit-name-modal-title');
  if (!modal || !input || !title) return;
  editingName = { kind, id };
  title.textContent = kind === 'project' ? 'Editar projeto' : 'Editar tipo de trabalho';
  input.value = name;
  modal.classList.remove('hidden');
  input.focus();
  input.select();
}

async function openProjectFieldsModal(projectId) {
  currentProjectFieldsId = projectId;
  const modal = document.getElementById('project-fields-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  await loadProjectFields(projectId);
}

async function openWorkTypeFieldsModal(workTypeName) {
  currentWorkTypeFieldsName = workTypeName;
  const modal = document.getElementById('work-type-fields-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  await loadWorkTypeFields(workTypeName);
}

async function loadProjectFields(projectId) {
  const list = document.getElementById('project-fields-list');
  if (!list) return;

  try {
    const data = await api.leaderProjects.fields.list(projectId);
    const fields = data?.fields || [];
    list.innerHTML = fields.length
      ? fields
          .map(
            (f) => `
          <div class="list-item">
            <span>${escapeHtml(f.field_name)} ${f.is_required ? '<strong>(obrigatório)</strong>' : ''}</span>
            <button type="button" class="btn btn-danger btn-sm" data-remove-project-field="${encodeURIComponent(f.field_name)}">Remover</button>
          </div>
        `
          )
          .join('')
      : '<p class="text-muted">Nenhum campo customizado. Clique em "Adicionar campo" para criar.</p>';
  } catch {
    list.innerHTML = '<p class="text-muted">Erro ao carregar campos.</p>';
  }
}

async function loadWorkTypeFields(workTypeName) {
  const list = document.getElementById('work-type-fields-list');
  if (!list) return;

  try {
    const data = await api.leaderWorkTypes.fields.list(workTypeName);
    const fields = data?.fields || [];
    list.innerHTML = fields.length
      ? fields
          .map(
            (f) => `
          <div class="list-item">
            <span>${escapeHtml(f.field_name)} ${f.is_required ? '<strong>(obrigatório)</strong>' : ''}</span>
            <button type="button" class="btn btn-danger btn-sm" data-remove-work-type-field="${encodeURIComponent(f.field_name)}">Remover</button>
          </div>
        `
          )
          .join('')
      : '<p class="text-muted">Nenhum campo customizado. Clique em "Adicionar campo" para criar.</p>';
  } catch {
    list.innerHTML = '<p class="text-muted">Erro ao carregar campos.</p>';
  }
}

async function load() {
  await mountShell({ active: '' });
  setupSettingsPanelToggles();
  await loadLunchWindowConfig();
  await loadLeaderSettings();
  setupLeaderListeners();
}

document.getElementById('btn-save-lunch-window')?.addEventListener('click', () => {
  saveLunchWindowConfig();
});

document.getElementById('btn-logout-settings')?.addEventListener('click', () => {
  clearSession();
  window.location.href = 'login.html';
});

load();
