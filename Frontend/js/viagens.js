import { api, formatDateBR, statusBadge } from './api.js';
import { escapeHtml, mountShell } from './layout.js';

const body = document.getElementById('trips-body');
const filterQ = document.getElementById('filter-q');
const filterStatus = document.getElementById('filter-status');
let allTrips = [];

function renderTrips(trips) {
  if (!body) return;
  if (!trips.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">Nenhuma viagem encontrada. <a href="trip-new.html">Criar a primeira</a></td></tr>`;
    return;
  }

  body.innerHTML = trips
    .map(
      (t) => `
    <tr>
      <td>
        <strong>${escapeHtml(t.destination)}</strong>
        <div class="text-muted" style="font-size:0.8rem">${escapeHtml(t.origin)} → ${escapeHtml(t.destination)}</div>
      </td>
      <td>${formatDateBR(t.start_date)} — ${formatDateBR(t.end_date)}</td>
      <td>${escapeHtml(t.sector)}</td>
      <td>${statusBadge(t)}</td>
      <td class="text-right"><a class="btn btn-secondary btn-sm" href="trip.html?id=${t.id}">Abrir</a></td>
    </tr>`
    )
    .join('');
}

function applyFilters() {
  if (!body) return;
  const q = (filterQ.value || '').toLowerCase().trim();
  const status = filterStatus.value;
  let list = allTrips;
  if (status && status !== 'all') list = list.filter((t) => t.status === status);
  if (q) {
    list = list.filter(
      (t) =>
        t.origin.toLowerCase().includes(q) ||
        t.destination.toLowerCase().includes(q) ||
        (t.reason || '').toLowerCase().includes(q)
    );
  }
  renderTrips(list);
}

async function load() {
  const user = await mountShell({ active: 'viagens' });
  if (!user) return;

  const urlStatus = new URLSearchParams(location.search).get('status');
  if (urlStatus && filterStatus) {
    filterStatus.value = urlStatus;
  }

  try {
    const list = await api.listTrips();
    allTrips = list.trips || [];
    applyFilters();
  } catch (err) {
    if (body) body.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
  }
}

filterQ?.addEventListener('input', applyFilters);
filterStatus?.addEventListener('change', applyFilters);
load();
