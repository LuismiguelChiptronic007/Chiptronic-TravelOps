import { api, formatDateBR, statusBadge } from './api.js';
import { escapeHtml, mountShell } from './layout.js';

const recentBody = document.getElementById('recent-body');
const alertPending = document.getElementById('alert-pending');

const charts = {};

const STATUS_LABELS = {
  planned: 'Planejada',
  in_progress: 'Em andamento',
  awaiting_report: 'Aguardando relatório',
  completed: 'Concluída',
};

const STATUS_COLORS = {
  planned: '#94a3b8',
  in_progress: '#2563eb',
  awaiting_report: '#ca8a04',
  completed: '#16a34a',
};

const WORK_COLORS = ['#0b5fff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

function destroyChart(key) {
  try {
    if (charts[key]) charts[key].destroy();
  } catch {
    /* ignore */
  }
  charts[key] = null;
}

function renderRecentTrips(trips) {
  if (!recentBody) return;
  if (!trips.length) {
    recentBody.innerHTML =
      '<tr><td colspan="4" class="empty-state">Nenhuma viagem ainda. <a href="viagens.html">Ir para Viagens</a></td></tr>';
    return;
  }

  recentBody.innerHTML = trips
    .map(
      (t) => `
    <tr>
      <td>
        <strong>${escapeHtml(t.destination)}</strong>
        <div class="text-muted" style="font-size:0.8rem">${escapeHtml(t.origin)} → ${escapeHtml(t.destination)}</div>
      </td>
      <td>${formatDateBR(t.start_date)} — ${formatDateBR(t.end_date)}</td>
      <td>${statusBadge(t)}</td>
      <td class="text-right"><a class="btn btn-secondary btn-sm" href="trip.html?id=${t.id}">Abrir</a></td>
    </tr>`
    )
    .join('');
}

function renderCharts(analytics) {
  if (!window.Chart || !analytics) return;

  const status = analytics.status_counts || {};
  destroyChart('status');
  const statusCtx = document.getElementById('chart-status');
  if (statusCtx) {
    const labels = Object.keys(STATUS_LABELS).map((k) => STATUS_LABELS[k]);
    const data = Object.keys(STATUS_LABELS).map((k) => status[k] || 0);
    charts.status = new Chart(statusCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: Object.keys(STATUS_LABELS).map((k) => STATUS_COLORS[k]),
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

  destroyChart('monthly');
  const monthlyCtx = document.getElementById('chart-monthly');
  if (monthlyCtx) {
    const months = analytics.monthly_trips || [];
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
          backgroundColor: '#0b5fff',
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

  destroyChart('destinations');
  const destCtx = document.getElementById('chart-destinations');
  if (destCtx) {
    const dests = analytics.top_destinations || [];
    charts.destinations = new Chart(destCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: dests.map((d) => d.name),
        datasets: [{
          label: 'Viagens',
          data: dests.map((d) => d.count),
          backgroundColor: '#2563eb',
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

  destroyChart('worktypes');
  const workCtx = document.getElementById('chart-worktypes');
  const workEmpty = document.getElementById('worktypes-empty');
  const works = analytics.work_types || [];
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

async function load() {
  const user = await mountShell({ active: 'dashboard' });
  if (!user) return;

  try {
    const dash = await api.dashboard();
    const { summary, analytics, recent } = dash;

    document.getElementById('stat-progress').textContent = summary.in_progress;
    document.getElementById('stat-done').textContent = summary.completed_month;
    document.getElementById('stat-pending').textContent = summary.awaiting_report;
    document.getElementById('stat-days').textContent = summary.total_days_away ?? 0;

    const card = document.getElementById('stat-pending-card');
    card.classList.remove('warn', 'danger-accent');
    if (summary.overdue > 0) card.classList.add('danger-accent');
    else if (summary.awaiting_report > 0) card.classList.add('warn');

    if (alertPending) {
      if (summary.awaiting_report > 0) {
        const overdueText =
          summary.overdue > 0
            ? ` ${summary.overdue} ${summary.overdue === 1 ? 'está atrasada' : 'estão atrasadas'}.`
            : '';
        alertPending.innerHTML = `Você tem ${summary.awaiting_report} viagem(ns) aguardando relatório.${overdueText} <a href="viagens.html?status=awaiting_report">Ver pendentes</a>`;
        alertPending.classList.remove('hidden');
      } else {
        alertPending.classList.add('hidden');
      }
    }

    renderCharts(analytics);
    renderRecentTrips(recent || []);
  } catch (err) {
    if (recentBody) {
      recentBody.innerHTML = `<tr><td colspan="4" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
    }
  }
}

load();
