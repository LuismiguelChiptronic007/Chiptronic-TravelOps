import {
  api,
  formatDateBR,
  hideAlert,
  showAlert,
  statusBadge,
  updateStoredUser,
  initials,
} from './api.js';
import { escapeHtml, mountShell, showToast, emptyStateSVG } from './layout.js';

const POSITIONS = ['Líder', 'Integrante'];

const alertEl = document.getElementById('alert');

async function fillSectors(selected) {
  const select = document.getElementById('sector');
  select.innerHTML = '';
  let sectors = [];
  try {
    const res = await api.sectors();
    sectors = res.sectors || [];
  } catch {
    sectors = [selected || 'Outro'];
  }
  for (const s of sectors) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    if (s === selected) opt.selected = true;
    select.appendChild(opt);
  }
}

function renderAvatar(user) {
  const el = document.getElementById('profile-avatar');
  if (user.avatar_url) {
    el.innerHTML = `<img src="${user.avatar_url}" alt="">`;
  } else {
    el.textContent = initials(user.full_name);
  }
}

function renderHistory(trips) {
  const body = document.getElementById('history-body');
  if (!trips.length) {
    body.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-illust">${emptyStateSVG('airplane')}</div><p class="empty-title">Nenhuma viagem ainda</p><p class="empty-sub">Quando você participar de uma viagem ela aparecerá aqui.</p></div></td></tr>`;
    return;
  }
  body.innerHTML = trips
    .map(
      (t) => `
    <tr>
      <td><strong>${escapeHtml(t.destination)}</strong><div class="text-muted" style="font-size:0.8rem">${escapeHtml(t.origin)}</div></td>
      <td>${formatDateBR(t.start_date)} — ${formatDateBR(t.end_date)}</td>
      <td>${statusBadge(t)}</td>
      <td class="text-right"><a class="btn btn-secondary btn-sm" href="trip.html?id=${t.id}">Abrir</a></td>
    </tr>`
    )
    .join('');
}

async function load() {
  const shellUser = await mountShell({ active: 'profile' });
  if (!shellUser) return;

  document.getElementById('history-body')?.classList.add('loading');
  try {
    const res = await api.profile();
    const u = res.user;
    renderAvatar(u);
    document.getElementById('profile-name').textContent = u.full_name;
    document.getElementById('profile-meta').textContent =
      `${u.sector} · ${u.position_title} · Mat. ${u.employee_id}`;

    document.getElementById('s-total').textContent = res.stats.total_trips;
    document.getElementById('s-days').textContent = res.stats.total_days_away;
    document.getElementById('s-done').textContent = res.stats.by_status.completed || 0;
    document.getElementById('s-pending').textContent = res.stats.by_status.awaiting_report || 0;

    await fillSectors(u.sector);
    document.getElementById('full_name').value = u.full_name;
    const positionSelect = document.getElementById('position_title');
    positionSelect.value = POSITIONS.includes(u.position_title) ? u.position_title : '';
    document.getElementById('manager_name').value = u.manager_name || '';
    document.getElementById('manager_name').readOnly = true;
    document.getElementById('email').value = u.email;
    document.getElementById('employee_id').value = u.employee_id;

    renderHistory(res.trips || []);
  } catch (err) {
    showAlert(alertEl, err.message);
    showToast({ type: 'error', title: 'Erro ao carregar perfil', msg: err.message, duration: 3200 });
  } finally {
    document.getElementById('history-body')?.classList.remove('loading');
  }
}

document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertEl);
  try {
    const res = await api.updateProfile({
      full_name: document.getElementById('full_name').value.trim(),
      position_title: document.getElementById('position_title').value,
      sector: document.getElementById('sector').value,
    });
    updateStoredUser(res.user);
    showAlert(alertEl, 'Perfil atualizado.', 'success');
    await load();
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});

document.getElementById('avatar-input')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  hideAlert(alertEl);
  try {
    const res = await api.uploadAvatar(file);
    updateStoredUser(res.user);
    showAlert(alertEl, 'Foto atualizada.', 'success');
    await load();
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});

load();
