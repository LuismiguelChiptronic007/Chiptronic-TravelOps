import { api, showAlert } from './api.js';
import { escapeHtml } from './layout.js';

function canManageDemands(user) {
  const position = String(user?.position_title || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return Boolean(user?.is_admin || user?.is_admin_master || user?.is_sector_leader || position === 'lider');
}

function vehicleLabel(vehicle) {
  return [vehicle.montadora, vehicle.modelo, vehicle.placa].filter(Boolean).join(' · ') || `Veículo ${vehicle.id}`;
}

function demandStatusLabel(status) {
  return status === 'concluida' ? 'Concluída' : 'Pendente';
}

function demandPriorityClass(priority) {
  const value = Number(priority || 1);
  return value === 1 ? 'priority-p1' : value === 2 ? 'priority-p2' : 'priority-p3';
}

function renderDemandRows(vehicle, manage, open = false) {
  const demands = vehicle.demands || [];
  if (!demands.length) {
    return `<div class="vehicle-demands ${open ? '' : 'is-collapsed'}"><div class="vehicle-demand-empty">Nenhuma demanda cadastrada para este veículo.</div></div>`;
  }

  const groups = new Map();
  demands.forEach((demand) => {
    const project = String(demand.tipo_projeto || 'Sem projeto');
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push(demand);
  });

  const groupsHtml = [...groups.entries()].map(([project, projectDemands]) => `
    <section class="vehicle-demand-project">
      <h4>${escapeHtml(project)} <span>${projectDemands.length}</span></h4>
      <div class="vehicle-demand-list">
        ${projectDemands.map((demand) => `
          <div class="vehicle-demand-row">
            <span class="vehicle-demand-priority ${demandPriorityClass(demand.prioridade)}" aria-hidden="true"></span>
            <strong>${escapeHtml(demand.atividade || 'Atividade')}</strong>
            <span class="vehicle-demand-status-text ${demand.status === 'concluida' ? 'is-completed' : ''}">${demandStatusLabel(demand.status)}</span>
            ${manage ? `<button type="button" class="icon-btn vehicle-demand-delete btn-delete-vehicle-demand" data-demand-id="${demand.id}" aria-label="Excluir demanda" title="Excluir demanda"><i class="ti ti-trash" aria-hidden="true"></i></button>` : ''}
          </div>`).join('')}
      </div>
    </section>`).join('');

  return `<div class="vehicle-demands ${open ? '' : 'is-collapsed'}">${groupsHtml}</div>`;
}

function renderVehicleCard(vehicle, manage, open = false) {
  return `<article class="vehicle-card">
    <div class="vehicle-card-header">
      <button type="button" class="vehicle-card-toggle" aria-expanded="${open}" aria-controls="vehicle-demands-${vehicle.id}" data-vehicle-toggle="${vehicle.id}">
        <span class="vehicle-card-heading"><strong>${escapeHtml([vehicle.montadora, vehicle.modelo, vehicle.versao_modelo, vehicle.ano, vehicle.placa].filter(Boolean).join(' · ') || vehicleLabel(vehicle))}</strong><span class="text-muted">Cadastrado por ${escapeHtml(vehicle.created_by_name || 'Usuário')}</span></span>
        <i class="ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'}" aria-hidden="true"></i>
      </button>
      ${manage ? `<button type="button" class="btn btn-secondary btn-sm btn-add-vehicle-demand" data-vehicle-id="${vehicle.id}">Adicionar demanda</button>` : ''}
    </div>
    ${manage ? `<div id="vehicle-demands-${vehicle.id}">${renderDemandRows(vehicle, manage, open)}</div>` : ''}
  </article>`;
}

function renderDemandDialog({ vehicle, projects, activities, onSaved }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal vehicle-demand-modal" role="dialog" aria-modal="true">
    <div class="modal-header"><h2>Adicionar demanda</h2><button type="button" class="modal-close" aria-label="Fechar">&times;</button></div>
    <div class="modal-body">
      <p class="text-muted">Veículo: ${escapeHtml(vehicleLabel(vehicle))}</p>
      <label for="vehicle-demand-project">Tipo de projeto</label>
      <select id="vehicle-demand-project"><option value="">Selecione...</option>${projects.map((project) => `<option value="${escapeHtml(project.name)}">${escapeHtml(project.name)}</option>`).join('')}</select>
      <label for="vehicle-demand-activity">Atividade</label>
      <select id="vehicle-demand-activity"><option value="">Selecione...</option>${activities.map((activity) => `<option value="${activity.id}">${escapeHtml(activity.descricao)}</option>`).join('')}</select>
      <label for="vehicle-demand-priority">Prioridade</label>
      <input id="vehicle-demand-priority" type="number" min="1" step="1" value="1" />
      <div class="alert alert-error hidden" id="vehicle-demand-alert"></div>
    </div>
    <div class="modal-footer"><button type="button" class="btn btn-secondary modal-cancel">Cancelar</button><button type="button" class="btn btn-primary modal-save">Salvar demanda</button></div>
  </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('.modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.querySelector('.modal-save').addEventListener('click', async () => {
    const alert = overlay.querySelector('#vehicle-demand-alert');
    const payload = {
      tipo_projeto: overlay.querySelector('#vehicle-demand-project').value,
      atividade_modelo_id: Number(overlay.querySelector('#vehicle-demand-activity').value || 0),
      prioridade: Number(overlay.querySelector('#vehicle-demand-priority').value || 0),
    };
    try {
      const response = await api.createVehicleDemand(vehicle.trip_id, vehicle.id, payload);
      close();
      onSaved(response.vehicles || []);
    } catch (error) {
      alert.textContent = error.message || 'Não foi possível salvar a demanda.';
      alert.classList.remove('hidden');
    }
  });
}

export async function renderTripVehicles(container, trip, user, { alertEl } = {}) {
  if (!container || !trip) return;
  const manage = canManageDemands(user);
  container.innerHTML = '<div class="empty-state">Carregando veículos...</div>';
  try {
    const response = await api.listVehicles(trip.id);
    const vehicles = response.vehicles || [];
    renderVehicleList(container, vehicles, trip, user, { alertEl });
  } catch (error) {
    container.innerHTML = `<div class="alert alert-error">${escapeHtml(error.message || 'Não foi possível carregar os veículos.')}</div>`;
  }
}

function renderVehicleList(container, vehicles, trip, user, { alertEl } = {}) {
  const manage = canManageDemands(user);
  container.innerHTML = `<div class="vehicle-page-header"><div><h2>${manage ? 'Veículos e fornecer demandas' : 'Veículos'}</h2><p class="text-muted">Veículos disponíveis nesta viagem.</p></div><button type="button" class="btn btn-primary" id="btn-add-trip-vehicle-tab">Adicionar veículo</button></div>
    <div class="vehicle-list">${vehicles.length ? vehicles.map((vehicle, index) => renderVehicleCard(vehicle, manage, index === 0)).join('') : '<div class="empty-state">Nenhum veículo cadastrado nesta viagem.</div>'}</div>`;
  container.querySelector('#btn-add-trip-vehicle-tab')?.addEventListener('click', () => renderVehicleDialog(trip, (next) => renderVehicleList(container, next, trip, user, { alertEl })));
  container.querySelectorAll('[data-vehicle-toggle]').forEach((toggle) => toggle.addEventListener('click', () => {
    const demands = container.querySelector(`#vehicle-demands-${toggle.dataset.vehicleToggle}`);
    if (!demands) return;
    const isOpen = !demands.querySelector('.vehicle-demands')?.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded', String(isOpen));
    const chevron = toggle.querySelector('.ti');
    chevron?.classList.toggle('ti-chevron-up', isOpen);
    chevron?.classList.toggle('ti-chevron-down', !isOpen);
  }));
  if (manage) {
    container.querySelectorAll('.btn-add-vehicle-demand').forEach((button) => button.addEventListener('click', async () => {
      const vehicle = vehicles.find((item) => Number(item.id) === Number(button.dataset.vehicleId));
      if (!vehicle) return;
      try {
        const [projectsResponse, activitiesResponse] = await Promise.all([api.leaderProjects.list(), api.demandas.atividadesModelo()]);
        renderDemandDialog({ vehicle, projects: projectsResponse.projects || [], activities: activitiesResponse.atividades || [], onSaved: (next) => renderVehicleList(container, next, trip, user, { alertEl }) });
      } catch (error) {
        if (alertEl) showAlert(alertEl, error.message || 'Não foi possível carregar as opções de demanda.');
      }
    }));
    container.querySelectorAll('.btn-delete-vehicle-demand').forEach((button) => button.addEventListener('click', async () => {
      if (!window.confirm('Deseja excluir esta demanda?')) return;
      try {
        const response = await api.deleteVehicleDemand(button.dataset.demandId);
        renderVehicleList(container, response.vehicles || [], trip, user, { alertEl });
      } catch (error) {
        if (alertEl) showAlert(alertEl, error.message || 'Não foi possível excluir a demanda.');
      }
    }));
  }
}

function renderVehicleDialog(trip, onSaved) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-header"><h2>Adicionar veículo</h2><button type="button" class="modal-close" aria-label="Fechar">&times;</button></div><div class="modal-body form-grid two"><div><label>Montadora *</label><input id="new-vehicle-maker" /></div><div><label>Modelo *</label><input id="new-vehicle-model" /></div><div><label>Versão modelo</label><input id="new-vehicle-version" /></div><div><label>Ano</label><input id="new-vehicle-year" type="text" /></div><div><label>Placa</label><input id="new-vehicle-plate" /></div><div class="alert alert-error hidden" id="new-vehicle-alert"></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary modal-cancel">Cancelar</button><button type="button" class="btn btn-primary modal-save">Salvar veículo</button></div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('.modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.querySelector('.modal-save').addEventListener('click', async () => {
    const alert = overlay.querySelector('#new-vehicle-alert');
    try {
      const response = await api.createVehicle(trip.id, {
        montadora: overlay.querySelector('#new-vehicle-maker').value,
        modelo: overlay.querySelector('#new-vehicle-model').value,
        versao_modelo: overlay.querySelector('#new-vehicle-version').value,
        ano: overlay.querySelector('#new-vehicle-year').value,
        placa: overlay.querySelector('#new-vehicle-plate').value,
      });
      close();
      onSaved(response.vehicles || []);
    } catch (error) {
      alert.textContent = error.message || 'Não foi possível salvar o veículo.';
      alert.classList.remove('hidden');
    }
  });
}
