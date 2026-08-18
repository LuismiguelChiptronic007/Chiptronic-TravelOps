import { api, hideAlert, showAlert } from './api.js';
import { mountShell } from './layout.js';
import {
  fillWorkTypes,
  prepareTaskForm,
  renderTrip,
  taskFormPayload,
  validateTaskTimeAvailability,
  setupPanelToggles,
} from './trip-render.js';
import { confirmDialog } from './ui.js';

function getTripDays(startDate, endDate) {
  const days = [];
  if (!startDate || !endDate || endDate < startDate) return days;
  let current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (current <= end) {
    days.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function hasTaskEveryTripDay(trip) {
  if (!trip || !trip.start_date || !trip.end_date || !Array.isArray(trip.tasks)) return false;
  const requiredDays = getTripDays(trip.start_date, trip.end_date);
  const taskDates = new Set(trip.tasks.map((task) => String(task.task_date || '').trim()).filter(Boolean));
  return requiredDays.every((date) => taskDates.has(date));
}

const params = new URLSearchParams(location.search);
const tripId = Number(params.get('id'));
const alertEl = document.getElementById('alert');

async function init() {
  if (!tripId) {
    location.href = 'index.html';
    return;
  }
  const user = await mountShell({ active: 'dashboard' });
  if (!user) return;

  try {
    const [typesRes, res] = await Promise.all([
      api.workTypes(),
      api.getTrip(tripId),
    ]);
    fillWorkTypes(typesRes.work_types || []);
    renderTrip(res.trip);
    setupPanelToggles();

    const editBtn = document.getElementById('btn-edit-trip');
    if (editBtn) {
      editBtn.textContent = res.trip.status === 'completed' ? 'Editar checklist' : 'Editar viagem';
    }
  } catch (err) {
    showAlert(alertEl, err.message);
  }
}

document.getElementById('task-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertEl);
  const btn = document.getElementById('btn-save-task');
  if (btn) btn.disabled = true;

  try {
    const trip = window.__currentTrip;
    const payload = taskFormPayload();
    const validation = validateTaskTimeAvailability(
      trip,
      payload.task_date,
      payload.start_time,
      payload.end_time
    );

    if (!validation.ok) {
      showAlert(alertEl, validation.message);
      alertEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const res = await api.addTask(tripId, payload);
    renderTrip(res.trip);
    setupPanelToggles();
    prepareTaskForm(res.trip, { keepDate: true });
    showAlert(alertEl, 'Tarefa salva com sucesso.', 'success');
    alertEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showAlert(alertEl, err.message);
    alertEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } finally {
    if (btn) btn.disabled = false;
  }
});

document.getElementById('btn-complete')?.addEventListener('click', async () => {
  hideAlert(alertEl);
  const trip = window.__currentTrip;
  const valid = hasTaskEveryTripDay(trip);
  const confirmed = await confirmDialog({
    title: 'Finalizar viagem',
    message: valid ? '' : 'Só é possível finalizar quando cada dia do período tiver pelo menos uma tarefa registrada.',
    confirmLabel: 'Finalizar',
    cancelLabel: 'Cancelar',
    tone: valid ? 'confirm' : 'danger',
    confirmTone: valid ? 'primary' : 'danger'
  });
  if (!confirmed) return;
  try {
    const res = await api.completeTrip(tripId);
    renderTrip(res.trip);
    setupPanelToggles();
    showAlert(alertEl, 'Viagem finalizada com sucesso!', 'success');
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});

document.addEventListener('click', async (e) => {
  const deleteBtn = e.target.closest('[data-del-task]');
  if (!deleteBtn) return;

  const id = deleteBtn.getAttribute('data-del-task');
  if (!id) return;

  const confirmed = await confirmDialog({
    title: 'Excluir tarefa',
    message: 'Deseja realmente excluir esta tarefa? Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    cancelLabel: 'Cancelar',
    tone: 'danger',
    confirmTone: 'danger'
  });

  if (!confirmed) return;

  hideAlert(alertEl);
  try {
    const res = await api.deleteTask(tripId, id);
    renderTrip(res.trip);
    showAlert(alertEl, 'Tarefa excluída.', 'success');
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});

document.getElementById('btn-edit-trip')?.addEventListener('click', () => {
  const trip = window.__currentTrip;
  if (!trip) return;
  if (trip.status === 'completed') {
    document.getElementById('task-form-wrap')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  location.href = `trip-new.html?id=${tripId}`;
});

document.getElementById('btn-delete-trip')?.addEventListener('click', async () => {
  const confirmed = await confirmDialog({
    title: 'Excluir viagem',
    message: 'Deseja excluir esta viagem? Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    cancelLabel: 'Cancelar',
    tone: 'danger',
    confirmTone: 'danger'
  });

  if (!confirmed) return;

   hideAlert(alertEl);
   try {
     await api.deleteTrip(tripId);
     showAlert(alertEl, 'Viagem excluída com sucesso.', 'success');
     setTimeout(() => {
       location.href = 'index.html';
     }, 1200);
   } catch (err) {
     showAlert(alertEl, err.message);
   }
});

init();
