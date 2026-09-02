import { Hono } from "hono";
import { requireUser } from "./auth.js";
import { computeStatus, err, json, getLedSector, isAdmin } from "./helpers.js";
import { notifyUsers } from "./notifications.js";
import {
  fetchTripFull,
  formatTrip,
  saveTripMembers,
  syncUserTripStatuses,
} from "./trip_utils.js";
import { checklistRoutes } from "./checklist.js";
import { taskRoutes } from "./tasks.js";
import { getAccessibleTrip } from "./tasks.js";
import { logActivity } from "./activity.js";

export const trips = new Hono();
trips.use("*", requireUser);

async function geocodeCity(city) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    // Nominatim interpreta melhor "Cidade, Estado, País" do que "Cidade - Estado - País"
    const query = String(city || "").replace(/\s*-\s*/g, ", ");
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=1`;
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Chiptronic-TravelOps/1.0 (travel operations application)",
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const results = await response.json();
    const first = Array.isArray(results) ? results[0] : null;
    const address = first?.address || {};
    const placeTypes = new Set(["city", "town", "village", "municipality"]);
    const isCityResult =
      first?.class === "place" && placeTypes.has(first?.type);
    const isAdministrativeCity =
      first?.class === "boundary" &&
      first?.type === "administrative" &&
      Boolean(address.city || address.town || address.village || address.municipality);
    if (!isCityResult && !isAdministrativeCity) return null;

    const latitude = Number(first?.lat);
    const longitude = Number(first?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch (error) {
    console.warn(
      `Falha ao geocodificar cidade "${city}":`,
      error?.message || error,
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTripCityString(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*[-–—]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  const lower = normalized.toLowerCase();
  if (lower === "piraju sp" || lower === "piraju-sp" || lower === "piraju") {
    return "Piraju - SP";
  }

  return text.trim();
}

async function geocodeTripCities(origin, destination) {
  const canonicalOrigin = normalizeTripCityString(origin || "Piraju - SP") || "Piraju - SP";
  const canonicalDestination = normalizeTripCityString(destination || "") || destination || "Piraju - SP";

  const originCoords = await geocodeCity(canonicalOrigin);
  const destinationCoords = await geocodeCity(canonicalDestination);
  return {
    origin_lat: originCoords?.latitude ?? null,
    origin_lng: originCoords?.longitude ?? null,
    destination_lat: destinationCoords?.latitude ?? null,
    destination_lng: destinationCoords?.longitude ?? null,
  };
}

async function findOverlappingMemberIds(db, memberIds, startDate, endDate, excludeTripId = 0) {
  const ids = [...new Set(memberIds.map(Number).filter((id) => id > 0))];
  if (!ids.length) return [];

  const placeholders = ids.map(() => "?").join(", ");
  const { results } = await db.prepare(
    `SELECT DISTINCT users.id
     FROM users
     LEFT JOIN trip_members occupied_member ON occupied_member.user_id = users.id
     LEFT JOIN trips occupied_trip ON occupied_trip.id = occupied_member.trip_id OR occupied_trip.user_id = users.id
     WHERE users.id IN (${placeholders})
       AND occupied_trip.start_date <= ?
       AND occupied_trip.end_date >= ?
       AND (? = 0 OR occupied_trip.id != ?)`,
  )
    .bind(...ids, endDate, startDate, excludeTripId, excludeTripId)
    .all();

  return (results || []).map((row) => Number(row.id));
}

trips.get("/", async (c) => {
  const userId = c.get("userId");
  const user = c.get("user");
  const ledSector = getLedSector(user);
  await syncUserTripStatuses(c.env.DB, userId);

  const status = c.req.query("status") || "";
  const q = c.req.query("q") || "";

  let sql = `SELECT DISTINCT t.* FROM trips t
             INNER JOIN users trip_owner ON trip_owner.id = t.user_id
             LEFT JOIN trip_members tm ON tm.trip_id = t.id
             WHERE (t.user_id = ? OR tm.user_id = ?`;
  const binds = [userId, userId];
  if (ledSector) {
    sql += ` OR TRIM(t.sector) = TRIM(?) COLLATE NOCASE
             OR TRIM(trip_owner.sector) = TRIM(?) COLLATE NOCASE
             OR trip_owner.manager_id = ?
             OR EXISTS (
               SELECT 1
               FROM trip_members team_member
               INNER JOIN users team_user ON team_user.id = team_member.user_id
               WHERE team_member.trip_id = t.id
                 AND TRIM(team_user.sector) = TRIM(?) COLLATE NOCASE
             )`;
    binds.push(ledSector, ledSector, userId, ledSector);
  }
  sql += ")";

  if (status && status !== "all") {
    sql += " AND t.status = ?";
    binds.push(status);
  }
  if (q) {
    sql += " AND (t.origin LIKE ? OR t.destination LIKE ? OR t.reason LIKE ?)";
    const like = `%${q}%`;
    binds.push(like, like, like);
  }
  sql += " ORDER BY t.start_date DESC, t.id DESC";

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all();
  return json({
    success: true,
    trips: (results || []).map((t) => formatTrip(t)),
  });
});

trips.get("/dashboard", async (c) => {
  const userId = c.get("userId");
  await syncUserTripStatuses(c.env.DB, userId);

  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT t.* FROM trips t
     LEFT JOIN trip_members tm ON tm.trip_id = t.id
     WHERE t.user_id = ? OR tm.user_id = ?
     ORDER BY t.start_date DESC, t.id DESC`,
  )
    .bind(userId, userId)
    .all();

  const tripsList = results || [];
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = now.toISOString().slice(0, 10);

  let inProgress = 0;
  let completedMonth = 0;
  let awaiting = 0;
  let overdue = 0;

  const statusCounts = {
    planned: 0,
    in_progress: 0,
    awaiting_report: 0,
    completed: 0,
  };
  const destCounts = {};
  const monthlyCounts = {};
  let totalDaysAway = 0;

  for (const t of tripsList) {
    if (statusCounts[t.status] !== undefined) statusCounts[t.status]++;

    if (t.status === "in_progress") inProgress++;
    if (t.status === "awaiting_report") {
      awaiting++;
      if (t.end_date < today) overdue++;
    }
    if (
      t.status === "completed" &&
      String(t.updated_at || t.end_date).startsWith(monthPrefix)
    ) {
      completedMonth++;
    }

    const dest = String(t.destination || "—").trim() || "—";
    destCounts[dest] = (destCounts[dest] || 0) + 1;

    const monthKey = String(t.start_date || "").slice(0, 7);
    if (monthKey) monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;

    if (t.start_date && t.end_date) {
      const start = new Date(`${t.start_date}T12:00:00`);
      const end = new Date(`${t.end_date}T12:00:00`);
      if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
        totalDaysAway += Math.floor((end - start) / 86400000) + 1;
      }
    }
  }

  const topDestinations = Object.entries(destCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const monthLabels = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthLabels.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  const monthlyTrips = monthLabels.map((month) => ({
    month,
    count: monthlyCounts[month] || 0,
  }));

  let workTypes = [];
  try {
    const { results: workRows } = await c.env.DB.prepare(
      `SELECT tt.work_type AS name, COUNT(*) AS count
       FROM trip_tasks tt
       INNER JOIN trips t ON t.id = tt.trip_id
       LEFT JOIN trip_members tm ON tm.trip_id = t.id
       WHERE t.user_id = ? OR tm.user_id = ?
       GROUP BY tt.work_type
       ORDER BY count DESC`,
    )
      .bind(userId, userId)
      .all();
    workTypes = (workRows || []).map((r) => ({ name: r.name, count: r.count }));
  } catch {
    workTypes = [];
  }

  return json({
    success: true,
    summary: {
      in_progress: inProgress,
      completed_month: completedMonth,
      awaiting_report: awaiting,
      overdue,
      total_days_away: totalDaysAway,
      total_trips: tripsList.length,
    },
    analytics: {
      status_counts: statusCounts,
      top_destinations: topDestinations,
      monthly_trips: monthlyTrips,
      work_types: workTypes,
    },
    recent: tripsList.slice(0, 5).map((t) => formatTrip(t)),
  });
});

trips.get("/users-for-members", async (c) => {
  const userId = c.get("userId");
  const q = String(c.req.query("q") || "").trim();
  const startDate = String(c.req.query("start_date") || "").trim();
  const endDate = String(c.req.query("end_date") || "").trim();
  const excludeTripId = Number(c.req.query("exclude_trip_id")) || 0;

  let sql = `SELECT id, full_name, email, sector, position_title, manager_name, employee_id
             FROM users WHERE id != ?`;
  const binds = [userId];

  if (startDate && endDate && endDate >= startDate) {
    sql += ` AND NOT EXISTS (
      SELECT 1
      FROM trip_members occupied_member
      INNER JOIN trips occupied_trip ON occupied_trip.id = occupied_member.trip_id
      WHERE occupied_trip.start_date <= ?
        AND occupied_trip.end_date >= ?
        AND (occupied_trip.user_id = users.id OR occupied_member.user_id = users.id)
        AND (? = 0 OR occupied_trip.id != ?)
    )`;
    binds.push(endDate, startDate, excludeTripId, excludeTripId);
  }

  if (q) {
    sql +=
      " AND (full_name LIKE ? OR email LIKE ? OR sector LIKE ? OR employee_id LIKE ?)";
    const like = `%${q}%`;
    binds.push(like, like, like, like);
  }
  sql += " ORDER BY full_name ASC";

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all();
  return json({
    success: true,
    users: (results || []).map((u) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      sector: u.sector,
      position_title: u.position_title,
      manager_name: u.manager_name || null,
      employee_id: u.employee_id,
    })),
  });
});

trips.route("/", taskRoutes);

trips.post("/", async (c) => {
  const user = c.get("user");
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err("JSON inválido.");
  }

  const origin = normalizeTripCityString(body.origin || "Piraju - SP") || "Piraju - SP";
  const destination = normalizeTripCityString(body.destination || "") || "Piraju - SP";
  const start_date = String(body.start_date || "").trim();
  const end_date = String(body.end_date || "").trim();
  const reason = String(body.reason || "").trim();
  const sector = String(body.sector || user.sector || "").trim();
  const priority = ["low", "normal", "high"].includes(body.priority)
    ? body.priority
    : "normal";
  const memberIds = Array.isArray(body.member_ids) ? body.member_ids : [];
  const equipmentChecklist = Array.isArray(body.equipment_checklist)
    ? body.equipment_checklist
        .map((item) => ({
          name: String(item?.name || "").trim(),
          carried: Boolean(item?.carried),
        }))
        .filter((item) => item.name)
    : [];

  if (!origin || !destination) return err("Informe origem e destino.");
  if (!start_date || !end_date) return err("Informe as datas da viagem.");
  if (end_date < start_date)
    return err("Data de término deve ser >= data de início.");
  if (!reason) return err("Informe o motivo da viagem.");

  const memberIdsForValidation = Array.isArray(memberIds)
    ? memberIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  const overlappingMemberIds = await findOverlappingMemberIds(
    c.env.DB,
    memberIdsForValidation,
    start_date,
    end_date,
  );
  if (overlappingMemberIds.length) {
    return err("Um ou mais integrantes já estão em outra viagem neste período.");
  }

  const status = computeStatus({ start_date, end_date, status: "planned" });
  const coordinates = await geocodeTripCities(origin, destination);
  if (
    coordinates.origin_lat === null ||
    coordinates.origin_lng === null ||
    coordinates.destination_lat === null ||
    coordinates.destination_lng === null
  ) {
    return err("Origem e destino devem ser cidades válidas (formato Cidade - UF para o Brasil, ou Cidade - País / Cidade - Estado - País para o exterior).");
  }
  const result = await c.env.DB.prepare(
    `INSERT INTO trips (user_id, origin, destination, start_date, end_date, reason, sector, status, priority,
                        origin_lat, origin_lng, destination_lat, destination_lng)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      user.id,
      origin,
      destination,
      start_date,
      end_date,
      reason,
      sector,
      status,
      priority,
      coordinates.origin_lat,
      coordinates.origin_lng,
      coordinates.destination_lat,
      coordinates.destination_lng,
    )
    .run();

  const tripId = Number(result.meta.last_row_id);
  if (!tripId || !Number.isInteger(tripId) || tripId <= 0) {
    return err("Não foi possível criar a viagem.", 500);
  }

  const tripExists = await c.env.DB.prepare('SELECT 1 FROM trips WHERE id = ? LIMIT 1').bind(tripId).first();
  if (!tripExists) {
    return err("Viagem não encontrada após criação.", 500);
  }

  await logActivity(c.env.DB, {
    tripId,
    userId: user.id,
    action: "trip_created",
    summary: `Criou a viagem para ${destination}.`,
    details: { destination, start_date, end_date, sector },
  });
  await c.env.DB.prepare("INSERT INTO trip_checklists (trip_id) VALUES (?)")
    .bind(tripId)
    .run();
  if (equipmentChecklist.length) {
    await c.env.DB.prepare(
      "UPDATE trip_checklists SET equipment_checklist = ? WHERE trip_id = ?",
    )
      .bind(JSON.stringify(equipmentChecklist), tripId)
      .run();
  }

  // Always include the trip creator as a trip member so they can be
  // selected as responsible for tasks.
  try {
    const ids = Array.isArray(memberIds)
      ? [...new Set(memberIds.map((i) => Number(i)).filter((n) => n > 0))]
      : [];
    if (!ids.includes(user.id)) ids.unshift(user.id);
    await saveTripMembers(c.env.DB, tripId, ids);
  } catch (e) {
    // fallback: try to save whatever was provided
    await saveTripMembers(c.env.DB, tripId, memberIds);
  }

  // Notifica o líder do setor sobre a nova viagem
  try {
    const { results: leaders } = await c.env.DB.prepare(
      `SELECT id FROM users WHERE sector = ? AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) = 'lider'`,
    )
      .bind(sector)
      .all();
    const leaderIds = (leaders || []).map((r) => r.id).filter(Boolean);
    if (leaderIds.length > 0) {
      await notifyUsers(c.env.DB, leaderIds, {
        type: "info",
        title: "Nova viagem criada",
        message: `${user.full_name} criou uma viagem para ${destination} (${start_date} — ${end_date}).`,
        link: `/trip.html?id=${tripId}`,
      });
    }
  } catch (e) {
    console.error("Falha ao notificar líder da setor:", e);
  }

  const full = await fetchTripFull(c.env.DB, tripId, user.id);
  return json({ success: true, trip: full }, 201);
});

trips.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const userId = c.get("userId");
  const viewer = c.get("user");

  const tripRow = await c.env.DB.prepare("SELECT * FROM trips WHERE id = ?")
    .bind(id)
    .first();
  if (!tripRow) return err("Viagem não encontrada.", 404);

  if (tripRow.user_id !== userId) {
    const owner = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(tripRow.user_id)
      .first();
    const ledSector = getLedSector(viewer);

    const memberRow = await c.env.DB.prepare(
      "SELECT id FROM trip_members WHERE trip_id = ? AND user_id = ? LIMIT 1",
    )
      .bind(id, userId)
      .first();

    const allowed =
      isAdmin(viewer) ||
      owner?.manager_id === userId ||
      (ledSector && owner?.sector === ledSector) ||
      !!memberRow;
    if (!allowed) return err("Viagem não encontrada.", 404);
  }

  const full = await fetchTripFull(c.env.DB, id, tripRow.user_id);
  if (!full) return err("Viagem não encontrada.", 404);
  return json({ success: true, trip: full });
});

trips.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const userId = c.get("userId");
  const trip = await c.env.DB.prepare(
    "SELECT * FROM trips WHERE id = ? AND user_id = ?",
  )
    .bind(id, userId)
    .first();
  if (!trip) return err("Viagem não encontrada.", 404);
  if (trip.status === "completed")
    return err("Viagem concluída não pode ser editada.");

  let body;
  try {
    body = await c.req.json();
  } catch {
    return err("JSON inválido.");
  }

  const origin = normalizeTripCityString(body.origin ?? trip.origin ?? "Piraju - SP") || "Piraju - SP";
  const destination = normalizeTripCityString(body.destination ?? trip.destination ?? "") || "Piraju - SP";
  const start_date = String(body.start_date ?? trip.start_date).trim();
  const end_date = String(body.end_date ?? trip.end_date).trim();
  const reason = String(body.reason ?? trip.reason).trim();
  const sector = String(body.sector ?? trip.sector).trim();
  const priority = ["low", "normal", "high"].includes(body.priority)
    ? body.priority
    : trip.priority || "normal";
  const equipmentChecklist = Array.isArray(body.equipment_checklist)
    ? body.equipment_checklist
        .map((item) => ({
          name: String(item?.name || "").trim(),
          carried: Boolean(item?.carried),
        }))
        .filter((item) => item.name)
    : null;

  if (!origin || !destination || !start_date || !end_date || !reason) {
    return err("Preencha todos os campos obrigatórios.");
  }
  if (end_date < start_date) return err("Data de término inválida.");

  const memberIdsForValidation = Array.isArray(body.member_ids)
    ? body.member_ids.map(Number).filter((memberId) => Number.isInteger(memberId) && memberId > 0)
    : [];
  const overlappingMemberIds = await findOverlappingMemberIds(
    c.env.DB,
    memberIdsForValidation,
    start_date,
    end_date,
    id,
  );
  if (overlappingMemberIds.length) {
    return err("Um ou mais integrantes já estão em outra viagem neste período.");
  }

  const status = computeStatus({ start_date, end_date, status: trip.status });
  const citiesChanged =
    origin !== trip.origin || destination !== trip.destination;
  const hasMissingCoordinates =
    trip.origin_lat == null ||
    trip.origin_lng == null ||
    trip.destination_lat == null ||
    trip.destination_lng == null;
  const coordinates = citiesChanged || hasMissingCoordinates
    ? await geocodeTripCities(origin, destination)
    : {
        origin_lat: trip.origin_lat ?? null,
        origin_lng: trip.origin_lng ?? null,
        destination_lat: trip.destination_lat ?? null,
        destination_lng: trip.destination_lng ?? null,
      };
  if (
    coordinates.origin_lat === null ||
    coordinates.origin_lng === null ||
    coordinates.destination_lat === null ||
    coordinates.destination_lng === null
  ) {
    return err("Origem e destino devem ser cidades válidas (formato Cidade - UF para o Brasil, ou Cidade - País / Cidade - Estado - País para o exterior).");
  }
  const changes = {};
  for (const [field, value] of Object.entries({
    origin,
    destination,
    start_date,
    end_date,
    reason,
    sector,
    status,
    priority,
  })) {
    if (String(trip[field] ?? "") !== String(value ?? ""))
      changes[field] = { from: trip[field] ?? null, to: value };
  }
  await c.env.DB.prepare(
    `UPDATE trips SET origin=?, destination=?, start_date=?, end_date=?, reason=?, sector=?, status=?, priority=?,
     origin_lat=?, origin_lng=?, destination_lat=?, destination_lng=?, updated_at=datetime('now') WHERE id=?`,
  )
    .bind(
      origin,
      destination,
      start_date,
      end_date,
      reason,
      sector,
      status,
      priority,
      coordinates.origin_lat,
      coordinates.origin_lng,
      coordinates.destination_lat,
      coordinates.destination_lng,
      id,
    )
    .run();

  if (Object.keys(changes).length) {
    await logActivity(c.env.DB, {
      tripId: id,
      userId,
      action: "trip_updated",
      summary: `Atualizou ${Object.keys(changes).length} ${Object.keys(changes).length === 1 ? "campo" : "campos"} da viagem.`,
      details: changes,
    });
  }

  if (Array.isArray(body.member_ids)) {
    try {
      const provided = Array.isArray(body.member_ids)
        ? body.member_ids.map((i) => Number(i)).filter((n) => n > 0)
        : [];
      const ids = [...new Set(provided)];
      if (!ids.includes(userId)) ids.unshift(userId);
      await saveTripMembers(c.env.DB, id, ids);
    } catch (e) {
      console.error("Falha ao atualizar integrantes:", e);
    }
  }

  if (equipmentChecklist) {
    await c.env.DB.prepare(
      "UPDATE trip_checklists SET equipment_checklist = ? WHERE trip_id = ?",
    )
      .bind(JSON.stringify(equipmentChecklist), id)
      .run();
  }

  return json({
    success: true,
    trip: await fetchTripFull(c.env.DB, id, userId),
  });
});

trips.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const userId = c.get("userId");
  const viewer = c.get("user");

  const trip = await getAccessibleTrip(c, id);
  if (!trip) return err("Viagem não encontrada.", 404);

  if (trip.status === "completed" && !isAdmin(viewer)) {
    return err("Viagem concluída não pode ser excluída.", 403);
  }

  await logActivity(c.env.DB, {
    tripId: id,
    userId,
    action: "trip_deleted",
    summary: `Excluiu a viagem para ${trip.destination}.`,
  });

  await c.env.DB.prepare(
    "DELETE FROM trip_task_photos WHERE task_id IN (SELECT id FROM trip_tasks WHERE trip_id = ?)",
  )
    .bind(id)
    .run();
  await c.env.DB.prepare("DELETE FROM trip_tasks WHERE trip_id = ?")
    .bind(id)
    .run();
  await c.env.DB.prepare("DELETE FROM trip_checklists WHERE trip_id = ?")
    .bind(id)
    .run();
  await c.env.DB.prepare("DELETE FROM trip_members WHERE trip_id = ?")
    .bind(id)
    .run();

  await c.env.DB.prepare(
    "DELETE FROM demanda_atividades WHERE demanda_veiculo_id IN (SELECT id FROM demanda_veiculos WHERE demanda_id IN (SELECT id FROM demandas WHERE viagem_id = ?))",
  )
    .bind(id)
    .run();
  await c.env.DB.prepare(
    "DELETE FROM demanda_veiculos WHERE demanda_id IN (SELECT id FROM demandas WHERE viagem_id = ?)",
  )
    .bind(id)
    .run();
  await c.env.DB.prepare("DELETE FROM demandas WHERE viagem_id = ?")
    .bind(id)
    .run();

  await c.env.DB.prepare("DELETE FROM trips WHERE id = ?").bind(id).run();

  return json({ success: true });
});

trips.route("/", checklistRoutes);
