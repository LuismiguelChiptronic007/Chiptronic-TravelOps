import { api, hideAlert, showAlert } from "./api.js";
import { escapeHtml, mountShell } from "./layout.js";

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

/** @type {Map<number, object>} */
const selectedMembers = new Map();
/** @type {object[]} */
let availableUsers = [];
let currentTrip = null;

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
        if (sectorSelect && currentTrip.sector)
          sectorSelect.value = currentTrip.sector;
        setSelectedMembersFromTrip(currentTrip.members || []);
        renderMemberCheckboxes();
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

  const payload = {
    origin: document.getElementById("origin").value.trim(),
    destination: document.getElementById("destination").value.trim(),
    start_date: document.getElementById("start_date").value,
    end_date: document.getElementById("end_date").value,
    reason: document.getElementById("reason").value.trim(),
    sector: sectorSelect.value,
    member_ids: [...selectedMembers.keys()].map(Number),
  };

  try {
    const res = isEditing
      ? await api.updateTrip(editTripId, payload)
      : await api.createTrip(payload);
    window.location.href = `trip.html?id=${res.trip.id}`;
  } catch (err) {
    showAlert(alertEl, err.message);
    btn.disabled = false;
  }
});

init();
