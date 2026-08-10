import { Hono } from 'hono';
import { checklistIsComplete, err, json } from './helpers.js';
import { fetchTripFull } from './trip_utils.js';

export const checklistRoutes = new Hono();

checklistRoutes.post('/:id/complete', async (c) => {
  const id = Number(c.req.param('id'));
  const userId = c.get('userId');
  const trip = await c.env.DB.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();
  if (!trip) return err('Viagem não encontrada.', 404);
  if (trip.status === 'completed') return err('Viagem já concluída.');

  let tasks = [];
  try {
    const { results } = await c.env.DB.prepare('SELECT id FROM trip_tasks WHERE trip_id = ?')
      .bind(id)
      .all();
    tasks = results || [];
  } catch {
    tasks = [];
  }

  if (!checklistIsComplete(null, tasks)) {
    return err('Registre ao menos uma tarefa no encerramento antes de concluir a viagem.', 400);
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

  return json({ success: true, trip: await fetchTripFull(c.env.DB, id, userId) });
});