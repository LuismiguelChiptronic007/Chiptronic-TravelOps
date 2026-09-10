

const REPORT_SYSTEM_NAME = "Chiptronic TravelOps";

const REPORT_THEME = {
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

const STATUS_LABEL_MAP = {
  planned: "Planejada",
  in_progress: "Em andamento",
  awaiting_report: "Aguardando relatório",
  completed: "Concluída",
  cancelled: "Cancelada",
};

function statusLabel(status) {
  return STATUS_LABEL_MAP[status] || String(status || "—");
}

function parseTaskResponsibles(task) {
  if (Array.isArray(task.responsibles) && task.responsibles.length) {
    return task.responsibles;
  }
  const ids = Array.isArray(task.responsible_ids)
    ? task.responsible_ids
    : String(task.responsible_ids || task.responsible_id || "")
        .split(",")
        .map(Number)
        .filter(Boolean);
  return ids.map((id) => ({ id, full_name: task.responsible_full_name || "—" }));
}

function taskIsCompleted(task) {
  return !String(task.pending_items || "").trim();
}

function calculateHours(tasks) {
  let minutes = 0;
  for (const task of tasks) {
    const start = timeToMinutes(task.start_time);
    const end = timeToMinutes(task.end_time);
    if (start != null && end != null && end > start) minutes += end - start;
  }
  return Math.round((minutes / 60) * 100) / 100;
}

function timeToMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return null;
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function buildTripReportModel(trip) {
  const tasks = Array.isArray(trip.tasks) ? trip.tasks : [];
  const owner = (trip.members || []).find(
    (member) => Number(member.user_id || member.id) === Number(trip.user_id),
  );
  const assignedUsers = new Map();

  for (const task of tasks) {
    for (const responsible of parseTaskResponsibles(task)) {
      const id = Number(responsible.id || responsible.user_id || 0);
      const key = id || responsible.full_name || `task-${task.id}`;
      if (!assignedUsers.has(key)) {
        assignedUsers.set(key, {
          id,
          fullName: responsible.full_name || "Responsável",
          tasks: [],
        });
      }
      assignedUsers.get(key).tasks.push(task);
    }
  }

  if (!assignedUsers.size && owner) {
    assignedUsers.set(Number(owner.user_id || owner.id), {
      id: Number(owner.user_id || owner.id),
      fullName: owner.full_name,
      tasks: [],
    });
  }

  const userSummaries = [...assignedUsers.values()].map((user) => {
    const byDate = new Map();
    for (const task of user.tasks) {
      if (!byDate.has(task.task_date)) byDate.set(task.task_date, []);
      byDate.get(task.task_date).push(task);
    }
    const days = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dateTasks]) => ({
        date,
        slots: dateTasks.map((task) => ({
          start: task.start_time,
          end: task.end_time,
          workType: task.work_type,
        })),
        timeSlots: dateTasks
          .map((task) =>
            task.start_time && task.end_time
              ? `${task.start_time} – ${task.end_time}`
              : task.start_time || task.end_time || "",
          )
          .filter(Boolean)
          .join(" / "),
      }));
    return {
      fullName: user.fullName,
      tasksCompleted: user.tasks.filter(taskIsCompleted).length,
      tasksAssigned: user.tasks.length,
      totalHoursWorked: user.tasks.length ? calculateHours(user.tasks) : null,
      days,
    };
  });

  const taskResults = tasks.map((task) => ({
    id: task.id,
    date: task.task_date,
    startTime: task.start_time,
    endTime: task.end_time,
    workType: task.work_type,
    location: task.location,
    summary: task.summary,
    pendingItems: task.pending_items,
    completed: taskIsCompleted(task),
    responsibles: parseTaskResponsibles(task).map((r) => r.full_name),
  }));

  const memberNames = (trip.members || []).map((m) => m.full_name).filter(Boolean);

  return {
    general: {
      code: `TRIP-${trip.id}`,
      status: trip.status,
      statusLabel: trip.status_label || statusLabel(trip.status),
      origin: trip.origin,
      destination: trip.destination,
      startDate: trip.start_date,
      endDate: trip.end_date,
      reason: trip.reason,
      sector: trip.sector,
      priority: trip.priority || "normal",
      employee: owner?.full_name || "—",
      coordinator: owner?.manager_name || "—",
      participants: memberNames.join(", ") || "—",
      objectiveMet: trip.checklist?.objective_met ?? null,
      objectiveNotes: trip.checklist?.objective_notes || "",
      peopleVisited: trip.checklist?.people_visited || "",
      activitiesSummary: trip.checklist?.activities_summary || "",
      generalPendingItems: trip.checklist?.pending_items || "",
      completedAt: trip.checklist?.completed_at || null,
    },
    taskResults,
    members: (trip.members || []).map((member) => ({
      fullName: member.full_name,
      sector: member.sector,
      positionTitle: member.position_title,
    })),
    tasksCompleted: tasks
      .filter(taskIsCompleted)
      .map((task) => ({
        ...task,
        responsibles: parseTaskResponsibles(task).map((r) => r.full_name),
      })),
    tasksPending: tasks
      .filter((task) => !taskIsCompleted(task))
      .map((task) => ({
        ...task,
        responsibles: parseTaskResponsibles(task).map((r) => r.full_name),
      })),
    userSummaries,
    generatedAt: new Date().toISOString(),
  };
}

function renderTripReportHTML(model) {
  const { general, members, tasksCompleted, tasksPending, userSummaries, generatedAt } = model;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Relatório de Viagem — ${esc(general.code)}</title>
<style>${reportCSS()}</style>
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
  const logoMark = window.__REPORT_LOGOS__?.logoMark || "";
  return `
  <table class="report-header" role="presentation">
    <tr>
      <td class="report-header__logo">
        <div class="report-header__logo-wrap">${logoMark}</div>
      </td>
      <td class="report-header__title-cell">
        <h1>FORMULÁRIO DE VIAGENS</h1>
        <div class="report-header__divider"></div>
      </td>
      <td class="report-header__code-cell">
        <div class="report-code">RG-RH-20</div>
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
      ✔ Checklist de encerramento — Prioritário
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
          <span class="task-card__row-label">👥 Responsáveis:</span>
          <span class="task-card__row-value">
            ${task.responsibles?.length ? task.responsibles.map(r => `<span class="responsor-tag">${esc(r)}</span>`).join(" ") : `<span class="text-muted-sub">Não definido</span>`}
          </span>
        </div>

        ${task.location ? `
        <div class="task-card__row task-card__location">
          <span class="task-card__row-label">📍 Local:</span>
          <span class="task-card__row-value">${esc(task.location)}</span>
        </div>` : ""}

        <div class="task-card__summary">
          <div class="task-card__summary-label">📝 Resumo do que foi feito:</div>
          <p>${esc(task.summary || "Sem resumo informado.")}</p>
        </div>

        ${task.pendingItems ? `
        <div class="task-card__pending">
          <div class="task-card__pending-label">⚠️ Pendências neste trabalho:</div>
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
          <col style="width:15%">
          <col style="width:26%">
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
  <section class="signatures-wrap">
    <table class="signatures-table" role="presentation" border="0" cellpadding="0" cellspacing="0">
      <tr>
        <td class="signature-block">
          <div class="signature-line-simple"></div>
          <div class="signature-placeholder">${esc(general.employee || "Funcionário")}</div>
          <div class="signature-label">ASSINATURA DO INTEGRANTE</div>
          <div class="signature-date-field">Data: ____ / ____ / ______</div>
        </td>
        <td class="signature-block signature-block--last">
          <div class="signature-line-simple"></div>
          <div class="signature-placeholder">${esc(general.coordinator || "Coordenador")}</div>
          <div class="signature-label">ASSINATURA DO LÍDER</div>
          <div class="signature-date-field">Data: ____ / ____ / ______</div>
        </td>
      </tr>
    </table>
  </section>`;
}

function renderFooter(generatedAt, code) {
  const logoMark = window.__REPORT_LOGOS__?.logoMark || "";
  return `
  <table class="report-footer" role="presentation" border="0" cellpadding="0" cellspacing="0" style="background:#0f172a;background-color:#0f172a;mso-highlight:#0f172a;">
    <tr>
      <td class="report-footer__brand-cell" style="background:#0f172a;background-color:#0f172a;mso-highlight:#0f172a;color:#e2e8f0;">
        <div class="report-footer__brand">
          <div class="report-footer__mark-wrap">${logoMark}</div>
        </div>
      </td>
      <td class="report-footer__meta-cell" style="background:#0f172a;background-color:#0f172a;mso-highlight:#0f172a;color:#cbd5e1;">
        Relatório RG-RH-20 · Gerado em ${formatDateTime(generatedAt)}
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

function reportCSS() {
  const T = REPORT_THEME;
  return `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: #111827;
    font-size: 15px;
    line-height: 1.6;
    margin: 0;
    padding: 0;
    background: #ffffff;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
  .page {
    width: 100%;
    max-width: 100%;
    min-height: auto;
    padding: 0;
    margin: 0;
    background: #ffffff;
    color: #111827;
  }
  .report-header {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 32px;
  }
  .report-header td { vertical-align: middle; }
  .report-header__logo { width: 160px; padding-right: 24px; }
  .report-header__logo-wrap svg { width: 84px; height: 84px; display: block; border-radius: 22px; }
  .report-header__title-cell { text-align: center; padding: 0 16px; }
  .report-header__title-cell h1 {
    margin: 0 0 12px;
    font-size: 32px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.4px;
  }
  .report-header__divider {
    height: 4px;
    background: linear-gradient(90deg, #2563eb 0%, #0ea5e9 50%, #0f172a 100%);
    border-radius: 3px;
  }
  .report-header__code-cell {
    width: 160px;
    text-align: right;
    padding-left: 20px;
  }
  .report-code {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 10px;
  }
  .badge {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    background: #e5e7eb;
    color: #374151;
    vertical-align: middle;
  }
  .badge--ok { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
  .badge--pending { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
  .card {
    border: 1px solid #d1d5db;
    border-radius: 14px;
    background-color: #ffffff;
    padding: 22px 24px 24px;
    margin-bottom: 20px;
    page-break-inside: avoid;
    break-inside: avoid;
    -webkit-column-break-inside: avoid;
    box-shadow: none;
  }
  .card--highlight {
    border-color: #cbd5e1;
    background-color: #f8fafc;
    border-width: 1px;
  }
  .card--priority {
    position: relative;
    border-top: 1px solid #cbd5e1;
  }
  .card__priority-ribbon {
    display: inline-block;
    background: #0f172a;
    color: #ffffff;
    padding: 8px 16px;
    border-radius: 0 0 10px 10px;
    font-size: 13px;
    font-weight: 600;
    margin: -22px 0 16px -4px;
    letter-spacing: .02em;
  }
  .card__title {
    font-size: 20px;
    margin: 0 0 18px;
    color: #0f172a;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .card__title--main {
    padding-bottom: 14px;
    border-bottom: 1px solid #e5e7eb;
  }
  .card__subtitle {
    font-size: 16px;
    margin: 22px 0 12px;
    color: #0f172a;
    font-weight: 700;
  }
  .card__subtitle--accent {
    color: #0f172a;
    background: #ffffff;
    padding: 10px 14px;
    border-radius: 8px;
    border-left: 4px solid #0f172a;
    margin-top: 22px;
  }
  .text-muted-sub { color: #6b7280; font-weight: 500; font-size: 13px; }
  .info-block {
    margin: 0;
    padding: 10px 0;
    border-bottom: 1px solid #f1f5f9;
  }
  .info-block__label {
    font-size: 17px;
    font-weight: 700;
    color: #0f172a;
    display: inline;
  }
  .info-block__value {
    font-size: 17px;
    font-weight: 500;
    color: #1e293b;
    display: inline;
    margin-left: 6px;
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
  .two-col-table td:first-child .info-block { padding-right: 24px; }
  .two-col-table td:last-child .info-block { padding-left: 24px; border-left: 1px solid #f1f5f9; }
  .long-field { margin-top: 16px; }
  .long-field__label {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .03em;
    color: #6b7280;
    margin-bottom: 6px;
  }
  .long-field__value {
    font-size: 15px;
    margin: 0;
    padding: 12px 14px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    white-space: pre-wrap;
    line-height: 1.7;
  }
  .long-field--pending .long-field__value {
    background: #fffbeb;
    border-color: #fde68a;
    color: #92400e;
  }
  .table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-top: 12px;
  }
  .table thead { display: table-header-group; }
  .table tr { page-break-inside: avoid; break-inside: avoid; }
  .table th, .table td {
    text-align: left;
    padding: 12px 14px;
    border-bottom: 1px solid #e5e7eb;
    font-size: 14px;
    vertical-align: top;
    overflow-wrap: anywhere;
    word-break: break-word;
    color: #111827;
  }
  .table th {
    color: #6b7280;
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: .03em;
    background: #f8fafc;
    border-bottom: 1px solid #d1d5db;
  }
  .participants-wrap { margin-top: 20px; }
  .participants-table td:first-child, .participants-table th:first-child { font-weight: 600; }
  .text--pending { color: #92400e; font-weight: 500; }
  .text-summary { color: #374151; }
  .empty {
    color: #6b7280;
    font-size: 14px;
    padding: 20px;
    text-align: center;
    background: #f8fafc;
    border-radius: 8px;
  }
  .table-wrap { overflow-x: hidden; }
  .user-schedule-block {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 16px 18px;
    margin-bottom: 14px;
  }
  .user-schedule-block__head {
    padding-bottom: 10px;
    margin-bottom: 10px;
    border-bottom: 1px dashed #e5e7eb;
  }
  .user-schedule-block__name {
    font-weight: 700;
    font-size: 17px;
    color: #0f172a;
    display: block;
  }
  .user-schedule-block__meta {
    font-size: 13px;
    color: #6b7280;
    font-weight: 500;
    display: block;
    margin-top: 5px;
  }
  .day-schedule {
    font-size: 17px;
    padding: 8px 0;
    line-height: 1.8;
  }
  .day-schedule__date {
    font-weight: 700;
    color: #0f172a;
    margin-right: 10px;
  }
  .day-schedule__slots {
    color: #1d4ed8;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .task-card {
    background: #ffffff;
    border: 1px solid #d1d5db;
    border-radius: 12px;
    padding: 16px 18px;
    margin-bottom: 14px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .task-card--done { border-left: 5px solid #166534; }
  .task-card--pending { border-left: 5px solid #d97706; }
  .task-card__header {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid #e5e7eb;
  }
  .task-card__header td { padding: 0; vertical-align: middle; }
  .task-card__title-col { text-align: left; }
  .task-card__when-col { text-align: right; }
  .task-card__index {
    font-weight: 800;
    color: #0f172a;
    margin-right: 8px;
    font-size: 17px;
  }
  .task-card__worktype {
    font-weight: 700;
    font-size: 17px;
    color: #0f172a;
    margin-right: 12px;
  }
  .task-card__status-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
  }
  .task-card__status-badge--done { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
  .task-card__status-badge--pending { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
  .task-card__date {
    display: block;
    font-weight: 700;
    color: #0f172a;
    font-size: 14px;
  }
  .task-card__time {
    display: block;
    color: #1d4ed8;
    font-weight: 600;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    margin-top: 4px;
  }
  .task-card__row {
    padding: 8px 0;
  }
  .task-card__row-label {
    font-size: 13px;
    font-weight: 700;
    color: #6b7280;
    display: block;
    margin-bottom: 4px;
  }
  .task-card__row-value {
    font-size: 15px;
    color: #0f172a;
    font-weight: 500;
  }
  .responsor-tag {
    display: inline-block;
    padding: 4px 12px;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 13px;
    margin-right: 8px;
    margin-bottom: 5px;
    color: #0f172a;
    font-weight: 600;
  }
  .task-card__summary, .task-card__pending {
    margin-top: 10px;
  }
  .task-card__summary-label, .task-card__pending-label {
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: .02em;
  }
  .task-card__summary p, .task-card__pending p {
    margin: 0;
    padding: 14px 16px;
    border-radius: 8px;
    font-size: 15px;
    line-height: 1.7;
    white-space: pre-wrap;
  }
  .task-card__summary p {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
  }
  .task-card__pending-label { color: #92400e; }
  .task-card__pending p {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
  }
  .signatures-wrap {
    page-break-before: auto;
    break-before: auto;
    page-break-inside: avoid;
    break-inside: avoid;
    padding-top: 0;
    margin-top: 260px;
  }
  .signatures-table {
    width: 100%;
    border-collapse: collapse;
    border: 0;
    background: transparent;
    padding: 0;
    margin: 0;
  }
  .signature-block {
    width: 50%;
    text-align: center;
    vertical-align: top;
    padding: 0 36px 60px 36px;
    background: transparent;
    border: 0;
  }
  .signature-block--last {
    padding: 0 16px 60px 56px;
  }
  .signature-line-simple {
    border: 0;
    border-top: 1.2px solid #0f172a;
    width: 100%;
    margin: 0 auto 18px auto;
    height: 1px;
    background: transparent;
  }
  .signature-placeholder {
    font-weight: 700;
    font-size: 18px;
    color: #0f172a;
    line-height: 1.3;
  }
  .signature-label {
    font-size: 15px;
    font-weight: 600;
    color: #0f172a;
    margin-top: 8px;
    letter-spacing: .04em;
  }
  .signature-date-field {
    font-size: 14px;
    color: #6b7280;
    margin-top: 26px;
    font-weight: 500;
  }
  .report-footer {
    width: 100%;
    border-collapse: collapse;
    margin-top: 28px;
    background: #0f172a;
    border-radius: 12px 12px 0 0;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .report-footer td {
    padding: 18px 24px;
    font-size: 13px;
    background: #0f172a;
    color: #e2e8f0;
    vertical-align: middle;
  }
  .report-footer__brand-cell { width: 55%; }
  .report-footer__meta-cell { width: 45%; text-align: right; color: #cbd5e1; font-weight: 500; }
  .report-footer__brand {
    display: inline-flex;
    align-items: center;
    gap: 0;
  }
  .report-footer__mark-wrap svg { width: 44px; height: 44px; display: block; border-radius: 10px; }
  .report-footer__system-name {
    display: none;
  }
  `;
}

function wordCSS() {
  const T = REPORT_THEME;
  return `
/* REGRAS GERAIS DE PÁGINA PARA WORD (MSO) */
@page Section1 {
  size: 21cm 29.7cm;
  margin: 15mm 18mm 15mm 18mm;
  mso-page-orientation: portrait;
  mso-header-margin: 12.7mm;
  mso-footer-margin: 12.7mm;
  mso-paper-source: 0;
}
div.Section1 { page: Section1; }

* { box-sizing: border-box; mso-box-sizing: border-box; }

body {
  font-family: "Calibri", "Arial", sans-serif;
  color: #111827;
  font-size: 11pt;
  line-height: 1.55;
  margin: 0;
  padding: 0;
  background: #ffffff;
  -webkit-font-smoothing: antialiased;
}

.page {
  width: 100%;
  max-width: 100%;
  padding: 0;
  margin: 0 auto;
  background: #ffffff;
  color: #111827;
  mso-padding-alt: 0;
}

/* ===== HEADER ===== */
.report-header {
  width: 100%;
  border-collapse: collapse;
  mso-table-lspace: 0pt;
  mso-table-rspace: 0pt;
  margin-bottom: 24pt;
}
.report-header td { vertical-align: middle; padding: 0; }
.report-header__logo { width: 80pt; padding-right: 12pt; }
.report-header__logo-wrap img { width: 56pt; height: 56pt; display: block; border-radius: 14pt; }
.report-header__title-cell { text-align: center; padding: 0 8pt; }
.report-header__title-cell h1 {
  margin: 0 0 8pt;
  font-size: 22pt;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.3pt;
  font-family: "Calibri", "Arial", sans-serif;
  mso-ansi-font-size: 22pt;
  mso-bidi-font-size: 22pt;
}
.report-header__divider {
  height: 3pt;
  background: #2563eb;
  mso-highlight: #2563eb;
  border: none;
  border-radius: 2pt;
  margin: 0;
}
.report-header__code-cell {
  width: 80pt;
  text-align: right;
  padding-left: 10pt;
}
.report-code {
  font-size: 11pt;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6pt;
  font-family: "Calibri", "Arial", sans-serif;
}

/* BADGES */
.badge {
  display: inline-block;
  padding: 3pt 9pt;
  border-radius: 999pt;
  font-size: 9pt;
  font-weight: 600;
  background: #e5e7eb;
  color: #374151;
  vertical-align: middle;
  border: 1pt solid #d1d5db;
  font-family: "Calibri", "Arial", sans-serif;
  mso-padding-alt: 3pt 9pt 3pt 9pt;
}
.badge--ok { background: #dcfce7; color: #166534; border: 1pt solid #bbf7d0; mso-highlight: #dcfce7; }
.badge--pending { background: #fef3c7; color: #92400e; border: 1pt solid #fde68a; mso-highlight: #fef3c7; }

/* ===== CARDS (SEÇÕES) ===== */
.card {
  border: 1pt solid #d1d5db;
  border-radius: 9pt;
  background-color: #ffffff;
  padding: 14pt 16pt 16pt 16pt;
  margin-bottom: 14pt;
  page-break-inside: avoid;
  mso-border-alt: solid #d1d5db 0.75pt;
  mso-padding-alt: 14pt 16pt 16pt 16pt;
  mso-shadow: none;
  box-shadow: none;
}
.card--highlight {
  border-color: #cbd5e1;
  background-color: #f8fafc;
  mso-highlight: #f8fafc;
  border-width: 1pt;
}
.card--priority {
  position: relative;
  border-top: 1pt solid #cbd5e1;
}
.card__priority-ribbon {
  display: inline-block;
  background: #0f172a;
  color: #ffffff;
  padding: 5pt 11pt;
  border-radius: 0 0 7pt 7pt;
  font-size: 9pt;
  font-weight: 600;
  margin: -14pt 0 12pt -3pt;
  letter-spacing: 0.02em;
  mso-highlight: #0f172a;
  font-family: "Calibri", "Arial", sans-serif;
}
.card__title {
  font-size: 14pt;
  margin: 0 0 12pt;
  color: #0f172a;
  font-weight: 700;
  font-family: "Calibri", "Arial", sans-serif;
  mso-ansi-font-size: 14pt;
}
.card__title--main {
  padding-bottom: 10pt;
  border-bottom: 1pt solid #e5e7eb;
  mso-border-bottom-alt: solid #e5e7eb 0.75pt;
}
.card__subtitle {
  font-size: 11pt;
  margin: 15pt 0 8pt;
  color: #0f172a;
  font-weight: 700;
  font-family: "Calibri", "Arial", sans-serif;
}
.card__subtitle--accent {
  color: #0f172a;
  background: #ffffff;
  padding: 7pt 10pt;
  border-radius: 5pt;
  border-left: 3pt solid #0f172a;
  margin-top: 15pt;
  mso-highlight: #ffffff;
}
.text-muted-sub { color: #6b7280; font-weight: 500; font-size: 9pt; font-family: "Calibri", "Arial", sans-serif; }

/* ===== INFO BLOCK (campos label : valor) ===== */
.info-block {
  margin: 0;
  padding: 7pt 0;
  border-bottom: 1pt solid #f1f5f9;
  mso-border-bottom-alt: solid #f1f5f9 0.5pt;
  font-family: "Calibri", "Arial", sans-serif;
}
.info-block__label {
  font-size: 12pt;
  font-weight: 700;
  color: #0f172a;
  display: inline;
  mso-ansi-font-size: 12pt;
}
.info-block__value {
  font-size: 12pt;
  font-weight: 500;
  color: #1e293b;
  display: inline;
  margin-left: 4pt;
  mso-ansi-font-size: 12pt;
}

.two-col-table {
  width: 100%;
  border-collapse: collapse;
  mso-table-lspace: 0pt;
  mso-table-rspace: 0pt;
}
.two-col-table td {
  width: 50%;
  padding: 0;
  vertical-align: top;
}
.two-col-table td:first-child .info-block { padding-right: 16pt; }
.two-col-table td:last-child .info-block {
  padding-left: 16pt;
  border-left: 1pt solid #f1f5f9;
  mso-border-left-alt: solid #f1f5f9 0.5pt;
}

/* ===== CAMPOS LONGOS ===== */
.long-field { margin-top: 11pt; font-family: "Calibri", "Arial", sans-serif; }
.long-field__label {
  font-size: 9pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #6b7280;
  margin-bottom: 4pt;
  display: block;
}
.long-field__value {
  font-size: 11pt;
  margin: 0;
  padding: 8pt 10pt;
  background: #ffffff;
  border: 1pt solid #e5e7eb;
  border-radius: 5pt;
  white-space: pre-wrap;
  line-height: 1.6;
  mso-border-alt: solid #e5e7eb 0.75pt;
  mso-padding-alt: 8pt 10pt 8pt 10pt;
}
.long-field--pending .long-field__value {
  background: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
  mso-highlight: #fffbeb;
}

/* ===== TABELAS GERAIS ===== */
.table {
  width: 100%;
  border-collapse: collapse;
  mso-table-lspace: 0pt;
  mso-table-rspace: 0pt;
  margin-top: 8pt;
  table-layout: auto;
}
.table thead { display: table-header-group; }
.table th, .table td {
  text-align: left;
  padding: 8pt 10pt;
  border-bottom: 1pt solid #e5e7eb;
  font-size: 10pt;
  vertical-align: top;
  color: #111827;
  font-family: "Calibri", "Arial", sans-serif;
  mso-border-bottom-alt: solid #e5e7eb 0.5pt;
  mso-padding-alt: 8pt 10pt 8pt 10pt;
}
.table th {
  color: #6b7280;
  font-weight: 600;
  font-size: 9pt;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: #f8fafc;
  border-bottom: 1pt solid #d1d5db;
  mso-highlight: #f8fafc;
  mso-border-bottom-alt: solid #d1d5db 0.75pt;
}
.participants-wrap { margin-top: 14pt; }
.participants-table td:first-child, .participants-table th:first-child { font-weight: 600; }
.text--pending { color: #92400e; font-weight: 500; }
.text-summary { color: #374151; }
.empty {
  color: #6b7280;
  font-size: 10pt;
  padding: 14pt;
  text-align: center;
  background: #f8fafc;
  border-radius: 5pt;
  mso-highlight: #f8fafc;
  font-family: "Calibri", "Arial", sans-serif;
}
.table-wrap { overflow: hidden; }

/* ===== HORÁRIOS POR USUÁRIO ===== */
.user-schedule-block {
  background: #ffffff;
  border: 1pt solid #e5e7eb;
  border-radius: 8pt;
  padding: 11pt 12pt;
  margin-bottom: 10pt;
  mso-border-alt: solid #e5e7eb 0.75pt;
  mso-padding-alt: 11pt 12pt 11pt 12pt;
}
.user-schedule-block__head {
  padding-bottom: 7pt;
  margin-bottom: 7pt;
  border-bottom: 1pt dashed #e5e7eb;
  mso-border-bottom-alt: dashed #e5e7eb 0.5pt;
}
.user-schedule-block__name {
  font-weight: 700;
  font-size: 12pt;
  color: #0f172a;
  display: block;
  font-family: "Calibri", "Arial", sans-serif;
}
.user-schedule-block__meta {
  font-size: 9pt;
  color: #6b7280;
  font-weight: 500;
  display: block;
  margin-top: 3pt;
  font-family: "Calibri", "Arial", sans-serif;
}
.day-schedule {
  font-size: 12pt;
  padding: 5pt 0;
  line-height: 1.75;
  font-family: "Calibri", "Arial", sans-serif;
}
.day-schedule__date {
  font-weight: 700;
  color: #0f172a;
  margin-right: 7pt;
}
.day-schedule__slots {
  color: #1d4ed8;
  font-weight: 600;
  letter-spacing: 0.01em;
}

/* ===== TASK CARDS ===== */
.task-card {
  background: #ffffff;
  border: 1pt solid #d1d5db;
  border-radius: 8pt;
  padding: 11pt 12pt;
  margin-bottom: 10pt;
  page-break-inside: avoid;
  mso-border-alt: solid #d1d5db 0.75pt;
  mso-padding-alt: 11pt 12pt 11pt 12pt;
}
.task-card--done { border-left: 3.5pt solid #166534; mso-border-left-alt: solid #166534 2.25pt; }
.task-card--pending { border-left: 3.5pt solid #d97706; mso-border-left-alt: solid #d97706 2.25pt; }
.task-card__header {
  width: 100%;
  border-collapse: collapse;
  mso-table-lspace: 0pt;
  mso-table-rspace: 0pt;
  margin-bottom: 8pt;
  padding-bottom: 7pt;
  border-bottom: 1pt solid #e5e7eb;
  mso-border-bottom-alt: solid #e5e7eb 0.5pt;
}
.task-card__header td { padding: 0; vertical-align: middle; }
.task-card__title-col { text-align: left; }
.task-card__when-col { text-align: right; }
.task-card__index {
  font-weight: 800;
  color: #0f172a;
  margin-right: 5pt;
  font-size: 12pt;
}
.task-card__worktype {
  font-weight: 700;
  font-size: 12pt;
  color: #0f172a;
  margin-right: 8pt;
}
.task-card__status-badge {
  display: inline-block;
  padding: 2.5pt 8pt;
  border-radius: 4pt;
  font-size: 8.5pt;
  font-weight: 700;
  font-family: "Calibri", "Arial", sans-serif;
}
.task-card__status-badge--done { background: #dcfce7; color: #166534; border: 0.75pt solid #bbf7d0; mso-highlight: #dcfce7; }
.task-card__status-badge--pending { background: #fef3c7; color: #92400e; border: 0.75pt solid #fde68a; mso-highlight: #fef3c7; }
.task-card__date {
  display: block;
  font-weight: 700;
  color: #0f172a;
  font-size: 10pt;
}
.task-card__time {
  display: block;
  color: #1d4ed8;
  font-weight: 600;
  font-size: 11pt;
  margin-top: 3pt;
}
.task-card__row { padding: 5pt 0; }
.task-card__row-label {
  font-size: 9pt;
  font-weight: 700;
  color: #6b7280;
  display: block;
  margin-bottom: 3pt;
}
.task-card__row-value {
  font-size: 11pt;
  color: #0f172a;
  font-weight: 500;
}
.responsor-tag {
  display: inline-block;
  padding: 2.5pt 8pt;
  background: #f1f5f9;
  border: 0.75pt solid #e2e8f0;
  border-radius: 4pt;
  font-size: 9pt;
  margin-right: 5pt;
  margin-bottom: 3pt;
  color: #0f172a;
  font-weight: 600;
  mso-highlight: #f1f5f9;
}
.task-card__summary, .task-card__pending { margin-top: 7pt; }
.task-card__summary-label, .task-card__pending-label {
  font-size: 9pt;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 4pt;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  display: block;
}
.task-card__summary p, .task-card__pending p {
  margin: 0;
  padding: 10pt 11pt;
  border-radius: 5pt;
  font-size: 11pt;
  line-height: 1.6;
  white-space: pre-wrap;
  mso-padding-alt: 10pt 11pt 10pt 11pt;
}
.task-card__summary p {
  background: #f8fafc;
  border: 0.75pt solid #e2e8f0;
  mso-highlight: #f8fafc;
  mso-border-alt: solid #e2e8f0 0.75pt;
}
.task-card__pending-label { color: #92400e; }
.task-card__pending p {
  background: #fffbeb;
  border: 0.75pt solid #fde68a;
  color: #92400e;
  mso-highlight: #fffbeb;
  mso-border-alt: solid #fde68a 0.75pt;
}

/* ===== ASSINATURAS ===== */
.signatures-wrap {
  page-break-before: auto;
  padding-top: 0;
  margin-top: 200pt;
  page-break-inside: avoid;
  background: #ffffff !important;
}
.signatures-table {
  width: 100%;
  border-collapse: collapse;
  mso-table-lspace: 0pt;
  mso-table-rspace: 0pt;
  margin-top: 0;
  border: 0;
  background: #ffffff !important;
}
.signature-block {
  width: 50%;
  text-align: center;
  vertical-align: top;
  padding: 0 24pt 50pt 24pt;
  background: #ffffff !important;
  mso-padding-alt: 0 24pt 50pt 24pt;
  border: 0 !important;
}
.signature-block--last {
  padding: 0 10pt 50pt 40pt;
  mso-padding-alt: 0 10pt 50pt 40pt;
}
.signature-line-simple {
  border: 0;
  border-top: 1pt solid #0f172a;
  width: 100%;
  margin: 0 auto 14pt auto;
  mso-border-top-alt: solid #0f172a 0.75pt;
  height: 1pt;
  background: #ffffff !important;
}
.signature-placeholder {
  font-weight: 700;
  font-size: 14pt;
  color: #0f172a;
  line-height: 1.3;
  font-family: "Calibri", "Arial", sans-serif;
}
.signature-label {
  font-size: 11pt;
  font-weight: 600;
  color: #0f172a;
  margin-top: 6pt;
  letter-spacing: 0.04em;
  font-family: "Calibri", "Arial", sans-serif;
}
.signature-date-field {
  font-size: 10pt;
  color: #6b7280;
  margin-top: 20pt;
  font-weight: 500;
  font-family: "Calibri", "Arial", sans-serif;
}

/* ===== FOOTER ===== */
.report-footer {
  width: 100%;
  border-collapse: collapse;
  mso-table-lspace: 0pt;
  mso-table-rspace: 0pt;
  margin-top: 28pt;
  background: #0f172a;
  mso-highlight: #0f172a;
  border-radius: 8pt 8pt 0 0;
  page-break-inside: avoid;
}
.report-footer td {
  padding: 12pt 16pt;
  font-size: 9pt;
  background: #0f172a;
  color: #e2e8f0;
  vertical-align: middle;
  mso-highlight: #0f172a;
  mso-padding-alt: 12pt 16pt 12pt 16pt;
  font-family: "Calibri", "Arial", sans-serif;
}
.report-footer__brand-cell { width: 55%; }
.report-footer__meta-cell {
  width: 45%;
  text-align: right;
  color: #cbd5e1;
  font-weight: 500;
}
.report-footer__brand {
  display: inline-block;
}
.report-footer__mark-wrap img {
  width: 29pt;
  height: 29pt;
  display: block;
  border-radius: 7pt;
}
.report-footer__system-name { display: none; }
`;
}

window.TripReport = {
  build: buildTripReportModel,
  render: renderTripReportHTML,
  wordCSS: wordCSS,
  buildAndRender(trip) {
    return renderTripReportHTML(buildTripReportModel(trip));
  },
};
