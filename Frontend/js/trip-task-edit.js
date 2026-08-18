import { api, showAlert, hideAlert } from './api.js';
import { escapeHtml, mountShell } from './layout.js';

const params = new URLSearchParams(location.search);
const taskId = Number(params.get('task_id'));
const tripId = Number(params.get('trip_id'));

const form = document.getElementById('task-edit-form');
const alertEl = document.getElementById('alert');
const subtitle = document.getElementById('trip-subtitle');

let currentTrip = null;
let task = null;
let members = [];

function setAlert(message, type = 'error') {
  alertEl.textContent = message;
  alertEl.className = `alert alert-${type}`;
  alertEl.classList.remove('hidden');
}

async function init() {
  if (!taskId || !tripId) {
    location.href = 'index.html';
    return;
  }

  const user = await mountShell({ active: 'dashboard' });
  if (!user) return;

  try {
    const res = await api.getTrip(tripId);
    currentTrip = res.trip;
    subtitle.textContent = `${currentTrip.origin} → ${currentTrip.destination} · ${currentTrip.start_date} a ${currentTrip.end_date}`;

    const tripMembers = (currentTrip.members || []).filter((m) => {
      const uid = Number(m.user_id || m.id);
      return uid && uid !== Number(currentTrip.user_id);
    });

    const allMembers = [
      {
        user_id: currentTrip.user_id,
        full_name: currentTrip.members?.[0]?.full_name || 'Você',
        employee_id: currentTrip.members?.[0]?.employee_id || null,
        position_title: currentTrip.members?.[0]?.position_title || null,
      },
      ...tripMembers.map((m) => ({
        user_id: m.user_id || m.id,
        full_name: m.full_name,
        employee_id: m.employee_id || null,
        position_title: m.position_title || null,
      })),
    ];

    members = allMembers.filter((m) => m.full_name);

    const workTypesRes = await api.workTypes();
    const workTypeSelect = document.getElementById('edit-work-type');
    workTypeSelect.innerHTML = '<option value="">Selecione…</option>' +
      (workTypesRes.work_types || []).map((w) => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join('');

    const taskRes = await api.getTask(tripId, taskId);
    task = taskRes.task;

    if (!task) {
      setAlert('Tarefa não encontrada.', 'error');
      return;
    }

    fillForm();
    setupListeners();
  } catch (err) {
    setAlert(err.message, 'error');
  }
}

function fillForm() {
  if (!task) return;

  document.getElementById('edit-work-type').value = task.work_type || '';
  document.getElementById('edit-task-date').value = task.task_date || '';
  document.getElementById('edit-location').value = task.location || '';
  document.getElementById('edit-start-time').value = task.start_time || '';
  document.getElementById('edit-end-time').value = task.end_time || '';
  document.getElementById('edit-summary').value = task.summary || '';
  document.getElementById('edit-pending-items').value = task.pending_items || '';
  document.getElementById('edit-vehicle').value = task.vehicle || '';
  document.getElementById('edit-plate').value = task.plate || '';
  document.getElementById('edit-montadora').value = task.montadora || '';
  document.getElementById('edit-modelo').value = task.modelo || '';
  document.getElementById('edit-submodelo').value = task.submodelo || '';

  fillResponsibleOptions();
  updateTaskTypeFields();
  loadEditProjects();
}

async function loadEditProjects() {
  const sel = document.getElementById('edit-project-id');
  if (!sel) return;
  try {
    const data = await api.projects();
    const projects = data?.projects || [];
    sel.innerHTML = '<option value="">Sem projeto</option>' +
      projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    sel.value = task.project_id || '';
  } catch {
    sel.innerHTML = '<option value="">Sem projeto</option>';
  }
}

function fillResponsibleOptions() {
  const list = document.getElementById('edit-responsible-list');
  list.innerHTML = '';

  if (!members.length) {
    const empty = document.createElement('div');
    empty.className = 'responsible-empty';
    empty.textContent = 'Nenhum integrante cadastrado na viagem';
    list.appendChild(empty);
    return;
  }

  for (const member of members) {
    const memberId = String(member.user_id || '');
    if (!memberId) continue;

    const option = document.createElement('label');
    option.className = 'responsible-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'responsible_id';
    checkbox.value = memberId;

    if (Array.isArray(task.responsibles) && task.responsibles.length) {
      checkbox.checked = task.responsibles.some((r) => String(r.id) === memberId);
    } else {
      checkbox.checked = String(task.responsible_id || '') === memberId;
    }

    const text = document.createElement('span');
    const isCreator = memberId === String(currentTrip.user_id || '');
    text.textContent = `${member.full_name}${member.employee_id ? ` — ${member.employee_id}` : ''}${isCreator ? ' (Criador)' : ''}`;

    option.appendChild(checkbox);
    option.appendChild(text);
    list.appendChild(option);
  }
}

function updateTaskTypeFields() {
  const type = document.getElementById('edit-work-type').value;
  const vehicleFields = document.getElementById('edit-vehicle-fields');
  const vehicleDetailFields = document.getElementById('edit-vehicle-detail-fields');

  vehicleFields.classList.add('hidden-fields');
  vehicleDetailFields.classList.add('hidden-fields');

  const normalizedType = String(type || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const requiresVehicleDetails = [
    'dieseldiag ontime',
    'controle de logs',
    'logs de telemetria',
  ].includes(normalizedType);

  if (requiresVehicleDetails) {
    vehicleFields.classList.remove('hidden-fields');
    vehicleDetailFields.classList.remove('hidden-fields');
    if (vehicleFields) vehicleFields.classList.add('required-fields');
    if (vehicleDetailFields) vehicleDetailFields.classList.add('required-fields');
  } else if (normalizedType === 'analise de veiculos') {
    vehicleFields.classList.remove('hidden-fields');
    if (vehicleFields) vehicleFields.classList.add('required-fields');
  }
}

function getSelectedResponsibles() {
  const checkboxes = document.querySelectorAll('#edit-responsible-list input[type="checkbox"]:checked');
  return Array.from(checkboxes).map((cb) => Number(cb.value)).filter(Number.isInteger);
}

async function saveTask() {
  hideAlert(alertEl);

  const work_type = document.getElementById('edit-work-type').value;
  const task_date = document.getElementById('edit-task-date').value;
  const location = document.getElementById('edit-location').value.trim();
  const start_time = document.getElementById('edit-start-time').value;
  const end_time = document.getElementById('edit-end-time').value;
  const summary = document.getElementById('edit-summary').value.trim();
  const pending_items = document.getElementById('edit-pending-items').value.trim();
  const vehicle = document.getElementById('edit-vehicle').value.trim();
  const plate = document.getElementById('edit-plate').value.trim();
  const montadora = document.getElementById('edit-montadora').value.trim();
  const modelo = document.getElementById('edit-modelo').value.trim();
  const submodelo = document.getElementById('edit-submodelo').value.trim();
  const responsible_ids = getSelectedResponsibles();

  if (!work_type || !task_date || !location || !start_time || !end_time || !summary) {
    setAlert('Preencha todos os campos obrigatórios.', 'error');
    return;
  }

  if (end_time < start_time) {
    setAlert('Hora de término deve ser igual ou posterior à hora de início.', 'error');
    return;
  }

  const normalizedType = String(work_type || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const requiresVehicle = ['dieseldiag ontime', 'controle de logs', 'logs de telemetria', 'analise de veiculos'].includes(normalizedType);
  if (requiresVehicle && (!vehicle || !plate || !montadora || !modelo || !submodelo)) {
    setAlert('Para este tipo de trabalho, informe a montadora, o modelo, a versão e a placa.', 'error');
    return;
  }

  try {
    const payload = {
      work_type,
      task_date,
      location,
      start_time,
      end_time,
      summary,
      pending_items,
      responsible_ids,
      vehicle,
      plate,
      montadora,
      modelo,
      submodelo,
      project_id: document.getElementById('edit-project-id')?.value || null,
    };

    await api.updateTask(tripId, taskId, payload);
    location.href = `trip.html?id=${tripId}`;
  } catch (err) {
    setAlert(err.message, 'error');
  }
}

function setupListeners() {
  document.getElementById('edit-work-type').addEventListener('change', updateTaskTypeFields);
  document.getElementById('btn-cancel').addEventListener('click', () => {
    if (confirm('Descartar alterações?')) {
      location.href = `trip.html?id=${tripId}`;
    }
  });
  document.getElementById('btn-save').addEventListener('click', saveTask);
  setupCollapsibleSections();
  setupToggleButton();
}

function setupToggleButton() {
  const toggleBtn = document.getElementById('btn-toggle-fields');
  const section = document.getElementById('section-main');
  if (!toggleBtn || !section) return;

  const content = section.querySelector('.collapsible-content');
  const sectionToggle = section.querySelector('.panel-toggle');
  if (!content || !sectionToggle) return;

  toggleBtn.addEventListener('click', () => {
    const willCollapse = !content.classList.contains('collapsed');
    if (willCollapse) {
      content.classList.add('collapsed');
      sectionToggle.classList.add('collapsed');
      toggleBtn.textContent = 'Expandir campos';
    } else {
      content.classList.remove('collapsed');
      sectionToggle.classList.remove('collapsed');
      toggleBtn.textContent = 'Minimizar campos';
    }
  });
}

function setupCollapsibleSections() {
  const mainSection = document.getElementById('section-main');
  if (!mainSection) return;

  const header = mainSection.querySelector('.collapsible-header');
  const content = mainSection.querySelector('.collapsible-content');
  const sectionToggle = mainSection.querySelector('.panel-toggle');
  const globalToggle = document.getElementById('btn-toggle-fields');
  if (!header || !content || !sectionToggle || !globalToggle) return;

  header.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    const willCollapse = !content.classList.contains('collapsed');
    if (willCollapse) {
      content.classList.add('collapsed');
      sectionToggle.classList.add('collapsed');
      globalToggle.textContent = 'Expandir campos';
    } else {
      content.classList.remove('collapsed');
      sectionToggle.classList.remove('collapsed');
      globalToggle.textContent = 'Minimizar campos';
    }
  });
}

init();
