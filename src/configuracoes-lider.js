import { Hono } from "hono";
import { requireUser } from "./auth.js";
import { err, json, isSectorLeader, getLedSector, isAdminMaster, isLuisMiguel } from "./helpers.js";

export const configuracoesLider = new Hono();
configuracoesLider.use("*", requireUser);

const EQUIPMENT_TYPES = [
  "Equipamento de LOGs",
  "Equipamento Diagnóstico",
  "Ferramentas",
  "Equipamentos de Telemetria",
];

function canManageEquipment(user) {
  return isSectorLeader(user) || isLuisMiguel(user);
}

async function resolveEquipmentSector(c) {
  const user = c.get("user");
  const requested = String(c.req.query("sector") || "").trim();
  const ledSector = getLedSector(user);
  if (!requested) return ledSector || user?.sector || "";
  if (isLuisMiguel(user)) return requested;
  if (ledSector === requested || user?.sector === requested) return requested;
  return "";
}

async function getEquipmentTypes(db, sector) {
  const { results } = await db.prepare(
    "SELECT name FROM sector_equipment_types WHERE sector = ? ORDER BY name ASC",
  ).bind(sector).all();
  return [...new Set([
    ...EQUIPMENT_TYPES,
    ...(results || []).map((type) => type.name),
  ])];
}

configuracoesLider.get("/equipamentos", async (c) => {
  const sector = await resolveEquipmentSector(c);
  if (!sector) return json({ success: true, equipment_types: EQUIPMENT_TYPES, equipment: [] });

  const equipmentTypes = await getEquipmentTypes(c.env.DB, sector);

  const { results } = await c.env.DB.prepare(
    "SELECT id, sector, equipment_type, name, created_at FROM sector_equipment_catalog WHERE sector = ? ORDER BY equipment_type ASC, name ASC",
  ).bind(sector).all();
  return json({ success: true, sector, equipment_types: equipmentTypes, equipment: results || [] });
});

configuracoesLider.post("/equipamentos/tipos", async (c) => {
  const user = c.get("user");
  if (!canManageEquipment(user)) return err("Apenas líderes de setor ou Luis Miguel podem cadastrar tipos de equipamento.", 403);

  let body;
  try { body = await c.req.json(); } catch { return err("JSON inválido.", 400); }
  const name = String(body.name || "").trim();
  const sector = String(body.sector || getLedSector(user) || user?.sector || "").trim();
  if (!name) return err("Informe o nome do tipo de equipamento.", 400);
  if (name.length > 120) return err("O tipo de equipamento deve ter no máximo 120 caracteres.", 400);
  if (EQUIPMENT_TYPES.includes(name)) return err("Este tipo de equipamento já existe.", 409);
  if (!sector) return err("Setor não identificado.", 400);
  if (!isLuisMiguel(user) && getLedSector(user) !== sector) return err("Você só pode cadastrar tipos do seu setor.", 403);

  try {
    const result = await c.env.DB.prepare(
      "INSERT INTO sector_equipment_types (sector, name, created_by) VALUES (?, ?, ?)",
    ).bind(sector, name, user.id).run();
    return json({ success: true, id: result.meta.last_row_id, name });
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("unique")) return err("Este tipo de equipamento já existe neste setor.", 409);
    throw error;
  }
});

configuracoesLider.post("/equipamentos", async (c) => {
  const user = c.get("user");
  if (!canManageEquipment(user)) return err("Apenas líderes de setor ou Luis Miguel podem cadastrar equipamentos.", 403);

  let body;
  try { body = await c.req.json(); } catch { return err("JSON inválido.", 400); }
  const equipmentType = String(body.equipment_type || "").trim();
  const name = String(body.name || "").trim();
  const sector = String(body.sector || getLedSector(user) || user?.sector || "").trim();
  const equipmentTypes = sector ? await getEquipmentTypes(c.env.DB, sector) : EQUIPMENT_TYPES;
  if (!equipmentTypes.includes(equipmentType)) return err("Tipo de equipamento inválido.", 400);
  if (!name) return err("Informe o nome do equipamento.", 400);
  if (!sector) return err("Setor não identificado.", 400);
  if (!isLuisMiguel(user) && getLedSector(user) !== sector) return err("Você só pode cadastrar equipamentos do seu setor.", 403);

  try {
    const result = await c.env.DB.prepare(
      "INSERT INTO sector_equipment_catalog (sector, equipment_type, name, created_by) VALUES (?, ?, ?, ?)",
    ).bind(sector, equipmentType, name, user.id).run();
    return json({ success: true, id: result.meta.last_row_id });
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("unique")) return err("Este equipamento já existe neste tipo e setor.", 409);
    throw error;
  }
});

configuracoesLider.delete("/equipamentos/:id", async (c) => {
  const user = c.get("user");
  if (!canManageEquipment(user)) return err("Apenas líderes de setor ou Luis Miguel podem remover equipamentos.", 403);
  const id = Number(c.req.param("id"));
  const sector = await resolveEquipmentSector(c);
  const result = await c.env.DB.prepare(
    "DELETE FROM sector_equipment_catalog WHERE id = ? AND sector = ?",
  ).bind(id, sector).run();
  if (!result.meta.changes) return err("Equipamento não encontrado.", 404);
  return json({ success: true });
});

configuracoesLider.get("/projetos", async (c) => {
  const user = c.get("user");
  const sector = getLedSector(user) || user?.sector;
  if (!sector) {
    return json({ success: true, projects: [] });
  }

  const { results } = await c.env.DB.prepare(
    "SELECT id, name, created_at FROM leader_projects WHERE sector = ? ORDER BY name ASC",
  )
    .bind(sector)
    .all();

  return json({ success: true, projects: results || [] });
});

configuracoesLider.post("/projetos", async (c) => {
  const user = c.get("user");
  if (!isSectorLeader(user)) {
    return err("Apenas líderes de setor podem adicionar projetos.", 403);
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return err("JSON inválido.", 400);
  }

  const name = String(body.name || "").trim();
  if (!name) {
    return err("Informe o nome do projeto.", 400);
  }

  const sector = getLedSector(user) || user.sector;
  if (!sector) {
    return err("Setor não identificado para o líder.", 400);
  }
  const result = await c.env.DB.prepare(
    "INSERT INTO leader_projects (sector, name, created_by) VALUES (?, ?, ?)",
  )
    .bind(sector, name, user.id)
    .run();

  return json({ success: true, id: result.meta.last_row_id });
});

configuracoesLider.delete("/projetos/:id", async (c) => {
  const user = c.get("user");
  if (!isSectorLeader(user)) {
    return err("Apenas líderes de setor podem remover projetos.", 403);
  }

  const id = Number(c.req.param("id"));
  const sector = getLedSector(user) || user.sector;

  await c.env.DB.prepare(
    "DELETE FROM leader_projects WHERE id = ? AND sector = ?",
  )
    .bind(id, sector)
    .run();

  return json({ success: true });
});

configuracoesLider.put("/projetos/:id", async (c) => {
  const user = c.get("user");
  if (!isSectorLeader(user)) {
    return err("Apenas líderes de setor podem editar projetos.", 403);
  }

  const id = Number(c.req.param("id"));
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err("JSON inválido.", 400);
  }
  const name = String(body.name || "").trim();
  if (!id || !name) return err("Informe um nome válido para o projeto.", 400);

  const sector = getLedSector(user) || user.sector;
  const result = await c.env.DB.prepare(
    "UPDATE leader_projects SET name = ? WHERE id = ? AND sector = ?",
  )
    .bind(name, id, sector)
    .run();
  if (!result.meta.changes) return err("Projeto não encontrado.", 404);
  return json({ success: true });
});

configuracoesLider.get("/tipos-trabalho", async (c) => {
  const user = c.get("user");
  const sector = getLedSector(user) || user?.sector;
  if (!sector) {
    return json({ success: true, work_types: [] });
  }

  const { results } = await c.env.DB.prepare(
    "SELECT id, name, created_at FROM leader_work_types WHERE sector = ? ORDER BY name ASC",
  )
    .bind(sector)
    .all();

  return json({ success: true, work_types: results || [] });
});

configuracoesLider.post("/tipos-trabalho", async (c) => {
  const user = c.get("user");
  if (!isSectorLeader(user)) {
    return err(
      "Apenas líderes de setor podem adicionar tipos de trabalho.",
      403,
    );
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return err("JSON inválido.", 400);
  }

  const name = String(body.name || "").trim();
  if (!name) {
    return err("Informe o nome do tipo de trabalho.", 400);
  }

  const sector = getLedSector(user) || user.sector;
  if (!sector) {
    return err("Setor não identificado para o líder.", 400);
  }
  const result = await c.env.DB.prepare(
    "INSERT INTO leader_work_types (sector, name, created_by) VALUES (?, ?, ?)",
  )
    .bind(sector, name, user.id)
    .run();

  return json({ success: true, id: result.meta.last_row_id });
});

configuracoesLider.put("/tipos-trabalho/:id", async (c) => {
  const user = c.get("user");
  if (!isSectorLeader(user)) {
    return err("Apenas líderes de setor podem editar tipos de trabalho.", 403);
  }

  const id = Number(c.req.param("id"));
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err("JSON inválido.", 400);
  }

  const name = String(body.name || "").trim();
  if (!id || !name) return err("Informe um nome válido para o tipo de trabalho.", 400);

  const sector = getLedSector(user) || user.sector;
  const current = await c.env.DB.prepare(
    "SELECT name FROM leader_work_types WHERE id = ? AND sector = ?",
  )
    .bind(id, sector)
    .first();
  if (!current) return err("Tipo de trabalho não encontrado.", 404);

  try {
    await c.env.DB.prepare(
      "UPDATE leader_work_types SET name = ? WHERE id = ? AND sector = ?",
    )
      .bind(name, id, sector)
      .run();
    if (current.name !== name) {
      await c.env.DB.prepare(
        "UPDATE leader_work_type_fields SET work_type_name = ? WHERE sector = ? AND work_type_name = ?",
      )
        .bind(name, sector, current.name)
        .run();
    }
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("unique")) {
      return err("Já existe um tipo de trabalho com esse nome.", 409);
    }
    throw error;
  }

  return json({ success: true });
});

configuracoesLider.delete("/tipos-trabalho/:id", async (c) => {
  const user = c.get("user");
  if (!isSectorLeader(user)) {
    return err("Apenas líderes de setor podem remover tipos de trabalho.", 403);
  }

  const id = Number(c.req.param("id"));
  const sector = getLedSector(user) || user.sector;

  await c.env.DB.prepare(
    "DELETE FROM leader_work_types WHERE id = ? AND sector = ?",
  )
    .bind(id, sector)
    .run();

  return json({ success: true });
});

async function resolveLeaderSector(c, explicitSector = "") {
  const user = c.get("user");
  const sectorFromQuery = String(
    explicitSector || c.req.query("sector") || "",
  ).trim();
  if (sectorFromQuery) return sectorFromQuery;

  const tripId = Number(c.req.query("trip_id") || 0);
  if (tripId > 0) {
    try {
      const trip = await c.env.DB.prepare(
        "SELECT sector FROM trips WHERE id = ?",
      )
        .bind(tripId)
        .first();
      const tripSector = String(trip?.sector || "").trim();
      if (tripSector) return tripSector;
    } catch {
      // ignore lookup failures and continue with fallback sector
    }
  }

  return getLedSector(user) || user?.sector || "";
}

configuracoesLider.get("/tipos-trabalho/:name/campos", async (c) => {
  const user = c.get("user");
  const sector = await resolveLeaderSector(c);
  if (!sector) {
    return json({ success: true, fields: [] });
  }

  const name = String(c.req.param("name"));
  const { results } = await c.env.DB.prepare(
    `SELECT id, field_name, is_required, sort_order
     FROM leader_work_type_fields
     WHERE sector = ? AND work_type_name = ?
     ORDER BY sort_order ASC, field_name ASC`,
  )
    .bind(sector, name)
    .all();

  return json({ success: true, fields: results || [] });
});

configuracoesLider.post("/tipos-trabalho/:name/campos", async (c) => {
  const user = c.get("user");
  if (!isSectorLeader(user)) {
    return err("Apenas líderes de setor podem adicionar campos.", 403);
  }

  const name = String(c.req.param("name"));
  const sector = await resolveLeaderSector(c);
  if (!sector) {
    return err("Setor não identificado para o líder.", 400);
  }
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err("JSON inválido.", 400);
  }

  const fieldName = String(body.field_name || "").trim();
  if (!fieldName) {
    return err("Informe o nome do campo.", 400);
  }

  const isRequired = body.is_required ? 1 : 0;
  const sortOrder = Number(body.sort_order || 0);

  await c.env.DB.prepare(
    `INSERT INTO leader_work_type_fields (sector, work_type_name, field_name, is_required, sort_order)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(sector, work_type_name, field_name) DO UPDATE SET
       is_required = excluded.is_required,
       sort_order = excluded.sort_order`,
  )
    .bind(sector, name, fieldName, isRequired, sortOrder)
    .run();

  return json({ success: true });
});

configuracoesLider.delete(
  "/tipos-trabalho/:name/campos/:fieldName",
  async (c) => {
    const user = c.get("user");
    if (!isSectorLeader(user)) {
      return err("Apenas líderes de setor podem remover campos.", 403);
    }

    const name = String(c.req.param("name"));
    const fieldName = String(c.req.param("fieldName"));
    const sector = await resolveLeaderSector(c);

    await c.env.DB.prepare(
      "DELETE FROM leader_work_type_fields WHERE sector = ? AND work_type_name = ? AND field_name = ?",
    )
      .bind(sector, name, fieldName)
      .run();

    return json({ success: true });
  },
);

configuracoesLider.get("/projetos/:id/campos", async (c) => {
  const user = c.get("user");
  const sector = await resolveLeaderSector(c);
  if (!sector) {
    return json({ success: true, fields: [] });
  }

  const projectId = Number(c.req.param("id"));
  const { results } = await c.env.DB.prepare(
    `SELECT id, field_name, is_required, sort_order
     FROM leader_project_fields
     WHERE sector = ? AND project_id = ?
     ORDER BY sort_order ASC, field_name ASC`,
  )
    .bind(sector, projectId)
    .all();

  return json({ success: true, fields: results || [] });
});

configuracoesLider.post("/projetos/:id/campos", async (c) => {
  const user = c.get("user");
  if (!isSectorLeader(user)) {
    return err("Apenas líderes de setor podem adicionar campos.", 403);
  }

  const projectId = Number(c.req.param("id"));
  const sector = await resolveLeaderSector(c);
  if (!sector) {
    return err("Setor não identificado para o líder.", 400);
  }
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err("JSON inválido.", 400);
  }

  const fieldName = String(body.field_name || "").trim();
  if (!fieldName) {
    return err("Informe o nome do campo.", 400);
  }

  const isRequired = body.is_required ? 1 : 0;
  const sortOrder = Number(body.sort_order || 0);

  await c.env.DB.prepare(
    `INSERT INTO leader_project_fields (sector, project_id, field_name, is_required, sort_order)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(sector, project_id, field_name) DO UPDATE SET
       is_required = excluded.is_required,
       sort_order = excluded.sort_order`,
  )
    .bind(sector, projectId, fieldName, isRequired, sortOrder)
    .run();

  return json({ success: true });
});

configuracoesLider.delete("/projetos/:id/campos/:fieldName", async (c) => {
  const user = c.get("user");
  if (!isSectorLeader(user)) {
    return err("Apenas líderes de setor podem remover campos.", 403);
  }

  const projectId = Number(c.req.param("id"));
  const fieldName = String(c.req.param("fieldName"));
  const sector = await resolveLeaderSector(c);

  await c.env.DB.prepare(
    "DELETE FROM leader_project_fields WHERE sector = ? AND project_id = ? AND field_name = ?",
  )
    .bind(sector, projectId, fieldName)
    .run();

  return json({ success: true });
});
