import { api, hideAlert, showAlert } from "./api.js";
import { escapeHtml, mountShell } from "./layout.js";
import { saveTripOffline } from "./db-offline.js";

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
const memberSectorFilter = document.getElementById("member-sector-filter");

const equipmentColumns = document.getElementById("equipment-columns");
const equipmentManage = document.getElementById("equipment-manage");
const equipmentCatalogType = document.getElementById("equipment-catalog-type");
const equipmentCatalogName = document.getElementById("equipment-catalog-name");
const addCatalogEquipmentBtn = document.getElementById("btn-add-catalog-equipment");

const originInput = document.getElementById("origin");
const destinationInput = document.getElementById("destination");
const cityDatalist = document.getElementById("city-options");

const selectedMembers = new Map();
let availableUsers = [];
let currentTrip = null;
let currentUser = null;
let equipmentCatalog = [];
let equipmentTypes = [];
let selectedMemberSector = "";
let carriedEquipment = new Map();
let canManageEquipmentCatalog = false;

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

function isLuisMiguel(user) {
  if (!user) return false;
  if (user.role === "admin_master") return true;
  const name = String(user?.full_name || "").trim().toLowerCase();
  return name === "luis miguel" || name.startsWith("luis miguel");
}

function isSectorLeaderUI(user, sector) {
  if (!user) return false;
  if (isLuisMiguel(user)) return true;
  const pos = String(user?.position_title || "").trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const isLeaderPos = pos === 'lider' || pos.startsWith('lider ') || pos.startsWith('lider-');
  return isLeaderPos && String(user?.sector || "").trim() === String(sector || "").trim();
}

function renderEquipmentColumns() {
  if (!equipmentColumns) return;

  if (!equipmentCatalog.length) {
    equipmentColumns.innerHTML = '<div class="empty-state">Nenhum equipamento cadastrado para este setor.</div>';
    return;
  }

  const groups = new Map();
  for (const type of equipmentTypes) {
    groups.set(type, equipmentCatalog.filter(function (e) { return e.equipment_type === type; }));
  }

  const cols = [];
  for (const [type, items] of groups.entries()) {
    if (!items.length) continue;
    let itemsHtml = "";
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const key = type + "|" + item.name;
      const isCarried = carriedEquipment.get(key) ? true : false;
      const checked = isCarried ? "checked" : "";
      itemsHtml += (
        '<label class="equipment-check-item">' +
        '<input type="checkbox" data-equipment-type="' + escapeHtml(type) + '" data-equipment-name="' + escapeHtml(item.name) + '" ' + checked + '>' +
        '<span class="equipment-name">' + escapeHtml(item.name) + '</span>' +
        '<span class="equipment-status ' + (isCarried ? 'is-carried' : 'is-pending') + '">' + (isCarried ? 'Carregado' : 'Pendente') + '</span>' +
        '</label>'
      );
    }
    cols.push(
      '<div class="equipment-column">' +
      '<h4 class="equipment-column-title">' + escapeHtml(type) + '</h4>' +
      '<div class="equipment-checklist-items">' + itemsHtml + '</div>' +
      '</div>'
    );
  }

  equipmentColumns.innerHTML = cols.join("");
}

function renderCatalogTypeOptions() {
  if (!equipmentCatalogType) return;
  let html = '<option value="">Selecione o tipo de equipamento...</option>';
  for (let i = 0; i < equipmentTypes.length; i++) {
    const type = equipmentTypes[i];
    html += '<option value="' + escapeHtml(type) + '">' + escapeHtml(type) + '</option>';
  }
  equipmentCatalogType.innerHTML = html;
}

function syncEquipmentButtons() {
  const type = equipmentCatalogType?.value || "";
  const name = String(equipmentCatalogName?.value || "").trim();
  if (equipmentCatalogName) equipmentCatalogName.disabled = !type;
  if (addCatalogEquipmentBtn) addCatalogEquipmentBtn.disabled = !type || !name;
}

async function loadEquipmentCatalog(sector, { preserveCarried = false } = {}) {
  equipmentCatalog = [];
  equipmentTypes = [];
  if (!preserveCarried) carriedEquipment = new Map();

  if (equipmentCatalogType) {
    equipmentCatalogType.innerHTML = '<option value="">Carregando...</option>';
  }
  if (equipmentColumns) {
    equipmentColumns.innerHTML = '<div class="empty-state">Carregando equipamentos...</div>';
  }

  try {
    const data = await api.sectorEquipment.list(sector);
    equipmentCatalog = data.equipment || [];
    equipmentTypes = data.equipment_types || [];
    canManageEquipmentCatalog = isSectorLeaderUI(currentUser, sector);

    if (equipmentManage) {
      if (canManageEquipmentCatalog) equipmentManage.classList.remove("hidden");
      else equipmentManage.classList.add("hidden");
    }

    renderCatalogTypeOptions();
    syncEquipmentButtons();
    renderEquipmentColumns();
  } catch {
    if (equipmentColumns) {
      equipmentColumns.innerHTML = '<div class="empty-state">Não foi possível carregar os equipamentos.</div>';
    }
    if (equipmentCatalogType) {
      equipmentCatalogType.innerHTML = '<option value="">Erro ao carregar</option>';
    }
  }
}

async function addCatalogEquipment() {
  const sector = sectorSelect?.value || (currentUser?.sector || "");
  const type = equipmentCatalogType?.value || "";
  const name = String(equipmentCatalogName?.value || "").trim();
  if (!type || !name) return;

  addCatalogEquipmentBtn.disabled = true;
  try {
    await api.sectorEquipment.create({ sector, equipment_type: type, name });
    equipmentCatalogName.value = "";
    await loadEquipmentCatalog(sector, { preserveCarried: true });
    showAlert(alertEl, `Equipamento "${name}" cadastrado com sucesso!`, "success");
  } catch (err) {
    showAlert(alertEl, err.message || "Erro ao cadastrar equipamento.");
  } finally {
    addCatalogEquipmentBtn.disabled = false;
    syncEquipmentButtons();
  }
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

    await loadEquipmentCatalog(sectorSelect?.value || currentUser?.sector || "");

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
        const savedChecklist = currentTrip.checklist?.equipment_checklist || [];
        carriedEquipment = new Map();
        for (const item of savedChecklist) {
          const key = `${item.equipment_type}|${item.name}`;
          carriedEquipment.set(key, !!item.carried);
        }
        await loadEquipmentCatalog(sectorSelect.value || currentTrip.sector || currentUser?.sector || "", { preserveCarried: true });
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

function collectCarriedEquipmentList() {
  const result = [];
  if (!equipmentColumns) return result;
  const checkboxes = equipmentColumns.querySelectorAll('input[type="checkbox"]');
  for (const cb of checkboxes) {
    const type = cb.getAttribute("data-equipment-type");
    const name = cb.getAttribute("data-equipment-name");
    if (!type || !name) continue;
    result.push({ equipment_type: type, name, carried: !!cb.checked });
  }
  return result;
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

sectorSelect?.addEventListener("change", () => {
  carriedEquipment = new Map();
  loadEquipmentCatalog(sectorSelect.value);
});

equipmentCatalogType?.addEventListener("change", syncEquipmentButtons);
equipmentCatalogName?.addEventListener("input", syncEquipmentButtons);
addCatalogEquipmentBtn?.addEventListener("click", addCatalogEquipment);
equipmentCatalogName?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (!addCatalogEquipmentBtn.disabled) addCatalogEquipment();
  }
});

equipmentColumns?.addEventListener("change", (e) => {
  const cb = e.target.closest('input[type="checkbox"]');
  if (!cb) return;
  const type = cb.getAttribute("data-equipment-type");
  const name = cb.getAttribute("data-equipment-name");
  if (!type || !name) return;
  const key = `${type}|${name}`;
  if (cb.checked) carriedEquipment.set(key, true);
  else carriedEquipment.delete(key);
  const status = cb.closest('.equipment-check-item')?.querySelector('.equipment-status');
  if (status) {
    status.textContent = cb.checked ? 'Carregado' : 'Pendente';
    status.classList.toggle('is-carried', cb.checked);
    status.classList.toggle('is-pending', !cb.checked);
  }
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

  const equipment_checklist = collectCarriedEquipmentList();

  const payload = {
    origin,
    destination,
    start_date: document.getElementById("start_date").value,
    end_date: document.getElementById("end_date").value,
    reason: document.getElementById("reason").value.trim(),
    priority: document.getElementById("priority").value || "normal",
    sector: sectorSelect.value,
    member_ids: [...selectedMembers.keys()].map(Number),
    equipment_checklist,
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

    window.location.href = `trip.html?id=${res.trip.id}`;

  } catch (err) {
    showAlert(alertEl, err.message);
    btn.disabled = false;
  }
});

init();
