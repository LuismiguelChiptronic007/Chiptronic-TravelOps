import {
  formatDateBR,
  formatSectorName,
  statusBadge,
  api,
  showAlert,
} from "./api.js";

import { escapeHtml } from "./layout.js";

import {
  shouldShowVehicleFields,
  shouldShowVehicleDetailFields,
  isLunchType,
  isTravelType,
  normalizeWorkType,
  filterVehicleDetailCustomFields,
} from "./task-field-rules.js";

import {
  inserirCampoAtividadePrioridadeNoForm,
  extrairPayloadDemandaDoForm,
  abrirModalDemandasLider,
} from "./demandas.js";

let lastTaskDate = "";
let selectedTripDate = "";
const TASK_DAY_START = 0;
const TASK_DAY_END = 24 * 60;
let personalTaskSchedule = {
  date: "",
  schedules: {},
  requestId: 0,
  allowConflict: false,
};
let availableWorkTypes = [];

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
  document
    .querySelectorAll(
      "#task-form input, #task-form textarea, #task-form select",
    )
    .forEach((el) => {
      el.disabled = flag;
    });
  ["btn-save-task", "btn-complete"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = flag;
  });
}

function hideElement(el) {
  if (el) el.classList.add("hidden-fields");
}

function showElement(el) {
  if (el) el.classList.remove("hidden-fields");
}

function requiresVehicleFields(type) {
  return shouldShowVehicleFields(type);
}

function requiresVehicleDetailFields(type) {
  return shouldShowVehicleDetailFields(type);
}

function isTravelTypeTask(type) {
  return isTravelType(type);
}

function updateTaskTypeFields() {
  const type = document.getElementById("work_type")?.value;
  const form = document.getElementById("task-form");
  const isOtherEntry = form?.dataset.entryMode === "other";
  const vehicleFields = document.getElementById("vehicle-fields");
  const vehicleInput = document.getElementById("vehicle");
  const plateInput = document.getElementById("plate");
  const vehicleDetailFields = document.getElementById("vehicle-detail-fields");
  const montadoraInput = document.getElementById("montadora");
  const modeloInput = document.getElementById("modelo");
  const submodeloInput = document.getElementById("submodelo");
  const anoInput = document.getElementById("ano");
  const locationField = document.getElementById("location-field");
  const locationInput = document.getElementById("location");
  const summaryField = document.getElementById("summary-field");
  const summaryInput = document.getElementById("summary");
  const pendingItemsField = document.getElementById("pending-items-field");
  const demandVehicleFields = document.getElementById("demand-vehicle-fields");

  if (isOtherEntry) {
    if (vehicleFields) hideElement(vehicleFields);
    if (vehicleDetailFields) hideElement(vehicleDetailFields);
    if (pendingItemsField) hideElement(pendingItemsField);
    if (demandVehicleFields) hideElement(demandVehicleFields);
  } else if (pendingItemsField) {
    showElement(pendingItemsField);
    if (demandVehicleFields) showElement(demandVehicleFields);
  }

  if (vehicleFields) hideElement(vehicleFields);
  if (vehicleDetailFields) hideElement(vehicleDetailFields);
  if (vehicleInput) vehicleInput.required = false;
  if (plateInput) plateInput.required = false;
  if (montadoraInput) montadoraInput.required = false;
  if (modeloInput) modeloInput.required = false;
  if (submodeloInput) submodeloInput.required = false;
  if (anoInput) anoInput.required = false;

  if (requiresVehicleFields(type)) {
    if (vehicleDetailFields) showElement(vehicleDetailFields);
    if (plateInput) plateInput.required = true;
    if (montadoraInput) montadoraInput.required = true;
    if (modeloInput) modeloInput.required = true;
    if (submodeloInput) submodeloInput.required = true;
    if (anoInput) anoInput.required = false;
  } else if (type === "Análise de veículos") {
    if (vehicleDetailFields) showElement(vehicleDetailFields);
    if (plateInput) plateInput.required = true;
  }

  const lunch = isLunchType(type);
  const travel = isTravelTypeTask(type);
  if (travel || lunch) {
    if (vehicleDetailFields) hideElement(vehicleDetailFields);
    if (plateInput) plateInput.required = false;
    if (montadoraInput) montadoraInput.required = false;
    if (modeloInput) modeloInput.required = false;
    if (submodeloInput) submodeloInput.required = false;
    if (anoInput) anoInput.required = false;
  }

  if (locationField)
    lunch ? hideElement(locationField) : showElement(locationField);
  if (locationInput) {
    locationInput.required = !lunch;
    if (lunch && !locationInput.value) locationInput.value = "Refeição";
  }

  if (summaryField)
    lunch ? hideElement(summaryField) : showElement(summaryField);
  if (summaryInput) {
    summaryInput.required = !lunch;
    if (lunch && !summaryInput.value)
      summaryInput.value = "Horário de refeição";
  }
}

function formatDemandVehicle(vehicle) {
  return [vehicle.montadora, vehicle.modelo, vehicle.versao_modelo, vehicle.placa]
    .filter(Boolean)
    .join(" · ") || `Veículo ${vehicle.id}`;
}

function populateDemandVehicleFields(trip) {
  const vehicleFields = document.getElementById("demand-vehicle-fields");
  const vehicleSelect = document.getElementById("demanda_veiculo_id");
  const activityField = document.getElementById("demand-activity-field");
  const activitySelect = document.getElementById("demanda_atividade_id");
  if (!vehicleFields || !vehicleSelect || !activityField || !activitySelect) return;

  const normalizeVehicleIdentity = (vehicle) => [
    vehicle.montadora,
    vehicle.modelo,
    vehicle.versao_modelo,
    vehicle.ano,
    vehicle.placa,
  ].map((value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "")).join("|");
  const vehiclesByIdentity = new Map();

  for (const vehicle of trip?.vehicles || []) {
    vehiclesByIdentity.set(normalizeVehicleIdentity(vehicle), {
      ...vehicle,
      id: `trip-${vehicle.id}`,
      atividades: [],
      vehicleFromTrip: true,
    });
  }

  for (const demand of trip?.demandas || []) {
    for (const vehicle of demand.veiculos || []) {
      const identity = normalizeVehicleIdentity(vehicle);
      const existing = vehiclesByIdentity.get(identity);
      vehiclesByIdentity.set(identity, {
        ...vehicle,
        ...(existing || {}),
        id: vehicle.id,
        atividades: [
          ...(existing?.atividades || []),
          ...(vehicle.atividades || []),
        ],
        demanda_tipo_projeto: demand.tipo_projeto || "",
        demanda_tipo_trabalho: demand.tipo_trabalho || "",
      });
    }
  }

  const vehicles = [...vehiclesByIdentity.values()];
  const currentVehicle = vehicleSelect.value;
  vehicleSelect.innerHTML = '<option value="">Sem veículo de demanda</option>' + vehicles
    .map((vehicle) => `<option value="${vehicle.id}">${escapeHtml(formatDemandVehicle(vehicle))}</option>`)
    .join("");
  if (currentVehicle && vehicles.some((vehicle) => String(vehicle.id) === currentVehicle)) {
    vehicleSelect.value = currentVehicle;
  }

  const updateActivityOptions = () => {
    const vehicle = vehicles.find((item) => String(item.id) === String(vehicleSelect.value));
    if (!vehicle) {
      activityField.classList.add("hidden-fields");
      activitySelect.innerHTML = '<option value="">Selecione uma demanda</option>';
      setVehicleDetailFields(null);
      return;
    }

    if (vehicle.atividades?.length) activityField.classList.remove("hidden-fields");
    else activityField.classList.add("hidden-fields");
    activitySelect.innerHTML = '<option value="">Selecione uma demanda</option>' +
      (vehicle.atividades || []).map((activity) =>
        `<option value="${activity.id}">${escapeHtml(activity.atividade_descricao || "Demanda")}${activity.prioridade ? ` · P${activity.prioridade}` : ""}</option>`,
      ).join("");
    setVehicleDetailFields(vehicle);
  };

  if (!vehicleSelect.dataset.listenerAttached) {
    vehicleSelect.addEventListener("change", updateActivityOptions);
    vehicleSelect.dataset.listenerAttached = "1";
  }
  updateActivityOptions();
}

function setVehicleDetailFields(vehicle) {
  const values = {
    montadora: vehicle?.montadora || "",
    modelo: vehicle?.modelo || "",
    submodelo: vehicle?.versao_modelo || "",
    plate: vehicle?.placa || "",
    ano: vehicle?.ano || "",
  };
  for (const [id, value] of Object.entries(values)) {
    const input = document.getElementById(id);
    if (input) input.value = value;
  }
}

function renderMembers(t) {
  const el = document.getElementById("trip-members");
  if (!el) return;
  const members = Array.isArray(t.members) ? t.members : [];
  if (!members.length) {
    el.innerHTML = '<div class="empty-state">Nenhum integrante</div>';
    return;
  }
  el.className = "tdb-members-list";
  el.innerHTML = members
    .map((m) => {
      const details = `Setor: ${formatSectorName(m.sector || "—")} · Responsável: ${m.manager_name || "Não informado"}${m.position_title ? ` · ${m.position_title}` : ""}`;
      return `
    <span class="tdb-member-chip" title="${escapeHtml(details)}">
      ${escapeHtml(m.full_name)}
    </span>`;
    })
    .join("");
}

function renderEquipment(t) {
  const el = document.getElementById("trip-equipment");
  if (!el) return;
  const list = Array.isArray(t.checklist?.equipment_checklist) ? t.checklist.equipment_checklist : [];
  const carriedItems = list.filter((item) => item.carried);
  if (!carriedItems.length) {
    el.innerHTML = '<div class="empty-state">Nenhum equipamento carregado</div>';
    return;
  }

  const groups = new Map();
  for (const item of carriedItems) {
    const type = String(item.equipment_type || "Outros").trim() || "Outros";
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(item);
  }

  const sections = [];
  for (const [type, items] of groups.entries()) {
    sections.push(`
      <div class="tdb-equipment-group">
        <div class="tdb-equipment-group-title">
          <span>${escapeHtml(type)}</span>
          <span class="tdb-equipment-count">${items.length}</span>
        </div>
        <div class="tdb-equipment-items">
          ${items.map((item) => {
            const accessories = Array.isArray(item.accessories) ? item.accessories : [];
            const accessoryHtml = accessories.length
              ? '<div class="equipment-accessory-list">' + accessories.map((accessory) => `
                  <span class="equipment-accessory-chip ${accessory.required ? 'is-required' : 'is-optional'}">
                    ${escapeHtml(accessory.name)}${accessory.required ? ' • obrigatório' : ' • opcional'}
                  </span>
                `).join("") + '</div>'
              : '';

            return `
            <div class="tdb-equipment-item ${item.carried ? "is-carried" : "is-pending"}">
              <label class="tdb-checkbox" style="cursor:default">
                <input type="checkbox" disabled ${item.carried ? "checked" : ""}>
                <span class="tdb-checkbox-box" aria-hidden="true">
                  ${item.carried ? `
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  ` : ""}
                </span>
              </label>
              <div class="tdb-equipment-meta">
                <span class="tdb-equipment-name">${escapeHtml(item.name)}</span>
                ${accessoryHtml}
              </div>
              <span class="tdb-equipment-status ${item.carried ? "status-carried" : "status-pending"}">
                ${item.carried ? "Carregado" : "Pendente"}
              </span>
            </div>
          `;
          }).join("")}
        </div>
      </div>
    `);
  }

  el.className = "tdb-equipment-list";
  el.innerHTML = sections.join("");
}

function fillTaskResponsibleOptions(t) {
  const list = document.getElementById("responsible_id");
  if (!list) return;

  const currentValues = new Set(
    Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map(
      (input) => input.value,
    ),
  );

  const members = Array.isArray(t.members) ? t.members : [];
  try {
    window.__tripMembers = members;
  } catch (e) {}
  list.innerHTML = "";

  if (!members.length) {
    const empty = document.createElement("div");
    empty.className = "responsible-empty";
    empty.textContent = "Nenhum integrante cadastrado na viagem";
    list.appendChild(empty);
    return;
  }

  for (const member of members) {
    const memberId = String(member.user_id || member.id || "");
    if (!memberId) continue;

    const option = document.createElement("label");
    option.className = "responsible-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "responsible_id";
    checkbox.value = memberId;
    checkbox.checked = currentValues.has(memberId);
    checkbox.addEventListener("change", () => {
      personalTaskSchedule.allowConflict = false;
      refreshPersonalSchedule(t, document.getElementById("task_date")?.value || "");
    });

    const text = document.createElement("span");
    const isCreator = memberId === String(t.user_id || "");
    text.textContent = `${member.full_name}${member.employee_id ? ` — ${member.employee_id}` : ""}${isCreator ? " (Criador)" : ""}`;

    option.appendChild(checkbox);
    option.appendChild(text);
    list.appendChild(option);
  }
}

const taskFilters = {
  responsible: "",
  workType: "",
  location: "",
  montadora: "",
  modelo: "",
  submodelo: "",
};

function populateTaskFilters(tasks) {
  const responsibleSelect = document.getElementById("filter-responsible");
  const workTypeSelect = document.getElementById("filter-work-type");
  const locationSelect = document.getElementById("filter-location");
  const montadoraSelect = document.getElementById("filter-montadora");
  const modeloSelect = document.getElementById("filter-modelo");
  const submodeloSelect = document.getElementById("filter-submodelo");

  if (
    !responsibleSelect ||
    !workTypeSelect ||
    !locationSelect ||
    !montadoraSelect ||
    !modeloSelect ||
    !submodeloSelect
  )
    return;

  const sets = {
    responsibles: new Set(),
    workTypes: new Set(),
    locations: new Set(),
    montadoras: new Set(),
    modelos: new Set(),
    submodelos: new Set(),
  };

  for (const t of tasks || []) {
    if (Array.isArray(t.responsibles)) {
      for (const r of t.responsibles) {
        if (r.full_name) sets.responsibles.add(r.full_name);
      }
    } else if (t.responsible?.full_name) {
      sets.responsibles.add(t.responsible.full_name);
    }
    const wt = (t.work_type || "").trim();
    if (wt) sets.workTypes.add(wt);
    const loc = (t.location || "").trim();
    if (loc) sets.locations.add(loc);
    const mon = (t.montadora || "").trim();
    if (mon) sets.montadoras.add(mon);
    const mod = (t.modelo || "").trim();
    if (mod) sets.modelos.add(mod);
    const sub = (t.submodelo || "").trim();
    if (sub) sets.submodelos.add(sub);
  }

  const responsibles = [...sets.responsibles].sort();
  const workTypes = [...sets.workTypes].sort();
  const locations = [...sets.locations].sort();
  const montadoras = [...sets.montadoras].sort();
  const modelos = [...sets.modelos].sort();
  const submodelos = [...sets.submodelos].sort();

  const currentResponsible = responsibleSelect.value;
  const currentWorkType = workTypeSelect.value;
  const currentLocation = locationSelect.value;
  const currentMontadora = montadoraSelect.value;
  const currentModelo = modeloSelect.value;
  const currentSubmodelo = submodeloSelect.value;

  responsibleSelect.innerHTML =
    '<option value="">Todos</option>' +
    responsibles
      .map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`)
      .join("");
  workTypeSelect.innerHTML =
    '<option value="">Todos</option>' +
    workTypes
      .map((w) => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`)
      .join("");
  locationSelect.innerHTML =
    '<option value="">Todos</option>' +
    locations
      .map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`)
      .join("");
  montadoraSelect.innerHTML =
    '<option value="">Todas</option>' +
    montadoras
      .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
      .join("");
  modeloSelect.innerHTML =
    '<option value="">Todos</option>' +
    modelos
      .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
      .join("");
  submodeloSelect.innerHTML =
    '<option value="">Todas</option>' +
    submodelos
      .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
      .join("");

  if (currentResponsible) responsibleSelect.value = currentResponsible;
  if (currentWorkType) workTypeSelect.value = currentWorkType;
  if (currentLocation) locationSelect.value = currentLocation;
  if (currentMontadora) montadoraSelect.value = currentMontadora;
  if (currentModelo) modeloSelect.value = currentModelo;
  if (currentSubmodelo) submodeloSelect.value = currentSubmodelo;
}

function getResponsibleLabel(task) {
  if (Array.isArray(task.responsibles) && task.responsibles.length) {
    return task.responsibles.map((r) => r.full_name || "—").join(", ");
  }
  if (task.responsible?.full_name) return task.responsible.full_name;
  return "—";
}

function applyTaskFilters(tasks) {
  const responsible = (
    document.getElementById("filter-responsible")?.value || ""
  ).trim();
  const workType = (
    document.getElementById("filter-work-type")?.value || ""
  ).trim();
  const location = (
    document.getElementById("filter-location")?.value || ""
  ).trim();
  const montadora = (
    document.getElementById("filter-montadora")?.value || ""
  ).trim();
  const modelo = (document.getElementById("filter-modelo")?.value || "").trim();
  const submodelo = (
    document.getElementById("filter-submodelo")?.value || ""
  ).trim();

  taskFilters.responsible = responsible;
  taskFilters.workType = workType;
  taskFilters.location = location;
  taskFilters.montadora = montadora;
  taskFilters.modelo = modelo;
  taskFilters.submodelo = submodelo;

  if (
    !responsible &&
    !workType &&
    !location &&
    !montadora &&
    !modelo &&
    !submodelo
  )
    return tasks;

  return tasks.filter((task) => {
    const responsibleLabel = getResponsibleLabel(task);
    if (responsible && !responsibleLabel.split(", ").includes(responsible))
      return false;
    if (workType && (task.work_type || "").trim() !== workType) return false;
    if (location && (task.location || "").trim() !== location) return false;
    if (montadora && (task.montadora || "").trim() !== montadora) return false;
    if (modelo && (task.modelo || "").trim() !== modelo) return false;
    if (submodelo && (task.submodelo || "").trim() !== submodelo) return false;
    return true;
  });
}

function renderTasks(t) {
  const board = document.getElementById("tasks-board");
  if (!board) return;

  const tasks = t.tasks || [];
  const byDateTasks = selectedTripDate
    ? tasks.filter((task) => task.task_date === selectedTripDate)
    : tasks;
  const filteredTasks = applyTaskFilters(byDateTasks);
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

  const hasVehicleDetails = (task) =>
    !!(
      task.montadora ||
      task.modelo ||
      task.submodelo ||
      task.vehicle ||
      task.plate ||
      task.project_id ||
      Object.keys(task.custom_fields || {}).length
    );

  const vehicleDetailHtml = (task) => {
    const rows = [];
    if (task.project_id) {
      const projectName = task.project_name || `Projeto #${task.project_id}`;
      rows.push(
        `<span>Projeto: <strong>${escapeHtml(projectName)}</strong></span>`,
      );
    }
    if (task.montadora || task.modelo || task.submodelo) {
      rows.push(
        `<span>Montadora/Modelo/Versão: <strong>${escapeHtml(task.montadora || "—")} · ${escapeHtml(task.modelo || "—")} · ${escapeHtml(task.submodelo || "—")}</strong></span>`,
      );
    }
    if (task.vehicle || task.plate) {
      rows.push(
        `<span>Veículo/Placa: <strong>${escapeHtml(task.vehicle || "—")}${task.plate ? ` · ${escapeHtml(task.plate)}` : ""}</strong></span>`,
      );
    }
    const customFields = task.custom_fields || {};
    for (const [name, value] of Object.entries(customFields)) {
      if (value) {
        rows.push(
          `<span>${escapeHtml(name)}: <strong>${escapeHtml(value)}</strong></span>`,
        );
      }
    }
    return rows.length
      ? `<div class="task-card-body"><div class="task-detail-row">${rows.join("")}</div></div>`
      : "";
  };

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
            <div class="task-card" data-task-id="${task.id}" role="button" tabindex="0" style="cursor: pointer;">
                <div class="task-card-header">
                  <span class="task-responsible" title="Responsáveis: ${escapeHtml(getResponsibleLabel(task))}">Responsáveis: ${escapeHtml(getResponsibleLabel(task))}</span>
                  <span class="task-title" title="${escapeHtml(task.work_type)}">${escapeHtml(task.work_type)}</span>
                  <span class="task-time">${escapeHtml(task.start_time)} – ${escapeHtml(task.end_time)}</span>
                </div>
                ${hasVehicleDetails(task) ? vehicleDetailHtml(task) : ""}
            </div>`,
            )
            .join("")}
        </div>
      </div>`;
    })
    .join("");

  board.querySelectorAll(".task-day-group").forEach((group, index) => {
    const dayTasks = [...(byDate.get(dates[index]) || [])].sort((a, b) =>
      String(a.start_time || "").localeCompare(String(b.start_time || "")),
    );
    for (let taskIndex = 0; taskIndex < dayTasks.length - 1; taskIndex++) {
      if (dayTasks[taskIndex].end_time !== "12:00" || dayTasks[taskIndex + 1].start_time !== "13:00") continue;
      const cards = group.querySelectorAll(".task-card");
      const nextCard = cards[taskIndex + 1];
      if (nextCard) {
        nextCard.insertAdjacentHTML("beforebegin", '<div class="automatic-lunch-marker">Almoço · 12:00 – 13:00</div>');
      }
    }
  });

  if (board.dataset.taskBoardEventsAttached) return;
  board.dataset.taskBoardEventsAttached = "1";
  board.addEventListener("click", (e) => {
    const card = e.target.closest(".task-card");
    if (!card) return;
    const taskId = Number(card.dataset.taskId);
    const task = tasks.find((t) => t.id === taskId);
    if (task) openTaskModal(task);
  });

  board.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const card = e.target.closest(".task-card");
      if (!card) return;
      e.preventDefault();
      const taskId = Number(card.dataset.taskId);
      const task = tasks.find((t) => t.id === taskId);
      if (task) openTaskModal(task);
    }
  });
}

function openTaskModal(task) {
  const existing = document.getElementById("task-modal");
  if (existing) existing.remove();

  const getResponsibleLabel = (task) => {
    if (Array.isArray(task.responsibles) && task.responsibles.length) {
      return task.responsibles.map((r) => r.full_name || "—").join(", ");
    }
    if (task.responsible?.full_name) return task.responsible.full_name;
    return "—";
  };

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "task-modal";

  const vehicleSection = [
    task.montadora || task.modelo || task.submodelo
      ? `<div class="kv-item"><label>Montadora / Modelo / Submodelo</label><div>${escapeHtml(task.montadora || "—")} · ${escapeHtml(task.modelo || "—")} · ${escapeHtml(task.submodelo || "—")}</div></div>`
      : "",
    task.vehicle || task.plate
      ? `<div class="kv-item"><label>Veículo / Placa</label><div>${escapeHtml(task.vehicle || "—")}${task.plate ? ` · ${escapeHtml(task.plate)}` : ""}</div></div>`
      : "",
    ...Object.entries(task.custom_fields || {}).map(([name, value]) =>
      value
        ? `<div class="kv-item"><label>${escapeHtml(name)}</label><div>${escapeHtml(value)}</div></div>`
        : [],
    ),
  ]
    .filter(Boolean)
    .join("");

  const trip = window.__currentTrip || {};
  const members = Array.isArray(trip.members) ? trip.members : [];

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${escapeHtml(task.work_type)}</h2>
        <button type="button" class="modal-close" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body" id="modal-view">
        <div class="kv">
          <div class="kv-item"><label>Horário</label><div>${escapeHtml(task.start_time)} – ${escapeHtml(task.end_time)}</div></div>
          <div class="kv-item"><label>Data</label><div>${formatDateBR(task.task_date)}</div></div>
          <div class="kv-item"><label>Local</label><div>${escapeHtml(task.location)}</div></div>
          <div class="kv-item"><label>Responsáveis</label><div>${escapeHtml(getResponsibleLabel(task))}</div></div>
          <div class="kv-item"><label>Resumo</label><div>${escapeHtml(task.summary)}</div></div>
          ${vehicleSection}
          ${
            task.pending_items
              ? `<div class="kv-item"><label>Pendências</label><div>${escapeHtml(task.pending_items)}</div></div>`
              : ""
          }
        </div>
        ${
          task.photos?.length
            ? `<div class="task-photos-modal">${task.photos
                .map(
                  (p) =>
                    `<a href="${p.url}" target="_blank" class="task-photo-thumb"><img src="${p.url}" alt="${escapeHtml(p.original_name)}" /></a>`,
                )
                .join("")}</div>`
            : ""
        }
      </div>
      <div id="modal-edit" class="modal-body hidden-fields">
        <form class="form-grid" id="task-edit-form">
          <div class="form-grid two">
            <div>
              <label for="edit-work-type">Tipo de trabalho *</label>
              <select id="edit-work-type" required>
                <option value="">Selecione…</option>
              </select>
            </div>
            <div>
              <label for="edit-task-date">Data da tarefa *</label>
              <input id="edit-task-date" type="date" required />
            </div>
          </div>
          <div>
            <label>Responsáveis pela tarefa</label>
            <div id="edit-responsible-list" class="responsible-list"></div>
          </div>
          <div id="edit-vehicle-detail-fields" class="form-grid five hidden-fields">
            <div>
              <label for="edit-montadora">Montadora</label>
              <input id="edit-montadora" placeholder="Ex: Chevrolet" />
            </div>
            <div>
              <label for="edit-modelo">Modelo</label>
              <input id="edit-modelo" placeholder="Ex: S10" />
            </div>
            <div>
              <label for="edit-submodelo">Versão modelo</label>
              <input id="edit-submodelo" placeholder="Ex: LTZ 2.8" />
            </div>
            <div>
              <label for="edit-plate">Placa</label>
              <input id="edit-plate" placeholder="Ex: ABC-1234" />
            </div>
            <div>
              <label for="edit-ano">Ano</label>
              <input id="edit-ano" type="number" min="1900" max="2027" step="1" inputmode="numeric" placeholder="Ex: 2024" />
            </div>
          </div>
          <div>
            <label for="edit-location">Local do serviço *</label>
            <input id="edit-location" required placeholder="Ex: Cliente XYZ — unidade centro" />
          </div>
          <div class="form-grid two">
            <div>
              <label for="edit-start-time">Hora de início *</label>
              <input id="edit-start-time" type="time" required />
            </div>
            <div>
              <label for="edit-end-time">Hora de término *</label>
              <input id="edit-end-time" type="time" required />
            </div>
          </div>
          <div>
            <label for="edit-summary">Resumo do que foi feito *</label>
            <textarea id="edit-summary" required placeholder="Descreva a atividade realizada…"></textarea>
          </div>
          <div>
            <label for="edit-pending-items">Pendências neste trabalho</label>
            <textarea id="edit-pending-items" placeholder="O que ficou pendente neste mesmo trabalho…"></textarea>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <div id="view-actions">
          <button type="button" class="btn btn-primary" id="btn-edit-task">Editar</button>
          <button type="button" class="btn btn-danger btn-sm" data-del-task="${task.id}">Excluir tarefa</button>
        </div>
        <div id="edit-actions" class="hidden-fields">
          <button type="button" class="btn btn-secondary" id="btn-cancel-edit">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-save-edit">Salvar</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector(".modal-close");
  const closeHandler = () => modal.remove();

  closeBtn.addEventListener("click", closeHandler);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeHandler();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("task-modal"))
      closeHandler();
  });

  // Setup edit mode
  const viewSection = modal.querySelector("#modal-view");
  const editSection = modal.querySelector("#modal-edit");
  const viewActions = modal.querySelector("#view-actions");
  const editActions = modal.querySelector("#edit-actions");
  const editBtn = modal.querySelector("#btn-edit-task");
  const cancelBtn = modal.querySelector("#btn-cancel-edit");
  const saveBtn = modal.querySelector("#btn-save-edit");

  const fillEditForm = () => {
    const editWorkTypeSelect = document.getElementById("edit-work-type");
    const currentWorkTypes = Array.from(editWorkTypeSelect.options)
      .map((o) => o.value)
      .filter(Boolean);

    if (!currentWorkTypes.length) {
      const currentFormWorkTypeSelect = document.getElementById("work_type");
      const formWorkTypes = Array.from(currentFormWorkTypeSelect.options)
        .map((o) => o.value)
        .filter(Boolean);
      editWorkTypeSelect.innerHTML = '<option value="">Selecione…</option>';
      for (const type of formWorkTypes) {
        const opt = document.createElement("option");
        opt.value = type;
        opt.textContent = type;
        editWorkTypeSelect.appendChild(opt);
      }
    }

    document.getElementById("edit-work-type").value = task.work_type;
    document.getElementById("edit-task-date").value = task.task_date;
    document.getElementById("edit-location").value = task.location;
    document.getElementById("edit-start-time").value = task.start_time;
    document.getElementById("edit-end-time").value = task.end_time;
    document.getElementById("edit-summary").value = task.summary;
    document.getElementById("edit-pending-items").value =
      task.pending_items || "";
    const legacyVehicleInput = document.getElementById("edit-vehicle");
    if (legacyVehicleInput) legacyVehicleInput.value = task.vehicle || "";
    document.getElementById("edit-plate").value = task.plate || "";
    document.getElementById("edit-montadora").value = task.montadora || "";
    document.getElementById("edit-modelo").value = task.modelo || "";
    document.getElementById("edit-submodelo").value = task.submodelo || "";
    document.getElementById("edit-ano").value = task.ano || "";

    fillEditResponsibleOptions();
    updateEditTaskTypeFields();
  };

  const fillEditResponsibleOptions = () => {
    const list = document.getElementById("edit-responsible-list");
    const currentValues = new Set(
      Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map(
        (input) => input.value,
      ),
    );

    list.innerHTML = "";

    if (!members.length) {
      const empty = document.createElement("div");
      empty.className = "responsible-empty";
      empty.textContent = "Nenhum integrante cadastrado na viagem";
      list.appendChild(empty);
      return;
    }

    for (const member of members) {
      const memberId = String(member.user_id || member.id || "");
      if (!memberId) continue;

      const option = document.createElement("label");
      option.className = "responsible-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "edit_responsible_id";
      checkbox.value = memberId;

      if (Array.isArray(task.responsibles) && task.responsibles.length) {
        checkbox.checked = task.responsibles.some(
          (r) => String(r.id) === memberId,
        );
      } else {
        checkbox.checked = String(task.responsible_id) === memberId;
      }

      const text = document.createElement("span");
      const isCreator = memberId === String(trip.user_id || "");
      text.textContent = `${member.full_name}${member.employee_id ? ` — ${member.employee_id}` : ""}${isCreator ? " (Criador)" : ""}`;

      option.appendChild(checkbox);
      option.appendChild(text);
      list.appendChild(option);
    }
  };

  const updateEditTaskTypeFields = () => {
    const type = document.getElementById("edit-work-type").value;
    const vehicleFields = document.getElementById("edit-vehicle-fields");
    const vehicleDetailFields = document.getElementById(
      "edit-vehicle-detail-fields",
    );

    vehicleFields.classList.add("hidden-fields");
    vehicleDetailFields.classList.add("hidden-fields");

    const normalizedType = String(type || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    const requiresVehicleDetails = [].includes(normalizedType);

    if (requiresVehicleDetails) {
      vehicleFields.classList.remove("hidden-fields");
      vehicleDetailFields.classList.remove("hidden-fields");
    } else if (type === "Análise de veículos") {
      vehicleFields.classList.remove("hidden-fields");
    }
  };

  editBtn.addEventListener("click", () => {
    const tripId = window.__currentTrip?.id;
    if (!tripId) return;
    closeHandler();
    window.location.href = `trip-task-edit.html?trip_id=${tripId}&task_id=${task.id}`;
  });

  cancelBtn.addEventListener("click", () => {
    viewSection.classList.remove("hidden-fields");
    editSection.classList.add("hidden-fields");
    viewActions.classList.remove("hidden-fields");
    editActions.classList.add("hidden-fields");
  });

  document
    .getElementById("edit-work-type")
    .addEventListener("change", updateEditTaskTypeFields);

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      const responsibleList = document.getElementById("edit-responsible-list");
      const selectedResponsibles = Array.from(
        responsibleList.querySelectorAll('input[type="checkbox"]:checked'),
      )
        .map((input) => input.value)
        .filter(Boolean);

      const payload = {
        work_type: document.getElementById("edit-work-type").value,
        location: document.getElementById("edit-location").value.trim(),
        start_time: document.getElementById("edit-start-time").value,
        end_time: document.getElementById("edit-end-time").value,
        responsible_ids: selectedResponsibles,
        responsible_id: selectedResponsibles[0] || null,
        summary: document.getElementById("edit-summary").value.trim(),
        task_date: document.getElementById("edit-task-date").value,
        pending_items:
          document.getElementById("edit-pending-items").value.trim() || null,
        vehicle: document.getElementById("edit-vehicle")?.value.trim() || null,
        plate: document.getElementById("edit-plate").value.trim() || null,
        montadora:
          document.getElementById("edit-montadora").value.trim() || null,
        modelo: document.getElementById("edit-modelo").value.trim() || null,
        submodelo:
          document.getElementById("edit-submodelo").value.trim() || null,
        ano: document.getElementById("edit-ano")?.value.trim() || null,
      };

      const res = await api.updateTask(trip.id, task.id, payload);
      window.__currentTrip = res.trip;
      renderTrip(res.trip);
      closeHandler();
      showAlert(
        document.getElementById("alert"),
        "Tarefa atualizada com sucesso.",
        "success",
      );
    } catch (err) {
      showAlert(document.getElementById("alert"), err.message || "Erro ao atualizar tarefa");
      saveBtn.disabled = false;
    }
  });
}

export function prepareTaskForm(
  t,
  { keepDate = false, clearDate = false } = {},
) {
  const form = document.getElementById("task-form");
  if (!form) return;

  const dateInput = document.getElementById("task_date");
  const typeSelect = document.getElementById("work_type");
  const prevDate = dateInput?.value || lastTaskDate;

  form.reset();

  const startInput = document.getElementById("start_time");
  const endInput = document.getElementById("end_time");

  if (typeSelect && !typeSelect.dataset.listenerAttached) {
    typeSelect.addEventListener("change", () => {
      updateTaskTypeFields();
      loadCustomFieldsForForm();
    });
    typeSelect.dataset.listenerAttached = "1";
  }

  const projectSelect = document.getElementById("project_id");
  if (projectSelect && !projectSelect.dataset.listenerAttached) {
    projectSelect.addEventListener("change", loadCustomFieldsForForm);
    projectSelect.dataset.listenerAttached = "1";
  }

  if (startInput && !startInput.dataset.listenerAttached) {
    startInput.addEventListener("input", () => {
      personalTaskSchedule.allowConflict = false;
      renderPersonalSchedule(t);
    });
    startInput.dataset.listenerAttached = "1";
  }

  if (endInput && !endInput.dataset.listenerAttached) {
    endInput.addEventListener("input", () => {
      personalTaskSchedule.allowConflict = false;
      renderPersonalSchedule(t);
    });
    endInput.dataset.listenerAttached = "1";
  }

  if (dateInput) {
    dateInput.min = t.start_date;
    dateInput.max = t.end_date;
    if (keepDate && prevDate) {
      dateInput.value = prevDate;
    } else if (clearDate) {
      dateInput.value = "";
    } else if (selectedTripDate) {
      dateInput.value = selectedTripDate;
    } else {
      const today = new Date().toISOString().slice(0, 10);
      if (today >= t.start_date && today <= t.end_date) dateInput.value = today;
      else dateInput.value = t.start_date;
    }
    if (!dateInput.dataset.listenerAttached) {
      dateInput.addEventListener("change", () => {
        refreshPersonalSchedule(t, dateInput.value);
      });
      dateInput.dataset.listenerAttached = "1";
    }
  }

  updateTaskTypeFields();
  lastTaskDate = dateInput?.value || "";
  refreshPersonalSchedule(t, dateInput?.value || "");
}

async function loadCustomFieldsForForm() {
  const container = document.getElementById("custom-fields-container");
  if (!container) return;

  const type = document.getElementById("work_type").value;
  const projectId = document.getElementById("project_id").value;
  const t = window.__currentTrip || {};

  container.innerHTML = "";

  if (!type && !projectId) return;

  try {
    const [typeFields, projectFields] = await Promise.all([
      type
        ? api.leaderWorkTypes.fields.list(type, {
            sector: t.sector,
            trip_id: t.id,
          })
        : Promise.resolve({ fields: [] }),
      projectId
        ? api.leaderProjects.fields.list(projectId, {
            sector: t.sector,
            trip_id: t.id,
          })
        : Promise.resolve({ fields: [] }),
    ]);

    const fields = filterVehicleDetailCustomFields([
      ...(typeFields.fields || []).map((f) => ({ ...f, source: "type" })),
      ...(projectFields.fields || []).map((f) => ({ ...f, source: "project" })),
    ]);

    if (!fields.length) return;

    const grid = document.createElement("div");
    grid.className = "form-grid two";

    for (const field of fields) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
        <label for="custom_${field.field_name}">${escapeHtml(field.field_name)} ${field.is_required ? "*" : ""}</label>
        <input id="custom_${field.field_name}" name="custom_${field.field_name}" data-field-name="${escapeHtml(field.field_name)}" data-field-required="${field.is_required ? "1" : "0"}" placeholder="Informe ${escapeHtml(field.field_name)}" />
      `;
      grid.appendChild(wrapper);
    }

    container.appendChild(grid);
  } catch {
    // ignore custom fields load failure
  }
}

function renderWorkTypeOptions(types) {
  const sel = document.getElementById("work_type");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Selecione…</option>';
  for (const type of types || []) {
    const opt = document.createElement("option");
    opt.value = type;
    opt.textContent = type;
    sel.appendChild(opt);
  }
  if (current) sel.value = current;
}

export function fillWorkTypes(types) {
  availableWorkTypes = [...new Set((types || []).map((type) => String(type || "").trim()).filter(Boolean))];
  renderWorkTypeOptions(availableWorkTypes);
}

export function configureTaskEntryMode(mode = "task") {
  const normalizedMode = mode === "other" ? "other" : "task";
  const projectWrap = document.getElementById("project_id")?.closest("div");
  const demandAnchor = document.getElementById("demanda-prioridade-anchor");
  const demandasPanel = document.getElementById("demandas-panel-container") || document.getElementById("demandas");
  const types = normalizedMode === "other"
    ? ["Refeição", "Viagem", "Deslocamento"]
    : availableWorkTypes.filter((type) => {
        const normalized = normalizeWorkType(type);
        return normalized !== "refeicao" && normalized !== "viagem";
      });

  renderWorkTypeOptions(types);
  const taskForm = document.getElementById("task-form");
  if (taskForm) taskForm.dataset.entryMode = normalizedMode;
  if (normalizedMode === "task") populateDemandVehicleFields(window.__currentTrip);
  else {
    document.getElementById("demanda_veiculo_id")?.replaceChildren(new Option("Sem veículo de demanda", ""));
    document.getElementById("demanda_atividade_id")?.replaceChildren(new Option("Selecione uma demanda", ""));
    document.getElementById("demand-activity-field")?.classList.add("hidden-fields");
  }
  if (projectWrap) projectWrap.classList.toggle("hidden-fields", normalizedMode === "other");
  if (demandAnchor) demandAnchor.classList.toggle("hidden-fields", normalizedMode === "other");
  if (demandasPanel) demandasPanel.classList.toggle("hidden-fields", normalizedMode === "other");
  if (normalizedMode === "other") {
    const projectSelect = document.getElementById("project_id");
    if (projectSelect) projectSelect.value = "";
    document.getElementById("demanda-prioridade-wrap")?.remove();
    if (demandAnchor) demandAnchor.innerHTML = "";
  } else if (window.__currentTrip) {
    inserirCampoAtividadePrioridadeNoForm(document.getElementById("task-form"), window.__currentTrip, {
      onChange: preencherCamposPelaDemanda,
    });
  }
  const workType = document.getElementById("work_type");
  if (workType) {
    workType.value = "";
    updateTaskTypeFields();
    loadCustomFieldsForForm();
  }
}

export function fillProjects(projects) {
  const sel = document.getElementById("project_id");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Sem projeto</option>';
  for (const p of projects || []) {
    const opt = document.createElement("option");
    opt.value = p.id || p.name;
    opt.textContent = p.name;
    sel.appendChild(opt);
  }
  if (current) sel.value = current;
}

function preencherCamposPelaDemanda(atividadesSelecionadas = [], { veiculoCompativel = true } = {}) {
  const taskFieldsSection = document.getElementById("task-fields-section");
  const taskFieldsContent = taskFieldsSection?.querySelector(".collapsible-content");
  const taskFieldsToggle = taskFieldsSection?.querySelector(".panel-toggle");
  if (taskFieldsContent) taskFieldsContent.classList.remove("collapsed");
  if (taskFieldsToggle) {
    taskFieldsToggle.classList.remove("collapsed");
    taskFieldsToggle.setAttribute("aria-expanded", "true");
  }
  try {
    localStorage.setItem("panelState_taskFields", "expanded");
  } catch (e) {}

  const demanda = atividadesSelecionadas[0];
  if (!demanda) return;

  const workTypeSelect = document.getElementById("work_type");
  const projectSelect = document.getElementById("project_id");

  if (!veiculoCompativel) {
    setVehicleDetailFields(null);
    if (workTypeSelect) workTypeSelect.value = "";
    if (projectSelect) projectSelect.value = "";
    updateTaskTypeFields();
    loadCustomFieldsForForm();
    return;
  }

  setVehicleDetailFields({
    montadora: demanda.montadora,
    modelo: demanda.modelo,
    versao_modelo: demanda.versaoModelo,
    ano: demanda.ano,
    placa: demanda.placa,
  });

  if (workTypeSelect && demanda.tipoTrabalho) {
    const workTypeOption = [...workTypeSelect.options].find(
      (option) => option.value.trim().toLowerCase() === demanda.tipoTrabalho.trim().toLowerCase(),
    );
    if (workTypeOption) workTypeSelect.value = workTypeOption.value;
  }

  if (projectSelect && demanda.tipoProjeto) {
    const projectOption = [...projectSelect.options].find(
      (option) => option.textContent.trim().toLowerCase() === demanda.tipoProjeto.trim().toLowerCase(),
    );
    if (projectOption) projectSelect.value = projectOption.value;
  }
}

async function loadProjects(opts = {}) {
  try {
    const data = await api.projects(opts);
    fillProjects(data?.projects || []);
  } catch {
    // ignore projects load failure
  }
}

function renderTripDays(t) {
  const daysContainer = document.getElementById("trip-days");
  if (!daysContainer) return;

  const dates = getTripDays(t.start_date, t.end_date);
  if (dates.length <= 1) {
    daysContainer.innerHTML = "";
    return;
  }

  if (!selectedTripDate || !dates.includes(selectedTripDate)) {
    const today = new Date().toISOString().slice(0, 10);
    selectedTripDate = dates.includes(today) ? today : dates[0];
  }

  daysContainer.innerHTML = dates
    .map(
      (date) => `
      <button type="button" class="trip-day-btn${date === selectedTripDate ? " active" : ""}" data-day="${date}">
        ${formatDateBR(date)}
      </button>`,
    )
    .join("");

  daysContainer.querySelectorAll(".trip-day-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const date = btn.dataset.day;
      if (!date || date === selectedTripDate) return;
      selectedTripDate = date;
      renderTripDays(t);
      renderTasks(t);
      updateTaskAvailability(t, selectedTripDate);
      document.getElementById("task-form-title").textContent =
        `Trabalhos do dia — ${formatDateBR(selectedTripDate)}`;
      prepareTaskForm(t, { clearDate: false });
    });
  });
}

function minutesFromTime(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function formatTimeLabel(value) {
  if (!value) return "—";
  const [h, m] = String(value).split(":");
  return `${String(h).padStart(2, "0")}:${String(m || "00").padStart(2, "0")}`;
}

function formatMinutesLabel(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getSelectedTaskResponsibleIds() {
  return Array.from(
    document.querySelectorAll('#responsible_id input[type="checkbox"]:checked'),
  )
    .map((input) => Number(input.value))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function getExtraResponsibleNames(t) {
  const currentUserId = Number(window.__currentUser?.id || 0);
  const members = Array.isArray(t?.members) ? t.members : [];
  return getSelectedTaskResponsibleIds()
    .filter((id) => id !== currentUserId)
    .map((id) => members.find((member) => Number(member.user_id || member.id) === id)?.full_name)
    .filter(Boolean);
}

function getPersonalScheduleConflict(date, startTime, endTime) {
  if (!date || date !== personalTaskSchedule.date) return null;
  const start = minutesFromTime(startTime);
  const end = minutesFromTime(endTime);
  if (start == null || end == null || end <= start) return null;

  for (const schedule of Object.values(personalTaskSchedule.schedules)) {
    const conflict = schedule.tasks.find((task) => {
      const occupiedStart = minutesFromTime(task.start_time);
      const occupiedEnd = minutesFromTime(task.end_time);
      return occupiedStart != null && occupiedEnd != null &&
        rangesOverlap(start, end, occupiedStart, occupiedEnd);
    });
    if (conflict) return { ...conflict, responsible_name: schedule.full_name };
  }
  return null;
}

function getPersonalScheduleSlots(tasks) {
  const occupied = tasks
    .map((task) => ({
      start: Math.max(TASK_DAY_START, minutesFromTime(task.start_time)),
      end: Math.min(TASK_DAY_END, minutesFromTime(task.end_time)),
    }))
    .filter((slot) => slot.start < slot.end)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const slot of occupied) {
    const previous = merged[merged.length - 1];
    if (previous && slot.start <= previous.end) previous.end = Math.max(previous.end, slot.end);
    else merged.push({ ...slot });
  }

  const free = [];
  let cursor = TASK_DAY_START;
  for (const slot of merged) {
    if (slot.start > cursor) free.push({ start: cursor, end: slot.start });
    cursor = Math.max(cursor, slot.end);
  }
  if (cursor < TASK_DAY_END) free.push({ start: cursor, end: TASK_DAY_END });
  return { occupied: merged, free };
}

function renderPersonalSchedule(t) {
  const panel = document.getElementById("task-time-availability");
  if (!panel) return;

  const date = document.getElementById("task_date")?.value || "";
  if (!date || personalTaskSchedule.date !== date) {
    panel.innerHTML = "";
    panel.classList.add("hidden-fields");
    return;
  }

  if (personalTaskSchedule.loading) {
    panel.innerHTML = '<div class="alert alert-info">Carregando seus horários...</div>';
    panel.classList.remove("hidden-fields");
    return;
  }

  const startTime = document.getElementById("start_time")?.value || "";
  const endTime = document.getElementById("end_time")?.value || "";
  const conflict = getPersonalScheduleConflict(date, startTime, endTime);
  const extraNames = getExtraResponsibleNames(t);
  const selectedStart = startTime && endTime ? `${formatTimeLabel(startTime)}–${formatTimeLabel(endTime)}` : "esse horário";

  const chips = (slots, className) => slots.length
    ? slots.map((slot) => `<span class="task-schedule-chip ${className}">${formatMinutesLabel(slot.start)}–${formatMinutesLabel(slot.end)}</span>`).join("")
    : '<span class="task-schedule-empty">Nenhum</span>';
  const scheduleSections = Object.values(personalTaskSchedule.schedules).map((schedule) => {
    const { occupied, free } = getPersonalScheduleSlots(schedule.tasks || []);
    const occupiedLabels = (schedule.tasks || [])
      .map((task) => `<span class="task-schedule-chip is-occupied" title="${escapeHtml(task.work_type || "Tarefa")}">${formatTimeLabel(task.start_time)}–${formatTimeLabel(task.end_time)}</span>`)
      .join("");
    return `<div class="task-schedule-person">
      <strong>${escapeHtml(schedule.full_name || "Responsável")}</strong>
      <div class="task-schedule-row"><span>Livre:</span>${chips(free, "is-free")}</div>
      ${occupiedLabels ? `<div class="task-schedule-row"><span>Ocupado:</span>${occupiedLabels}</div>` : ""}
    </div>`;
  }).join("");

  panel.innerHTML = `
    <div class="task-schedule-box">
      <strong>Horários dos responsáveis hoje</strong>
      ${scheduleSections || '<div class="task-schedule-empty">Selecione um responsável para consultar os horários.</div>'}
    </div>
    ${extraNames.length && startTime && endTime ? `<div class="task-extra-responsibles"><span aria-hidden="true">ⓘ</span> ${escapeHtml(selectedStart)} também será reservado para ${escapeHtml(extraNames.join(" e "))} nessa tarefa.</div>` : ""}
    ${conflict ? `<div class="task-schedule-conflict" role="alert"><span aria-hidden="true">⚠</span> ${escapeHtml(formatTimeLabel(conflict.start_time))}–${escapeHtml(formatTimeLabel(conflict.end_time))} já está ocupado para ${escapeHtml(conflict.responsible_name || "um responsável selecionado")}. </div>` : ""}
  `;
  panel.classList.remove("hidden-fields");
}

async function refreshPersonalSchedule(t, date) {
  const panel = document.getElementById("task-time-availability");
  if (!panel || !date) return;
  const requestId = ++personalTaskSchedule.requestId;
  personalTaskSchedule = { ...personalTaskSchedule, date, schedules: {}, loading: true, allowConflict: false };
  renderPersonalSchedule(t);
  try {
    const selectedIds = getSelectedTaskResponsibleIds();
    const fallbackId = Number(window.__currentUser?.id || 0);
    const result = await api.taskSchedule(date, selectedIds.length ? selectedIds : [fallbackId]);
    if (requestId !== personalTaskSchedule.requestId) return;
    personalTaskSchedule = { ...personalTaskSchedule, loading: false, schedules: result.schedules || {} };
    renderPersonalSchedule(t);
  } catch {
    if (requestId !== personalTaskSchedule.requestId) return;
    const currentUserId = Number(window.__currentUser?.id || 0);
    const selectedIds = getSelectedTaskResponsibleIds();
    const ids = selectedIds.length ? selectedIds : [currentUserId];
    const schedules = {};
    for (const id of ids) {
      const member = (t.members || []).find((item) => Number(item.user_id || item.id) === id);
      schedules[id] = {
        user_id: id,
        full_name: member?.full_name || (id === currentUserId ? window.__currentUser?.full_name : "Responsável"),
        tasks: (t.tasks || []).filter((task) => {
          const responsibleIds = Array.isArray(task.responsible_ids)
            ? task.responsible_ids.map(Number)
            : String(task.responsible_ids || task.responsible_id || "").split(",").map(Number);
          return task.task_date === date && responsibleIds.includes(id);
        }),
      };
    }
    personalTaskSchedule = { ...personalTaskSchedule, loading: false, schedules };
    renderPersonalSchedule(t);
  }
}

export function hasConfirmedPersonalTaskConflict(payload) {
  return Boolean(
    getPersonalScheduleConflict(payload.task_date, payload.start_time, payload.end_time) &&
    personalTaskSchedule.allowConflict,
  );
}

export function hasPersonalTaskConflict(payload) {
  return Boolean(getPersonalScheduleConflict(payload.task_date, payload.start_time, payload.end_time));
}

function getLunchWindowConfig() {
  try {
    const start = localStorage.getItem("cto_lunch_window_start");
    const end = localStorage.getItem("cto_lunch_window_end");

    // Se não houver nenhuma config explícita, retorna null
    if (!start || !end) return null;

    const startMinutes = minutesFromTime(start);
    const endMinutes = minutesFromTime(end);

    if (
      startMinutes == null ||
      endMinutes == null ||
      endMinutes <= startMinutes
    ) {
      return null;
    }

    return { start, end };
  } catch (_err) {
    return null;
  }
}

function computeTimeline(tasksForDate = []) {
  const dayStart = 0;
  const dayEnd = 24 * 60;

  const blocks = (tasksForDate || [])
    .map((task) => ({
      start: minutesFromTime(task.start_time),
      end: minutesFromTime(task.end_time),
      label: task.work_type || "Trabalho",
      kind: "work",
    }))
    .filter(
      (block) =>
        block.start != null && block.end != null && block.end > block.start,
    )
    .sort((a, b) => a.start - b.start);

  const lunchConfig = getLunchWindowConfig();
  if (lunchConfig) {
    const lunchStart = minutesFromTime(lunchConfig.start);
    const lunchEnd = minutesFromTime(lunchConfig.end);
    const lunch = {
      start: lunchStart,
      end: lunchEnd,
      label: "Almoço",
      kind: "lunch",
    };

    const lunchOverlap = blocks.some(
      (block) => block.start < lunch.end && block.end > lunch.start,
    );
    if (
      !lunchOverlap &&
      lunch.start >= dayStart &&
      lunch.end <= dayEnd &&
      lunch.end > lunch.start
    ) {
      blocks.push({ ...lunch, kind: "lunch" });
    }
  }

  blocks.sort((a, b) => a.start - b.start);

  const timeline = [];
  let cursor = dayStart;

  for (const block of blocks) {
    if (block.start > cursor) {
      timeline.push({
        start: cursor,
        end: block.start,
        label: "Horário disponível",
        kind: "free",
      });
    }
    timeline.push({ ...block, end: Math.min(block.end, dayEnd) });
    cursor = Math.max(cursor, Math.min(block.end, dayEnd));
  }

  if (cursor < dayEnd) {
    timeline.push({
      start: cursor,
      end: dayEnd,
      label: "Horário disponível",
      kind: "free",
    });
  }

  return timeline.filter((entry) => entry.end > entry.start);
}

function findConflict(startMinutes, endMinutes, tasksForDate = [], responsibleIds = []) {
  const dayStart = 0;
  const dayEnd = 24 * 60;
  if (
    startMinutes < dayStart ||
    endMinutes > dayEnd ||
    endMinutes <= startMinutes
  ) {
    return { label: "fora do intervalo válido (00:00–23:59)" };
  }

  const workBlocks = (tasksForDate || [])
    .map((task) => ({
      start: minutesFromTime(task.start_time),
      end: minutesFromTime(task.end_time),
      label: task.work_type || "Trabalho",
      responsibleIds: Array.isArray(task.responsible_ids)
        ? task.responsible_ids.map(Number).filter(Boolean)
        : String(task.responsible_ids || task.responsible_id || "")
            .split(",")
            .map(Number)
            .filter(Boolean),
    }))
    .filter(
      (block) =>
        block.start != null && block.end != null && block.end > block.start,
    );

  const selectedIds = responsibleIds.map(Number).filter(Boolean);
  const clash = workBlocks.find(
    (block) =>
      block.start < endMinutes &&
      block.end > startMinutes &&
      (!selectedIds.length ||
        block.responsibleIds.some((id) => selectedIds.includes(id))),
  );
  return clash || null;
}

function getAvailabilitySummary(tasksForDate) {
  const timeline = computeTimeline(tasksForDate);
  const freeSlots = timeline.filter((slot) => slot.kind === "free");

  const chipStyle =
    "display:inline-block;padding:1px 6px;margin:0 4px 2px 0;border-radius:10px;background:#eef4ee;color:#2f6b46;font-size:0.68rem;font-weight:600;white-space:nowrap;";
  const labelStyle = "color:#6b7280;margin-right:4px;";

  if (!freeSlots.length) {
    return `<div style="${labelStyle}">Sem horários livres neste dia.</div>`;
  }

  const chips = freeSlots
    .map(
      (slot) =>
        `<span style="${chipStyle}">${formatMinutesLabel(slot.start)}–${formatMinutesLabel(slot.end)}</span>`,
    )
    .join("");

  return `<span style="${labelStyle}">Livre:</span>${chips}`;
}

export function updateTaskAvailability(t, selectedDate) {
  const panel = document.getElementById("task-time-availability");
  if (!panel) return;

  const form = document.getElementById("task-form");
  const startValue = form?.querySelector("#start_time")?.value || "";
  const endValue = form?.querySelector("#end_time")?.value || "";

  if (startValue && endValue) {
    panel.innerHTML = "";
    panel.classList.add("hidden-fields");
    return;
  }

  if (!selectedDate) {
    panel.innerHTML = "";
    panel.classList.add("hidden-fields");
    return;
  }

  const tasksForDate = (t.tasks || []).filter(
    (task) => task.task_date === selectedDate,
  );
  panel.innerHTML = getAvailabilitySummary(tasksForDate);
  panel.classList.remove("hidden-fields");
}

export function validateTaskTimeAvailability(
  t,
  selectedDate,
  startTime,
  endTime,
  responsibleIds = [],
  allowConflict = false,
) {
  if (!selectedDate || !startTime || !endTime) return { ok: true, message: "" };

  const tasksForDate = (t.tasks || []).filter(
    (task) => task.task_date === selectedDate,
  );
  const startMinutes = minutesFromTime(startTime);
  const endMinutes = minutesFromTime(endTime);

  if (startMinutes == null || endMinutes == null) {
    return { ok: true, message: "" };
  }

  return { ok: true, message: "" };
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

function renderCompletionProgress(t) {
  const wrap = document.getElementById("completion-progress");
  if (!wrap) return;
  if (t.status === "completed") {
    wrap.classList.add("hidden-fields");
    return;
  }
  wrap.classList.remove("hidden-fields");

  const requiredDays = getTripDays(t.start_date, t.end_date);
  const taskDates = new Set(
    (t.tasks || [])
      .map((task) => String(task.task_date || "").trim())
      .filter(Boolean),
  );
  const total = requiredDays.length;
  const covered = requiredDays.filter((d) => taskDates.has(d)).length;
  const missing = total - covered;
  const pct =
    total === 0 ? 0 : Math.min(100, Math.round((covered / total) * 100));

  document.getElementById("progress-text").textContent =
    `${covered} de ${total} ${total === 1 ? "dia com tarefa" : "dias com tarefa registrada"}`;

  const fill = document.getElementById("progress-fill");
  if (fill) {
    fill.style.width = `${pct}%`;
    fill.classList.toggle("complete", missing === 0);
  }

  const hint = document.getElementById("progress-hint");
  if (hint) {
    if (missing === 0) {
      hint.textContent =
        "✓ Todos os dias têm pelo menos uma tarefa. Você já pode concluir a viagem.";
    } else {
      hint.textContent = `Falta${missing === 1 ? "" : "m"} registrar tarefa${missing === 1 ? "" : "s"} em ${missing} dia${missing === 1 ? "" : "s"} do período para poder concluir.`;
    }
  }
}

export function setupPanelToggles() {
  setupTaskFilters();
  document.querySelectorAll(".panel-toggle").forEach((button) => {
    if (button.dataset.toggle === "demandas-panel") return;
    if (button.dataset.panelToggleBound === "true") return;
    button.dataset.panelToggleBound = "true";
    button.addEventListener("click", (e) => {
      e.preventDefault();
      const isForm = button.closest("#task-form-wrap");
      const collapsibleSection = button.closest(".collapsible-section");
      const content = collapsibleSection
        ? collapsibleSection.querySelector(".collapsible-content")
        : isForm
        ? button.closest(".panel-subheader")?.nextElementSibling
        : button.closest(".panel-header")?.nextElementSibling;
      if (!content) return;

      const collapsed = content.classList.toggle("collapsed");
      button.classList.toggle("collapsed");

      try {
        const key = isForm
          ? "panelState_taskForm"
          : `panelState_${button.closest(".panel")?.querySelector("h2, h3")?.textContent || "panel"}`;
        localStorage.setItem(key, collapsed ? "collapsed" : "expanded");
      } catch (e) {}
    });
  });

  try {
    document.querySelectorAll(".panel").forEach((panel) => {
      const h2 = panel.querySelector("h2");
      if (!h2) return;
      if (panel.querySelector('[data-toggle="demandas-panel"]')) return;
      const key = `panelState_${h2.textContent}`;
      const state = localStorage.getItem(key);
      const toggle = panel.querySelector(".panel-toggle");
      const content = panel.querySelector(".panel-content");
      if (state === "collapsed" && toggle && content) {
        toggle.classList.add("collapsed");
        content.classList.add("collapsed");
      }
    });

    const taskFormToggle = document.querySelector(
      "#task-form-wrap .panel-toggle",
    );
    const taskFormContent = document.querySelector("#task-form");
    const taskFormState = localStorage.getItem("panelState_taskForm");
    if (taskFormState === "collapsed" && taskFormToggle && taskFormContent) {
      taskFormToggle.classList.add("collapsed");
      taskFormContent.classList.add("collapsed");
    }
  } catch (e) {}
}

function setupTaskFilters() {
  const container = document.querySelector(".task-filters");
  if (!container || container.dataset.taskFiltersInstalled) return;
  container.dataset.taskFiltersInstalled = "true";

  container.addEventListener("change", () => {
    const trip = window.__currentTrip;
    if (trip) renderTasks(trip);
  });
}

export function renderTrip(t) {
  document.getElementById("trip-title").textContent =
    `${t.origin} → ${t.destination}`;
  document.getElementById("trip-subtitle").textContent =
    `${formatDateBR(t.start_date)} a ${formatDateBR(t.end_date)}`;
  document.getElementById("trip-status").innerHTML = statusBadge(t);

  const originDisplay = document.getElementById("trip-origin-display");
  const destinationDisplay = document.getElementById("trip-destination-display");
  const statusDisplay = document.getElementById("trip-status-display");
  const periodDisplay = document.getElementById("trip-period-display");
  const sectorDisplay = document.getElementById("trip-sector-display");
  const reasonEl = document.getElementById("trip-reason");

  if (originDisplay) originDisplay.textContent = t.origin;
  if (destinationDisplay) destinationDisplay.textContent = t.destination;
  if (statusDisplay) statusDisplay.innerHTML = statusBadge(t);
  if (periodDisplay) periodDisplay.textContent = `${formatDateBR(t.start_date)} a ${formatDateBR(t.end_date)}`;
  if (sectorDisplay) sectorDisplay.textContent = formatSectorName(t.sector);
  if (reasonEl) reasonEl.textContent = t.reason || "—";

  const tripKv = document.getElementById("trip-kv");
  if (tripKv) {
    tripKv.innerHTML = `
      <div class="kv-item"><label>Origem</label><div>${escapeHtml(t.origin)}</div></div>
      <div class="kv-item"><label>Destino</label><div>${escapeHtml(t.destination)}</div></div>
      <div class="kv-item"><label>Início</label><div>${formatDateBR(t.start_date)}</div></div>
      <div class="kv-item"><label>Término</label><div>${formatDateBR(t.end_date)}</div></div>
      <div class="kv-item"><label>Setor</label><div>${escapeHtml(formatSectorName(t.sector))}</div></div>
    `;
  }

  const banner = document.getElementById("overdue-banner");
  if (t.is_overdue) banner.classList.remove("hidden");
  else banner.classList.add("hidden");

  renderMembers(t);
  renderEquipment(t);
  fillTaskResponsibleOptions(t);
  renderTripDays(t);
  renderTasks(t);
  populateTaskFilters(t.tasks || []);
  updateTaskAvailability(t, selectedTripDate);
  renderCompletionProgress(t);

  loadProjects({ trip_id: t.id, sector: t.sector });

  document.getElementById("task-form-title").textContent = selectedTripDate
    ? `Trabalhos do dia — ${formatDateBR(selectedTripDate)}`
    : "Trabalhos do dia";

  const completeBtn = document.getElementById("btn-complete");
  if (completeBtn) {
    const canFinishEarly =
      ["in_progress", "awaiting_report"].includes(t.status) &&
      hasTaskEveryTripDay(t);
    completeBtn.classList.toggle("hidden", !canFinishEarly);
    completeBtn.textContent = "Finalizar viagem";
  }

  prepareTaskForm(t, { clearDate: false });
  setReadOnly(false);
  window.__currentTrip = t;

  const alertEl = document.getElementById("alert");
  const taskForm = document.getElementById("task-form");
  if (taskForm) {
    const campoExistente = taskForm.querySelector("#demanda-prioridade-wrap");
    if (campoExistente) campoExistente.remove();
    inserirCampoAtividadePrioridadeNoForm(taskForm, t, {
      onChange: preencherCamposPelaDemanda,
    });
  }

  const liderBtnWrap = document.getElementById("btn-demanda-lider-wrap");
  if (liderBtnWrap) {
    const u = window.__currentUser || {};
    const ehLider = Boolean(
      u?.is_sector_leader ||
        u?.is_admin ||
        u?.is_admin_master ||
        (String(u.position_title || "")
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "") === "lider" &&
          u.sector === t.sector)
    );
    if (ehLider) {
      liderBtnWrap.innerHTML = `
        <button type="button" class="btn btn-success" id="btn-fornecer-demandas-lider" style="width:100%;">
          🚗 Fornecer / Gerenciar demandas para esta viagem
        </button>`;
      liderBtnWrap.querySelector("#btn-fornecer-demandas-lider").addEventListener("click", () => {
        window.location.href = `demandas.html?id=${t.id}`;
      });
    } else {
      liderBtnWrap.innerHTML = "";
    }
  }
}

export function taskFormPayload() {
  const list = document.getElementById("responsible_id");
  const selectedValues = Array.from(
    list || document.querySelectorAll('input[name="responsible_id"]')
      ? list
        ? list.querySelectorAll('input[type="checkbox"]:checked')
        : document.querySelectorAll('input[name="responsible_id"]:checked')
      : [],
  )
    .map((input) => input.value)
    .filter(Boolean);

  const demandaPayload = extrairPayloadDemandaDoForm();

  return {
    work_type: document.getElementById("work_type").value,
    location: document.getElementById("location").value.trim(),
    start_time: document.getElementById("start_time").value,
    end_time: document.getElementById("end_time").value,
    responsible_ids: selectedValues,
    responsible_id: selectedValues[0] || null,
    summary: document.getElementById("summary").value.trim(),
    task_date: document.getElementById("task_date").value,
    pending_items:
      document.getElementById("pending_items")?.value.trim() || null,
    vehicle: document.getElementById("vehicle")?.value.trim() || null,
    plate: document.getElementById("plate")?.value.trim() || null,
    montadora: document.getElementById("montadora")?.value.trim() || null,
    modelo: document.getElementById("modelo")?.value.trim() || null,
    submodelo: document.getElementById("submodelo")?.value.trim() || null,
    ano: document.getElementById("ano")?.value.trim() || null,
    project_id: document.getElementById("project_id")?.value || null,
    ...demandaPayload,
    custom_fields: Object.fromEntries(
      Array.from(
        document.querySelectorAll("#custom-fields-container input"),
      ).map((input) => [input.dataset.fieldName, input.value.trim()]),
    ),
  };
}