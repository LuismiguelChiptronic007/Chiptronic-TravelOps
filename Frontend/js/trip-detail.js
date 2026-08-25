import { api, hideAlert, showAlert } from "./api.js";
import { mountShell } from "./layout.js";
import {
<<<<<<< HEAD
  fillWorkTypes, prepareTaskForm, renderTrip, taskFormPayload, validateTaskTimeAvailability, setupPanelToggles } from "./trip-render.js";
import { confirmDialog } from "./ui.js";
import {
  getLocationConsent,
  setLocationConsent,
  startTripLocationMonitor,
  stopTripLocationMonitor,
  isMonitoringActive,
  registrarCheckinTrabalho,
} from "./location.js";
=======
  fillWorkTypes,
  prepareTaskForm,
  renderTrip,
  taskFormPayload,
  validateTaskTimeAvailability,
  setupPanelToggles,
} from "./trip-render.js";
import { confirmDialog } from "./ui.js";
>>>>>>> 2d51f852f158caac4c1b360bbbba5710351d4f54

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
  if (!trip || !trip.start_date || !trip.end_date || !Array.isArray(trip.tasks))
    return false;
  const requiredDays = getTripDays(trip.start_date, trip.end_date);
  const taskDates = new Set(
    trip.tasks
      .map((task) => String(task.task_date || "").trim())
      .filter(Boolean),
  );
  return requiredDays.every((date) => taskDates.has(date));
}

const params = new URLSearchParams(location.search);
const tripId = Number(params.get("id"));
const alertEl = document.getElementById("alert");

<<<<<<< HEAD
let monitorMetricsTimer = null;

function updateLocationMonitorStatus(trip, extra = {}) {
  const statusEl = document.getElementById('location-monitor-status');
  const panelEl = document.getElementById('location-monitor-panel');
  const toggle = document.getElementById('trip-share-location');
  const metricsEl = document.getElementById('loc-last-checkin');
  const metricsWrap = document.getElementById('location-monitor-metrics');
  if (!statusEl || !panelEl) return;

  panelEl.classList.remove('hidden-fields');

  const consent = getLocationConsent(tripId);
  if (toggle) toggle.checked = Boolean(consent);

  if (!trip || trip.status !== 'in_progress') {
    panelEl.classList.add('hidden-fields');
    return;
  }

  statusEl.className = 'alert';
  if (extra.error) {
    statusEl.classList.add('alert-error');
    statusEl.textContent = String(extra.error);
  } else if (isMonitoringActive(tripId)) {
    statusEl.classList.add('alert-success');
    statusEl.textContent = '🟢 Monitoramento ativo — sua localização está sendo compartilhada com o Mapa Operacional.';
    if (metricsWrap) metricsWrap.classList.remove('hidden-fields');
  } else if (consent === true) {
    statusEl.classList.add('alert-warning');
    statusEl.textContent = 'Compartilhamento ativado, aguardando primeira leitura de localização…';
  } else if (consent === false) {
    statusEl.classList.add('alert-info');
    statusEl.textContent = 'Compartilhamento desativado. Ligue o toggle acima se quiser participar do Mapa Operacional.';
  } else {
    statusEl.classList.add('alert-info');
    statusEl.textContent = 'Ative o compartilhamento para enviar sua posição durante esta viagem.';
  }

  if (metricsEl) {
    try {
      const key = `cto_last_checkin_${tripId}`;
      const raw = localStorage.getItem(key);
      const last = raw ? JSON.parse(raw) : null;
      if (last?.at) {
        const d = new Date(last.at);
        metricsEl.textContent = `Último check-in: ${d.toLocaleString('pt-BR')} · Lat ${Number(last.latitude).toFixed(5)}, Lon ${Number(last.longitude).toFixed(5)}`;
      } else {
        metricsEl.textContent = 'Nenhum check-in registrado ainda nesta viagem.';
      }
    } catch {}
  }
}

function setupLocationMonitor(trip) {
  if (!trip) return;
  const panelEl = document.getElementById('location-monitor-panel');
  if (!panelEl) return;
  if (trip.status !== 'in_progress') {
    panelEl.classList.add('hidden-fields');
    return;
  }
  panelEl.classList.remove('hidden-fields');

  const toggle = document.getElementById('trip-share-location');
  const consent = getLocationConsent(tripId);
  if (toggle) toggle.checked = Boolean(consent);

  if (consent === true && !isMonitoringActive(tripId)) {
    startTripLocationMonitor(tripId, {
      intervalMs: 4 * 60 * 1000,
      loadTrip: () => api.getTrip(tripId).then((r) => r.trip),
      onTripEnded: () => {
        stopTripLocationMonitor(tripId, { notify: true, alertEl, showAlertFn: showAlert });
        updateLocationMonitorStatus(trip);
      },
    });
  }

  updateLocationMonitorStatus(trip);

  toggle?.addEventListener('change', async () => {
    const enabled = Boolean(toggle.checked);
    setLocationConsent(tripId, enabled);
    if (enabled && !isMonitoringActive(tripId)) {
      const h = startTripLocationMonitor(tripId, {
        intervalMs: 4 * 60 * 1000,
        loadTrip: () => api.getTrip(tripId).then((r) => r.trip),
        onTripEnded: () => {
          stopTripLocationMonitor(tripId, { notify: true, alertEl, showAlertFn: showAlert });
          updateLocationMonitorStatus(trip);
        },
      });
      if (!h) {
        updateLocationMonitorStatus(trip, { error: 'Não foi possível iniciar monitoramento (localização indisponível ou bloqueada).' });
        toggle.checked = false;
        setLocationConsent(tripId, false);
        return;
      }
      try {
        const posOk = await new Promise((resolve, reject) => {
          if (!('geolocation' in navigator)) return reject(new Error('sem-geoloc'));
          navigator.geolocation.getCurrentPosition(() => resolve(true), (e) => reject(e), { timeout: 7000 });
        }).catch((e) => e && e?.code === 1 ? 'denied' : false);
        if (posOk === 'denied') {
          toggle.checked = false;
          setLocationConsent(tripId, false);
          stopTripLocationMonitor(tripId);
          updateLocationMonitorStatus(trip, { error: 'Permissão de localização negada. Habilite nas configurações do navegador e ative novamente.' });
          return;
        }
      } catch {}
    } else if (!enabled) {
      stopTripLocationMonitor(tripId);
    }
    updateLocationMonitorStatus(trip);
  });

  if (monitorMetricsTimer) clearInterval(monitorMetricsTimer);
  monitorMetricsTimer = setInterval(() => updateLocationMonitorStatus(trip), 15000);
}

=======
>>>>>>> 2d51f852f158caac4c1b360bbbba5710351d4f54
async function init() {
  if (!tripId) {
    window.location.href = "index.html";
    return;
  }
  const user = await mountShell({ active: "dashboard" });
  if (!user) return;

  try {
    const res = await api.getTrip(tripId);
    const trip = res.trip;
    const typesRes = await api.workTypes({
      trip_id: tripId,
      sector: trip.sector,
    });
    fillWorkTypes(typesRes.work_types || []);
    renderTrip(trip);
    setupPanelToggles();
<<<<<<< HEAD
    setupLocationMonitor(trip);
=======
>>>>>>> 2d51f852f158caac4c1b360bbbba5710351d4f54

    const editBtn = document.getElementById("btn-edit-trip");
    if (editBtn) {
      editBtn.textContent =
        trip.status === "completed" ? "Editar checklist" : "Editar viagem";
    }
  } catch (err) {
    showAlert(alertEl, err.message);
  }

  document.getElementById('btn-trip-history')?.addEventListener('click', () => {
    window.location.href = `trip-history.html?id=${tripId}`;
  });
}

document.getElementById("task-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert(alertEl);
  const btn = document.getElementById("btn-save-task");
  if (btn) btn.disabled = true;

  try {
    const trip = window.__currentTrip;
    const payload = taskFormPayload();
    const validation = validateTaskTimeAvailability(
      trip,
      payload.task_date,
      payload.start_time,
      payload.end_time,
    );

    if (!validation.ok) {
      showAlert(alertEl, validation.message);
      alertEl?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const res = await api.addTask(tripId, payload);
    renderTrip(res.trip);
    setupPanelToggles();
    prepareTaskForm(res.trip, { keepDate: true });
    showAlert(alertEl, "Tarefa salva com sucesso.", "success");
<<<<<<< HEAD

    const taskId = res.task_id || (res.trip?.tasks || []).slice(-1)[0]?.id || null;
    if (taskId && getLocationConsent(tripId) === true) {
      registrarCheckinTrabalho(taskId, { viagemId: tripId, silent: true })
        .then((r) => {
          if (r.ok) updateLocationMonitorStatus(res.trip || window.__currentTrip);
        })
        .catch(() => {});
    }
=======
>>>>>>> 2d51f852f158caac4c1b360bbbba5710351d4f54
  } catch (err) {
    showAlert(alertEl, err.message);
    alertEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    if (btn) btn.disabled = false;
  }
});

document.getElementById("btn-complete")?.addEventListener("click", async () => {
  hideAlert(alertEl);
  const trip = window.__currentTrip;
  const valid = hasTaskEveryTripDay(trip);
  const confirmed = await confirmDialog({
    title: "Finalizar viagem",
    message: valid
      ? ""
      : "Só é possível finalizar quando cada dia do período tiver pelo menos uma tarefa registrada.",
    confirmLabel: "Finalizar",
    cancelLabel: "Cancelar",
    tone: valid ? "confirm" : "danger",
    confirmTone: valid ? "primary" : "danger",
  });
  if (!confirmed) return;
  try {
<<<<<<< HEAD
    stopTripLocationMonitor(tripId, { notify: false });
    const res = await api.completeTrip(tripId);
    renderTrip(res.trip);
    setupPanelToggles();
    showAlert(alertEl, "Viagem finalizada com sucesso! Compartilhamento de localização encerrado.", "success");
    updateLocationMonitorStatus(res.trip);
    if (monitorMetricsTimer) {
      clearInterval(monitorMetricsTimer);
      monitorMetricsTimer = null;
    }
=======
    const res = await api.completeTrip(tripId);
    renderTrip(res.trip);
    setupPanelToggles();
    showAlert(alertEl, "Viagem finalizada com sucesso!", "success");
>>>>>>> 2d51f852f158caac4c1b360bbbba5710351d4f54
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});

document.addEventListener("click", async (e) => {
  const deleteBtn = e.target.closest("[data-del-task]");
  if (!deleteBtn) return;

  const id = deleteBtn.getAttribute("data-del-task");
  if (!id) return;

  const confirmed = await confirmDialog({
    title: "Excluir tarefa",
    message:
      "Deseja realmente excluir esta tarefa? Esta ação não pode ser desfeita.",
    confirmLabel: "Excluir",
    cancelLabel: "Cancelar",
    tone: "danger",
    confirmTone: "danger",
  });

  if (!confirmed) return;

  hideAlert(alertEl);
  try {
    const res = await api.deleteTask(tripId, id);
    renderTrip(res.trip);
    showAlert(alertEl, "Tarefa excluída.", "success");
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});

document.getElementById("btn-edit-trip")?.addEventListener("click", () => {
  const trip = window.__currentTrip;
  if (!trip) return;
  if (trip.status === "completed") {
    document
      .getElementById("task-form-wrap")
      ?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  window.location.href = `trip-new.html?id=${tripId}`;
});

document
  .getElementById("btn-delete-trip")
  ?.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: "Excluir viagem",
      message: "Deseja excluir esta viagem? Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      tone: "danger",
      confirmTone: "danger",
    });

    if (!confirmed) return;

    hideAlert(alertEl);
    try {
      await api.deleteTrip(tripId);
      showAlert(alertEl, "Viagem excluída com sucesso.", "success");
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1200);
    } catch (err) {
      showAlert(alertEl, err.message);
    }
  });

init();
