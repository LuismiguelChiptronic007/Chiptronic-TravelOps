import { api, hideAlert, showAlert } from "./api.js";
import { renderTripVehicles } from "./trip-vehicles.js";
import { mountShell } from "./layout.js";
import {
  fillWorkTypes,
  prepareTaskForm,
  renderTrip,
  taskFormPayload,
  configureTaskEntryMode,
  validateTaskTimeAvailability,
  hasPersonalTaskConflict,
  hasConfirmedPersonalTaskConflict,
  setupPanelToggles,
} from "./trip-render.js?v=2";
import { confirmDialog } from "./ui.js";
import {
  getLocationConsent,
  setLocationConsent,
  startTripLocationMonitor,
  stopTripLocationMonitor,
  isMonitoringActive,
  registrarCheckinTrabalho,
} from "./location.js";

function getTripDays(startDate, endDate) {
  const days = [];
  if (!startDate || !endDate || endDate < startDate) return days;
  let current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (current <= end) {
    days.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function hasTaskEveryTripDay(trip) {
  if (!trip || !trip.start_date || !trip.end_date || !Array.isArray(trip.tasks))
    return false;
  const requiredDays = getTripDays(trip.start_date, trip.end_date);
  const taskDates = new Set(
    trip.tasks
      .map((task) => String(task.task_date || "").trim())
      .filter(Boolean),
  );
  return requiredDays.every((date) => taskDates.has(date));
}

const params = new URLSearchParams(location.search);
const tripId = Number(params.get("id"));
const alertEl = document.getElementById("alert");
const VALID_TRIP_VIEWS = new Set(["geral", "tarefa", "veiculos", "relatorio"]);


let monitorMetricsTimer = null;

function currentTripView() {
  const view = new URLSearchParams(window.location.search).get("view") || "geral";
  return VALID_TRIP_VIEWS.has(view) ? view : "geral";
}

function setTripViewUrl(view, replace = false) {
  const next = new URLSearchParams(window.location.search);
  next.set("id", String(tripId));
  next.set("view", view);
  const url = `${window.location.pathname}?${next.toString()}`;
  window.history[replace ? "replaceState" : "pushState"]({ view }, "", url);
}

function updateTripView(view) {
  document.querySelectorAll("[data-trip-panel]").forEach((panel) => {
    panel.classList.toggle("hidden-fields", panel.dataset.tripPanel !== view);
  });
  document.querySelectorAll("[data-trip-view]").forEach((tab) => {
    const active = tab.dataset.tripView === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-current", active ? "page" : "false");
  });
  const leaderDemandButton = document.getElementById("btn-demanda-lider-wrap");
  if (leaderDemandButton) leaderDemandButton.classList.toggle("hidden-fields", view !== "veiculos");
  const vehiclesTab = document.getElementById("trip-vehicles-tab");
  const user = window.__currentUser || {};
  const managesDemands = Boolean(user.is_admin || user.is_admin_master || user.is_sector_leader || String(user.position_title || '').trim().toLowerCase() === 'líder');
  if (vehiclesTab) vehiclesTab.textContent = managesDemands ? "Veículos e fornecer demandas" : "Veículos";
}

function updateReportIndicator(trip) {
  const indicator = document.querySelector(".trip-tab-indicator");
  if (!indicator) return;
  const pending = trip?.status === "completed" && !trip?.checklist?.is_complete;
  indicator.classList.toggle("hidden-fields", !pending);
}

function renderReportPreview(trip) {
  const preview = document.getElementById("trip-report-preview");
  const button = document.getElementById("btn-trip-report");
  if (!preview || !button) return;
  const canReport = trip?.status === "completed";
  button.disabled = !canReport;
  button.title = canReport
    ? "Gerar relatório em PDF"
    : "O relatório só pode ser gerado após a conclusão da viagem";
  if (typeof window.TripReport?.buildAndRender !== "function") {
    preview.innerHTML = '<div class="empty-state">O relatório ainda está carregando.</div>';
    return;
  }
  const html = window.TripReport.buildAndRender(trip);
  preview.innerHTML = `<iframe title="Pré-visualização do relatório" class="trip-report-frame"></iframe>`;
  const frame = preview.querySelector("iframe");
  if (frame) frame.srcdoc = html;
}

async function navigateTripView(view, { updateHistory = true } = {}) {
  const nextView = VALID_TRIP_VIEWS.has(view) ? view : "geral";
  if (updateHistory) setTripViewUrl(nextView);
  updateTripView(nextView);
  try {
    const [response, typesResponse] = await Promise.all([
      api.getTrip(tripId),
      api.workTypes({ trip_id: tripId }),
    ]);
    const trip = response.trip;
    fillWorkTypes(typesResponse.work_types || []);
    renderTrip(trip);
    setupLocationMonitor(trip);
    const editBtn = document.getElementById("btn-edit-trip");
    if (editBtn) editBtn.textContent = trip.status === "completed" ? "Editar checklist" : "Editar viagem";
    setupPanelToggles();
    setupNewTaskMenu();
    updateTripView(nextView);
    const taskFormWrap = document.getElementById("task-form-wrap");
    if (taskFormWrap) taskFormWrap.classList.toggle("hidden-fields", nextView !== "tarefa");
    if (nextView === "tarefa") configureTaskEntryMode("task");
    if (nextView === "veiculos") {
      await renderTripVehicles(document.getElementById("trip-vehicles-container"), trip, window.__currentUser, { alertEl });
    }
    updateReportIndicator(trip);
    if (nextView === "relatorio") renderReportPreview(trip);
  } catch (error) {
    showAlert(alertEl, error.message || "Não foi possível carregar a viagem.");
  }
}

function setupTripRouter() {
  document.querySelectorAll("[data-trip-view]").forEach((tab) => {
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      navigateTripView(tab.dataset.tripView);
    });
  });
  window.addEventListener("popstate", () => navigateTripView(currentTripView(), { updateHistory: false }));
  const view = currentTripView();
  const rawView = new URLSearchParams(window.location.search).get("view");
  if (!rawView || !VALID_TRIP_VIEWS.has(rawView)) setTripViewUrl(view, true);
  navigateTripView(view, { updateHistory: false });
}

function setupNewTaskMenu() {
  const menu = document.getElementById("task-entry-menu");
  const trigger = document.getElementById("btn-new-task");
  const options = document.getElementById("task-entry-options");
  const formWrap = document.getElementById("task-form-wrap");
  if (!menu || !trigger || !options || !formWrap || menu.dataset.bound) return;
  menu.dataset.bound = "true";

  const closeOptions = () => {
    options.classList.add("hidden-fields");
    trigger.setAttribute("aria-expanded", "false");
  };

  trigger.addEventListener("click", () => {
    const isClosed = options.classList.contains("hidden-fields");
    if (isClosed && options.parentElement !== document.body) {
      document.body.appendChild(options);
    }
    options.classList.toggle("hidden-fields", !isClosed);
    trigger.setAttribute("aria-expanded", String(isClosed));
  });

  options.addEventListener("click", (event) => {
    if (event.target === options) closeOptions();
  });

  options.querySelectorAll("[data-task-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.taskMode || "task";
      closeOptions();
      formWrap.classList.remove("hidden-fields");
      configureTaskEntryMode(mode);
      prepareTaskForm(window.__currentTrip, { clearDate: false });
      formWrap.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOptions();
  });
}

function updateLocationMonitorStatus(trip, extra = {}) {
  const statusEl = document.getElementById('location-monitor-status');
  const panelEl = document.getElementById('location-monitor-panel');
  const metricsEl = document.getElementById('loc-last-checkin');
  const metricsWrap = document.getElementById('location-monitor-metrics');
  if (!statusEl || !panelEl) return;

  panelEl.classList.remove('hidden-fields');

  const consent = getLocationConsent(tripId);

  if (!trip || trip.status !== 'in_progress') {
    panelEl.classList.add('hidden-fields');
    return;
  }

  statusEl.className = 'alert';
  if (extra.error) {
    statusEl.classList.add('alert-error');
    statusEl.textContent = String(extra.error);
  } else if (isMonitoringActive(tripId)) {
    statusEl.classList.add('alert-success');
    statusEl.textContent = '🟢 Monitoramento ativo — sua localização está sendo compartilhada com o Mapa Operacional.';
    if (metricsWrap) metricsWrap.classList.remove('hidden-fields');
  } else if (consent === true) {
    statusEl.classList.add('alert-warning');
    statusEl.textContent = 'Compartilhamento ativado, aguardando primeira leitura de localização…';
  } else if (consent === false) {
    statusEl.classList.add('alert-info');
    statusEl.textContent = 'Compartilhamento desativado. Ligue o toggle acima se quiser participar do Mapa Operacional.';
  } else {
    statusEl.classList.add('alert-info');
    statusEl.textContent = 'Ative o compartilhamento para enviar sua posição durante esta viagem.';
  }

  if (metricsEl) {
    try {
      const key = `cto_last_checkin_${tripId}`;
      const raw = localStorage.getItem(key);
      const last = raw ? JSON.parse(raw) : null;
      if (last?.at) {
        const d = new Date(last.at);
        metricsEl.textContent = `Último check-in: ${d.toLocaleString('pt-BR')} · Lat ${Number(last.latitude).toFixed(5)}, Lon ${Number(last.longitude).toFixed(5)}`;
      } else {
        metricsEl.textContent = 'Nenhum check-in registrado ainda nesta viagem.';
      }
    } catch {}
  }
}

function pxToPt(v) {
  const n = parseFloat(v);
  if (Number.isNaN(n)) return v;
  return (n * 0.75).toFixed(2).replace(/\.?0+$/, "") + "pt";
}

function keepColor(c) {
  if (!c) return "";
  if (c.startsWith("#") || c.startsWith("rgb")) return c;
  return String(c);
}

function applyWordInlineStyles(rootEl) {
  if (!rootEl) return;

  const bgEls = rootEl.querySelectorAll(".card, .card--highlight, .card__priority-ribbon, .badge, .badge--ok, .badge--pending, .task-card__status-badge, .task-card__status-badge--done, .task-card__status-badge--pending, .long-field__value, .long-field--pending .long-field__value, .task-card__summary p, .task-card__pending p, .responsor-tag, .user-schedule-block, .report-footer, .report-footer td, .empty, .table th, .card__subtitle--accent, .signatures-wrap, .signatures-table, .signature-block, .signature-line-simple");
  for (const el of bgEls) {
    try {
      const cs = window.getComputedStyle(el);
      const tag = (el.tagName || "").toLowerCase();
      let inline = el.getAttribute("style") || "";

      const hasBg = cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
      if (hasBg) {
        const c = keepColor(cs.backgroundColor);
        inline += `background-color:${c};background:${c};mso-highlight:${c};`;
      }

      if (cs.color) inline += `color:${keepColor(cs.color)};`;

      if (cs.paddingTop || cs.paddingRight || cs.paddingBottom || cs.paddingLeft) {
        inline += `padding:${pxToPt(cs.paddingTop||"0")} ${pxToPt(cs.paddingRight||"0")} ${pxToPt(cs.paddingBottom||"0")} ${pxToPt(cs.paddingLeft||"0")};`;
      }

      const hasBorder = (s) => s && s !== "0px none rgb(0, 0, 0)" && s !== "medium none currentColor" && !s.includes("none");
      ["Top","Bottom","Left","Right"].forEach((side) => {
        const lc = side.toLowerCase();
        if (hasBorder(cs[`border${side}Style`]) || hasBorder(cs[`border${side}`])) {
          const w = pxToPt(cs[`border${side}Width`]);
          const color = keepColor(cs[`border${side}Color`]);
          const style = (cs[`border${side}Style`] || "solid").toLowerCase();
          inline += `border-${lc}:${w} ${style} ${color};mso-border-${lc}-alt:${style} ${color} ${w};`;
        }
      });

      if (tag === "table") inline += `border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;`;
      if (tag === "th" || tag === "td") inline += `vertical-align:${cs.verticalAlign||"top"};`;

      if (inline) el.setAttribute("style", inline);
    } catch (e) {}
  }

  const textEls = rootEl.querySelectorAll("h1, h2, h3, h4, .report-code, .card__title, .card__subtitle, .info-block__label, .info-block__value, .long-field__label, .task-card__worktype, .task-card__index, .task-card__date, .task-card__time, .task-card__row-label, .task-card__summary-label, .task-card__pending-label, .user-schedule-block__name, .user-schedule-block__meta, .day-schedule__date, .day-schedule__slots, .signature-placeholder, .signature-label, .signature-date-field, .report-footer td, .badge, .card__priority-ribbon, .task-card__status-badge, .table th, .text-muted-sub, .text--pending");
  for (const el of textEls) {
    try {
      const cs = window.getComputedStyle(el);
      const tag = (el.tagName || "").toLowerCase();
      let inline = el.getAttribute("style") || "";
      if (cs.fontFamily) inline += `font-family:${cs.fontFamily};`;
      if (cs.fontSize) inline += `font-size:${pxToPt(cs.fontSize)};mso-ansi-font-size:${pxToPt(cs.fontSize)};`;
      if (cs.fontWeight) inline += `font-weight:${cs.fontWeight};`;
      if (cs.color) inline += `color:${keepColor(cs.color)};`;
      if (cs.textAlign && tag !== "span") inline += `text-align:${cs.textAlign};`;
      if (cs.letterSpacing && cs.letterSpacing !== "normal") inline += `letter-spacing:${cs.letterSpacing};`;
      if (cs.textTransform && cs.textTransform !== "none") inline += `text-transform:${cs.textTransform};`;
      if (cs.whiteSpace && cs.whiteSpace !== "normal") inline += `white-space:${cs.whiteSpace};`;
      if (inline) el.setAttribute("style", inline);
    } catch (e) {}
  }

  const imgs = rootEl.querySelectorAll("img");
  for (const img of imgs) {
    try {
      let s = img.getAttribute("style") || "";
      s += "display:block;vertical-align:middle;";
      img.setAttribute("style", s);
    } catch (e) {}
  }

  const taskCards = rootEl.querySelectorAll(".task-card--done, .task-card--pending");
  for (const el of taskCards) {
    try {
      const cs = window.getComputedStyle(el);
      let inline = el.getAttribute("style") || "";
      const leftW = pxToPt(cs.borderLeftWidth || "1px");
      const leftC = keepColor(cs.borderLeftColor);
      inline += `border-left:${leftW} solid ${leftC};mso-border-left-alt:solid ${leftC} ${leftW};`;
      el.setAttribute("style", inline);
    } catch (e) {}
  }
}

function fallbackWordCSS() {
  return `
@page Section1 { size: 21cm 29.7cm; margin: 15mm 18mm 15mm 18mm; mso-page-orientation: portrait; }
div.Section1 { page: Section1; }
* { box-sizing: border-box; }
body { font-family: "Calibri", Arial, sans-serif; color: #111827; font-size: 11pt; line-height: 1.55; margin: 0; padding: 0; background: #fff; }
.page { width: 100%; max-width: 100%; padding: 0; margin: 0 auto; background: #fff; }
.report-header { width: 100%; border-collapse: collapse; margin-bottom: 24pt; }
.report-header td { vertical-align: middle; padding: 0; }
.report-header__logo { width: 80pt; padding-right: 12pt; }
.report-header__logo-wrap img { width: 56pt; height: 56pt; display: block; }
.report-header__title-cell { text-align: center; }
.report-header__title-cell h1 { margin: 0 0 8pt; font-size: 22pt; font-weight: 800; color: #0f172a; }
.report-header__divider { height: 3pt; background: #2563eb; border-radius: 2pt; }
.report-header__code-cell { width: 80pt; text-align: right; padding-left: 10pt; }
.report-code { font-size: 11pt; font-weight: 700; color: #0f172a; margin-bottom: 6pt; }
.badge { display: inline-block; padding: 3pt 9pt; border-radius: 999pt; font-size: 9pt; font-weight: 600; background: #e5e7eb; color: #374151; border: 1pt solid #d1d5db; }
.badge--ok { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
.badge--pending { background: #fef3c7; color: #92400e; border-color: #fde68a; }
.card { border: 1pt solid #d1d5db; border-radius: 9pt; padding: 14pt 16pt; margin-bottom: 14pt; }
.card__title { font-size: 14pt; margin: 0 0 12pt; color: #0f172a; font-weight: 700; padding-bottom: 10pt; border-bottom: 1pt solid #e5e7eb; }
.card__subtitle { font-size: 11pt; margin: 15pt 0 8pt; color: #0f172a; font-weight: 700; }
.info-block { margin: 0; padding: 7pt 0; border-bottom: 1pt solid #f1f5f9; }
.info-block__label { font-size: 12pt; font-weight: 700; color: #0f172a; display: inline; }
.info-block__value { font-size: 12pt; font-weight: 500; color: #1e293b; display: inline; margin-left: 4pt; }
.two-col-table { width: 100%; border-collapse: collapse; }
.two-col-table td { width: 50%; padding: 0; vertical-align: top; }
.two-col-table td:last-child .info-block { padding-left: 16pt; border-left: 1pt solid #f1f5f9; }
.long-field { margin-top: 11pt; }
.long-field__label { font-size: 9pt; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 4pt; }
.long-field__value { font-size: 11pt; margin: 0; padding: 8pt 10pt; border: 1pt solid #e5e7eb; border-radius: 5pt; white-space: pre-wrap; line-height: 1.6; }
.table { width: 100%; border-collapse: collapse; margin-top: 8pt; }
.table th, .table td { text-align: left; padding: 8pt 10pt; border-bottom: 1pt solid #e5e7eb; font-size: 10pt; }
.table th { color: #6b7280; font-weight: 600; font-size: 9pt; text-transform: uppercase; background: #f8fafc; }
.task-card { border: 1pt solid #d1d5db; border-radius: 8pt; padding: 11pt 12pt; margin-bottom: 10pt; }
.task-card--done { border-left: 3.5pt solid #166534; }
.task-card--pending { border-left: 3.5pt solid #d97706; }
.signatures-wrap { page-break-before: auto; padding-top: 0; margin-top: 200pt; background:#fff; page-break-inside: avoid; }
.signatures-table { width: 100%; border-collapse: collapse; border:0; background:#fff; }
.signature-block { width: 50%; text-align: center; vertical-align: top; padding: 0 24pt 50pt 24pt; background:#fff; border:0 !important; }
.signature-block--last { padding: 0 10pt 50pt 40pt; }
.signature-line-simple { border: 0; border-top: 1pt solid #0f172a; width: 100%; margin: 0 auto 14pt auto; height:1pt; background:#fff; }
.signature-placeholder { font-weight: 700; font-size: 14pt; color: #0f172a; line-height: 1.3; }
.signature-label { font-size: 11pt; font-weight: 600; color: #0f172a; margin-top: 6pt; letter-spacing: 0.04em; }
.signature-date-field { font-size: 10pt; color: #6b7280; margin-top: 20pt; font-weight: 500; }
.report-footer { width: 100%; border-collapse: collapse; margin-top: 28pt; background: #0f172a; border-radius: 8pt 8pt 0 0; }
.report-footer td { padding: 12pt 16pt; font-size: 9pt; background: #0f172a; color: #e2e8f0; }
.report-footer__mark-wrap img { width: 29pt; height: 29pt; display: block; }
`;
}

function showReportExportOptions(reportBlob) {
  const existing = document.getElementById("report-export-modal");
  existing?.remove();

  const previewUrl = URL.createObjectURL(
    new Blob([reportBlob], { type: "text/html;charset=utf-8" }),
  );

  const modal = document.createElement("div");
  modal.id = "report-export-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="report-export-title">
      <div class="modal-head">
        <div class="modal-icon info">📄</div>
        <div>
          <h3 id="report-export-title" class="modal-title">Relatório de viagem pronto</h3>
          <p class="modal-text">Prévia abaixo. Escolha uma opção para visualizar ou exportar.</p>
        </div>
      </div>
      <div class="modal-body">
        <div class="report-preview-frame-wrap">
          <iframe class="report-preview-frame" src="${previewUrl}" title="Prévia do relatório"></iframe>
        </div>
      </div>
      <div class="modal-footer modal-footer--spread">
        <button type="button" class="btn btn-secondary" data-export="preview">
          🔍 Abrir em nova aba
        </button>
        <button type="button" class="btn btn-secondary" data-export="word">
          📝 Exportar Word
        </button>
        <button type="button" class="btn btn-primary" data-export="pdf">
          📑 Exportar PDF
        </button>
        <button type="button" class="btn btn-ghost" data-export="cancel">Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => {
    URL.revokeObjectURL(previewUrl);
    modal.remove();
  };
  modal.querySelector('[data-export="cancel"]').addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });

  modal.querySelector('[data-export="preview"]').addEventListener("click", () => {
    const win = window.open(previewUrl, "_blank");
    if (!win) showAlert(alertEl, "O navegador bloqueou a abertura. Permita pop-ups para este site.");
  });

  modal.querySelector('[data-export="word"]').addEventListener("click", () => {

    (async () => {
      try {
        let reportHTML;
        if (typeof reportBlob === "string") {
          reportHTML = reportBlob;
        } else if (reportBlob instanceof Blob || (reportBlob && typeof reportBlob.arrayBuffer === "function")) {
          const buf = await reportBlob.arrayBuffer();
          reportHTML = new TextDecoder("utf-8").decode(buf);
        } else if (reportBlob && reportBlob.byteLength !== undefined) {
          reportHTML = new TextDecoder("utf-8").decode(reportBlob);
        } else {
          reportHTML = String(reportBlob);
        }
        const A4_WIDTH_PX = 794;
        const MARGIN_MM = 14;
        const MARGIN_PX_LEFT_RIGHT = Math.round((MARGIN_MM / 25.4) * 96 * 2);
        const CONTENT_W = Math.max(680, A4_WIDTH_PX - MARGIN_PX_LEFT_RIGHT);

        const stageId = "word-render-stage";
        document.getElementById(stageId)?.remove();

        const stage = document.createElement("div");
        stage.id = stageId;
        Object.assign(stage.style, {
          position: "absolute",
          left: "0",
          top: "0",
          width: `${CONTENT_W}px`,
          height: "auto",
          background: "#ffffff",
          zIndex: "999998",
          margin: "0",
          padding: "0",
          pointerEvents: "none",
          overflow: "visible",
          opacity: "0",
          visibility: "hidden",
          transform: "none",
        });
        document.body.appendChild(stage);
        document.body.style.overflow = "hidden";
        stage.innerHTML = reportHTML;
        const pageEl = stage.querySelector(".page");
        if (!pageEl) throw new Error("Falha ao montar o relatório para Word.");

        pageEl.style.width = `${CONTENT_W}px`;
        pageEl.style.maxWidth = `${CONTENT_W}px`;
        pageEl.style.minWidth = `${CONTENT_W}px`;
        pageEl.style.margin = "0 auto";
        pageEl.style.background = "#ffffff";
        pageEl.style.display = "block";
        pageEl.style.boxSizing = "border-box";
        stage.style.width = `${CONTENT_W + 40}px`;
        stage.style.padding = "0 20px";
        stage.style.overflow = "visible";

        const svgEls = stage.querySelectorAll("svg");
        svgEls.forEach((svg) => {
          try {
            svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            let w = svg.getAttribute("width") || svg.clientWidth || svg.viewBox?.baseVal?.width || 64;
            let h = svg.getAttribute("height") || svg.clientHeight || svg.viewBox?.baseVal?.height || 64;
            w = parseFloat(w) || 64;
            h = parseFloat(h) || 64;
            svg.setAttribute("width", `${w}`);
            svg.setAttribute("height", `${h}`);
            svg.style.width = `${w}px`;
            svg.style.height = `${h}px`;
            svg.style.display = "block";
          } catch {}
        });

        const allImgs = stage.querySelectorAll("img");
        await Promise.all([...allImgs].map((img) =>
          img.complete ? Promise.resolve() :
          new Promise((res) => { img.onload = res; img.onerror = res; setTimeout(res, 1500); })
        ));

        if (document.fonts?.ready) {
          try { await document.fonts.ready; } catch {}
        }
        await new Promise((resolve) => setTimeout(resolve, 1100));

        stage.style.visibility = "visible";
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const svgsToReplace = stage.querySelectorAll("svg");
        for (const svg of svgsToReplace) {
          try {
            const w = parseFloat(svg.getAttribute("width") || svg.style.width || "64");
            const h = parseFloat(svg.getAttribute("height") || svg.style.height || "64");
            const clone = svg.cloneNode(true);
            clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            clone.setAttribute("width", w);
            clone.setAttribute("height", h);
            const svgString = new XMLSerializer().serializeToString(clone);
            const svgEncoded = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
            const pngData = await new Promise((resolve, reject) => {
              const img = new Image();
              const timeout = setTimeout(() => reject(new Error("svg timeout")), 4000);
              img.onload = () => {
                clearTimeout(timeout);
                try {
                  const canvas = document.createElement("canvas");
                  const scale = 2;
                  canvas.width = w * scale;
                  canvas.height = h * scale;
                  const ctx = canvas.getContext("2d");
                  ctx.fillStyle = "#ffffff";
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  resolve(canvas.toDataURL("image/png"));
                } catch (e) { reject(e); }
              };
              img.onerror = () => { clearTimeout(timeout); reject(new Error("svg render")); };
              img.crossOrigin = "anonymous";
              img.src = svgEncoded;
            });
            const imgEl = document.createElement("img");
            imgEl.src = pngData;
            imgEl.width = Math.round(w);
            imgEl.height = Math.round(h);
            imgEl.style.width = `${w}px`;
            imgEl.style.height = `${h}px`;
            imgEl.style.display = "block";
            imgEl.style.verticalAlign = "middle";
            svg.parentNode.replaceChild(imgEl, svg);
          } catch (err) {
            svg.remove();
          }
        }

        applyWordInlineStyles(pageEl);
        const pageHTML = pageEl.innerHTML;
        const reportStyles = (window.TripReport?.wordCSS && window.TripReport.wordCSS()) || fallbackWordCSS();

        const wordHTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta http-equiv="Content-Style-Type" content="text/css">
<title>Relatório de Viagem — TRIP-${tripId}</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
  <w:DoNotOptimizeForBrowser/>
  <w:SaveIfXMLInvalid>false</w:SaveIfXMLInvalid>
  <w:IgnoreMixedContent>true</w:IgnoreMixedContent>
  <w:AlwaysShowPlaceholderText>false</w:AlwaysShowPlaceholderText>
  <w:Compatibility>
    <w:BreakWrappedTables/>
    <w:SnapToGridInCell/>
    <w:WrapTextWithPunct/>
    <w:UseAsianBreakRules/>
    <w:DontGrowAutofit/>
    <w:UseFELayout/>
  </w:Compatibility>
  <w:BrowserLevel>MicrosoftInternet Explorer4</w:BrowserLevel>
</w:WordDocument>
</xml>
<![endif]-->
<style type="text/css">
${reportStyles}
body { background:#ffffff !important; }
div.Section1, div.page { background:#ffffff !important; }
td, th, div, span, p { orphans:3; widows:3; }
</style>
</head>
<body lang="pt-BR" style="margin:0;padding:0;background:#ffffff;color:#111827;">
<div class="Section1">
<div class="page">
${pageHTML}
</div>
</div>
</body>
</html>`;

        const wordBlob = new Blob(["\ufeff", wordHTML], { type: "application/msword" });
        const url = URL.createObjectURL(wordBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `relatorio-viagem-${tripId}.doc`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        document.getElementById(stageId)?.remove();
        document.body.style.overflow = "";
        close();
      } catch (error) {
        console.error(error);
        showAlert(alertEl, error.message || "Não foi possível exportar o Word.");
        document.getElementById("word-render-stage")?.remove();
        document.body.style.overflow = "";
      }
    })();
  });

  modal.querySelector('[data-export="pdf"]').addEventListener("click", () => {
    if (typeof window.html2pdf !== "function") {
      showAlert(alertEl, "O exportador PDF ainda está carregando. Tente novamente.");
      return;
    }

    (async () => {
      try {
        let reportHTML;
        if (typeof reportBlob === "string") {
          reportHTML = reportBlob;
        } else if (reportBlob instanceof Blob || (reportBlob && typeof reportBlob.arrayBuffer === "function")) {
          const buf = await reportBlob.arrayBuffer();
          reportHTML = new TextDecoder("utf-8").decode(buf);
        } else if (reportBlob && reportBlob.byteLength !== undefined) {
          reportHTML = new TextDecoder("utf-8").decode(reportBlob);
        } else {
          reportHTML = String(reportBlob);
        }
        const A4_WIDTH_PX = 794;
        const MARGIN_MM = 14;
        const MARGIN_PX_LEFT_RIGHT = Math.round((MARGIN_MM / 25.4) * 96 * 2);
        const CONTENT_W = Math.max(680, A4_WIDTH_PX - MARGIN_PX_LEFT_RIGHT);

        const stage = document.createElement("div");
        stage.id = "pdf-render-stage";
        Object.assign(stage.style, {
          position: "absolute",
          left: "0",
          top: "0",
          width: `${CONTENT_W}px`,
          height: "auto",
          background: "#ffffff",
          zIndex: "999999",
          margin: "0",
          padding: "0",
          pointerEvents: "none",
          overflow: "visible",
          opacity: "0",
          visibility: "hidden",
          transform: "none",
        });
        document.body.appendChild(stage);
        document.body.style.overflow = "hidden";
        stage.innerHTML = reportHTML;
        const pageEl = stage.querySelector(".page");
        if (!pageEl) throw new Error("Falha ao montar o relatório para PDF.");

        pageEl.style.width = `${CONTENT_W}px`;
        pageEl.style.maxWidth = `${CONTENT_W}px`;
        pageEl.style.minWidth = `${CONTENT_W}px`;
        pageEl.style.margin = "0 auto";
        pageEl.style.background = "#ffffff";
        pageEl.style.display = "block";
        pageEl.style.boxSizing = "border-box";
        stage.style.width = `${CONTENT_W + 40}px`;
        stage.style.padding = "0 20px";
        stage.style.overflow = "visible";

        const svgEls = stage.querySelectorAll("svg");
        svgEls.forEach((svg) => {
          try {
            svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            let w = svg.getAttribute("width") || svg.clientWidth || svg.viewBox?.baseVal?.width || 64;
            let h = svg.getAttribute("height") || svg.clientHeight || svg.viewBox?.baseVal?.height || 64;
            w = parseFloat(w) || 64;
            h = parseFloat(h) || 64;
            svg.setAttribute("width", `${w}`);
            svg.setAttribute("height", `${h}`);
            svg.style.width = `${w}px`;
            svg.style.height = `${h}px`;
            svg.style.display = "block";
          } catch {}
        });

        const allImgs = stage.querySelectorAll("img");
        await Promise.all([...allImgs].map((img) =>
          img.complete ? Promise.resolve() :
          new Promise((res) => { img.onload = res; img.onerror = res; setTimeout(res, 1500); })
        ));

        if (document.fonts?.ready) {
          try { await document.fonts.ready; } catch {}
        }
        await new Promise((resolve) => setTimeout(resolve, 1100));

        const finalHeight = Math.max(1123, pageEl.scrollHeight + 200);
        stage.style.height = `${finalHeight}px`;
        stage.style.visibility = "visible";
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        await window.html2pdf().set({
          margin: [MARGIN_MM, MARGIN_MM, MARGIN_MM, MARGIN_MM],
          filename: `relatorio-viagem-${tripId}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            letterRendering: true,
            logging: false,
            allowTaint: true,
            foreignObjectRendering: false,
            removeContainer: false,
            ignoreElements: (el) => el.tagName && el.tagName.toLowerCase() === "script",
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: {
            mode: ["css"],
            avoid: [".card", ".task-card", ".user-schedule-block", ".report-footer", ".signatures"],
          },
        }).from(pageEl).save();

        document.getElementById("pdf-render-stage")?.remove();
        document.body.style.overflow = "";
        close();
      } catch (error) {
        console.error(error);
        showAlert(alertEl, error.message || "Não foi possível exportar o PDF.");
        document.getElementById("pdf-render-stage")?.remove();
        document.body.style.overflow = "";
      }
    })();
  });
}

function setupLocationMonitor(trip) {
  if (!trip) return;
  if (trip.status !== 'in_progress') {
    return;
  }

  setLocationConsent(tripId, true);
  const consent = true;

  if (consent === true && !isMonitoringActive(tripId)) {
    startTripLocationMonitor(tripId, {
      intervalMs: 4 * 60 * 1000,
      loadTrip: () => api.getTrip(tripId).then((r) => r.trip),
      onTripEnded: () => {
        stopTripLocationMonitor(tripId, { notify: true, alertEl, showAlertFn: showAlert });
        updateLocationMonitorStatus(trip);
      },
    });
  }

  updateLocationMonitorStatus(trip);

  if (monitorMetricsTimer) clearInterval(monitorMetricsTimer);
  monitorMetricsTimer = setInterval(() => updateLocationMonitorStatus(trip), 15000);
}


function applyDemandCompletionOptimisticUpdate(trip, payload) {
  if (!trip || !payload || !payload.demanda_atividade_id) return trip;

  const nextTrip = JSON.parse(JSON.stringify(trip || {}));
  const atividadeId = Number(payload.demanda_atividade_id);
  const selectedResponsibleIds = Array.isArray(payload.responsible_ids)
    ? payload.responsible_ids.map(Number).filter(Boolean)
    : [];
  const selectedResponsibleNames = selectedResponsibleIds
    .map((id) => (nextTrip.members || []).find((member) => Number(member.user_id || member.id) === id)?.full_name)
    .filter(Boolean);
  const completionLabel = selectedResponsibleNames.length
    ? selectedResponsibleNames.join(', ')
    : window.__currentUser?.full_name || 'Você';
  let updated = false;

  for (const demanda of nextTrip.demandas || []) {
    for (const veiculo of demanda.veiculos || []) {
      for (const atividade of veiculo.atividades || []) {
        if (Number(atividade.id) !== atividadeId) continue;

        atividade.status = 'concluida';
        atividade.concluida_nome = completionLabel;
        atividade.concluida_em = new Date().toISOString();
        updated = true;

        const todas = (veiculo.atividades || []).map((item) => item.status);
        const concluidas = todas.filter((status) => status === 'concluida').length;
        const total = todas.length || 1;
        demanda.status = concluidas >= total ? 'concluida' : 'em_andamento';
      }
    }
  }

  return nextTrip;
}

async function init() {
  if (!tripId) {
    window.location.href = "index.html";
    return;
  }
  const user = await mountShell({ active: "dashboard" });
  if (!user) return;
  window.__currentUser = user;

  setupTripRouter();

  document.getElementById('btn-trip-history')?.addEventListener('click', () => {
    window.location.href = `trip-history.html?id=${tripId}`;
  });
  document.getElementById('btn-trip-report')?.addEventListener('click', () => {
    if (window.__currentTrip?.status !== "completed") return;
    try {
      if (typeof window.TripReport?.buildAndRender !== "function") {
        throw new Error("O renderizador de relatórios ainda está carregando. Tente novamente.");
      }
      const html = window.TripReport.buildAndRender(window.__currentTrip);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      showReportExportOptions(blob);
    } catch (error) {
      showAlert(alertEl, error.message || "Não foi possível gerar o relatório.");
    }
  });
}

document.getElementById("task-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert(alertEl);
  const btn = document.getElementById("btn-save-task");
  if (btn) btn.disabled = true;

  try {
    const trip = window.__currentTrip;
    const payload = taskFormPayload();
    const personalConflict = hasPersonalTaskConflict(payload);
    const confirmedPersonalConflict = hasConfirmedPersonalTaskConflict(payload);
    const validation = validateTaskTimeAvailability(
      trip,
      payload.task_date,
      payload.start_time,
      payload.end_time,
      payload.responsible_ids,
      confirmedPersonalConflict,
    );

    if (!validation.ok) {
      showAlert(alertEl, validation.message);
      alertEl?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (
      personalConflict && !confirmedPersonalConflict
    ) {
      showAlert(
        alertEl,
        "Há sobreposição com uma tarefa sua. Ajuste o horário ou o responsável para continuar.",
        "warning",
      );
      alertEl?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    payload.allow_conflict = confirmedPersonalConflict;

    const res = await api.addTask(tripId, payload);
    const optimisticTrip = applyDemandCompletionOptimisticUpdate(window.__currentTrip, payload);
    if (optimisticTrip && optimisticTrip !== window.__currentTrip) {
      window.__currentTrip = optimisticTrip;
    }
    const freshTripRes = await api.getTrip(tripId);
    const freshTrip = applyDemandCompletionOptimisticUpdate(
      freshTripRes?.trip || optimisticTrip || res.trip,
      payload,
    );
    window.__currentTrip = freshTrip;
    renderTrip(freshTrip);
    setupPanelToggles();
    setupNewTaskMenu();
    prepareTaskForm(freshTrip, { keepDate: true });
    showAlert(alertEl, "Tarefa salva com sucesso.", "success");

    const taskId = res.task_id || (freshTrip?.tasks || []).slice(-1)[0]?.id || null;
    if (taskId && getLocationConsent(tripId) === true) {
      registrarCheckinTrabalho(taskId, { viagemId: tripId, silent: true })
        .then((r) => {
          if (r.ok) updateLocationMonitorStatus(res.trip || window.__currentTrip);
        })
        .catch(() => {});
    }

  } catch (err) {
    showAlert(alertEl, err.message);
    alertEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    if (btn) btn.disabled = false;
  }
});

document.getElementById("btn-complete")?.addEventListener("click", async () => {
  hideAlert(alertEl);
  const trip = window.__currentTrip;
  const valid = hasTaskEveryTripDay(trip);
  const confirmed = await confirmDialog({
    title: "Finalizar viagem",
    message: valid
      ? ""
      : "Só é possível finalizar quando cada dia do período tiver pelo menos uma tarefa registrada.",
    confirmLabel: "Finalizar",
    cancelLabel: "Cancelar",
    tone: valid ? "confirm" : "danger",
    confirmTone: valid ? "primary" : "danger",
  });
  if (!confirmed) return;
  try {
    stopTripLocationMonitor(tripId, { notify: false });
    const res = await api.completeTrip(tripId);
    renderTrip(res.trip);
    setupPanelToggles();
    showAlert(
      alertEl,
      "Viagem finalizada com sucesso! Compartilhamento de localização encerrado.",
      "success",
    );
    updateLocationMonitorStatus(res.trip);
    if (monitorMetricsTimer) {
      clearInterval(monitorMetricsTimer);
      monitorMetricsTimer = null;
    }
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});

document.addEventListener("click", async (e) => {
  const deleteBtn = e.target.closest("[data-del-task]");
  if (!deleteBtn) return;

  const id = deleteBtn.getAttribute("data-del-task");
  if (!id) return;

  const confirmed = await confirmDialog({
    title: "Excluir tarefa",
    message:
      "Deseja realmente excluir esta tarefa? Esta ação não pode ser desfeita.",
    confirmLabel: "Excluir",
    cancelLabel: "Cancelar",
    tone: "danger",
    confirmTone: "danger",
  });

  if (!confirmed) return;

  hideAlert(alertEl);
  try {
    const res = await api.deleteTask(tripId, id);
    renderTrip(res.trip);
    showAlert(alertEl, "Tarefa excluída.", "success");
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});

document.getElementById("btn-edit-trip")?.addEventListener("click", () => {
  const trip = window.__currentTrip;
  if (!trip) return;
  if (trip.status === "completed") {
    document
      .getElementById("task-form-wrap")
      ?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  window.location.href = `trip-new.html?id=${tripId}`;
});

document
  .getElementById("btn-delete-trip")
  ?.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: "Excluir viagem",
      message: "Deseja excluir esta viagem? Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      tone: "danger",
      confirmTone: "danger",
    });

    if (!confirmed) return;

    hideAlert(alertEl);
    try {
      await api.deleteTrip(tripId);
      showAlert(alertEl, "Viagem excluída com sucesso.", "success");
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1200);
    } catch (err) {
      showAlert(alertEl, err.message);
    }
  });

init();