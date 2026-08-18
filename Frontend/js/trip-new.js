import { api, hideAlert, showAlert } from './api.js';
import { escapeHtml, mountShell } from './layout.js';

const params = new URLSearchParams(location.search);
const editTripId = Number(params.get('id')) || null;
const isEditing = Boolean(editTripId);
const form = document.getElementById('trip-form');
const alertEl = document.getElementById('alert');
const btn = document.getElementById('btn-submit');
const sectorSelect = document.getElementById('sector');
const memberCheckboxes = document.getElementById('member-checkboxes');
const pageTitle = document.querySelector('.page-header h1');
const pageSubtitle = document.querySelector('.page-header p');

/** @type {object[]} */
let availableUsers = [];
let currentTrip = null;

function setEditMode() {
  if (!isEditing) return;
  if (pageTitle) pageTitle.textContent = 'Editar viagem';
  if (pageSubtitle) pageSubtitle.textContent = 'Atualize os dados da viagem existente';
  if (btn) btn.textContent = 'Salvar alterações';
}

function getSelectedMemberIds() {
  if (!memberCheckboxes) return [];
  const boxes = memberCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(boxes).map((b) => Number(b.value)).filter(Number.isInteger);
}

function setSelectedMembersFromTrip(members = []) {
  const ids = new Set(
    members
      .map((m) => Number(m.user_id ?? m.id))
      .filter(Number.isInteger)
  );
  if (!memberCheckboxes) return;
  const boxes = memberCheckboxes.querySelectorAll('input[type="checkbox"]');
  boxes.forEach((b) => {
    const id = Number(b.value);
    b.checked = ids.has(id);
  });
}

function renderMemberCheckboxes() {
  if (!memberCheckboxes) return;
  if (!availableUsers.length) {
    memberCheckboxes.innerHTML = '<div class="empty-state">Nenhum usuário disponível.</div>';
    return;
  }
  memberCheckboxes.innerHTML = availableUsers
    .map((u) => {
      const id = Number(u.id);
      return `
        <label class="member-checkbox-row">
          <input type="checkbox" value="${id}" data-member-id="${id}" />
          <div class="member-info">
            <strong>${escapeHtml(u.full_name || '—')}</strong>
            <small>
              Setor: ${escapeHtml(u.sector || '—')}
              · Responsável: ${escapeHtml(u.manager_name || 'Não informado')}
              ${u.position_title ? ` · ${escapeHtml(u.position_title)}` : ''}
              ${u.employee_id ? ` · Matrícula: ${escapeHtml(u.employee_id)}` : ''}
            </small>
          </div>
        </label>`;
    })
    .join('');
}

async function init() {
  const user = await mountShell({ active: 'new' });
  if (!user) return;

  try {
    const [sectorsRes, usersRes] = await Promise.all([
      api.sectors(),
      api.usersForMembers(),
    ]);

    for (const s of sectorsRes.sectors || []) {
      const opt = document.createElement('option');
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
        sector: user.sector || '',
        manager_name: user.manager_name || null,
        position_title: user.position_title || null,
        employee_id: user.employee_id || null,
      };
      availableUsers.unshift(me);
    }
  } catch {
    const opt = document.createElement('option');
    opt.value = user.sector;
    opt.textContent = user.sector;
    opt.selected = true;
    sectorSelect.appendChild(opt);
    availableUsers = [];
  }

  renderMemberCheckboxes();

  if (isEditing) {
    try {
      const tripRes = await api.getTrip(editTripId);
      currentTrip = tripRes.trip;
      if (currentTrip) {
        if (currentTrip.status === 'completed') {
          window.location.href = `trip.html?id=${editTripId}`;
          return;
        }
        document.getElementById('origin').value = currentTrip.origin || '';
        document.getElementById('destination').value = currentTrip.destination || '';
        document.getElementById('start_date').value = currentTrip.start_date || '';
        document.getElementById('end_date').value = currentTrip.end_date || '';
        document.getElementById('reason').value = currentTrip.reason || '';
        if (sectorSelect && currentTrip.sector) sectorSelect.value = currentTrip.sector;
        setSelectedMembersFromTrip(currentTrip.members || []);
      }
    } catch (err) {
      showAlert(alertEl, err.message || 'Não foi possível carregar a viagem para edição.');
    }
  }

  setEditMode();
}

const startDateInput = document.getElementById('start_date');
const endDateInput = document.getElementById('end_date');

function syncTripDates() {
  const start = startDateInput?.value;
  if (endDateInput && start) {
    endDateInput.min = start;
    if (endDateInput.value && endDateInput.value < start) {
      endDateInput.value = start;
    }
  }
}

startDateInput?.addEventListener('change', syncTripDates);
endDateInput?.addEventListener('change', syncTripDates);

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertEl);
  btn.disabled = true;

  const payload = {
    origin: document.getElementById('origin').value.trim(),
    destination: document.getElementById('destination').value.trim(),
    start_date: document.getElementById('start_date').value,
    end_date: document.getElementById('end_date').value,
    reason: document.getElementById('reason').value.trim(),
    sector: sectorSelect.value,
    member_ids: getSelectedMemberIds(),
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