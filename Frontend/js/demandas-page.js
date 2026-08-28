import { api, showAlert } from './api.js';
import { mountShell } from './layout.js';
import { abrirModalDemandasLider } from './demandas.js';

const tripId = Number(new URLSearchParams(location.search).get('id'));
const alertEl = document.getElementById('alert');

function isSectorLeader(user, trip) {
  const position = String(user?.position_title || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return position === 'lider' && user?.sector === trip?.sector;
}

async function init() {
  const user = await mountShell({ active: 'viagens' });
  if (!user || !tripId) return;

  try {
    const response = await api.getTrip(tripId);
    const trip = response.trip;
    if (!isSectorLeader(user, trip)) {
      showAlert(alertEl, 'Apenas o líder do setor pode fornecer demandas para esta viagem.');
      return;
    }

    document.getElementById('demandas-subtitle').textContent =
      `${trip.origin} → ${trip.destination} · ${trip.sector}`;
    await abrirModalDemandasLider(tripId, { fullPage: true, alertEl });
  } catch (error) {
    showAlert(alertEl, error.message || 'Não foi possível carregar a viagem.');
  }
}

init();
