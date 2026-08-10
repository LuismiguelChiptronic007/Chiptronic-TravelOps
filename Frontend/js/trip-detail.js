import { api, hideAlert, showAlert } from './api.js';
import { mountShell } from './layout.js';
import { fillWorkTypes, prepareTaskForm, renderTrip, taskFormPayload } from './trip-render.js';

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
    try {
      const typesRes = await api.workTypes();
      fillWorkTypes(typesRes.work_types || []);
    } catch {
      fillWorkTypes([
        'Instalação',
        'Manutenção',
        'Treinamento',
        'Visita técnica',
        'Suporte',
        'Comercial',
        'Auditoria',
        'Outro',
      ]);
    }

    const res = await api.getTrip(tripId);
    renderTrip(res.trip);
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
    const payload = taskFormPayload();
    const res = await api.addTask(tripId, payload);
    renderTrip(res.trip);
    prepareTaskForm(res.trip, { keepDate: true });
    showAlert(alertEl, 'Tarefa salva com sucesso.', 'success');
  } catch (err) {
    showAlert(alertEl, err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

document.getElementById('btn-complete')?.addEventListener('click', async () => {
  hideAlert(alertEl);
  if (!confirm('Concluir esta viagem? É necessário ter ao menos uma tarefa registrada.')) return;
  try {
    const res = await api.completeTrip(tripId);
    renderTrip(res.trip);
    showAlert(alertEl, 'Viagem concluída com sucesso!', 'success');
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});

document.getElementById('tasks-board')?.addEventListener('click', async (e) => {
  const id = e.target.getAttribute('data-del-task');
  if (!id || !confirm('Excluir esta tarefa?')) return;
  hideAlert(alertEl);
  try {
    const res = await api.deleteTask(tripId, id);
    renderTrip(res.trip);
    showAlert(alertEl, 'Tarefa excluída.', 'success');
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});

init();
