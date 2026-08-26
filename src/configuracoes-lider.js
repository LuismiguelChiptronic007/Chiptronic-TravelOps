import { Hono } from "hono";
import { requireUser } from "./auth.js";
import { err, json, isSectorLeader, getLedSector } from "./helpers.js";

export const configuracoesLider = new Hono();
configuracoesLider.use("*", requireUser);

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
