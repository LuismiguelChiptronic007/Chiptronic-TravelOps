import { api, hideAlert, showAlert } from "./api.js";
import { escapeHtml, mountShell } from "./layout.js";
import { saveTripOffline } from "./db-offline.js";
import { confirmDialog } from "./ui.js";

import { setLocationConsent } from "./location.js";
import { findCity, searchCities } from "./cidades.js";

const params = new URLSearchParams(location.search);
const editTripId = Number(params.get("id")) || null;
const isEditing = Boolean(editTripId);
const form = document.getElementById("trip-form");
const alertEl = document.getElementById("alert");
const btn = document.getElementById("btn-submit");
const sectorSelect = document.getElementById("sector");
const membersCheckboxes = document.getElementById("members-checkboxes");
const pageTitle = document.querySelector(".page-header h1");
const pageSubtitle = document.querySelector(".page-header p");
const equipmentItems = document.getElementById("equipment-items");
const equipmentName = document.getElementById("equipment-name");
const addEquipmentBtn = document.getElementById("btn-add-equipment");
const memberSectorFilter = document.getElementById("member-sector-filter");

const originInput = document.getElementById("origin");
const destinationInput = document.getElementById("destination");
const cityDatalist = document.getElementById("city-options");

/** @type {Map<number, object>} */
const selectedMembers = new Map();
/** @type {object[]} */
let availableUsers = [];
let currentTrip = null;
let currentUser = null;
let equipmentChecklist = [];
let selectedMemberSector = "";

function getVisibleUsers() {
  const sector = String(selectedMemberSector || "").trim();
  if (!sector) return availableUsers;
  return availableUsers.filter((user) => String(user.sector || "").trim() === sector);
}

async function refreshAvailableUsers() {
  const startDate = startDateInput?.value || "";
  const endDate = endDateInput?.value || "";
  if (!startDate || !endDate || endDate < startDate) return;

  try {
    const usersRes = await api.usersForMembers("", {
      start_date: startDate,
      end_date: endDate,
      exclude_trip_id: editTripId || undefined,
    });
    availableUsers = usersRes.users || [];
    if (currentUser && !availableUsers.some((u) => Number(u.id) === Number(currentUser.id))) {
      availableUsers.unshift({
        id: currentUser.id,
        full_name: currentUser.full_name,
        sector: currentUser.sector || "",
        manager_name: currentUser.manager_name || null,
        position_title: currentUser.position_title || null,
        employee_id: currentUser.employee_id || null,
      });
    }
    if (!isEditing) {
      const availableIds = new Set(availableUsers.map((u) => Number(u.id)));
      for (const userId of selectedMembers.keys()) {
        if (!availableIds.has(Number(userId))) selectedMembers.delete(userId);
      }
    }
    renderMemberCheckboxes();
  } catch {
    showAlert(alertEl, "Não foi possível atualizar os integrantes disponíveis.");
  }
}


function renderCitySuggestions(input) {
  if (!input || !cityDatalist) return;

  const query = input.value.trim();
  cityDatalist.innerHTML = "";

  if (!query) return;

  const matches = searchCities(query, 10);
  for (const city of matches) {
    const option = document.createElement("option");
    option.value = city;
    cityDatalist.appendChild(option);
  }
}


function renderEquipmentChecklist() {
  if (!equipmentItems) return;
  if (!equipmentChecklist.length) {
    equipmentItems.innerHTML = '<div class="empty-state">Nenhum equipamento adicionado</div>';
    return;
  }
  equipmentItems.innerHTML = equipmentChecklist.map((item, index) => `
    <div class="equipment-item">
      <span>${escapeHtml(item.name)}</span>
      <strong class="equipment-status ${item.carried ? "is-carried" : "is-pending"}">
        ${item.carried ? "Carregado" : "Pendente"}
      </strong>
      <button type="button" class="icon-btn" data-remove-equipment="${index}" aria-label="Remover equipamento" title="Remover equipamento">×</button>
    </div>
  `).join("");
}

async function addEquipment() {
  const name = equipmentName?.value.trim();
  if (!name) return;

  const carried = await confirmDialog({
    title: "Equipamento já carregado?",
    message: `O equipamento "${name}" já foi carregado para esta viagem?`,
    confirmLabel: "Sim, carregado",
    cancelLabel: "Não, pendente",
    tone: "confirm",
  });
  equipmentChecklist.push({ name, carried });
  equipmentName.value = "";
  renderEquipmentChecklist();
  equipmentName.focus();
}

function setEditMode() {
  if (!isEditing) return;
  if (pageTitle) pageTitle.textContent = "Editar viagem";
  if (pageSubtitle)
    pageSubtitle.textContent = "Atualize os dados da viagem existente";
  if (btn) btn.textContent = "Salvar alterações";
}

function setSelectedMembersFromTrip(members = []) {
  selectedMembers.clear();
  for (const member of members) {
    const userId = Number(member.user_id ?? member.id);
    if (!userId) continue;

    let existing = availableUsers.find((u) => Number(u.id) === userId);
    if (!existing) {
      existing = {
        id: userId,
        full_name: member.full_name,
        sector: member.sector || "",
        manager_name: member.manager_name || null,
        position_title: member.position_title || null,
        employee_id: member.employee_id || null,
      };
      availableUsers.unshift(existing);
    }
    selectedMembers.set(existing.id, existing);
  }
}

function renderMemberCheckboxes() {
  if (!membersCheckboxes) return;
  const visibleUsers = getVisibleUsers();
  if (!visibleUsers.length) {
    membersCheckboxes.innerHTML =
      '<div class="empty-state">Nenhum integrante disponível para este setor.</div>';
    return;
  }
  membersCheckboxes.innerHTML = visibleUsers
    .map(
      (u) => `
    <label class="member-checkbox compact-row">
      <input type="checkbox" value="${u.id}" ${selectedMembers.has(Number(u.id)) ? "checked" : ""}>
      <span class="member-checkbox-info compact-info">
        <strong>${escapeHtml(u.full_name)}</strong>
      </span>
    </label>`,
    )
    .join("");
}

async function init() {
  currentUser = await mountShell({ active: "new" });
  if (!currentUser) return;

  if (originInput && !isEditing) {
    originInput.value = "Piraju - SP";
  }

  try {
    const [sectorsRes, usersRes] = await Promise.all([
      api.sectors(),
      api.usersForMembers(),
    ]);

    const sectorOptions = Array.from(new Set([...(sectorsRes.sectors || []), currentUser?.sector || ""]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    for (const s of sectorOptions) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      if (s === currentUser.sector) opt.selected = true;
      sectorSelect.appendChild(opt);

      const filterOpt = document.createElement("option");
      filterOpt.value = s;
      filterOpt.textContent = s;
      memberSectorFilter.appendChild(filterOpt);
    }

    selectedMemberSector = String(currentUser?.sector || "").trim();
    if (memberSectorFilter) {
      memberSectorFilter.value = selectedMemberSector;
    }

    availableUsers = usersRes.users || [];
    if (currentUser && !availableUsers.some((u) => Number(u.id) === Number(currentUser.id))) {
      const me = {
        id: currentUser.id,
        full_name: currentUser.full_name,
        sector: currentUser.sector || "",
        manager_name: currentUser.manager_name || null,
        position_title: currentUser.position_title || null,
        employee_id: currentUser.employee_id || null,
      };
      availableUsers.unshift(me);
    }
  } catch {
    const opt = document.createElement("option");
    opt.value = currentUser.sector;
    opt.textContent = currentUser.sector;
    opt.selected = true;
    sectorSelect.appendChild(opt);
    availableUsers = [];
  }

  if (isEditing) {
    try {
      const tripRes = await api.getTrip(editTripId);
      currentTrip = tripRes.trip;
      if (currentTrip) {
        if (currentTrip.status === "completed") {
          window.location.href = `trip.html?id=${editTripId}`;
          return;
        }
        document.getElementById("origin").value = currentTrip.origin || "";
        document.getElementById("destination").value =
          currentTrip.destination || "";
        document.getElementById("start_date").value =
          currentTrip.start_date || "";
        document.getElementById("end_date").value = currentTrip.end_date || "";
        document.getElementById("reason").value = currentTrip.reason || "";
        document.getElementById("priority").value = currentTrip.priority || "normal";
        if (sectorSelect && currentTrip.sector)
          sectorSelect.value = currentTrip.sector;
        if (memberSectorFilter && currentTrip.sector) {
          selectedMemberSector = String(currentTrip.sector || "").trim();
          memberSectorFilter.value = selectedMemberSector;
        }
        setSelectedMembersFromTrip(currentTrip.members || []);
        equipmentChecklist = currentTrip.checklist?.equipment_checklist || [];
        renderEquipmentChecklist();
        renderMemberCheckboxes();

      }
    } catch (err) {
      showAlert(
        alertEl,
        err.message || "Não foi possível carregar a viagem para edição.",
      );
    }
  }

  syncTripDates();
  await refreshAvailableUsers();
  renderMemberCheckboxes();
  setEditMode();
}

const startDateInput = document.getElementById("start_date");
const endDateInput = document.getElementById("end_date");

function syncTripDates() {
  const start = startDateInput?.value;
  const end = endDateInput?.value;
  if (!endDateInput) return;

  endDateInput.min = start || "1900-01-01";
  endDateInput.max = "2100-12-31";

  if (start && end && end < start) {
    endDateInput.value = start;
  }
}

startDateInput?.addEventListener("change", syncTripDates);
endDateInput?.addEventListener("change", syncTripDates);
startDateInput?.addEventListener("change", refreshAvailableUsers);
endDateInput?.addEventListener("change", refreshAvailableUsers);

originInput?.addEventListener("input", () => renderCitySuggestions(originInput));
destinationInput?.addEventListener("input", () => renderCitySuggestions(destinationInput));


memberSectorFilter?.addEventListener("change", () => {
  selectedMemberSector = String(memberSectorFilter.value || "").trim();
  renderMemberCheckboxes();
});

membersCheckboxes?.addEventListener("change", (e) => {
  const checkbox = e.target.closest('input[type="checkbox"]');
  if (!checkbox) return;
  const id = Number(checkbox.value);
  const user = availableUsers.find((item) => Number(item.id) === id);
  if (!user) return;
  if (checkbox.checked) selectedMembers.set(id, user);
  else selectedMembers.delete(id);
});

addEquipmentBtn?.addEventListener("click", addEquipment);
equipmentName?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addEquipment();
  }
});
equipmentItems?.addEventListener("click", (e) => {
  const remove = e.target.closest("[data-remove-equipment]");
  if (!remove) return;
  equipmentChecklist.splice(Number(remove.dataset.removeEquipment), 1);
  renderEquipmentChecklist();
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert(alertEl);
  btn.disabled = true;

  const origin = "Piraju - SP";
  const destination = findCity(destinationInput?.value);
  if (!origin || !destination) {
    showAlert(
      alertEl,
      "Informe origem e destino usando uma cidade válida. Formatos aceitos: Cidade - UF (Brasil) ou Cidade - País / Cidade - Estado - País (internacional).",
    );
    btn.disabled = false;
    if (!origin) originInput?.focus();
    else destinationInput?.focus();
    return;
  }

  const payload = {
    origin,
    destination,
    start_date: document.getElementById("start_date").value,
    end_date: document.getElementById("end_date").value,
    reason: document.getElementById("reason").value.trim(),
    priority: document.getElementById("priority").value || "normal",
    sector: sectorSelect.value,
    member_ids: [...selectedMembers.keys()].map(Number),
    equipment_checklist: equipmentChecklist,
  };

  try {
    if (!navigator.onLine && !isEditing) {
      await saveTripOffline(payload);
      showAlert(alertEl, "Sem conexão. Viagem salva neste dispositivo e será enviada quando a internet voltar.", "success");
      btn.disabled = false;
      return;
    }
    const res = isEditing
      ? await api.updateTrip(editTripId, payload)
      : await api.createTrip(payload);


    const tripId = res.trip.id;
    if (tripId) {
      setLocationConsent(tripId, true);
    }

    window.location.href = `trip.html?id=${tripId}`;

    window.location.href = `trip.html?id=${res.trip.id}`;

  } catch (err) {
    showAlert(alertEl, err.message);
    btn.disabled = false;
  }
});

init();
