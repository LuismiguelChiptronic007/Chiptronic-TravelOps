import { api, hideAlert, showAlert } from './api.js';
import { escapeHtml, mountShell } from './layout.js';

const params = new URLSearchParams(location.search);
const editTripId = Number(params.get('id')) || null;
const isEditing = Boolean(editTripId);
const form = document.getElementById('trip-form');
const alertEl = document.getElementById('alert');
const btn = document.getElementById('btn-submit');
const sectorSelect = document.getElementById('sector');
const memberSelect = document.getElementById('member-select');
const membersList = document.getElementById('members-list');
const memberPreview = document.getElementById('member-preview');
const pageTitle = document.querySelector('.page-header h1');
const pageSubtitle = document.querySelector('.page-header p');

/** @type {Map<number, object>} */
const selectedMembers = new Map();
/** @type {object[]} */
let availableUsers = [];
let currentTrip = null;

function setEditMode() {
  if (!isEditing) return;
  if (pageTitle) pageTitle.textContent = 'Editar viagem';
  if (pageSubtitle) pageSubtitle.textContent = 'Atualize os dados da viagem existente';
  if (btn) btn.textContent = 'Salvar alterações';
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
        sector: member.sector || '',
        manager_name: member.manager_name || null,
        position_title: member.position_title || null,
        employee_id: member.employee_id || null,
      };
      availableUsers.unshift(existing);
    }
    selectedMembers.set(existing.id, existing);
  }
}

function renderMembers() {
  if (!selectedMembers.size) {
    membersList.innerHTML = `<div class="empty-state">Nenhum integrante adicionado</div>`;
    return;
  }
  membersList.innerHTML = [...selectedMembers.values()]
    .map(
      (u) => `
    <div class="member-chip" data-id="${u.id}">
      <div class="info">
        <strong>${escapeHtml(u.full_name)}</strong>
        <small>
          Setor: ${escapeHtml(u.sector || '—')}
          · Responsável: ${escapeHtml(u.manager_name || 'Não informado')}
          ${u.position_title ? ` · ${escapeHtml(u.position_title)}` : ''}
        </small>
      </div>
      <button type="button" class="btn btn-danger btn-sm" data-remove-member="${u.id}">Remover</button>
    </div>`
    )
    .join('');
}

function fillMemberSelect() {
  const current = memberSelect.value;
  memberSelect.innerHTML = `<option value="">Selecione um integrante…</option>`;
  for (const u of availableUsers) {
    if (selectedMembers.has(u.id)) continue;
    const opt = document.createElement('option');
    opt.value = String(u.id);
    opt.textContent = `${u.full_name} — ${u.sector}`;
    opt.dataset.sector = u.sector || '';
    opt.dataset.manager = u.manager_name || '';
    opt.dataset.position = u.position_title || '';
    memberSelect.appendChild(opt);
  }
  if ([...memberSelect.options].some((o) => o.value === current)) {
    memberSelect.value = current;
  }
  updatePreview();
}

function updatePreview() {
  const id = Number(memberSelect.value);
  const u = availableUsers.find((x) => x.id === id);
  if (!u) {
    memberPreview.classList.add('hidden');
    return;
  }
  document.getElementById('preview-sector').textContent = u.sector || '—';
  document.getElementById('preview-manager').textContent = u.manager_name || 'Não informado';
  document.getElementById('preview-position').textContent = u.position_title || '—';
  memberPreview.classList.remove('hidden');
}

async function init() {
  const user = await mountShell({ active: 'new' });
  if (!user) return;

  try {
    const res = await api.sectors();
    for (const s of res.sectors || []) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (s === user.sector) opt.selected = true;
      sectorSelect.appendChild(opt);
    }
  } catch {
    const opt = document.createElement('option');
    opt.value = user.sector;
    opt.textContent = user.sector;
    opt.selected = true;
    sectorSelect.appendChild(opt);
  }

  try {
    const res = await api.usersForMembers();
    availableUsers = res.users || [];
    // Ensure the logged-in user is available to be added as a trip member
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

    if (isEditing) {
      try {
        const tripRes = await api.getTrip(editTripId);
        currentTrip = tripRes.trip;
        if (currentTrip) {
          if (currentTrip.status === 'completed') {
            location.href = `trip.html?id=${editTripId}`;
            return;
          }
          document.getElementById('origin').value = currentTrip.origin || '';
          document.getElementById('destination').value = currentTrip.destination || '';
          document.getElementById('start_date').value = currentTrip.start_date || '';
          document.getElementById('end_date').value = currentTrip.end_date || '';
          document.getElementById('reason').value = currentTrip.reason || '';
          if (sectorSelect && currentTrip.sector) sectorSelect.value = currentTrip.sector;
          setSelectedMembersFromTrip(currentTrip.members || []);
          renderMembers();
        }
      } catch (err) {
        showAlert(alertEl, err.message || 'Não foi possível carregar a viagem para edição.');
      }
    }

    fillMemberSelect();
    setEditMode();
  } catch (err) {
    showAlert(alertEl, err.message || 'Não foi possível carregar integrantes.');
  }
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

memberSelect?.addEventListener('change', updatePreview);

document.getElementById('btn-add-member')?.addEventListener('click', () => {
  const id = Number(memberSelect.value);
  if (!id) {
    showAlert(alertEl, 'Selecione um integrante cadastrado.');
    return;
  }
  const u = availableUsers.find((x) => x.id === id);
  if (!u) return;
  selectedMembers.set(u.id, u);
  hideAlert(alertEl);
  fillMemberSelect();
  renderMembers();
});

membersList?.addEventListener('click', (e) => {
  const id = Number(e.target.getAttribute('data-remove-member'));
  if (!id) return;
  selectedMembers.delete(id);
  fillMemberSelect();
  renderMembers();
});

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
    member_ids: [...selectedMembers.keys()].map(Number),
  };

  try {
    const res = isEditing
      ? await api.updateTrip(editTripId, payload)
      : await api.createTrip(payload);
    location.href = `trip.html?id=${res.trip.id}`;
  } catch (err) {
    showAlert(alertEl, err.message);
    btn.disabled = false;
  }
});

init();