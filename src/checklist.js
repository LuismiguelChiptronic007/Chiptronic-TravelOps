import { Hono } from 'hono';
import { checklistIsComplete, err, json, hasTaskEveryTripDay } from './helpers.js';
import { fetchTripFull } from './trip_utils.js';
import { logActivity } from './activity.js';

export const checklistRoutes = new Hono();

checklistRoutes.post('/:id/complete', async (c) => {
  const id = Number(c.req.param('id'));
  const userId = c.get('userId');
  const viewer = c.get('user');

  const trip = await c.env.DB.prepare('SELECT * FROM trips WHERE id = ?')
    .bind(id)
    .first();
  if (!trip) return err('Viagem não encontrada.', 404);

  const isTripOwner = trip.user_id === userId;
  const isTripMember = !!(await c.env.DB.prepare(
    'SELECT id FROM trip_members WHERE trip_id = ? AND user_id = ? LIMIT 1'
  )
    .bind(id, userId)
    .first());
  const isAdminUser = viewer?.role === 'admin' || viewer?.role === 'admin_master';
  const ledSector = viewer?.sector
    ? await c.env.DB.prepare(
        `SELECT id FROM users WHERE sector = ?
         AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) = 'lider'
         AND id = ? LIMIT 1`
      )
        .bind(viewer.sector, userId)
        .first()
    : null;

  if (!isTripOwner && !isTripMember && !isAdminUser && !ledSector) {
    return err('Viagem não encontrada.', 404);
  }

  if (trip.status === 'completed') return err('Viagem já concluída.');

  let tasks = [];
  try {
    const { results } = await c.env.DB.prepare('SELECT id, task_date FROM trip_tasks WHERE trip_id = ?')
      .bind(id)
      .all();
    tasks = results || [];
  } catch {
    tasks = [];
  }

  if (!checklistIsComplete(null, tasks)) {
    return err('Registre ao menos uma tarefa antes de concluir a viagem.', 400);
  }

  if (!hasTaskEveryTripDay(trip, tasks)) {
    return err('Para concluir a viagem, cada dia do período deve ter pelo menos uma tarefa registrada. Verifique se não há dias sem atividades.', 400);
  }

  const checklist = await c.env.DB.prepare('SELECT id FROM trip_checklists WHERE trip_id = ?')
    .bind(id)
    .first();

  if (checklist) {
    await c.env.DB.prepare(
      `UPDATE trip_checklists SET completed_at = datetime('now'), updated_at = datetime('now') WHERE trip_id = ?`
    )
      .bind(id)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO trip_checklists (trip_id, completed_at) VALUES (?, datetime('now'))`
    )
      .bind(id)
      .run();
  }

  await c.env.DB.prepare(
    `UPDATE trips SET status = 'completed', updated_at = datetime('now') WHERE id = ?`
  )
    .bind(id)
    .run();

  await logActivity(c.env.DB, {
    tripId: id,
    userId,
    action: 'trip_completed',
    summary: 'Finalizou a viagem e entregou o relatório.',
  });

  return json({ success: true, trip: await fetchTripFull(c.env.DB, id, userId) });
});