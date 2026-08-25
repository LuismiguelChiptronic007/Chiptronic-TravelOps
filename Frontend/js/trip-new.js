import { api, hideAlert, showAlert } from "./api.js";
import { escapeHtml, mountShell } from "./layout.js";
import { saveTripOffline } from "./db-offline.js";
import { getLocationConsent, setLocationConsent } from "./location.js";
import { searchCities } from "./cidades.js";

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
const originInput = document.getElementById("origin");
const destinationInput = document.getElementById("destination");
const cityDatalist = document.getElementById("city-options");

/** @type {Map<number, object>} */
const selectedMembers = new Map();
/** @type {object[]} */
let availableUsers = [];
let currentTrip = null;
let equipmentChecklist = [];

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
    <label class="equipment-item">
      <input type="checkbox" data-equipment-index="${index}" ${item.carried ? "checked" : ""}>
      <span>${escapeHtml(item.name)}</span>
      <button type="button" class="icon-btn" data-remove-equipment="${index}" aria-label="Remover equipamento" title="Remover equipamento">×</button>
    </label>
  `).join("");
}

function addEquipment() {
  const name = equipmentName?.value.trim();
  if (!name) return;
  equipmentChecklist.push({ name, carried: false });
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
  if (!availableUsers.length) {
    membersCheckboxes.innerHTML =
      '<div class="empty-state">Nenhum integrante disponível</div>';
    return;
  }
  membersCheckboxes.innerHTML = availableUsers
    .map(
      (u) => `
    <label class="member-checkbox">
      <input type="checkbox" value="${u.id}" ${selectedMembers.has(Number(u.id)) ? "checked" : ""}>
      <span class="member-checkbox-info">
        <strong>${escapeHtml(u.full_name)}</strong>
        <small>
          Setor: ${escapeHtml(u.sector || "—")}
          · Responsável: ${escapeHtml(u.manager_name || "Não informado")}
          ${u.position_title ? ` · ${escapeHtml(u.position_title)}` : ""}
        </small>
      </span>
    </label>`,
    )
    .join("");
}

async function init() {
  const user = await mountShell({ active: "new" });
  if (!user) return;

  try {
    const [sectorsRes, usersRes] = await Promise.all([
      api.sectors(),
      api.usersForMembers(),
    ]);

    for (const s of sectorsRes.sectors || []) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      if (s === user.sector) opt.selected = true;
      sectorSelect.appendChild(opt);
    }

    availableUsers = usersRes.users || [];
    if (user && !availableUsers.some((u) => Number(u.id) === Number(user.id))) {
      const me = {
        id: user.id,
        full_name: user.full_name,
        sector: user.sector || "",
        manager_name: user.manager_name || null,
        position_title: user.position_title || null,
        employee_id: user.employee_id || null,
      };
      availableUsers.unshift(me);
    }
  } catch {
    const opt = document.createElement("option");
    opt.value = user.sector;
    opt.textContent = user.sector;
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
        setSelectedMembersFromTrip(currentTrip.members || []);
        equipmentChecklist = currentTrip.checklist?.equipment_checklist || [];
        renderEquipmentChecklist();
        renderMemberCheckboxes();

        const consent = getLocationConsent(editTripId);
        const toggle = document.getElementById("toggle-share-location");
        if (toggle) toggle.checked = Boolean(consent);
      }
    } catch (err) {
      showAlert(
        alertEl,
        err.message || "Não foi possível carregar a viagem para edição.",
      );
    }
  }

  renderMemberCheckboxes();
  setEditMode();
}

const startDateInput = document.getElementById("start_date");
const endDateInput = document.getElementById("end_date");

function syncTripDates() {
  const start = startDateInput?.value;
  if (endDateInput && start) {
    endDateInput.min = start;
    if (endDateInput.value && endDateInput.value < start) {
      endDateInput.value = start;
    }
  }
}

startDateInput?.addEventListener("change", syncTripDates);
endDateInput?.addEventListener("change", syncTripDates);
originInput?.addEventListener("input", () => renderCitySuggestions(originInput));
destinationInput?.addEventListener("input", () => renderCitySuggestions(destinationInput));

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
equipmentItems?.addEventListener("change", (e) => {
  const checkbox = e.target.closest("[data-equipment-index]");
  if (!checkbox) return;
  equipmentChecklist[Number(checkbox.dataset.equipmentIndex)].carried = checkbox.checked;
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

  const payload = {
    origin: document.getElementById("origin").value.trim(),
    destination: document.getElementById("destination").value.trim(),
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
    const toggle = document.getElementById("toggle-share-location");
    const shareEnabled = Boolean(toggle?.checked);
    if (tripId) {
      setLocationConsent(tripId, shareEnabled);
    }

    window.location.href = `trip.html?id=${tripId}`;
  } catch (err) {
    showAlert(alertEl, err.message);
    btn.disabled = false;
  }
});

init();
