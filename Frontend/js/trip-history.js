import { api, hideAlert, showAlert } from './api.js';
import { escapeHtml, mountShell } from './layout.js';

const tripId = Number(new URLSearchParams(location.search).get('id'));
const alertEl = document.getElementById('alert');
const listEl = document.getElementById('activity-list');

function formatDate(value) {
  const date = new Date(`${String(value || '').replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleString('pt-BR');
}

function renderActivities(activities) {
  document.getElementById('activity-count').textContent = `${activities.length} registro${activities.length === 1 ? '' : 's'}`;
  if (!activities.length) {
    listEl.innerHTML = '<p class="empty-state">Nenhuma alteração registrada para esta viagem.</p>';
    return;
  }
  listEl.innerHTML = activities.map((item) => `
    <article class="activity-entry">
      <div class="activity-entry-marker">?</div>
      <div class="activity-entry-content">
        <h3>${escapeHtml(item.summary)}</h3>
        <p class="text-muted">${escapeHtml(item.user_name)} · ${escapeHtml(formatDate(item.created_at))}</p>
        ${item.details ? `<pre>${escapeHtml(JSON.stringify(item.details, null, 2))}</pre>` : ''}
      </div>
    </article>`).join('');
}

async function init() {
  if (!tripId) {
    window.location.href = 'index.html';
    return;
  }
  const user = await mountShell({ active: 'dashboard' });
  if (!user) return;
  document.getElementById('back-trip').href = `trip.html?id=${tripId}`;
  hideAlert(alertEl);
  try {
    const [tripResponse, activityResponse] = await Promise.all([
      api.getTrip(tripId),
      api.tripActivity(tripId),
    ]);
    const trip = tripResponse.trip;
    document.getElementById('trip-subtitle').textContent = `${trip.origin} → ${trip.destination} · ${trip.start_date} — ${trip.end_date}`;
    renderActivities(activityResponse.activities || []);
  } catch (error) {
    showAlert(alertEl, error.message);
    listEl.innerHTML = '';
  }
}

init();