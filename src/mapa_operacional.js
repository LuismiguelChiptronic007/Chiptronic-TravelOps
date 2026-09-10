import { Hono } from "hono";
import { requireUser } from "./auth.js";
import { err, json, todayISO } from "./helpers.js";

export const mapaOperacional = new Hono();
mapaOperacional.use("*", requireUser);

function parseResponsibleIds(raw) {
  if (Array.isArray(raw))
    return raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return String(raw || "")
    .split(",")
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function timeToMinutes(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}

function currentMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function taskMemberStatus(task, nowMin) {
  const start = timeToMinutes(task.start_time);
  const end = timeToMinutes(task.end_time);
  const hasPending = String(task.pending_items || "").trim().length > 0;

  if (start === null || end === null) {
    return { key: "SEM_ATIVIDADE", label: "Sem atividade" };
  }

  if (nowMin >= start && nowMin <= end) {
    return { key: "EM_ANDAMENTO", label: "Em andamento" };
  }

  if (nowMin < start) {
    return { key: "PENDENTE", label: "Pendência" };
  }

  if (hasPending) {
    return { key: "ATENCAO", label: "Atenção" };
  }

  return { key: "CONCLUIDA", label: "Concluída" };
}

function memberOverallStatus(tasksOfDay, nowMin) {
  const statuses = tasksOfDay.map((t) => taskMemberStatus(t, nowMin).key);

  if (statuses.includes("ATENCAO"))
    return { key: "ATENCAO", badge: "🔴", label: "Atenção" };
  if (statuses.includes("EM_ANDAMENTO"))
    return { key: "EM_ANDAMENTO", badge: "🟢", label: "Em andamento" };
  if (statuses.includes("PENDENTE"))
    return { key: "PENDENTE", badge: "🟡", label: "Pendência" };
  if (statuses.includes("CONCLUIDA"))
    return { key: "CONCLUIDA", badge: "⚪", label: "Concluída" };
  return { key: "SEM_ATIVIDADE", badge: "🔵", label: "Sem atividade" };
}

mapaOperacional.post("/trabalhos/checkin", async (c) => {
  const userId = c.get("userId");
  const user = c.get("user");

  let body;
  try {
    body = await c.req.json();
  } catch {
    return err("JSON inválido.");
  }

  const trabalhoId = Number(body.trabalho_id || body.task_id || 0);
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);

  if (!trabalhoId || !Number.isInteger(trabalhoId) || trabalhoId <= 0) {
    return err("Informe trabalho_id válido.");
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return err("Latitude inválida.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return err("Longitude inválida.");
  }

  const task = await c.env.DB.prepare(
    `SELECT tt.*, t.status AS trip_status, t.user_id AS trip_user_id
     FROM trip_tasks tt
     INNER JOIN trips t ON t.id = tt.trip_id
     WHERE tt.id = ?`,
  )
    .bind(trabalhoId)
    .first();

  if (!task) return err("Trabalho não encontrado.", 404);

  if (task.trip_status !== "in_progress") {
    return err("Só é permitido check-in em viagens ativas (em andamento).");
  }

  const responsibleIds = parseResponsibleIds(task.responsible_ids);
  const legacyResponsible = Number(task.responsible_id) || 0;
  const allResponsible = new Set([
    ...responsibleIds,
    ...(legacyResponsible ? [legacyResponsible] : []),
  ]);

  const isMember = await c.env.DB.prepare(
    `SELECT id FROM trip_members WHERE trip_id = ? AND user_id = ? LIMIT 1`,
  )
    .bind(task.trip_id, userId)
    .first();

  const isTripOwner = Number(task.trip_user_id) === Number(userId);
  const isTaskResponsible = allResponsible.has(Number(userId));
  const isAdmin = user?.role === "admin" || user?.role === "admin_master";

  if (!isMember && !isTripOwner && !isTaskResponsible && !isAdmin) {
    return err("Você não faz parte desta viagem ou trabalho.", 403);
  }

  if (!isAdmin && isTaskResponsible === false && isTripOwner === false) {
    const responsible = Array.from(allResponsible);
    if (responsible.length && !responsible.includes(Number(userId))) {
      return err("Este trabalho não está atribuído a você.", 403);
    }
  }

  const integranteId = isTaskResponsible ? Number(userId) : Number(userId);

  const result = await c.env.DB.prepare(
    `INSERT INTO checkins (trabalho_id, integrante_id, viagem_id, latitude, longitude)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(trabalhoId, integranteId, task.trip_id, latitude, longitude)
    .run();

  return json(
    {
      success: true,
      checkin_id: result.meta.last_row_id,
      viagem_id: task.trip_id,
      trabalho_id: trabalhoId,
      timestamp: new Date().toISOString(),
    },
    201,
  );
});

async function handleMapaEstado(c) {
  const userId = c.get("userId");
  const user = c.get("user");

  const viagemIdFilter =
    c.req.query("viagemId") || c.req.query("trip_id") || "";
  const workTypeFilter =
    c.req.query("work_type") || c.req.query("tipo_trabalho") || "";
  const isAdmin = user?.role === "admin" || user?.role === "admin_master";
  const ledSector =
    user?.sector && (user?.role === "admin" || user?.role === "admin_master")
      ? user.sector
      : null;

  const today = todayISO();
  const nowMin = currentMinutes();

  let tripsWhere = `t.status = 'in_progress'`;
  const tripsBinds = [];

  if (viagemIdFilter) {
    tripsWhere += " AND t.id = ?";
    tripsBinds.push(Number(viagemIdFilter));
  }

  if (!isAdmin) {
    tripsWhere += ` AND (t.user_id = ? OR EXISTS (SELECT 1 FROM trip_members tm WHERE tm.trip_id = t.id AND tm.user_id = ?))`;
    tripsBinds.push(userId, userId);
  } else if (ledSector && user?.role !== "admin_master") {
    tripsWhere += ` AND t.sector = ?`;
    tripsBinds.push(ledSector);
  }

  const { results: activeTrips } = await c.env.DB.prepare(
    `SELECT t.*, u.full_name AS owner_name FROM trips t
     LEFT JOIN users u ON u.id = t.user_id
     WHERE ${tripsWhere}
     ORDER BY t.start_date DESC, t.id DESC`,
  )
    .bind(...tripsBinds)
    .all();

  const tripIds = (activeTrips || []).map((t) => t.id);
  const state = {
    trips: (activeTrips || []).map((t) => ({
      id: t.id,
      origin: t.origin,
      destination: t.destination,
      start_date: t.start_date,
      end_date: t.end_date,
      sector: t.sector,
      reason: t.reason,
      owner_name: t.owner_name || null,
      origin_lat: t.origin_lat == null ? null : Number(t.origin_lat),
      origin_lng: t.origin_lng == null ? null : Number(t.origin_lng),
      destination_lat:
        t.destination_lat == null ? null : Number(t.destination_lat),
      destination_lng:
        t.destination_lng == null ? null : Number(t.destination_lng),
    })),
    integrantes: [],
    work_types: [],
    alertas: { pendentes: 0, atencao: 0, total: 0 },
    atualizado_em: new Date().toISOString(),
  };

  if (!tripIds.length) {
    return json({ success: true, ...state });
  }

  const placeholders = tripIds.map(() => "?").join(",");

  const { results: allMembers } = await c.env.DB.prepare(
    `SELECT DISTINCT tm.trip_id, tm.user_id, tm.full_name, tm.sector, tm.manager_name,
            u.email, u.position_title, u.employee_id, u.avatar_data, u.avatar_key, u.role
     FROM trip_members tm
     INNER JOIN users u ON u.id = tm.user_id
     WHERE tm.trip_id IN (${placeholders})
     ORDER BY tm.full_name ASC`,
  )
    .bind(...tripIds)
    .all();

  const { results: tripOwners } = await c.env.DB.prepare(
    `SELECT DISTINCT t.id AS trip_id, t.user_id, u.full_name, u.sector, u.position_title,
            u.email, u.employee_id, u.avatar_data, u.avatar_key, u.role
     FROM trips t
     INNER JOIN users u ON u.id = t.user_id
     WHERE t.id IN (${placeholders})`,
  )
    .bind(...tripIds)
    .all();

  const membersByTrip = new Map();
  for (const m of allMembers || []) {
    if (!membersByTrip.has(m.trip_id)) membersByTrip.set(m.trip_id, []);
    membersByTrip.get(m.trip_id).push({ ...m, _isOwner: false });
  }
  for (const o of tripOwners || []) {
    if (!membersByTrip.has(o.trip_id)) membersByTrip.set(o.trip_id, []);
    const exists = membersByTrip
      .get(o.trip_id)
      .some((m) => Number(m.user_id) === Number(o.user_id));
    if (!exists) {
      membersByTrip.get(o.trip_id).push({
        trip_id: o.trip_id,
        user_id: o.user_id,
        full_name: o.full_name,
        sector: o.sector,
        manager_name: null,
        email: o.email,
        position_title: o.position_title,
        employee_id: o.employee_id,
        avatar_data: o.avatar_data,
        avatar_key: o.avatar_key,
        role: o.role,
        _isOwner: true,
      });
    }
  }

  const allMemberUserIds = new Set();
  for (const list of membersByTrip.values()) {
    for (const m of list) allMemberUserIds.add(Number(m.user_id));
  }

  let tasksSql = `SELECT tt.* FROM trip_tasks tt WHERE tt.trip_id IN (${placeholders}) AND tt.task_date = ?`;
  const tasksBinds = [...tripIds, today];
  if (workTypeFilter) {
    tasksSql += " AND tt.work_type = ?";
    tasksBinds.push(workTypeFilter);
  }
  tasksSql += " ORDER BY tt.start_time ASC, tt.id ASC";

  const { results: todayTasks } = await c.env.DB.prepare(tasksSql)
    .bind(...tasksBinds)
    .all();

  const workTypesSet = new Set();
  const tasksByResponsible = new Map();
  const tasksByTrip = new Map();

  for (const task of todayTasks || []) {
    workTypesSet.add(task.work_type);
    if (!tasksByTrip.has(task.trip_id)) tasksByTrip.set(task.trip_id, []);
    tasksByTrip.get(task.trip_id).push(task);

    const respIds = parseResponsibleIds(task.responsible_ids);
    const legacy = Number(task.responsible_id) || 0;
    const allResp = new Set([...respIds, ...(legacy ? [legacy] : [])]);

    if (allResp.size === 0) {
      const ownerTrip = activeTrips.find(
        (t) => Number(t.id) === Number(task.trip_id),
      );
      if (ownerTrip) allResp.add(Number(ownerTrip.user_id));
    }

    for (const rid of allResp) {
      if (!tasksByResponsible.has(rid)) tasksByResponsible.set(rid, []);
      tasksByResponsible.get(rid).push(task);
    }
  }

  state.work_types = Array.from(workTypesSet).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  const memberUserIdsArr = Array.from(allMemberUserIds);
  let lastCheckins = [];
  if (memberUserIdsArr.length) {
    const ph = memberUserIdsArr.map(() => "?").join(",");
    const { results } = await c.env.DB.prepare(
      `SELECT c.* FROM checkins c
       INNER JOIN (
         SELECT integrante_id, MAX(timestamp) AS max_ts
         FROM checkins
         WHERE integrante_id IN (${ph})
         GROUP BY integrante_id
       ) lm ON lm.integrante_id = c.integrante_id AND lm.max_ts = c.timestamp
       WHERE c.integrante_id IN (${ph})`,
    )
      .bind(...memberUserIdsArr, ...memberUserIdsArr)
      .all();
    lastCheckins = results || [];
  }

  const checkinByIntegrante = new Map();
  for (const ck of lastCheckins) {
    checkinByIntegrante.set(Number(ck.integrante_id), ck);
  }

  const todayCheckinsCountsByIntegrante = new Map();
  if (memberUserIdsArr.length) {
    const ph = memberUserIdsArr.map(() => "?").join(",");
    const { results } = await c.env.DB.prepare(
      `SELECT integrante_id, COUNT(*) AS cnt FROM checkins
       WHERE integrante_id IN (${ph}) AND DATE(timestamp) = ?
       GROUP BY integrante_id`,
    )
      .bind(...memberUserIdsArr, today)
      .all();
    for (const r of results || []) {
      todayCheckinsCountsByIntegrante.set(
        Number(r.integrante_id),
        Number(r.cnt) || 0,
      );
    }
  }

  for (const trip of activeTrips || []) {
    const members = membersByTrip.get(trip.id) || [];
    for (const m of members) {
      const uid = Number(m.user_id);
      const memberTasks = tasksByResponsible.get(uid) || [];
      const memberTodayTasks = memberTasks.filter(
        (t) => Number(t.trip_id) === Number(trip.id),
      );
      const overallStatus = memberOverallStatus(memberTodayTasks, nowMin);

      let currentTask = null;
      for (const t of memberTodayTasks) {
        const st = taskMemberStatus(t, nowMin);
        if (st.key === "EM_ANDAMENTO") {
          currentTask = { ...t, _status: st };
          break;
        }
      }
      if (!currentTask && memberTodayTasks.length) {
        currentTask = {
          ...memberTodayTasks[0],
          _status: taskMemberStatus(memberTodayTasks[0], nowMin),
        };
      }

      const lastCheckin = checkinByIntegrante.get(uid);
      const totalTarefas = memberTodayTasks.length;
      const pendentes = memberTodayTasks.filter(
        (t) => taskMemberStatus(t, nowMin).key === "PENDENTE",
      ).length;
      const atencao = memberTodayTasks.filter(
        (t) => taskMemberStatus(t, nowMin).key === "ATENCAO",
      ).length;
      const concluidos = memberTodayTasks.filter((t) => {
        const st = taskMemberStatus(t, nowMin).key;
          return st === "CONCLUIDA";
      }).length;

      if (overallStatus.key === "PENDENTE") state.alertas.pendentes++;
      if (overallStatus.key === "ATENCAO") state.alertas.atencao++;

      state.integrantes.push({
        integrante_id: uid,
        full_name: m.full_name,
        employee_id: m.employee_id || null,
        position_title: m.position_title || null,
        sector: m.sector || trip.sector,
        avatar_url: m.avatar_data
          ? m.avatar_data
          : m.avatar_key
            ? `/api/files/${m.avatar_key}`
            : "assets/default-avatar.svg",
        viagem: {
          id: trip.id,
          origin: trip.origin,
          destination: trip.destination,
          start_date: trip.start_date,
          end_date: trip.end_date,
          reason: trip.reason,
          origin_lat: trip.origin_lat == null ? null : Number(trip.origin_lat),
          origin_lng: trip.origin_lng == null ? null : Number(trip.origin_lng),
          destination_lat:
            trip.destination_lat == null ? null : Number(trip.destination_lat),
          destination_lng:
            trip.destination_lng == null ? null : Number(trip.destination_lng),
        },
        status: {
          key: overallStatus.key,
          badge: overallStatus.badge,
          label: overallStatus.label,
        },
        trabalho_atual: currentTask
          ? {
              id: currentTask.id,
              work_type: currentTask.work_type,
              location: currentTask.location,
              start_time: currentTask.start_time,
              end_time: currentTask.end_time,
              summary: currentTask.summary,
              task_date: currentTask.task_date,
              status_key: currentTask._status.key,
              status_label: currentTask._status.label,
            }
          : null,
        location: lastCheckin
          ? {
              latitude: Number(lastCheckin.latitude),
              longitude: Number(lastCheckin.longitude),
              timestamp: lastCheckin.timestamp,
              trabalho_id: Number(lastCheckin.trabalho_id) || null,
              checkins_hoje: todayCheckinsCountsByIntegrante.get(uid) || 1,
            }
          : null,
        metricas_dia: {
          total_tarefas: totalTarefas,
          concluidas: concluidos,
          pendentes,
          atencao,
          checkins_hoje: todayCheckinsCountsByIntegrante.get(uid) || 0,
        },
      });
    }
  }

  state.alertas.total = state.alertas.pendentes + state.alertas.atencao;

  return json({ success: true, ...state });
}

mapaOperacional.get("/mapa-operacional/estado", handleMapaEstado);
mapaOperacional.get("/mapa_operacional/estado", handleMapaEstado);
