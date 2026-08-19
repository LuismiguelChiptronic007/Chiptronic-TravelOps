import { Hono } from "hono";

import {
  assertImageFile,
  err,
  fileKey,
  hasFileStorage,
  json,
  WORK_TYPES,
  getLedSector,
} from "./helpers.js";

import { fetchTripFull } from "./trip_utils.js";
import { notifyUsers } from "./notifications.js";

export const taskRoutes = new Hono();

function timeToMinutes(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return hours * 60 + minutes;
}

function parseResponsibleIds(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const ids = raw
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((id) => Number.isInteger(id) && id > 0)
    .filter((id, index, arr) => arr.indexOf(id) === index);
  return ids;
}

function parseCustomFields(formOrBody) {
  const fields = {};
  if (formOrBody instanceof FormData) {
    for (const [key, value] of formOrBody.entries()) {
      if (key.startsWith("custom_")) {
        fields[key.slice(7)] = String(value || "").trim();
      }
    }
  } else if (typeof formOrBody === "object" && formOrBody !== null) {
    for (const [key, value] of Object.entries(formOrBody)) {
      if (key.startsWith("custom_")) {
        fields[key.slice(7)] = String(value || "").trim();
      }
    }
  }
  return fields;
}

async function saveCustomFields(db, taskId, fields) {
  if (!Object.keys(fields).length) return;
  const placeholders = Object.keys(fields)
    .map(() => "(?, ?, ?)")
    .join(", ");
  const flatBinds = Object.entries(fields).flatMap(([name, value]) => [
    taskId,
    name,
    value || null,
  ]);
  await db
    .prepare(
      `INSERT INTO trip_task_custom_values (task_id, field_name, field_value) VALUES ${placeholders} ON CONFLICT(task_id, field_name) DO UPDATE SET field_value = excluded.field_value`,
    )
    .bind(...flatBinds)
    .run();
}

async function getCustomFields(db, taskId) {
  const { results } = await db
    .prepare(
      "SELECT field_name, field_value FROM trip_task_custom_values WHERE task_id = ?",
    )
    .bind(taskId)
    .all();
  const fields = {};
  for (const row of results || []) {
    fields[row.field_name] = row.field_value;
  }
  return fields;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

taskRoutes.get("/work-types", async (c) => {
  const user = c.get("user");
  const defaultTypes = [...WORK_TYPES];

  const explicitSector = String(c.req.query("sector") || "").trim();
  const tripIdParam = Number(c.req.query("trip_id") || 0);

  let resolvedSector = explicitSector;

  if (!resolvedSector && tripIdParam > 0) {
    try {
      const trip = await c.env.DB.prepare(
        "SELECT sector FROM trips WHERE id = ?",
      )
        .bind(tripIdParam)
        .first();
      resolvedSector = String(trip?.sector || "").trim();
    } catch {
      // ignore trip lookup failure
    }
  }

  if (!resolvedSector) {
    resolvedSector = String(user?.sector || "").trim();
  }

  let customTypes = [];
  if (resolvedSector) {
    try {
      const { results } = await c.env.DB.prepare(
        "SELECT DISTINCT name FROM leader_work_types WHERE sector = ? ORDER BY name ASC",
      )
        .bind(resolvedSector)
        .all();

      customTypes = [
        ...new Set(
          (results || [])
            .map((r) => String(r.name || "").trim())
            .filter(Boolean),
        ),
      ];
    } catch {
      // ignore if table doesn't exist yet or query fails
    }
  }

  const allTypes = [...new Set([...defaultTypes, ...customTypes])].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );

  return json({ success: true, work_types: allTypes });
});

taskRoutes.get("/projects", async (c) => {
  const user = c.get("user");

  const explicitSector = String(c.req.query("sector") || "").trim();
  const tripIdParam = Number(c.req.query("trip_id") || 0);

  let resolvedSector = explicitSector;

  if (!resolvedSector && tripIdParam > 0) {
    try {
      const trip = await c.env.DB.prepare(
        "SELECT sector FROM trips WHERE id = ?",
      )
        .bind(tripIdParam)
        .first();
      resolvedSector = String(trip?.sector || "").trim();
    } catch {
      // ignore trip lookup failure
    }
  }

  if (!resolvedSector) {
    resolvedSector = String(user?.sector || "").trim();
  }

  if (!resolvedSector) {
    return json({ success: true, projects: [] });
  }

  try {
    const { results } = await c.env.DB.prepare(
      "SELECT DISTINCT id, name FROM leader_projects WHERE sector = ? ORDER BY name ASC",
    )
      .bind(resolvedSector)
      .all();

    return json({ success: true, projects: results || [] });
  } catch {
    return json({ success: true, projects: [] });
  }
});

export async function getAccessibleTrip(c, tripId) {
  const userId = c.get("userId");
  const viewer = c.get("user");

  const trip = await c.env.DB.prepare("SELECT * FROM trips WHERE id = ?")
    .bind(tripId)
    .first();
  if (!trip) return null;

  if (trip.user_id === userId) return trip;

  const [member, ledSector, owner] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id FROM trip_members WHERE trip_id = ? AND user_id = ? LIMIT 1",
    )
      .bind(tripId, userId)
      .first(),
    viewer?.sector
      ? c.env.DB.prepare(
          `SELECT id FROM users WHERE sector = ?
           AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) = 'lider'
           AND id = ? LIMIT 1`,
        )
          .bind(viewer.sector, userId)
          .first()
      : Promise.resolve(null),
    c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(trip.user_id)
      .first(),
  ]);

  if (member) return trip;

  const isAdminUser =
    viewer?.role === "admin" || viewer?.role === "admin_master";
  if (isAdminUser) return trip;

  if (ledSector) return trip;

  if (owner && owner.manager_id === userId) return trip;

  return null;
}

taskRoutes.post("/:id/tasks", async (c) => {
  const id = Number(c.req.param("id"));
  const userId = c.get("userId");
  const trip = await getAccessibleTrip(c, id);
  if (!trip) return err("Viagem não encontrada.", 404);

  const contentType = c.req.header("content-type") || "";
  let work_type = "";
  let location = "";
  let start_time = "";
  let end_time = "";
  let summary = "";
  let task_date = "";
  let responsible_id = "";
  let responsible_ids = [];
  let pending_items = "";
  let vehicle = "";
  let plate = "";
  let montadora = "";
  let modelo = "";
  let submodelo = "";
  let project_id = "";
  let customFields = {};
  const photoFiles = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    work_type = String(form.get("work_type") || "").trim();
    location = String(form.get("location") || "").trim();
    start_time = String(form.get("start_time") || "").trim();
    end_time = String(form.get("end_time") || "").trim();
    summary = String(form.get("summary") || "").trim();
    task_date = String(form.get("task_date") || "").trim();
    responsible_id = String(form.get("responsible_id") || "").trim();
    responsible_ids = parseResponsibleIds(form.getAll("responsible_ids"));
    if (!responsible_ids.length && responsible_id)
      responsible_ids = [Number(responsible_id)];
    pending_items = String(form.get("pending_items") || "").trim();
    vehicle = String(form.get("vehicle") || "").trim();
    plate = String(form.get("plate") || "").trim();
    montadora = String(form.get("montadora") || "").trim();
    modelo = String(form.get("modelo") || "").trim();
    submodelo = String(form.get("submodelo") || "").trim();
    project_id = String(form.get("project_id") || "").trim();
    customFields = parseCustomFields(form);
  } else {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return err("JSON inválido.");
    }
    work_type = String(body.work_type || "").trim();
    location = String(body.location || "").trim();
    start_time = String(body.start_time || "").trim();
    end_time = String(body.end_time || "").trim();
    summary = String(body.summary || "").trim();
    task_date = String(body.task_date || "").trim();
    responsible_id = String(body.responsible_id || "").trim();
    responsible_ids = parseResponsibleIds(
      body.responsible_ids || body.responsible_id || [],
    );
    if (!responsible_ids.length && responsible_id)
      responsible_ids = [Number(responsible_id)];
    pending_items = String(body.pending_items || "").trim();
    vehicle = String(body.vehicle || "").trim();
    plate = String(body.plate || "").trim();
    montadora = String(body.montadora || "").trim();
    modelo = String(body.modelo || "").trim();
    submodelo = String(body.submodelo || "").trim();
    project_id = String(body.project_id || "").trim();
    customFields = parseCustomFields(body);
  }

  const normalizedWorkType = work_type
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const isLunch = normalizedWorkType === "refeicao";
  if (isLunch) {
    if (!location) location = "Refeição";
    if (!summary) summary = "Horário de refeição";
  }

  if (
    !work_type ||
    !location ||
    !start_time ||
    !end_time ||
    !summary ||
    !task_date
  ) {
    return err("Preencha todos os campos da tarefa.");
  }

  const requiresVehicle = [].includes(normalizedWorkType);
  if (
    requiresVehicle &&
    (!vehicle || !plate || !montadora || !modelo || !submodelo)
  ) {
    return err(
      "Para este tipo de trabalho, informe a montadora, o modelo, a versão e a placa.",
    );
  }

  if (!task_date || task_date < trip.start_date || task_date > trip.end_date) {
    return err("Data da tarefa deve estar dentro do período da viagem.");
  }

  if (end_time < start_time) {
    return err("Hora de término deve ser igual ou posterior à hora de início.");
  }

  const startMinutes = timeToMinutes(start_time);
  const endMinutes = timeToMinutes(end_time);
  if (
    startMinutes == null ||
    endMinutes == null ||
    endMinutes <= startMinutes
  ) {
    return err("Informe um intervalo de horário válido.", 400);
  }

  const { results: conflictingTasks } = await c.env.DB.prepare(
    "SELECT start_time, end_time FROM trip_tasks WHERE trip_id = ? AND task_date = ?",
  )
    .bind(id, task_date)
    .all();

  const hasConflict = (conflictingTasks || []).some((task) => {
    const existingStart = timeToMinutes(task.start_time);
    const existingEnd = timeToMinutes(task.end_time);
    if (existingStart == null || existingEnd == null) return false;
    return rangesOverlap(startMinutes, endMinutes, existingStart, existingEnd);
  });

  if (hasConflict) {
    return err(
      "Já existe outra tarefa neste mesmo horário para este dia.",
      409,
    );
  }

  const selectedResponsibleIds = responsible_ids.length
    ? responsible_ids
    : responsible_id
      ? [Number(responsible_id)]
      : [trip.user_id];
  const uniqueIds = [...new Set(selectedResponsibleIds)];

  const validUserIds = new Set();
  if (uniqueIds.length) {
    const placeholders = uniqueIds.map(() => "?").join(",");
    const { results: userRows } = await c.env.DB.prepare(
      `SELECT id FROM users WHERE id IN (${placeholders})`,
    )
      .bind(...uniqueIds)
      .all();
    for (const row of userRows || []) validUserIds.add(row.id);
  }

  const validMemberIds = new Set();
  if (uniqueIds.length) {
    const placeholders = uniqueIds.map(() => "?").join(",");
    const { results: memberRows } = await c.env.DB.prepare(
      `SELECT user_id FROM trip_members WHERE trip_id = ? AND user_id IN (${placeholders})`,
    )
      .bind(id, ...uniqueIds)
      .all();
    for (const row of memberRows || []) validMemberIds.add(row.user_id);
  }

  const validResponsibleIds = [];
  for (const parsed of selectedResponsibleIds) {
    if (!validUserIds.has(parsed)) {
      return err("Responsável da tarefa inválido.");
    }
    if (parsed !== trip.user_id && !validMemberIds.has(parsed)) {
      return err("O responsável deve ser um integrante da viagem.");
    }
    validResponsibleIds.push(parsed);
  }

  const primaryResponsibleId = validResponsibleIds[0] || trip.user_id;
  const responsibleIdsCsv = validResponsibleIds.length
    ? validResponsibleIds.join(",")
    : String(trip.user_id);

  const result = await c.env.DB.prepare(
    `INSERT INTO trip_tasks (
       trip_id, work_type, location, start_time, end_time, summary, task_date, responsible_id,
       responsible_ids, pending_items, vehicle, plate, montadora, modelo, submodelo, project_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      work_type,
      location,
      start_time,
      end_time,
      summary,
      task_date,
      primaryResponsibleId,
      responsibleIdsCsv,
      pending_items || null,
      vehicle || null,
      plate || null,
      montadora || null,
      modelo || null,
      submodelo || null,
      project_id ? Number(project_id) : null,
    )
    .run();

  const taskId = result.meta.last_row_id;

  if (photoFiles.length > 0 && !hasFileStorage(c.env)) {
    return err("Upload de fotos indisponível: R2 não configurado.", 503);
  }

  for (const file of photoFiles) {
    const mime = assertImageFile(file);
    const original_name = file.name || "foto.jpg";
    const stored_key = fileKey(`tasks/${id}/${taskId}`, original_name);
    await c.env.FILES.put(stored_key, file.stream(), {
      httpMetadata: { contentType: mime },
    });
    await c.env.DB.prepare(
      "INSERT INTO trip_task_photos (task_id, original_name, stored_key, mime_type) VALUES (?, ?, ?, ?)",
    )
      .bind(taskId, original_name, stored_key, mime)
      .run();
  }

  await saveCustomFields(c.env.DB, taskId, customFields);

  try {
    const { results: leaders } = await c.env.DB.prepare(
      `SELECT id FROM users WHERE sector = ? AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) = 'lider'`,
    )
      .bind(trip.sector)
      .all();
    const leaderIds = (leaders || []).map((r) => r.id).filter(Boolean);
    const user = c.get("user");
    if (leaderIds.length > 0) {
      await notifyUsers(c.env.DB, leaderIds, {
        type: "info",
        title: "Nova tarefa registrada",
        message: `${user.full_name} adicionou uma tarefa em ${trip.destination} (${task_date}).`,
        link: `/trip.html?id=${id}`,
      });
    }
  } catch (e) {
    console.error("Falha ao notificar líder da setor:", e);
  }

  return json(
    { success: true, trip: await fetchTripFull(c.env.DB, id, userId) },
    201,
  );
});

taskRoutes.delete("/:id/tasks/:taskId", async (c) => {
  const id = Number(c.req.param("id"));
  const taskId = Number(c.req.param("taskId"));
  const userId = c.get("userId");

  const trip = await getAccessibleTrip(c, id);
  if (!trip) return err("Viagem não encontrada.", 404);
  if (trip.status === "completed")
    return err("Viagem concluída é somente leitura.");

  const task = await c.env.DB.prepare(
    "SELECT * FROM trip_tasks WHERE id = ? AND trip_id = ?",
  )
    .bind(taskId, id)
    .first();
  if (!task) return err("Tarefa não encontrada.", 404);

  const { results: photos } = await c.env.DB.prepare(
    "SELECT * FROM trip_task_photos WHERE task_id = ?",
  )
    .bind(taskId)
    .all();

  if (hasFileStorage(c.env)) {
    await Promise.all(
      (photos || []).map((p) =>
        c.env.FILES.delete(p.stored_key).catch(() => {}),
      ),
    );
  }

  await c.env.DB.prepare("DELETE FROM trip_task_photos WHERE task_id = ?")
    .bind(taskId)
    .run();
  await c.env.DB.prepare("DELETE FROM trip_tasks WHERE id = ?")
    .bind(taskId)
    .run();

  return json({
    success: true,
    trip: await fetchTripFull(c.env.DB, id, userId),
  });
});

taskRoutes.put("/:id/tasks/:taskId", async (c) => {
  const id = Number(c.req.param("id"));
  const taskId = Number(c.req.param("taskId"));
  const userId = c.get("userId");

  const trip = await getAccessibleTrip(c, id);
  if (!trip) return err("Viagem não encontrada.", 404);

  const task = await c.env.DB.prepare(
    "SELECT * FROM trip_tasks WHERE id = ? AND trip_id = ?",
  )
    .bind(taskId, id)
    .first();
  if (!task) return err("Tarefa não encontrada.", 404);

  const contentType = c.req.header("content-type") || "";
  let work_type = task.work_type;
  let location = task.location;
  let start_time = task.start_time;
  let end_time = task.end_time;
  let summary = task.summary;
  let task_date = task.task_date;
  let responsible_id = task.responsible_id;
  let responsible_ids = [];
  let pending_items = task.pending_items;
  let vehicle = task.vehicle;
  let plate = task.plate;
  let montadora = task.montadora;
  let modelo = task.modelo;
  let submodelo = task.submodelo;
  let project_id = task.project_id;
  let customFields = {};
  const photoFiles = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    work_type = String(form.get("work_type") || "").trim() || work_type;
    location = String(form.get("location") || "").trim() || location;
    start_time = String(form.get("start_time") || "").trim() || start_time;
    end_time = String(form.get("end_time") || "").trim() || end_time;
    summary = String(form.get("summary") || "").trim() || summary;
    task_date = String(form.get("task_date") || "").trim() || task_date;
    responsible_ids = parseResponsibleIds(form.getAll("responsible_ids"));
    if (!responsible_ids.length) {
      const rid = String(form.get("responsible_id") || "").trim();
      if (rid) responsible_ids = [Number(rid)];
    }
    pending_items = String(form.get("pending_items") || "").trim();
    vehicle = String(form.get("vehicle") || "").trim();
    plate = String(form.get("plate") || "").trim();
    montadora = String(form.get("montadora") || "").trim();
    modelo = String(form.get("modelo") || "").trim();
    submodelo = String(form.get("submodelo") || "").trim();
    project_id = String(form.get("project_id") || "").trim() || project_id;
    customFields = parseCustomFields(form);

    for (const entry of form.getAll("photos")) {
      if (entry instanceof File) {
        photoFiles.push(entry);
      }
    }
  } else {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return err("JSON inválido.");
    }
    work_type = String(body.work_type || "").trim() || work_type;
    location = String(body.location || "").trim() || location;
    start_time = String(body.start_time || "").trim() || start_time;
    end_time = String(body.end_time || "").trim() || end_time;
    summary = String(body.summary || "").trim() || summary;
    task_date = String(body.task_date || "").trim() || task_date;
    responsible_ids = parseResponsibleIds(
      body.responsible_ids || body.responsible_id || [],
    );
    if (!responsible_ids.length) {
      const rid = String(body.responsible_id || "").trim();
      if (rid) responsible_ids = [Number(rid)];
    }
    pending_items = String(body.pending_items || "").trim();
    vehicle = String(body.vehicle || "").trim();
    plate = String(body.plate || "").trim();
    montadora = String(body.montadora || "").trim();
    modelo = String(body.modelo || "").trim();
    submodelo = String(body.submodelo || "").trim();
    project_id = String(body.project_id || "").trim() || project_id;
    customFields = parseCustomFields(body);
  }

  const normalizedWorkType = work_type
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const isLunch = normalizedWorkType === "refeicao";
  if (isLunch) {
    if (!location) location = "Refeição";
    if (!summary) summary = "Horário de refeição";
  }

  if (
    !work_type ||
    !location ||
    !start_time ||
    !end_time ||
    !summary ||
    !task_date
  ) {
    return err("Preencha todos os campos da tarefa.");
  }

  const requiresVehicle = [].includes(normalizedWorkType);
  if (
    requiresVehicle &&
    (!vehicle || !plate || !montadora || !modelo || !submodelo)
  ) {
    return err(
      "Para este tipo de trabalho, informe a montadora, o modelo, a versão e a placa.",
    );
  }

  if (!task_date || task_date < trip.start_date || task_date > trip.end_date) {
    return err("Data da tarefa deve estar dentro do período da viagem.");
  }

  if (end_time < start_time) {
    return err("Hora de término deve ser igual ou posterior à hora de início.");
  }

  const startMinutes = timeToMinutes(start_time);
  const endMinutes = timeToMinutes(end_time);
  if (
    startMinutes == null ||
    endMinutes == null ||
    endMinutes <= startMinutes
  ) {
    return err("Informe um intervalo de horário válido.", 400);
  }

  const { results: conflictingTasks } = await c.env.DB.prepare(
    "SELECT id, start_time, end_time FROM trip_tasks WHERE trip_id = ? AND task_date = ? AND id != ?",
  )
    .bind(id, task_date, taskId)
    .all();

  const hasConflict = (conflictingTasks || []).some((t) => {
    const existingStart = timeToMinutes(t.start_time);
    const existingEnd = timeToMinutes(t.end_time);
    if (existingStart == null || existingEnd == null) return false;
    return rangesOverlap(startMinutes, endMinutes, existingStart, existingEnd);
  });

  if (hasConflict) {
    return err(
      "Já existe outra tarefa neste mesmo horário para este dia.",
      409,
    );
  }

  const selectedResponsibleIds = responsible_ids.length
    ? responsible_ids
    : [task.responsible_id || trip.user_id];
  const uniqueIds = [...new Set(selectedResponsibleIds)];

  const validUserIds = new Set();
  if (uniqueIds.length) {
    const placeholders = uniqueIds.map(() => "?").join(",");
    const { results: userRows } = await c.env.DB.prepare(
      `SELECT id FROM users WHERE id IN (${placeholders})`,
    )
      .bind(...uniqueIds)
      .all();
    for (const row of userRows || []) validUserIds.add(row.id);
  }

  const validMemberIds = new Set();
  if (uniqueIds.length) {
    const placeholders = uniqueIds.map(() => "?").join(",");
    const { results: memberRows } = await c.env.DB.prepare(
      `SELECT user_id FROM trip_members WHERE trip_id = ? AND user_id IN (${placeholders})`,
    )
      .bind(id, ...uniqueIds)
      .all();
    for (const row of memberRows || []) validMemberIds.add(row.user_id);
  }

  const validResponsibleIds = [];
  for (const parsed of selectedResponsibleIds) {
    if (!validUserIds.has(parsed)) {
      return err("Responsável da tarefa inválido.");
    }
    if (parsed !== trip.user_id && !validMemberIds.has(parsed)) {
      return err("O responsável deve ser um integrante da viagem.");
    }
    validResponsibleIds.push(parsed);
  }

  const primaryResponsibleId = validResponsibleIds[0] || trip.user_id;
  const responsibleIdsCsv = validResponsibleIds.length
    ? validResponsibleIds.join(",")
    : String(trip.user_id);

  try {
    await c.env.DB.prepare(
      `UPDATE trip_tasks SET
         work_type = ?, location = ?, start_time = ?, end_time = ?, summary = ?, task_date = ?, 
         responsible_id = ?, responsible_ids = ?, pending_items = ?, vehicle = ?, plate = ?, 
         montadora = ?, modelo = ?, submodelo = ?, project_id = ?
       WHERE id = ?`,
    )
      .bind(
        work_type,
        location,
        start_time,
        end_time,
        summary,
        task_date,
        primaryResponsibleId,
        responsibleIdsCsv,
        pending_items || null,
        vehicle || null,
        plate || null,
        montadora || null,
        modelo || null,
        submodelo || null,
        project_id ? Number(project_id) : null,
        taskId,
      )
      .run();
  } catch (updateError) {
    if (String(updateError).includes("no such column")) {
      await c.env.DB.prepare(
        `UPDATE trip_tasks SET
           work_type = ?, location = ?, start_time = ?, end_time = ?, summary = ?, task_date = ?, 
           responsible_id = ?, pending_items = ?, vehicle = ?, plate = ?
         WHERE id = ?`,
      )
        .bind(
          work_type,
          location,
          start_time,
          end_time,
          summary,
          task_date,
          primaryResponsibleId,
          pending_items || null,
          vehicle || null,
          plate || null,
          taskId,
        )
        .run();
    } else {
      throw updateError;
    }
  }

  if (photoFiles.length > 0 && !hasFileStorage(c.env)) {
    return err("Upload de fotos indisponível: R2 não configurado.", 503);
  }

  for (const file of photoFiles) {
    const mime = assertImageFile(file);
    const original_name = file.name || "foto.jpg";
    const stored_key = fileKey(`tasks/${id}/${taskId}`, original_name);
    await c.env.FILES.put(stored_key, file.stream(), {
      httpMetadata: { contentType: mime },
    });
    await c.env.DB.prepare(
      "INSERT INTO trip_task_photos (task_id, original_name, stored_key, mime_type) VALUES (?, ?, ?, ?)",
    )
      .bind(taskId, original_name, stored_key, mime)
      .run();
  }

  await saveCustomFields(c.env.DB, taskId, customFields);

  return json({
    success: true,
    trip: await fetchTripFull(c.env.DB, id, userId),
  });
});

taskRoutes.get("/:id/tasks/:taskId", async (c) => {
  const tripId = Number(c.req.param("id"));
  const taskId = Number(c.req.param("taskId"));
  const userId = c.get("userId");

  const trip = await getAccessibleTrip(c, tripId);
  if (!trip) return err("Viagem não encontrada.", 404);

  const task = await c.env.DB.prepare(
    `SELECT tt.*, lp.name AS project_name
     FROM trip_tasks tt
     LEFT JOIN leader_projects lp ON lp.id = tt.project_id
     WHERE tt.id = ? AND tt.trip_id = ?`,
  )
    .bind(taskId, tripId)
    .first();

  if (!task) return err("Tarefa não encontrada.", 404);

  const { results: photos } = await c.env.DB.prepare(
    "SELECT * FROM trip_task_photos WHERE task_id = ? ORDER BY id ASC",
  )
    .bind(taskId)
    .all();

  const customFields = await getCustomFields(c.env.DB, taskId);

  const { results: memberRows } = await c.env.DB.prepare(
    `SELECT tm.*, u.position_title, u.email
     FROM trip_members tm
     LEFT JOIN users u ON u.id = tm.user_id
     WHERE tm.trip_id = ?
     ORDER BY tm.id ASC`,
  )
    .bind(tripId)
    .all();

  let members = memberRows || [];
  try {
    const owner = await c.env.DB.prepare(
      "SELECT id, full_name, sector, manager_name, position_title, employee_id FROM users WHERE id = ?",
    )
      .bind(trip.user_id)
      .first();
    if (owner) {
      const exists = members.some(
        (m) => Number(m.user_id || m.id) === Number(owner.id),
      );
      if (!exists) {
        members = [
          {
            id: null,
            trip_id: tripId,
            user_id: owner.id,
            full_name: owner.full_name,
            sector: owner.sector || null,
            manager_name: owner.manager_name || null,
            position_title: owner.position_title || null,
            employee_id: owner.employee_id || null,
          },
          ...members,
        ];
      }
    }
  } catch {}

  const rawResponsibleIds = Array.isArray(task.responsible_ids)
    ? task.responsible_ids
    : String(task.responsible_ids || "")
        .split(",")
        .map((id) => Number(String(id).trim()))
        .filter((id) => Number.isInteger(id) && id > 0);

  const hasLegacy =
    !rawResponsibleIds.length &&
    Number.isInteger(Number(task.responsible_id)) &&
    Number(task.responsible_id) > 0;
  const responsibleIds = hasLegacy
    ? [Number(task.responsible_id)]
    : rawResponsibleIds;

  const responsibleUsers = new Map();
  if (responsibleIds.length) {
    const placeholders = responsibleIds.map(() => "?").join(",");
    const { results: users } = await c.env.DB.prepare(
      `SELECT id, full_name, employee_id, position_title FROM users WHERE id IN (${placeholders}) ORDER BY full_name ASC`,
    )
      .bind(...responsibleIds)
      .all();
    for (const u of users || []) responsibleUsers.set(u.id, u);
  }

  const responsibles = responsibleIds
    .map((id) => responsibleUsers.get(id))
    .filter(Boolean)
    .map((u) => ({
      id: u.id,
      full_name: u.full_name,
      employee_id: u.employee_id || null,
      position_title: u.position_title || null,
    }));

  const primaryResponsible = responsibles[0] || null;

  const formattedTask = {
    id: task.id,
    trip_id: task.trip_id,
    work_type: task.work_type,
    location: task.location,
    start_time: task.start_time,
    end_time: task.end_time,
    summary: task.summary,
    task_date: task.task_date,
    responsible_id: primaryResponsible?.id || task.responsible_id || null,
    responsible_ids: responsibleIds,
    vehicle: task.vehicle || null,
    plate: task.plate || null,
    montadora: task.montadora || null,
    modelo: task.modelo || null,
    submodelo: task.submodelo || null,
    project_id: task.project_id || null,
    project_name: task.project_name || null,
    custom_fields: await getCustomFields(c.env.DB, taskId),
    responsible: primaryResponsible
      ? {
          id: primaryResponsible.id,
          full_name: primaryResponsible.full_name,
          employee_id: primaryResponsible.employee_id || null,
          position_title: primaryResponsible.position_title || null,
        }
      : null,
    responsibles,
    pending_items: task.pending_items || "",
    created_at: task.created_at,
    updated_at: task.updated_at,
    photos: (photos || []).map((p) => ({
      id: p.id,
      original_name: p.original_name,
      url: `/api/files/${p.stored_key}`,
      mime_type: p.mime_type,
      created_at: p.created_at,
    })),
  };

  return json({
    success: true,
    task: formattedTask,
    members: members.map((m) => ({ ...m, user_id: m.user_id || m.id })),
  });
});
