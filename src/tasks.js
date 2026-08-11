import { Hono } from 'hono';
import { assertImageFile, err, fileKey, hasFileStorage, json, WORK_TYPES } from './helpers.js';
import { fetchTripFull } from './trip_utils.js';
import { notifyUsers } from './notifications.js';

export const taskRoutes = new Hono();

taskRoutes.get('/work-types', (c) => json({ success: true, work_types: WORK_TYPES }));

async function getOwnedTrip(c, tripId) {
  return c.env.DB.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
    .bind(tripId, c.get('userId'))
    .first();
}

taskRoutes.post('/:id/tasks', async (c) => {
  const id = Number(c.req.param('id'));
  const userId = c.get('userId');
  const trip = await getOwnedTrip(c, id);
  if (!trip) return err('Viagem não encontrada.', 404);
  if (trip.status === 'completed') return err('Viagem concluída não aceita novas tarefas.');

  const contentType = c.req.header('content-type') || '';
  let work_type = '';
  let location = '';
  let start_time = '';
  let end_time = '';
  let summary = '';
  let task_date = '';
  let responsible_id = '';
  let pending_items = '';
  let approved_loads = '';
  let rejected_loads = '';
  let logs_realizados = '';
  let sistemas_logados = '';
  let nome_sistemas_logados = '';
  const photoFiles = [];

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData();
    work_type = String(form.get('work_type') || '').trim();
    location = String(form.get('location') || '').trim();
    start_time = String(form.get('start_time') || '').trim();
    end_time = String(form.get('end_time') || '').trim();
    summary = String(form.get('summary') || '').trim();
    task_date = String(form.get('task_date') || '').trim();
    responsible_id = String(form.get('responsible_id') || '').trim();
    pending_items = String(form.get('pending_items') || '').trim();
      approved_loads = String(form.get('approved_loads') || '').trim();
      rejected_loads = String(form.get('rejected_loads') || '').trim();
      logs_realizados = String(form.get('logs_realizados') || '').trim();
      sistemas_logados = String(form.get('sistemas_logados') || '').trim();
      nome_sistemas_logados = String(form.get('nome_sistemas_logados') || '').trim();

    for (const [key, value] of form.entries()) {
      if ((key === 'photos' || key === 'photos[]' || key === 'photo') && value && typeof value === 'object' && value.size > 0) {
        photoFiles.push(value);
      }
    }
  } else {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return err('JSON inválido.');
    }
    work_type = String(body.work_type || '').trim();
    location = String(body.location || '').trim();
    start_time = String(body.start_time || '').trim();
    end_time = String(body.end_time || '').trim();
    summary = String(body.summary || '').trim();
    task_date = String(body.task_date || '').trim();
    responsible_id = String(body.responsible_id || '').trim();
    pending_items = String(body.pending_items || '').trim();
      approved_loads = String(body.approved_loads || '').trim();
      rejected_loads = String(body.rejected_loads || '').trim();
      logs_realizados = String(body.logs_realizados || '').trim();
      sistemas_logados = String(body.sistemas_logados || '').trim();
      nome_sistemas_logados = String(body.nome_sistemas_logados || '').trim();
  }

  if (!work_type) return err('Selecione o tipo de trabalho.');
  if (!location) return err('Informe o local do serviço.');
  if (!start_time || !end_time) return err('Informe o horário de início e fim.');
  if (end_time < start_time) return err('Horário de fim deve ser >= horário de início.');
  if (!summary) return err('Descreva o resumo da atividade.');
  if (!task_date) return err('Informe a data da tarefa.');
  if (task_date < trip.start_date || task_date > trip.end_date) {
    return err('A data da tarefa deve estar dentro do período da viagem.');
  }

  let responsibleIdValue = null;
  if (responsible_id) {
    const parsed = Number(responsible_id);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return err('Responsável da tarefa inválido.');
    }
    const responsibleUser = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?')
      .bind(parsed)
      .first();
    if (!responsibleUser) {
      return err('Responsável da tarefa inválido.');
    }
    const member = await c.env.DB.prepare(
      'SELECT id FROM trip_members WHERE trip_id = ? AND user_id = ?'
    )
      .bind(id, parsed)
      .first();
    if (!member) {
      return err('O responsável deve ser um integrante da viagem.');
    }
    responsibleIdValue = parsed;
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO trip_tasks (
       trip_id, work_type, location, start_time, end_time, summary, task_date, responsible_id,
       pending_items, approved_loads, rejected_loads,
       logs_realizados, sistemas_logados, nome_sistemas_logados
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      work_type,
      location,
      start_time,
      end_time,
      summary,
      task_date,
      responsibleIdValue,
      pending_items || null,
      approved_loads || null,
      rejected_loads || null,
      logs_realizados || null,
      sistemas_logados || null,
      nome_sistemas_logados || null
    )
    .run();

  const taskId = result.meta.last_row_id;

  if (photoFiles.length > 0 && !hasFileStorage(c.env)) {
    return err('Upload de fotos indisponível: R2 não configurado.', 503);
  }

  for (const file of photoFiles) {
    const mime = assertImageFile(file);
    const original_name = file.name || 'foto.jpg';
    const stored_key = fileKey(`tasks/${id}/${taskId}`, original_name);
    await c.env.FILES.put(stored_key, file.stream(), {
      httpMetadata: { contentType: mime },
    });
    await c.env.DB.prepare(
      'INSERT INTO trip_task_photos (task_id, original_name, stored_key, mime_type) VALUES (?, ?, ?, ?)'
    )
      .bind(taskId, original_name, stored_key, mime)
      .run();
  }

  // Notifica o líder do setor sobre a nova tarefa
  try {
    const { results: leaders } = await c.env.DB.prepare(
      `SELECT id FROM users WHERE sector = ? AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) = 'lider'`
    )
      .bind(trip.sector)
      .all();
    const leaderIds = (leaders || []).map((r) => r.id).filter(Boolean);
    const user = c.get('user');
    if (leaderIds.length > 0) {
      await notifyUsers(c.env.DB, leaderIds, {
        type: 'info',
        title: 'Nova tarefa registrada',
        message: `${user.full_name} adicionou uma tarefa em ${trip.destination} (${task_date}).`,
        link: `/trip.html?id=${id}`,
      });
    }
  } catch (e) {
    console.error('Falha ao notificar líder da setor:', e);
  }

  return json({ success: true, trip: await fetchTripFull(c.env.DB, id, userId) }, 201);
});

taskRoutes.delete('/:id/tasks/:taskId', async (c) => {
  const id = Number(c.req.param('id'));
  const taskId = Number(c.req.param('taskId'));
  const userId = c.get('userId');

  const trip = await getOwnedTrip(c, id);
  if (!trip) return err('Viagem não encontrada.', 404);
  if (trip.status === 'completed') return err('Viagem concluída é somente leitura.');

  const task = await c.env.DB.prepare('SELECT * FROM trip_tasks WHERE id = ? AND trip_id = ?')
    .bind(taskId, id)
    .first();
  if (!task) return err('Tarefa não encontrada.', 404);

  const { results: photos } = await c.env.DB.prepare(
    'SELECT * FROM trip_task_photos WHERE task_id = ?'
  )
    .bind(taskId)
    .all();

  for (const photo of photos || []) {
    if (hasFileStorage(c.env)) {
      try {
        await c.env.FILES.delete(photo.stored_key);
      } catch {
        /* ignore */
      }
    }
  }

  await c.env.DB.prepare('DELETE FROM trip_task_photos WHERE task_id = ?').bind(taskId).run();
  await c.env.DB.prepare('DELETE FROM trip_tasks WHERE id = ?').bind(taskId).run();

  return json({ success: true, trip: await fetchTripFull(c.env.DB, id, userId) });
});
