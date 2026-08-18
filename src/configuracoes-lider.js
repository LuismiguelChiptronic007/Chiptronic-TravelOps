import { Hono } from 'hono';
import { requireUser } from './auth.js';
import { err, json, isSectorLeader } from './helpers.js';

export const configuracoesLider = new Hono();
configuracoesLider.use('*', requireUser);

configuracoesLider.get('/projetos', async (c) => {
  const user = c.get('user');
  if (!isSectorLeader(user)) {
    return err('Apenas líderes de setor podem acessar esta funcionalidade.', 403);
  }

  const sector = user.sector;
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, created_at FROM leader_projects WHERE sector = ? ORDER BY name ASC'
  )
    .bind(sector)
    .all();

  return json({ success: true, projects: results || [] });
});

configuracoesLider.post('/projetos', async (c) => {
  const user = c.get('user');
  if (!isSectorLeader(user)) {
    return err('Apenas líderes de setor podem adicionar projetos.', 403);
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return err('JSON inválido.', 400);
  }

  const name = String(body.name || '').trim();
  if (!name) {
    return err('Informe o nome do projeto.', 400);
  }

  const sector = user.sector;
  const result = await c.env.DB.prepare(
    'INSERT INTO leader_projects (sector, name, created_by) VALUES (?, ?, ?)'
  )
    .bind(sector, name, user.id)
    .run();

  return json({ success: true, id: result.meta.last_row_id });
});

configuracoesLider.delete('/projetos/:id', async (c) => {
  const user = c.get('user');
  if (!isSectorLeader(user)) {
    return err('Apenas líderes de setor podem remover projetos.', 403);
  }

  const id = Number(c.req.param('id'));
  const sector = user.sector;

  await c.env.DB.prepare(
    'DELETE FROM leader_projects WHERE id = ? AND sector = ?'
  )
    .bind(id, sector)
    .run();

  return json({ success: true });
});

configuracoesLider.get('/tipos-trabalho', async (c) => {
  const user = c.get('user');
  if (!isSectorLeader(user)) {
    return err('Apenas líderes de setor podem acessar esta funcionalidade.', 403);
  }

  const sector = user.sector;
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, created_at FROM leader_work_types WHERE sector = ? ORDER BY name ASC'
  )
    .bind(sector)
    .all();

  return json({ success: true, work_types: results || [] });
});

configuracoesLider.post('/tipos-trabalho', async (c) => {
  const user = c.get('user');
  if (!isSectorLeader(user)) {
    return err('Apenas líderes de setor podem adicionar tipos de trabalho.', 403);
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return err('JSON inválido.', 400);
  }

  const name = String(body.name || '').trim();
  if (!name) {
    return err('Informe o nome do tipo de trabalho.', 400);
  }

  const sector = user.sector;
  const result = await c.env.DB.prepare(
    'INSERT INTO leader_work_types (sector, name, created_by) VALUES (?, ?, ?)'
  )
    .bind(sector, name, user.id)
    .run();

  return json({ success: true, id: result.meta.last_row_id });
});

configuracoesLider.delete('/tipos-trabalho/:id', async (c) => {
  const user = c.get('user');
  if (!isSectorLeader(user)) {
    return err('Apenas líderes de setor podem remover tipos de trabalho.', 403);
  }

  const id = Number(c.req.param('id'));
  const sector = user.sector;

  await c.env.DB.prepare(
    'DELETE FROM leader_work_types WHERE id = ? AND sector = ?'
  )
    .bind(id, sector)
    .run();

  return json({ success: true });
});
