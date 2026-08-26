import { api, requireAuthPage, initials, formatDateBR } from "./api.js";
import { mountShell } from "./layout.js";

let map = null;
const markersLayer = L.layerGroup();
const routesLayer = L.layerGroup();
let currentState = null;
let pollTimer = null;

const els = {
  mapa: () => document.getElementById("mapa"),
  filterViagem: () => document.getElementById("filter-viagem"),
  filterWorktype: () => document.getElementById("filter-worktype"),
  atividadeLista: () => document.getElementById("atividade-lista"),
  integrantesCount: () => document.getElementById("integrantes-count"),
  alertasTopo: () => document.getElementById("alertas-topo"),
  atualizadoEm: () => document.getElementById("atualizado-em"),
};

function statusDotClass(key) {
  switch (key) {
    case "EM_ANDAMENTO":
      return "status-em_andamento";
    case "PENDENTE":
      return "status-pendente";
    case "SEM_ATIVIDADE":
      return "status-sem_atividade";
    case "ATENCAO":
      return "status-atencao";
    default:
      return "status-sem_atividade";
  }
}

function statusBadgeColor(key) {
  switch (key) {
    case "EM_ANDAMENTO":
      return "#16a34a";
    case "PENDENTE":
      return "#ca8a04";
    case "SEM_ATIVIDADE":
      return "#2563eb";
    case "ATENCAO":
      return "#dc2626";
    default:
      return "#64748b";
  }
}

function formatTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function makeMarkerIcon(integrante) {
  const statusKey = integrante.status?.key || "SEM_ATIVIDADE";
  const color = statusBadgeColor(statusKey);

  const avatarUrl =
    integrante.avatar_url && integrante.avatar_url.startsWith("http")
      ? integrante.avatar_url
      : null;

  const photoHtml = avatarUrl
    ? `<img class="pin-photo" src="${avatarUrl}" style="border-color:${color};"
         onerror="this.style.display='none';this.nextElementSibling.style.display='grid';" />
       <span class="pin-initials" style="display:none;border-color:${color};">${initials(integrante.full_name)}</span>`
    : `<span class="pin-initials" style="border-color:${color};">${initials(integrante.full_name)}</span>`;

  return L.divIcon({
    className: "marker-pin",
    html: `
      <div class="avatar-pin" title="${integrante.full_name}">
        ${photoHtml}
        <span class="pin-dot" style="background:${color};"></span>
        <div class="pin-tail" style="border-top-color:${color};"></div>
      </div>
    `,
    iconSize: [46, 58],
    iconAnchor: [23, 58],
    popupAnchor: [0, -54],
  });
}

function makePopupHtml(integrante) {
  const v = integrante.viagem;
  const t = integrante.trabalho_atual;
  const m = integrante.metricas_dia;
  const loc = integrante.location;

  const headerNome = `<h4>${integrante.status?.badge || ""} ${integrante.full_name}</h4>
    <div style="font-size:12px;color:var(--muted);margin-bottom:2px;">
      ${integrante.position_title || "Integrante"} · ${integrante.sector || ""}
      ${integrante.employee_id ? ` · ${integrante.employee_id}` : ""}
    </div>`;

  const viagemHtml = v
    ? `
    <div class="p-section">
      <div class="p-label">Viagem</div>
      <div class="p-value">
        <strong>${v.origin || "—"}</strong> → <strong>${v.destination || "—"}</strong>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">
          ${formatDateBR(v.start_date)} a ${formatDateBR(v.end_date)}
        </div>
        ${v.reason ? `<div style="font-size:12px;color:var(--muted);margin-top:2px;">${v.reason}</div>` : ""}
      </div>
    </div>`
    : "";

  const atividadeHtml = t
    ? `
    <div class="p-section">
      <div class="p-label">Atividade atual</div>
      <div class="p-value">
        <div style="display:inline-flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="width:10px;height:10px;border-radius:999px;background:${statusBadgeColor(t.status_key)}"></span>
          <strong>${t.work_type}</strong>
          <span style="font-size:11px;color:var(--muted);">${t.status_label || ""}</span>
        </div>
        <div style="font-size:12.5px;color:var(--text-2);margin-top:2px;">
          ${t.summary || "—"}
        </div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:4px;">
          📍 ${t.location || "—"} · ⏰ ${t.start_time || "--:--"} às ${t.end_time || "--:--"}
        </div>
      </div>
    </div>`
    : `
    <div class="p-section">
      <div class="p-label">Atividade atual</div>
      <div class="p-value" style="color:var(--muted);font-style:italic;">Nenhuma atividade no momento.</div>
    </div>`;

  const metricasHtml = `
    <div class="p-section">
      <div class="p-label">Métricas do dia</div>
      <div class="metricas-grid">
        <div class="metrica">
          <div class="num">${m?.total_tarefas || 0}</div>
          <div class="lbl">Tarefas</div>
        </div>
        <div class="metrica">
          <div class="num">${m?.concluidas || 0}</div>
          <div class="lbl">Concluídas</div>
        </div>
        <div class="metrica">
          <div class="num" style="color:${(m?.pendentes || 0) + (m?.atencao || 0) > 0 ? "#dc2626" : "inherit"};">
            ${(m?.pendentes || 0) + (m?.atencao || 0)}
          </div>
          <div class="lbl">Pendentes</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px;">
        📍 Check-ins hoje: ${m?.checkins_hoje || 0}
        ${loc ? ` · Último: ${formatTime(loc.timestamp)}` : ""}
      </div>
    </div>`;

  const actionsHtml = `
    <div class="p-actions">
      ${v ? `<a class="primary" href="trip.html?id=${encodeURIComponent(v.id)}" target="_blank" rel="noopener">Ver viagem</a>` : ""}
      ${t && v ? `<a href="trip-task-edit.html?id=${encodeURIComponent(v.id)}&task_id=${encodeURIComponent(t.id)}" target="_blank" rel="noopener">Ver atividade</a>` : ""}
    </div>`;

  return `<div class="popup-body">${headerNome}${viagemHtml}${atividadeHtml}${metricasHtml}${actionsHtml}</div>`;
}

function renderFilters(state) {
  const viagemSel = els.filterViagem();
  const currentViagem = viagemSel.value;
  viagemSel.innerHTML = '<option value="">Todas as viagens ativas</option>';
  for (const t of state.trips || []) {
    const label = `${t.origin || "—"} → ${t.destination || "—"} (${formatDateBR(t.start_date)})`;
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = label;
    viagemSel.appendChild(opt);
  }
  if (
    currentViagem &&
    [...viagemSel.options].some((o) => o.value === currentViagem)
  ) {
    viagemSel.value = currentViagem;
  }

  const workSel = els.filterWorktype();
  const currentWork = workSel.value;
  workSel.innerHTML = '<option value="">Todos os tipos</option>';
  for (const wt of state.work_types || []) {
    const opt = document.createElement("option");
    opt.value = wt;
    opt.textContent = wt;
    workSel.appendChild(opt);
  }
  if (
    currentWork &&
    [...workSel.options].some((o) => o.value === currentWork)
  ) {
    workSel.value = currentWork;
  }
}

function getFilteredIntegrantes(state) {
  const viagemId = els.filterViagem().value;
  const workType = els.filterWorktype().value;
  let list = [...(state.integrantes || [])];
  if (viagemId) {
    list = list.filter((i) => String(i.viagem?.id) === String(viagemId));
  }
  if (workType) {
    list = list.filter(
      (i) =>
        i.trabalho_atual &&
        String(i.trabalho_atual.work_type) === String(workType),
    );
  }
  const orderKey = {
    ATENCAO: 0,
    PENDENTE: 1,
    EM_ANDAMENTO: 2,
    SEM_ATIVIDADE: 3,
  };
  list.sort((a, b) => {
    const ka = orderKey[a.status?.key] ?? 9;
    const kb = orderKey[b.status?.key] ?? 9;
    if (ka !== kb) return ka - kb;
    return String(a.full_name).localeCompare(String(b.full_name), "pt-BR");
  });
  return list;
}

function renderLista(state) {
  const lista = els.atividadeLista();
  const list = getFilteredIntegrantes(state);
  els.integrantesCount().textContent = list.length;

  if (!list.length) {
    lista.innerHTML =
      '<div class="empty-state">Nenhum integrante encontrado com os filtros selecionados.</div>';
    return;
  }

  lista.innerHTML = "";
  for (const i of list) {
    const item = document.createElement("div");
    item.className = "atividade-item";
    item.dataset.integrante_id = i.integrante_id;

    const avatarUrl = i.avatar_url;
    const avatarHtml =
      avatarUrl && avatarUrl.startsWith("http")
        ? `<img src="${avatarUrl}" style="width:36px;height:36px;border-radius:999px;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';" />
         <span class="avatar" style="display:none;">${initials(i.full_name)}</span>`
        : `<div class="avatar">${initials(i.full_name)}</div>`;

    const subText = i.trabalho_atual
      ? `${i.trabalho_atual.work_type} · ${i.viagem?.destination || "—"}`
      : i.viagem
        ? `${i.status?.label || ""} · ${i.viagem.destination || "—"}`
        : i.status?.label || "";

    item.innerHTML = `
      <div style="position:relative;">
        ${avatarHtml}
      </div>
      <div class="info">
        <div class="nome">${i.full_name}</div>
        <div class="sub">${subText}</div>
      </div>
      <div class="status-dot ${statusDotClass(i.status?.key)}" title="${i.status?.label || ""}"></div>
    `;

    item.addEventListener("click", () => {
      const coordinates = getIntegranteCoordinates(i);
      if (coordinates) {
        map.flyTo(coordinates, Math.max(map.getZoom(), 14), {
          duration: 0.9,
          easeLinearity: 0.25,
        });
        setTimeout(() => {
          const marker = markersByIntegrante.get(Number(i.integrante_id));
          if (marker) marker.openPopup();
        }, 700);
      } else {
        const all = [...markersByIntegrante.values()];
        if (all.length)
          map.flyToBounds(L.featureGroup(all).getBounds().pad(0.3), {
            duration: 0.8,
          });
      }
    });

    lista.appendChild(item);
  }
}

const markersByIntegrante = new Map();

<<<<<<< HEAD
function spreadOverlappingCoordinates(items) {
  const groups = new Map();
  const coordinatesById = new Map();

  for (const integrante of items) {
    const coordinates = getIntegranteCoordinates(integrante);
    if (!coordinates) continue;

    const key = coordinates.map((value) => value.toFixed(6)).join(",");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ integrante, coordinates });
  }

  for (const group of groups.values()) {
    const [latitude, longitude] = group[0].coordinates;
    const radius = 0.0012;

    group.forEach(({ integrante, coordinates }, index) => {
      if (group.length === 1) {
        coordinatesById.set(Number(integrante.integrante_id), coordinates);
        return;
      }

      const angle = (2 * Math.PI * index) / group.length - Math.PI / 2;
      const latitudeOffset = radius * Math.cos(angle);
      const longitudeOffset =
        (radius * Math.sin(angle)) /
        Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);
      coordinatesById.set(Number(integrante.integrante_id), [
        latitude + latitudeOffset,
        longitude + longitudeOffset,
      ]);
    });
  }

  return coordinatesById;
}

=======
>>>>>>> 8c9d75601380a49d4874ffccdd2dfb1c364a8bac
function getIntegranteCoordinates(integrante) {
  if (
    integrante.location &&
    Number.isFinite(integrante.location.latitude) &&
    Number.isFinite(integrante.location.longitude)
  ) {
    return [integrante.location.latitude, integrante.location.longitude];
  }

  const viagem = integrante.viagem;
  if (
    viagem &&
    Number.isFinite(viagem.destination_lat) &&
    Number.isFinite(viagem.destination_lng)
  ) {
    return [viagem.destination_lat, viagem.destination_lng];
  }

  return null;
}

function renderRotas(state) {
  routesLayer.clearLayers();
  const routePoints = [];

  for (const trip of state.trips || []) {
    const origin = [trip.origin_lat, trip.origin_lng];
    const destination = [trip.destination_lat, trip.destination_lng];
    if (!origin.every(Number.isFinite) || !destination.every(Number.isFinite))
      continue;

    const line = L.polyline([origin, destination], {
      color:
        getComputedStyle(document.documentElement)
          .getPropertyValue("--border")
          .trim() || "#c7ccd1",
      weight: 2,
      opacity: 0.8,
      dashArray: "6 8",
    });
    line.bindTooltip(
      `${trip.origin || "Origem"} → ${trip.destination || "Destino"}`,
    );
    routesLayer.addLayer(line);
    routesLayer.addLayer(
      L.circleMarker(origin, {
        radius: 5,
        color: "#64748b",
        weight: 2,
        fillColor: "#fff",
        fillOpacity: 1,
      }).bindTooltip(`Origem: ${trip.origin || "—"}`),
    );
    routesLayer.addLayer(
      L.circleMarker(destination, {
        radius: 5,
        color: "#64748b",
        weight: 2,
        fillColor: "#fff",
        fillOpacity: 1,
      }).bindTooltip(`Destino: ${trip.destination || "—"}`),
    );
    routePoints.push(origin, destination);
  }

  routesLayer.addTo(map);
  return routePoints;
}

function renderMarkers(state) {
  markersLayer.clearLayers();
  markersByIntegrante.clear();

  const list = getFilteredIntegrantes(state);
  const validLocations = renderRotas(state);
<<<<<<< HEAD
  const markerCoordinates = spreadOverlappingCoordinates(list);

  for (const i of list) {
    const coordinates = markerCoordinates.get(i.integrante_id);
=======

  for (const i of list) {
    const coordinates = getIntegranteCoordinates(i);
>>>>>>> 8c9d75601380a49d4874ffccdd2dfb1c364a8bac
    if (!coordinates) continue;

    const marker = L.marker(coordinates, {
      icon: makeMarkerIcon(i),
    });
    marker.bindPopup(makePopupHtml(i), {
      maxWidth: 340,
      minWidth: 280,
      className: "mapa-popup",
    });
    marker.on("popupopen", () => {
      const parent = document.querySelector(".leaflet-popup-content-wrapper");
      if (parent) {
        parent.style.borderRadius = "16px";
        parent.style.background =
          getComputedStyle(document.documentElement)
            .getPropertyValue("--surface")
            .trim() || "#fff";
      }
    });
    markersLayer.addLayer(marker);
    markersByIntegrante.set(Number(i.integrante_id), marker);
    validLocations.push(coordinates);
  }

  markersLayer.addTo(map);

  if (validLocations.length && !map._userZoomed) {
    const bounds = L.latLngBounds(validLocations);
    map.fitBounds(bounds.pad(0.5), {
      maxZoom: 13,
      animate: true,
      duration: 0.6,
    });
  } else if (!validLocations.length) {
    if (!map._initialSet) {
      map.setView([-14.235004, -51.92528], 4);
    }
  }
  map._initialSet = true;
}

function renderAlertas(state) {
  const container = els.alertasTopo();
  const p = Number(state.alertas?.pendentes) || 0;
  const a = Number(state.alertas?.atencao) || 0;
  container.innerHTML = "";
  if (p > 0) {
    const el = document.createElement("span");
    el.className = "alerta-badge pendentes";
    el.innerHTML = `🟡 Pendentes: <strong>${p}</strong>`;
    container.appendChild(el);
  }
  if (a > 0) {
    const el = document.createElement("span");
    el.className = "alerta-badge atencao";
    el.innerHTML = `🔴 Atenção: <strong>${a}</strong>`;
    container.appendChild(el);
  }

  const dt = state.atualizado_em ? new Date(state.atualizado_em) : new Date();
  try {
    els.atualizadoEm().textContent = `Atualizado: ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  } catch {}
}

function applyFilterChange() {
  if (!currentState) return;
  renderMarkers(currentState);
  renderLista(currentState);
}

async function loadEstado() {
  const viagemId = els.filterViagem().value || "";
  const workType = els.filterWorktype().value || "";
  const params = {};
  if (viagemId) params.viagemId = viagemId;
  if (workType) params.work_type = workType;

  const data = await api.mapaOperacionalEstado(params);
  if (!data?.success)
    throw new Error(data?.error || "Falha ao carregar mapa operacional.");

  currentState = data;
  renderFilters(data);
  renderMarkers(data);
  renderLista(data);
  renderAlertas(data);
  return data;
}

function initMap() {
  const tileDark = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    },
  );

  const tileLight = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    },
  );

  const prefersDark =
    document.documentElement.getAttribute("data-theme") === "dark" ||
    (!document.documentElement.getAttribute("data-theme") &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  map = L.map("mapa", {
    zoomControl: true,
    scrollWheelZoom: true,
    preferCanvas: false,
  });
  map.setView([-14.235004, -51.92528], 4);
  (prefersDark ? tileDark : tileLight).addTo(map);

  let zoomTimeout;
  map.on("zoomstart", () => {
    map._userZoomed = true;
    clearTimeout(zoomTimeout);
  });
  map.on("moveend", () => {
    clearTimeout(zoomTimeout);
    zoomTimeout = setTimeout(() => {
      map._userZoomed = true;
    }, 150);
  });

  new MutationObserver(() => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    map.eachLayer((l) => {
      if (l instanceof L.TileLayer) map.removeLayer(l);
    });
    (dark ? tileDark : tileLight).addTo(map);
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

function initFilters() {
  els.filterViagem().addEventListener("change", applyFilterChange);
  els.filterWorktype().addEventListener("change", applyFilterChange);
}

export function startPolling(intervalMs = 25000) {
  stopPolling();
  pollTimer = setInterval(() => {
    loadEstado().catch((e) => {
      console.warn("[mapa-operacional] polling falhou:", e?.message || e);
    });
  }, intervalMs);
}

export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function init() {
  if (!requireAuthPage()) return;
  const user = await mountShell({ active: "mapa-operacional" });
  if (!user) return;
  initMap();
  initFilters();
  try {
    await loadEstado();
    startPolling(25000);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        loadEstado().catch((e) =>
          console.warn(
            "[mapa-operacional] refresh on visible falhou:",
            e?.message || e,
          ),
        );
      }
    });

    window.addEventListener("beforeunload", () => stopPolling());
  } catch (e) {
    const lista = els.atividadeLista();
    lista.innerHTML = `<div class="alert alert-error">${e?.message || "Erro ao carregar mapa operacional."}</div>`;
    console.error(e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

window.__mapaOperacional = {
  loadEstado,
  startPolling,
  stopPolling,
  getState: () => currentState,
};
