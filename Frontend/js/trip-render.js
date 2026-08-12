import { formatDateBR, formatSectorName, statusBadge } from './api.js';
import { escapeHtml } from './layout.js';

let lastTaskDate = '';
let selectedTripDate = '';

function getTripDays(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function setReadOnly(flag) {
  document.querySelectorAll('#task-form input, #task-form textarea, #task-form select').forEach((el) => {
    el.disabled = flag;
  });
  ['btn-save-task', 'btn-complete'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = flag;
  });
}

function hideElement(el) {
  if (el) el.classList.add('hidden-fields');
}

function showElement(el) {
  if (el) el.classList.remove('hidden-fields');
}

function updateTaskTypeFields() {
  const type = document.getElementById('work_type')?.value;
  const dieselFields = document.getElementById('dieseldiag-fields');
  const logsFields = document.getElementById('controlelogs-fields');
  const nomeSistemas = document.getElementById('nome-sistemas-field');

  hideElement(dieselFields);
  hideElement(logsFields);
  hideElement(nomeSistemas);

  if (type === 'Dieseldiag Ontime') {
    showElement(dieselFields);
  } else if (type === 'Controle de Logs') {
    showElement(logsFields);
    showElement(nomeSistemas);
  }
}

function renderMembers(t) {
  const el = document.getElementById('trip-members');
  if (!el) return;
  const members = Array.isArray(t.members) ? t.members : [];
  if (!members.length) {
    el.innerHTML = '<div class="empty-state">Nenhum integrante</div>';
    return;
  }
  el.innerHTML = members
    .map(
      (m) => `
    <div class="member-chip static">
      <div class="info">
        <strong>${escapeHtml(m.full_name)}</strong>
        <small>
          Setor: ${escapeHtml(formatSectorName(m.sector || '—'))}
          · Responsável: ${escapeHtml(m.manager_name || 'Não informado')}
          ${m.position_title ? ` · ${escapeHtml(m.position_title)}` : ''}
        </small>
      </div>
    </div>`
    )
    .join('');
}

function fillTaskResponsibleOptions(t) {
  const select = document.getElementById('responsible_id');
  if (!select) return;

  const current = select.value;
  const members = Array.isArray(t.members) ? t.members : [];
  // debug: expose members for quick inspection in console
  try { window.__tripMembers = members; } catch (e) {}
  select.innerHTML = '<option value="">Selecione um responsável…</option>';

  if (members.length) {
    for (const member of members) {
      const opt = document.createElement('option');
      opt.value = String(member.user_id || member.id || '');
      // mark the trip creator so it's visible in the dropdown
      const isCreator = String(member.user_id || member.id || '') === String(t.user_id || '');
      opt.textContent = `${member.full_name}${member.employee_id ? ` — ${member.employee_id}` : ''}${isCreator ? ' (Criador)' : ''}`;
      select.appendChild(opt);
    }
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nenhum integrante cadastrado na viagem';
    select.appendChild(opt);
  }

  if (current && [...select.options].some((o) => o.value === current)) {
    select.value = current;
  }
}

function renderTasks(t) {
  const board = document.getElementById('tasks-board');
  if (!board) return;

  const tasks = t.tasks || [];
  const filteredTasks = selectedTripDate ? tasks.filter((task) => task.task_date === selectedTripDate) : tasks;
  if (!filteredTasks.length) {
    board.innerHTML =
      '<div class="empty-state">Nenhuma tarefa registrada para este dia. Use o formulário abaixo para adicionar uma nova tarefa.</div>';
    return;
  }

  const byDate = new Map();
  for (const task of filteredTasks) {
    const d = task.task_date;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(task);
  }

  const dates = [...byDate.keys()].sort();
  board.innerHTML = dates
    .map((date) => {
      const dayTasks = byDate.get(date);
      return `
      <div class="task-day-group">
        <div class="task-day-header">
          <h3>${formatDateBR(date)}</h3>
          <span class="text-muted">${dayTasks.length} tarefa(s)</span>
        </div>
        <div class="task-cards">
          ${dayTasks
            .map(
              (task) => `
            <div class="task-card" data-task-id="${task.id}">
              <div class="task-card-header">
                <strong>${escapeHtml(task.work_type)}</strong>
                <span class="text-muted">${escapeHtml(task.start_time)} – ${escapeHtml(task.end_time)}</span>
              </div>
              <div class="task-card-body">
                <div class="kv-item"><label>Local</label><div>${escapeHtml(task.location)}</div></div>
                <div class="kv-item"><label>Responsável</label><div>${escapeHtml(task.responsible?.full_name || '—')}</div></div>
                <div class="kv-item"><label>Resumo</label><div>${escapeHtml(task.summary)}</div></div>
                ${
                  task.pending_items
                    ? `<div class="kv-item"><label>Pendências</label><div>${escapeHtml(task.pending_items)}</div></div>`
                    : ''
                }
                ${
                  task.photos?.length
                    ? `<div class="task-photos">${task.photos
                        .map(
                          (p) =>
                            `<a href="${p.url}" target="_blank" class="task-photo-thumb"><img src="${p.url}" alt="${escapeHtml(p.original_name)}" /></a>`
                        )
                        .join('')}</div>`
                    : ''
                }
              </div>
              ${
                t.status !== 'completed'
                  ? `<div class="task-card-actions"><button type="button" class="btn btn-danger btn-sm" data-del-task="${task.id}">Excluir</button></div>`
                  : ''
              }
            </div>`
            )
            .join('')}
        </div>
      </div>`;
    })
    .join('');
}

export function prepareTaskForm(t, { keepDate = false, clearDate = false } = {}) {
  const form = document.getElementById('task-form');
  if (!form) return;

  const dateInput = document.getElementById('task_date');
  const typeSelect = document.getElementById('work_type');
  const prevDate = dateInput?.value || lastTaskDate;

  form.reset();

  if (typeSelect && !typeSelect.dataset.listenerAttached) {
    typeSelect.addEventListener('change', updateTaskTypeFields);
    typeSelect.dataset.listenerAttached = '1';
  }

  if (dateInput) {
    dateInput.min = t.start_date;
    dateInput.max = t.end_date;
    if (keepDate && prevDate) {
      dateInput.value = prevDate;
    } else if (clearDate) {
      dateInput.value = '';
    } else if (selectedTripDate) {
      dateInput.value = selectedTripDate;
    } else {
      const today = new Date().toISOString().slice(0, 10);
      if (today >= t.start_date && today <= t.end_date) dateInput.value = today;
      else dateInput.value = t.start_date;
    }
  }

  updateTaskTypeFields();
  lastTaskDate = dateInput?.value || '';
}

export function fillWorkTypes(types) {
  const sel = document.getElementById('work_type');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Selecione…</option>';
  for (const type of types || []) {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = type;
    sel.appendChild(opt);
  }
  if (current) sel.value = current;
}

function renderTripDays(t) {
  const daysContainer = document.getElementById('trip-days');
  if (!daysContainer) return;

  const dates = getTripDays(t.start_date, t.end_date);
  if (dates.length <= 1) {
    daysContainer.innerHTML = '';
    return;
  }

  if (!selectedTripDate || !dates.includes(selectedTripDate)) {
    const today = new Date().toISOString().slice(0, 10);
    selectedTripDate = dates.includes(today) ? today : dates[0];
  }

  daysContainer.innerHTML = dates
    .map(
      (date) => `
      <button type="button" class="trip-day-btn${date === selectedTripDate ? ' active' : ''}" data-day="${date}">
        ${formatDateBR(date)}
      </button>`
    )
    .join('');

  daysContainer.querySelectorAll('.trip-day-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.day;
      if (!date || date === selectedTripDate) return;
      selectedTripDate = date;
      renderTripDays(t);
      renderTasks(t);
      document.getElementById('task-form-title').textContent = `Nova tarefa — ${formatDateBR(selectedTripDate)}`;
      prepareTaskForm(t, { clearDate: false });
    });
  });
}

function renderCompletionProgress(t) {
  const wrap = document.getElementById('completion-progress');
  if (!wrap) return;
  if (t.status === 'completed') {
    wrap.classList.add('hidden-fields');
    return;
  }
  wrap.classList.remove('hidden-fields');

  const requiredDays = getTripDays(t.start_date, t.end_date);
  const taskDates = new Set(
    (t.tasks || []).map((task) => String(task.task_date || '').trim()).filter(Boolean)
  );
  const total = requiredDays.length;
  const covered = requiredDays.filter((d) => taskDates.has(d)).length;
  const missing = total - covered;
  const pct = total === 0 ? 0 : Math.min(100, Math.round((covered / total) * 100));

  document.getElementById('progress-text').textContent =
    `${covered} de ${total} ${total === 1 ? 'dia com tarefa' : 'dias com tarefa registrada'}`;

  const fill = document.getElementById('progress-fill');
  if (fill) {
    fill.style.width = `${pct}%`;
    fill.classList.toggle('complete', missing === 0);
  }

  const hint = document.getElementById('progress-hint');
  if (hint) {
    if (missing === 0) {
      hint.textContent = '✓ Todos os dias têm pelo menos uma tarefa. Você já pode concluir a viagem.';
    } else {
      hint.textContent =
        `Falta${missing === 1 ? '' : 'm'} registrar tarefa${missing === 1 ? '' : 's'} em ${missing} dia${missing === 1 ? '' : 's'} do período para poder concluir.`;
    }
  }
}

export function renderTrip(t) {
  document.getElementById('trip-title').textContent = `${t.origin} → ${t.destination}`;
  document.getElementById('trip-subtitle').textContent =
    `${formatDateBR(t.start_date)} a ${formatDateBR(t.end_date)}`;
  document.getElementById('trip-status').innerHTML = statusBadge(t);
  document.getElementById('trip-reason').textContent = t.reason;

  document.getElementById('trip-kv').innerHTML = `
    <div class="kv-item"><label>Origem</label><div>${escapeHtml(t.origin)}</div></div>
    <div class="kv-item"><label>Destino</label><div>${escapeHtml(t.destination)}</div></div>
    <div class="kv-item"><label>Início</label><div>${formatDateBR(t.start_date)}</div></div>
    <div class="kv-item"><label>Término</label><div>${formatDateBR(t.end_date)}</div></div>
    <div class="kv-item"><label>Setor</label><div>${escapeHtml(formatSectorName(t.sector))}</div></div>
  `;

  const banner = document.getElementById('overdue-banner');
  if (t.is_overdue) banner.classList.remove('hidden');
  else banner.classList.add('hidden');

  renderMembers(t);
  fillTaskResponsibleOptions(t);
  renderTripDays(t);
  renderTasks(t);
  renderCompletionProgress(t);

  document.getElementById('task-form-title').textContent =
    selectedTripDate ? `Nova tarefa — ${formatDateBR(selectedTripDate)}` : 'Nova tarefa';

  const completeBtn = document.getElementById('btn-complete');
  if (completeBtn) {
    completeBtn.classList.toggle('hidden', t.status === 'completed');
  }

  prepareTaskForm(t, { clearDate: false });
  setReadOnly(false);
  window.__currentTrip = t;
}

export function taskFormPayload() {
  return {
    work_type: document.getElementById('work_type').value,
    location: document.getElementById('location').value.trim(),
    start_time: document.getElementById('start_time').value,
    end_time: document.getElementById('end_time').value,
    responsible_id: document.getElementById('responsible_id')?.value || null,
    summary: document.getElementById('summary').value.trim(),
    task_date: document.getElementById('task_date').value,
    pending_items: document.getElementById('pending_items')?.value.trim() || null,
  };
}
