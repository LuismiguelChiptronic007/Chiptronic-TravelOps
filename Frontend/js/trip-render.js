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

function normalizeWorkType(type) {
  return String(type || '').trim().toLowerCase();
}

function requiresVehicleFields(type) {
  const normalized = normalizeWorkType(type);
  return [
    'dieseldiag ontime',
    'controle de logs',
    'logs de telemetria',
  ].includes(normalized);
}

function updateTaskTypeFields() {
  const type = document.getElementById('work_type')?.value;
  const vehicleFields = document.getElementById('vehicle-fields');
  const vehicleInput = document.getElementById('vehicle');
  const plateInput = document.getElementById('plate');

  hideElement(vehicleFields);
  if (vehicleInput) vehicleInput.required = false;
  if (plateInput) plateInput.required = false;

  if (requiresVehicleFields(type)) {
    showElement(vehicleFields);
    if (vehicleInput) vehicleInput.required = true;
    if (plateInput) plateInput.required = true;
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
                  task.vehicle || task.plate
                    ? `<div class="kv-item"><label>Veículo / Placa</label><div>${escapeHtml(task.vehicle || '—')} ${task.plate ? `· ${escapeHtml(task.plate)}` : ''}</div></div>`
                    : ''
                }
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

  const startInput = document.getElementById('start_time');
  const endInput = document.getElementById('end_time');

  if (typeSelect && !typeSelect.dataset.listenerAttached) {
    typeSelect.addEventListener('change', updateTaskTypeFields);
    typeSelect.dataset.listenerAttached = '1';
  }

  if (startInput && !startInput.dataset.listenerAttached) {
    startInput.addEventListener('input', () => updateTaskAvailability(t, selectedTripDate));
    startInput.dataset.listenerAttached = '1';
  }

  if (endInput && !endInput.dataset.listenerAttached) {
    endInput.addEventListener('input', () => updateTaskAvailability(t, selectedTripDate));
    endInput.dataset.listenerAttached = '1';
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
      updateTaskAvailability(t, selectedTripDate);
      document.getElementById('task-form-title').textContent = `Nova tarefa — ${formatDateBR(selectedTripDate)}`;
      prepareTaskForm(t, { clearDate: false });
    });
  });
}

function minutesFromTime(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function formatTimeLabel(value) {
  if (!value) return '—';
  const [h, m] = String(value).split(':');
  return `${String(h).padStart(2, '0')}:${String(m || '00').padStart(2, '0')}`;
}

function formatMinutesLabel(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function computeTimeline(tasksForDate = []) {
  const dayStart = 8 * 60;
  const dayEnd = 18 * 60;
  const lunch = { start: 12 * 60, end: 13 * 60, label: 'Almoço', kind: 'lunch' };

  const blocks = (tasksForDate || [])
    .map((task) => ({
      start: minutesFromTime(task.start_time),
      end: minutesFromTime(task.end_time),
      label: task.work_type || 'Trabalho',
      kind: 'work',
    }))
    .filter((block) => block.start != null && block.end != null && block.end > block.start)
    .sort((a, b) => a.start - b.start);

  const lunchOverlap = blocks.some((block) => block.start < lunch.end && block.end > lunch.start);
  if (!lunchOverlap) {
    blocks.push({ ...lunch, kind: 'lunch' });
  }

  blocks.sort((a, b) => a.start - b.start);

  const timeline = [];
  let cursor = dayStart;

  for (const block of blocks) {
    if (block.start > cursor) {
      timeline.push({ start: cursor, end: block.start, label: 'Horário disponível', kind: 'free' });
    }
    timeline.push({ ...block, end: Math.min(block.end, dayEnd) });
    cursor = Math.max(cursor, Math.min(block.end, dayEnd));
  }

  if (cursor < dayEnd) {
    timeline.push({ start: cursor, end: dayEnd, label: 'Horário disponível', kind: 'free' });
  }

  return timeline.filter((entry) => entry.end > entry.start);
}

function findConflict(startMinutes, endMinutes, tasksForDate = []) {
  const dayStart = 8 * 60;
  const dayEnd = 18 * 60;
  if (startMinutes < dayStart || endMinutes > dayEnd || endMinutes <= startMinutes) {
    return { label: 'fora do expediente (08:00–18:00)' };
  }

  const timeline = computeTimeline(tasksForDate);
  const freeWindow = timeline.find((slot) => slot.kind === 'free' && slot.start <= startMinutes && slot.end >= endMinutes);
  if (freeWindow) return null;

  const clash = timeline.find((slot) => slot.start < endMinutes && slot.end > startMinutes && slot.kind !== 'free');
  if (clash) return clash;

  return { label: 'horário indisponível' };
}

function getAvailabilitySummary(tasksForDate) {
  const timeline = computeTimeline(tasksForDate);
  const freeSlots = timeline.filter((slot) => slot.kind === 'free');

  const chipStyle =
    'display:inline-block;padding:1px 6px;margin:0 4px 2px 0;border-radius:10px;background:#eef4ee;color:#2f6b46;font-size:0.68rem;font-weight:600;white-space:nowrap;';
  const labelStyle = 'color:#6b7280;margin-right:4px;';

  if (!freeSlots.length) {
    return `<div style="${labelStyle}">Sem horários livres neste dia.</div>`;
  }

  const chips = freeSlots
    .map((slot) => `<span style="${chipStyle}">${formatMinutesLabel(slot.start)}–${formatMinutesLabel(slot.end)}</span>`)
    .join('');

  return `<span style="${labelStyle}">Livre:</span>${chips}`;
}

export function updateTaskAvailability(t, selectedDate) {
  const panel = document.getElementById('task-time-availability');
  if (!panel) return;

  const form = document.getElementById('task-form');
  const startValue = form?.querySelector('#start_time')?.value || '';
  const endValue = form?.querySelector('#end_time')?.value || '';

  if (startValue && endValue) {
    panel.innerHTML = '';
    panel.classList.add('hidden-fields');
    return;
  }

  if (!selectedDate) {
    panel.innerHTML = '';
    panel.classList.add('hidden-fields');
    return;
  }

  const tasksForDate = (t.tasks || []).filter((task) => task.task_date === selectedDate);
  panel.innerHTML = getAvailabilitySummary(tasksForDate);
  panel.classList.remove('hidden-fields');
}

export function validateTaskTimeAvailability(t, selectedDate, startTime, endTime) {
  if (!selectedDate || !startTime || !endTime) return { ok: true, message: '' };

  const tasksForDate = (t.tasks || []).filter((task) => task.task_date === selectedDate);
  const startMinutes = minutesFromTime(startTime);
  const endMinutes = minutesFromTime(endTime);

  if (startMinutes == null || endMinutes == null) {
    return { ok: true, message: '' };
  }

  const conflict = findConflict(startMinutes, endMinutes, tasksForDate);
  if (conflict) {
    return {
      ok: false,
      message: 'Já tem uma tarefa nesse horário, coloque um dos horários disponíveis.'
    };
  }

  return { ok: true, message: '' };
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
  updateTaskAvailability(t, selectedTripDate);
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
    vehicle: document.getElementById('vehicle')?.value.trim() || null,
    plate: document.getElementById('plate')?.value.trim() || null,
  };
}
