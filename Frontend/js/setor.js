import { api, formatDateBR, showAlert, hideAlert } from './api.js';
import { escapeHtml, mountShell } from './layout.js';

const alertEl = document.getElementById('alert');
const teamRoot = document.getElementById('team-root');
const charts = {};
const WORK_COLORS = ['#0b5fff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function destroyChart(key) {
  try {
    if (charts[key]) charts[key].destroy();
  } catch {
    /* ignore */
  }
  charts[key] = null;
}

function renderRankingList(ranking) {
  const el = document.getElementById('ranking-list');
  if (!el) return;
  if (!ranking.length) {
    el.innerHTML = '<p class="empty-state">Nenhum integrante na equipe.</p>';
    return;
  }
  el.innerHTML = ranking
    .map(
      (r, i) => `
    <div class="ranking-row">
      <span class="ranking-pos">${i + 1}º</span>
      <div class="ranking-info">
        <strong>${escapeHtml(r.full_name)}</strong>
        <small class="text-muted">${r.trip_count} viagens · ${r.task_count} tarefas · ${r.days_away} dias fora</small>
      </div>
      ${r.pending_reports > 0 ? `<span class="badge badge-awaiting_report">${r.pending_reports} pendente(s)</span>` : ''}
    </div>`
    )
    .join('');
}

function renderCharts(data) {
  if (!window.Chart) return;

  destroyChart('ranking');
  const rankCtx = document.getElementById('chart-ranking');
  const ranking = (data.ranking || []).slice(0, 6);
  if (rankCtx && ranking.length) {
    charts.ranking = new Chart(rankCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ranking.map((r) => r.full_name.split(' ')[0]),
        datasets: [{
          label: 'Viagens',
          data: ranking.map((r) => r.trip_count),
          backgroundColor: '#0b5fff',
          borderRadius: 6,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    });
  }

  destroyChart('monthly');
  const monthlyCtx = document.getElementById('chart-monthly');
  if (monthlyCtx) {
    const months = data.monthly_trips || [];
    charts.monthly = new Chart(monthlyCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: months.map((m) => {
          const [y, mo] = m.month.split('-');
          return `${mo}/${y.slice(2)}`;
        }),
        datasets: [{
          label: 'Viagens',
          data: months.map((m) => m.count),
          backgroundColor: '#2563eb',
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    });
  }

  destroyChart('worktypes');
  const workCtx = document.getElementById('chart-worktypes');
  const workEmpty = document.getElementById('worktypes-empty');
  const works = data.work_types || [];
  if (workCtx) {
    if (!works.length) {
      workCtx.classList.add('hidden');
      workEmpty?.classList.remove('hidden');
    } else {
      workCtx.classList.remove('hidden');
      workEmpty?.classList.add('hidden');
      charts.worktypes = new Chart(workCtx.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: works.map((w) => w.name),
          datasets: [{
            data: works.map((w) => w.count),
            backgroundColor: works.map((_, i) => WORK_COLORS[i % WORK_COLORS.length]),
            borderWidth: 2,
            borderColor: '#fff',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
        },
      });
    }
  }
}

function renderMemberCard(member) {
  const u = member.user;
  const stats = member.stats || {};
  const reports = member.reports || [];
  const tasks = member.tasks || [];

  const reportsHtml = reports.length
    ? reports
        .map(
          (r) => `
        <tr>
          <td><strong>${escapeHtml(r.destination)}</strong></td>
          <td>${formatDateBR(r.period.split(' — ')[0])} — ${formatDateBR(r.period.split(' — ')[1])}</td>
          <td><span class="badge badge-${r.status}">${escapeHtml(r.status_label || r.status)}</span>${r.is_overdue ? ' <span class="badge badge-overdue">Atrasado</span>' : ''}</td>
          <td>${r.task_count} tarefa(s)</td>
          <td class="text-right"><a class="btn btn-secondary btn-sm" href="trip.html?id=${r.trip_id}">Ver relatório</a></td>
        </tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="empty-state">Nenhum relatório de viagem</td></tr>';

  const tasksHtml = tasks.length
    ? tasks
        .slice(0, 8)
        .map(
          (t) => `
        <tr>
          <td>${formatDateBR(t.task_date)}</td>
          <td><strong>${escapeHtml(t.work_type)}</strong></td>
          <td>${escapeHtml(t.location)}</td>
          <td>${escapeHtml(t.destination)}</td>
          <td class="text-muted" style="max-width:200px">${escapeHtml((t.summary || '').slice(0, 80))}${(t.summary || '').length > 80 ? '…' : ''}</td>
        </tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="empty-state">Nenhuma tarefa registrada</td></tr>';

  return `
    <div class="panel team-member-card">
      <div class="panel-header">
        <div class="team-member-head">
          <div class="avatar">${escapeHtml(u.full_name.split(' ').map((p) => p[0]).slice(0, 2).join(''))}</div>
          <div>
            <h2 style="margin:0">${escapeHtml(u.full_name)}</h2>
            <p class="text-muted mb-0">${escapeHtml(u.position_title)} · Mat. ${escapeHtml(u.employee_id)}</p>
          </div>
        </div>
        <div class="team-stats-mini">
          <span class="badge badge-in_progress">${stats.total_trips || 0} viagens</span>
          <span class="badge badge-planned">${stats.total_tasks || 0} tarefas</span>
          <span class="badge badge-awaiting_report">${stats.pending_reports || 0} pendentes</span>
          <span class="badge badge-completed">${stats.by_status?.completed || 0} concluídas</span>
        </div>
      </div>

      <div class="panel-subheader" style="padding:0 1.25rem"><h3>Relatórios de viagem</h3></div>
      <div class="table-wrap panel-body" style="padding-top:0">
        <table class="data">
          <thead>
            <tr>
              <th>Destino</th>
              <th>Período</th>
              <th>Status</th>
              <th>Tarefas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${reportsHtml}</tbody>
        </table>
      </div>

      <div class="panel-subheader" style="padding:0 1.25rem"><h3>Tarefas realizadas</h3></div>
      <div class="table-wrap panel-body" style="padding-top:0">
        <table class="data">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Local</th>
              <th>Viagem</th>
              <th>Resumo</th>
            </tr>
          </thead>
          <tbody>${tasksHtml}</tbody>
        </table>
      </div>
    </div>`;
}

async function load() {
  const user = await mountShell({ active: 'setor' });
  if (!user) return;

  if (!user.is_sector_leader || !user.led_sector) {
    showAlert(alertEl, 'Você não tem permissão para acessar o dashboard do setor.');
    teamRoot.innerHTML = '';
    document.getElementById('summary-cards')?.classList.add('hidden');
    return;
  }

  hideAlert(alertEl);

  try {
    const data = await api.sectorDashboard();
    const sectorName = data.sector || user.led_sector;

    document.getElementById('sector-title').textContent = `Dashboard ${sectorName}`;
    document.getElementById('sector-subtitle').textContent =
      'Relatórios, viagens e tarefas de cada integrante da sua equipe';

    const s = data.summary || {};
    document.getElementById('s-members').textContent = s.total_members ?? 0;
    document.getElementById('s-trips').textContent = s.total_trips ?? 0;
    document.getElementById('s-tasks').textContent = s.total_tasks ?? 0;
    document.getElementById('s-pending').textContent = s.pending_reports ?? 0;

    const pendingCard = document.getElementById('s-pending-card');
    pendingCard?.classList.toggle('danger-accent', (s.pending_reports || 0) > 0);
    pendingCard?.classList.toggle('warn', false);

    renderCharts(data);
    renderRankingList(data.ranking || []);

    const team = data.team || [];
    if (!team.length) {
      teamRoot.innerHTML =
        '<div class="panel"><div class="panel-body empty-state">Nenhum integrante cadastrado neste setor ainda.</div></div>';
      return;
    }

    teamRoot.innerHTML = `<h2 class="section-title">Integrantes e relatórios</h2>${team.map(renderMemberCard).join('')}`;
  } catch (err) {
    showAlert(alertEl, err.message);
    teamRoot.innerHTML = '';
  }
}

load();
