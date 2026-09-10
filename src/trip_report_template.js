import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_FULL = readFileSync(
  path.resolve(__dirname, "..", "Frontend", "assets", "logo-full.svg"),
  "utf8",
);
const LOGO_MARK = readFileSync(
  path.resolve(__dirname, "..", "Frontend", "assets", "logo-mark.svg"),
  "utf8",
);

const SYSTEM_NAME = "Chiptronic TravelOps";

const THEME = {
  brand: "#0f172a",
  brandLight: "#1e293b",
  accent: "#334155",
  brandSoft: "#f8fafc",
  border: "#cbd5e1",
  borderLight: "#e2e8f0",
  textMuted: "#64748b",
  textDark: "#0f172a",
  ok: "#166534",
  okSoft: "#dcfce7",
  pending: "#92400e",
  pendingSoft: "#fef3c7",
  pendingBg: "#fffbeb",
};

export function renderTripReportHTML(model) {
  const { general, members, tasksCompleted, tasksPending, userSummaries, generatedAt } = model;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Relatório de Viagem — ${esc(general.code)}</title>
<style>${css()}</style>
</head>
<body>
  <div class="page">

    ${renderHeader(general)}
    ${renderDadosGerais(general, members)}
    ${renderDataHorarioUsuario(userSummaries)}
    ${renderChecklistEncerramento(general, model.taskResults)}
    ${renderAtividades("Atividades concluídas", tasksCompleted, "ok")}
    ${renderAtividades("Atividades pendentes", tasksPending, "pending")}
    ${renderAssinaturas(general)}
    ${renderFooter(generatedAt, general.code)}

  </div>
</body>
</html>`;
}

function renderHeader(general) {
  return `
  <table class="report-header" role="presentation">
    <tr>
      <td class="report-header__logo">
        <div class="report-header__logo-wrap">${LOGO_FULL}</div>
      </td>
      <td class="report-header__title-cell">
        <h1>FORMULÁRIO DE VIAGENS</h1>
        <div class="report-header__divider"></div>
      </td>
      <td class="report-header__code-cell">
        <div class="report-code">${esc(general.code)}</div>
        ${badgeStatus(general.status, general.statusLabel)}
      </td>
    </tr>
  </table>`;
}

function badgeStatus(status, label) {
  const cls = status === "completed" || status === "concluida" ? "ok" : "pending";
  return `<span class="badge badge--${cls}">${esc(label || status || "—")}</span>`;
}

function renderDadosGerais(general, members) {
  return `
  <section class="card">
    <h2 class="card__title card__title--main">Dados gerais</h2>

    <div class="info-block">
      <span class="info-block__label">Coordenador:</span>
      <span class="info-block__value">${esc(general.coordinator)}</span>
    </div>

    <div class="info-block">
      <span class="info-block__label">Viagem para:</span>
      <span class="info-block__value">${esc(general.destination)}</span>
    </div>

    <table class="two-col-table" role="presentation">
      <tr>
        <td class="info-block">
          <span class="info-block__label">Data inicial:</span>
          <span class="info-block__value">${formatDate(general.startDate)}</span>
        </td>
        <td class="info-block">
          <span class="info-block__label">Data final:</span>
          <span class="info-block__value">${formatDate(general.endDate)}</span>
        </td>
      </tr>
    </table>

    <div class="info-block">
      <span class="info-block__label">Funcionário:</span>
      <span class="info-block__value">${esc(general.employee)}</span>
    </div>

    <div class="info-block">
      <span class="info-block__label">Participante(s):</span>
      <span class="info-block__value">${esc(general.participants)}</span>
    </div>

    <div class="info-block">
      <span class="info-block__label">Motivo:</span>
      <span class="info-block__value">${esc(general.reason)}</span>
    </div>

    <div class="info-block">
      <span class="info-block__label">Setor:</span>
      <span class="info-block__value">${esc(general.sector || "—")}</span>
    </div>

    ${members?.length ? `
    <div class="participants-wrap">
      <h3 class="card__subtitle">Quadro de participantes</h3>
      <table class="table participants-table">
        <colgroup><col style="width:42%"><col style="width:28%"><col style="width:30%"></colgroup>
        <thead><tr><th>Nome</th><th>Setor</th><th>Cargo</th></tr></thead>
        <tbody>
          ${members.map((m) => `
          <tr>
            <td>${esc(m.fullName)}</td>
            <td>${esc(m.sector || "—")}</td>
            <td>${esc(m.positionTitle || "—")}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}
  </section>`;
}

function renderDataHorarioUsuario(userSummaries) {
  if (!userSummaries?.length) return "";

  return `
  <section class="card">
    <h2 class="card__title card__title--main">Data e Horário por Usuário</h2>
    ${userSummaries.map((u) => `
    <div class="user-schedule-block">
      <div class="user-schedule-block__head">
        <span class="user-schedule-block__name">${esc(u.fullName)}</span>
        <span class="user-schedule-block__meta">
          ${u.tasksCompleted}/${u.tasksAssigned} tarefas
          ${u.totalHoursWorked !== null ? ` · ${u.totalHoursWorked}h totais` : ""}
        </span>
      </div>
      <div class="user-schedule-block__list">
        ${u.days.map((d) => `
        <div class="day-schedule">
          <span class="day-schedule__date">${formatDate(d.date)} —</span>
          <span class="day-schedule__slots">${d.timeSlots || "Sem horários registrados"}</span>
        </div>`).join("") || `<div class="empty">Nenhum horário registrado.</div>`}
      </div>
    </div>`).join("")}
  </section>`;
}

function renderChecklistEncerramento(general, taskResults = []) {
  const objetivoLabel =
    general.objectiveMet === true ? "Sim" :
    general.objectiveMet === false ? "Não" : "Não informado";
  const objetivoCls = general.objectiveMet === true ? "ok" : general.objectiveMet === false ? "pending" : "";

  return `
  <section class="card card--highlight card--priority">
    <div class="card__priority-ribbon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Checklist de encerramento — Prioritário
    </div>
    <h2 class="card__title card__title--main">Checklist de encerramento</h2>

    <table class="two-col-table" role="presentation" style="margin-bottom:10px;">
      <tr>
        <td class="info-block">
          <span class="info-block__label">Objetivo cumprido:</span>
          <span class="info-block__value"><span class="badge badge--${objetivoCls}">${esc(objetivoLabel)}</span></span>
        </td>
        <td class="info-block">
          <span class="info-block__label">Encerrado em:</span>
          <span class="info-block__value">${formatDateTime(general.completedAt)}</span>
        </td>
      </tr>
    </table>

    ${longField("Observações do objetivo", general.objectiveNotes)}
    ${longField("Pessoas visitadas / contatos", general.peopleVisited)}
    ${longField("Resumo geral das atividades", general.activitiesSummary)}
    ${longField("Pendências gerais da viagem", general.generalPendingItems, general.generalPendingItems ? "pending" : "")}

    <h3 class="card__subtitle card__subtitle--accent">
      Resumo das tarefas realizadas
      <span class="text-muted-sub">(${taskResults.length} tarefa(s) registrada(s))</span>
    </h3>

    ${taskResults.length ? taskResults.map((task, idx) => `
      <div class="task-card task-card--${task.completed ? "done" : "pending"}">
        <table class="task-card__header" role="presentation">
          <tr>
            <td class="task-card__title-col">
              <span class="task-card__index">${idx + 1}.</span>
              <span class="task-card__worktype">${esc(task.workType || "Tarefa")}</span>
              <span class="task-card__status-badge task-card__status-badge--${task.completed ? "done" : "pending"}">
                ${task.completed ? "Concluída" : "Com pendência"}
              </span>
            </td>
            <td class="task-card__when-col">
              <span class="task-card__date">${formatDate(task.date)}</span>
              <span class="task-card__time">${esc(task.startTime || "—")} – ${esc(task.endTime || "—")}</span>
            </td>
          </tr>
        </table>

        <div class="task-card__row task-card__responsibles">
          <span class="task-card__row-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Responsáveis:
          </span>
          <span class="task-card__row-value">
            ${task.responsibles?.length ? task.responsibles.map(r => `<span class="responsor-tag">${esc(r)}</span>`).join(" ") : `<span class="text-muted-sub">Não definido</span>`}
          </span>
        </div>

        ${task.location ? `
        <div class="task-card__row task-card__location">
          <span class="task-card__row-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Local:
          </span>
          <span class="task-card__row-value">${esc(task.location)}</span>
        </div>` : ""}

        <div class="task-card__summary">
          <div class="task-card__summary-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Resumo do que foi feito:
          </div>
          <p>${esc(task.summary || "Sem resumo informado.")}</p>
        </div>

        ${task.pendingItems ? `
        <div class="task-card__pending">
          <div class="task-card__pending-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Pendências neste trabalho:
          </div>
          <p>${esc(task.pendingItems)}</p>
        </div>` : ""}
      </div>`).join("") : '<p class="empty">Nenhuma tarefa registrada no checklist.</p>'}
  </section>`;
}

function renderAtividades(title, tasks, tone) {
  if (!tasks?.length) {
    return `
    <section class="card">
      <h2 class="card__title card__title--main">${esc(title)} <span class="badge badge--${tone}">0</span></h2>
      <p class="empty">Nenhuma atividade nesta categoria.</p>
    </section>`;
  }

  return `
  <section class="card">
    <h2 class="card__title card__title--main">${esc(title)} <span class="badge badge--${tone}">${tasks.length}</span></h2>
    <div class="table-wrap">
      <table class="table activity-table">
        <colgroup>
          <col style="width:11%">
          <col style="width:12%">
          <col style="width:18%">
          <col style="width:18%">
          <col style="width:${tone === "pending" ? "15%" : "15%"}">
          <col style="width:${tone === "pending" ? "26%" : "26%"}">
        </colgroup>
        <thead>
          <tr>
            <th>Data</th>
            <th>Horário</th>
            <th>Tarefa</th>
            <th>Responsáveis</th>
            <th>Local</th>
            ${tone === "pending" ? "<th>Pendência</th>" : "<th>Resumo</th>"}
          </tr>
        </thead>
        <tbody>
          ${tasks.map((t) => `
          <tr>
            <td>${formatDate(t.task_date)}</td>
            <td>${t.start_time || "—"}–${t.end_time || "—"}</td>
            <td>${esc(t.work_type || t.title || "—")}</td>
            <td>${t.responsibles?.length ? esc(t.responsibles.join(", ")) : "—"}</td>
            <td>${esc(t.location || "—")}</td>
            ${tone === "pending"
              ? `<td class="text--pending">${esc(t.pending_items || "—")}</td>`
              : `<td class="text-summary">${esc((t.summary || "—").slice(0, 120))}${(t.summary || "").length > 120 ? "…" : ""}</td>`
            }
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </section>`;
}

function renderAssinaturas(general) {
  return `
  <section class="card signatures">
    <h2 class="card__title card__title--main">Assinaturas</h2>

    <div class="signatures__route-line">
      Viagem ${esc(general.origin)} → ${esc(general.destination)} / ${esc(general.reason)}
    </div>

    <table class="signatures__table" role="presentation">
      <tr>
        <td class="signature-cell">
          <div class="signature-space"></div>
          <div class="signature-line"></div>
          <div class="signature-name">${esc(general.employee || "Funcionário")}</div>
          <div class="signature-role">ASSINATURA DO FUNCIONÁRIO</div>
          <div class="signature-date">Data: ____ / ____ / ______</div>
        </td>
        <td class="signature-cell">
          <div class="signature-space"></div>
          <div class="signature-line"></div>
          <div class="signature-name">${esc(general.coordinator || "Coordenador")}</div>
          <div class="signature-role">ASSINATURA DO LÍDER</div>
          <div class="signature-date">Data: ____ / ____ / ______</div>
        </td>
      </tr>
    </table>
  </section>`;
}

function renderFooter(generatedAt, code) {
  return `
  <table class="report-footer" role="presentation">
    <tr>
      <td class="report-footer__brand-cell">
        <div class="report-footer__brand">
          <div class="report-footer__mark-wrap">${LOGO_MARK}</div>
          <span class="report-footer__system-name">${esc(SYSTEM_NAME)}</span>
        </div>
      </td>
      <td class="report-footer__meta-cell">
        Relatório ${esc(code)} · Gerado em ${formatDateTime(generatedAt)}
      </td>
    </tr>
  </table>`;
}

function longField(label, value, tone = "") {
  if (!value) return "";
  return `
  <div class="long-field ${tone ? `long-field--${tone}` : ""}">
    <div class="long-field__label">${esc(label)}</div>
    <p class="long-field__value">${esc(value)}</p>
  </div>`;
}

function formatDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return esc(String(d));
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return esc(String(d));
  return date.toLocaleString("pt-BR");
}

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function css() {
  return `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: ${THEME.textDark};
    font-size: 13.5px;
    line-height: 1.55;
    margin: 0;
    background: #ffffff;
    -webkit-font-smoothing: antialiased;
  }
  .page {
    width: 794px;
    min-height: 1123px;
    padding: 38px 48px 28px;
    margin: 0 auto;
    background: #ffffff;
  }

  /* ========== Cabeçalho ========== */
  .report-header {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 22px;
  }
  .report-header td { vertical-align: middle; }
  .report-header__logo { width: 140px; padding-right: 14px; }
  .report-header__title-cell { text-align: center; }
  .report-header__title-cell h1 {
    margin: 0 0 8px;
    font-size: 26px;
    font-weight: 800;
    color: ${THEME.textDark};
    letter-spacing: -0.3px;
  }
  .report-header__divider {
    height: 3px;
    background: linear-gradient(90deg, #ef4444, ${THEME.brand});
    border-radius: 2px;
  }
  .report-header__code-cell {
    width: 130px;
    text-align: right;
    padding-left: 14px;
  }
  .report-code {
    font-size: 14px;
    font-weight: 700;
    color: ${THEME.brand};
    margin-bottom: 6px;
  }

  /* ========== Badges ========== */
  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 600;
    background: ${THEME.borderLight};
    color: #475569;
    vertical-align: middle;
  }
  .badge--ok { background: ${THEME.okSoft}; color: ${THEME.ok}; }
  .badge--pending { background: ${THEME.pendingSoft}; color: ${THEME.pending}; }

  /* ========== Cards ========== */
  .card {
    border: 1px solid ${THEME.border};
    border-radius: 10px;
    background-color: #ffffff;
    padding: 16px 18px 18px;
    margin-bottom: 16px;
    page-break-inside: avoid;
    break-inside: avoid;
    -webkit-column-break-inside: avoid;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }
  .card--highlight {
    border-color: ${THEME.brand};
    background-color: ${THEME.brandSoft};
    border-width: 1.5px;
  }
  .card--priority {
    position: relative;
    border-top: 3px solid ${THEME.brand};
  }
  .card__priority-ribbon {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: ${THEME.brand};
    color: #ffffff;
    padding: 5px 12px;
    border-radius: 0 0 8px 8px;
    font-size: 11.5px;
    font-weight: 600;
    margin: -16px 0 12px -4px;
    letter-spacing: .02em;
  }
  .card__title {
    font-size: 14.5px;
    margin: 0 0 14px;
    color: ${THEME.brand};
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .card__title--main {
    padding-bottom: 10px;
    border-bottom: 2px solid ${THEME.borderLight};
  }
  .card__subtitle {
    font-size: 13.5px;
    margin: 18px 0 10px;
    color: ${THEME.brand};
    font-weight: 700;
  }
  .card__subtitle--accent {
    color: ${THEME.brand};
    background: #ffffff;
    padding: 8px 12px;
    border-radius: 6px;
    border-left: 3px solid ${THEME.brand};
    margin-top: 18px;
  }
  .text-muted-sub { color: ${THEME.textMuted}; font-weight: 500; font-size: 12px; }

  /* ========== Info blocks (estilo do exemplo enviado) ========== */
  .info-block {
    margin: 0;
    padding: 8px 0;
    border-bottom: 1px solid #f1f5f9;
  }
  .info-block__label {
    font-size: 15px;
    font-weight: 700;
    color: ${THEME.textDark};
    display: inline;
  }
  .info-block__value {
    font-size: 15px;
    font-weight: 500;
    color: #1e293b;
    display: inline;
    margin-left: 4px;
  }
  .two-col-table {
    width: 100%;
    border-collapse: collapse;
  }
  .two-col-table td {
    width: 50%;
    padding: 0;
    vertical-align: top;
  }
  .two-col-table td:first-child .info-block { padding-right: 16px; }
  .two-col-table td:last-child .info-block { padding-left: 16px; border-left: 1px solid #f1f5f9; }

  /* ========== Long fields ========== */
  .long-field { margin-top: 12px; }
  .long-field__label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .03em;
    color: ${THEME.textMuted};
    margin-bottom: 5px;
  }
  .long-field__value {
    font-size: 13.5px;
    margin: 0;
    padding: 10px 12px;
    background: #ffffff;
    border: 1px solid ${THEME.borderLight};
    border-radius: 6px;
    white-space: pre-wrap;
    line-height: 1.6;
  }
  .long-field--pending .long-field__value {
    background: ${THEME.pendingBg};
    border-color: #fde68a;
    color: ${THEME.pending};
  }

  /* ========== Tabelas gerais ========== */
  .table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-top: 8px;
  }
  .table thead { display: table-header-group; }
  .table tr { page-break-inside: avoid; break-inside: avoid; }
  .table th, .table td {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid ${THEME.borderLight};
    font-size: 12.5px;
    vertical-align: top;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .table th {
    color: ${THEME.textMuted};
    font-weight: 600;
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: .02em;
    background: #f8fafc;
    border-bottom: 1px solid ${THEME.border};
  }
  .participants-wrap { margin-top: 16px; }
  .participants-table td:first-child, .participants-table th:first-child { font-weight: 600; }
  .text--pending { color: ${THEME.pending}; font-weight: 500; }
  .text-summary { color: #475569; }
  .empty {
    color: ${THEME.textMuted};
    font-size: 12.5px;
    padding: 16px;
    text-align: center;
    background: #f8fafc;
    border-radius: 6px;
  }
  .table-wrap { overflow-x: hidden; }

  /* ========== Data e Horário por Usuário ========== */
  .user-schedule-block {
    background: #ffffff;
    border: 1px solid ${THEME.borderLight};
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 10px;
  }
  .user-schedule-block__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    margin-bottom: 8px;
    border-bottom: 1px dashed ${THEME.borderLight};
  }
  .user-schedule-block__name {
    font-weight: 700;
    font-size: 14px;
    color: ${THEME.brand};
  }
  .user-schedule-block__meta {
    font-size: 11.5px;
    color: ${THEME.textMuted};
    font-weight: 500;
  }
  .day-schedule {
    font-size: 14px;
    padding: 6px 0;
    line-height: 1.7;
  }
  .day-schedule__date {
    font-weight: 700;
    color: ${THEME.textDark};
    margin-right: 6px;
  }
  .day-schedule__slots {
    color: #1e40af;
    font-weight: 500;
    letter-spacing: 0.01em;
  }

  /* ========== Task cards dentro do Checklist ========== */
  .task-card {
    background: #ffffff;
    border: 1px solid ${THEME.border};
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 12px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .task-card--done { border-left: 4px solid ${THEME.ok}; }
  .task-card--pending { border-left: 4px solid #f59e0b; }

  .task-card__header {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid ${THEME.borderLight};
  }
  .task-card__header td { padding: 0; vertical-align: middle; }
  .task-card__title-col { text-align: left; }
  .task-card__when-col { text-align: right; }

  .task-card__index {
    font-weight: 800;
    color: ${THEME.brand};
    margin-right: 5px;
    font-size: 15px;
  }
  .task-card__worktype {
    font-weight: 700;
    font-size: 14px;
    color: ${THEME.textDark};
    margin-right: 8px;
  }
  .task-card__status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
  }
  .task-card__status-badge--done { background: ${THEME.okSoft}; color: ${THEME.ok}; }
  .task-card__status-badge--pending { background: ${THEME.pendingSoft}; color: ${THEME.pending}; }

  .task-card__date {
    display: block;
    font-weight: 700;
    color: ${THEME.textDark};
    font-size: 12.5px;
  }
  .task-card__time {
    display: block;
    color: #2563eb;
    font-weight: 600;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    margin-top: 2px;
  }

  .task-card__row {
    display: flex;
    gap: 8px;
    padding: 5px 0;
    align-items: flex-start;
  }
  .task-card__row-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    color: ${THEME.textMuted};
    flex-shrink: 0;
    min-width: 90px;
  }
  .task-card__row-value {
    font-size: 13px;
    color: ${THEME.textDark};
    font-weight: 500;
    flex: 1;
  }
  .responsor-tag {
    display: inline-block;
    padding: 2px 8px;
    background: ${THEME.brandSoft};
    border: 1px solid ${THEME.borderLight};
    border-radius: 4px;
    font-size: 12px;
    margin-right: 5px;
    margin-bottom: 3px;
    color: ${THEME.brand};
    font-weight: 600;
  }

  .task-card__summary, .task-card__pending {
    margin-top: 8px;
  }
  .task-card__summary-label, .task-card__pending-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 700;
    color: ${THEME.brand};
    margin-bottom: 5px;
    text-transform: uppercase;
    letter-spacing: .02em;
  }
  .task-card__summary p, .task-card__pending p {
    margin: 0;
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 13.5px;
    line-height: 1.65;
    white-space: pre-wrap;
  }
  .task-card__summary p {
    background: ${THEME.brandSoft};
    border: 1px solid ${THEME.borderLight};
  }
  .task-card__pending-label { color: ${THEME.pending}; }
  .task-card__pending p {
    background: ${THEME.pendingBg};
    border: 1px solid #fde68a;
    color: ${THEME.pending};
  }

  /* ========== Assinaturas ========== */
  .signatures { page-break-before: always; break-before: page; page-break-inside: avoid; break-inside: avoid; }
  .signatures__route-line {
    text-align: center;
    padding: 40px 0 10px;
    font-size: 16px;
    font-weight: 500;
    color: ${THEME.textDark};
    line-height: 1.6;
  }
  .signatures__table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
  }
  .signature-cell {
    width: 50%;
    text-align: center;
    vertical-align: bottom;
    padding: 0 18px;
  }
  .signature-space {
    height: 110px;
  }
  .signature-line {
    border-top: 1.5px solid ${THEME.textDark};
    width: 100%;
    margin: 0 auto;
  }
  .signature-name {
    margin-top: 10px;
    font-weight: 700;
    font-size: 13.5px;
    color: ${THEME.textDark};
  }
  .signature-role {
    font-size: 13px;
    font-weight: 600;
    color: ${THEME.textDark};
    margin-top: 3px;
    letter-spacing: .04em;
  }
  .signature-date {
    font-size: 12px;
    color: ${THEME.textMuted};
    margin-top: 12px;
    font-weight: 500;
  }

  /* ========== Rodapé temático ========== */
  .report-footer {
    width: 100%;
    border-collapse: collapse;
    margin-top: 30px;
    background: ${THEME.brand};
    border-radius: 8px 8px 0 0;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .report-footer td {
    padding: 12px 16px;
    font-size: 10.5px;
    background: ${THEME.brand};
    color: #ffffff;
    vertical-align: middle;
  }
  .report-footer__brand-cell { width: 55%; }
  .report-footer__meta-cell { width: 45%; text-align: right; color: #cbd5e1; }
  .report-footer__brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .report-footer__system-name {
    font-weight: 700;
    font-size: 12px;
    letter-spacing: .03em;
    color: #ffffff;
  }
  `;
}
