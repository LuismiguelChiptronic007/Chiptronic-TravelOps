import { api, showAlert } from './api.js';
import { mountShell } from './layout.js';
import { abrirModalDemandasLider } from './demandas.js?v=2';

const tripId = Number(new URLSearchParams(location.search).get('id'));
const alertEl = document.getElementById('alert');

function syncDemandasLayout() {
  const shell = document.querySelector('.app-shell');
  const sidebar = document.getElementById('sidebar');
  if (!shell || !sidebar) return;

  const isMobile = window.innerWidth <= 880;
  const isCollapsed = sidebar.classList.contains('is-collapsed');
  shell.classList.toggle('demandas-mobile-layout', isMobile);
  shell.classList.toggle('demandas-collapsed-layout', !isMobile && isCollapsed);
  shell.classList.toggle('demandas-expanded-layout', !isMobile && !isCollapsed);
}

function watchSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  document.addEventListener('click', () => {
    setTimeout(syncDemandasLayout, 0);
  });

  const observer = new MutationObserver(syncDemandasLayout);
  observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
}

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
  syncDemandasLayout();
  watchSidebarToggle();
  window.addEventListener('resize', syncDemandasLayout);

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
