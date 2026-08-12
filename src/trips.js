import { Hono } from 'hono';
import { requireUser } from './auth.js';
import { computeStatus, err, json, getLedSector, isAdmin } from './helpers.js';
import { notifyUsers } from './notifications.js';
import { fetchTripFull, formatTrip, saveTripMembers, syncUserTripStatuses } from './trip_utils.js';
import { checklistRoutes } from './checklist.js';
import { taskRoutes } from './tasks.js';

export const trips = new Hono();
trips.use('*', requireUser);

trips.get('/', async (c) => {
  const userId = c.get('userId');
  await syncUserTripStatuses(c.env.DB, userId);

  const status = c.req.query('status') || '';
  const q = c.req.query('q') || '';

  let sql = `SELECT DISTINCT t.* FROM trips t
             LEFT JOIN trip_members tm ON tm.trip_id = t.id
             WHERE t.user_id = ? OR tm.user_id = ?`;
  const binds = [userId, userId];

  if (status && status !== 'all') {
    sql += ' AND t.status = ?';
    binds.push(status);
  }
  if (q) {
    sql += ' AND (t.origin LIKE ? OR t.destination LIKE ? OR t.reason LIKE ?)';
    const like = `%${q}%`;
    binds.push(like, like, like);
  }
  sql += ' ORDER BY t.start_date DESC, t.id DESC';

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return json({ success: true, trips: (results || []).map((t) => formatTrip(t)) });
});

trips.get('/dashboard', async (c) => {
  const userId = c.get('userId');
  await syncUserTripStatuses(c.env.DB, userId);

  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT t.* FROM trips t
     LEFT JOIN trip_members tm ON tm.trip_id = t.id
     WHERE t.user_id = ? OR tm.user_id = ?
     ORDER BY t.start_date DESC, t.id DESC`
  )
    .bind(userId, userId)
    .all();

  const tripsList = results || [];
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = now.toISOString().slice(0, 10);

  let inProgress = 0;
  let completedMonth = 0;
  let awaiting = 0;
  let overdue = 0;

  const statusCounts = { planned: 0, in_progress: 0, awaiting_report: 0, completed: 0 };
  const destCounts = {};
  const monthlyCounts = {};
  let totalDaysAway = 0;

  for (const t of tripsList) {
    if (statusCounts[t.status] !== undefined) statusCounts[t.status]++;

    if (t.status === 'in_progress') inProgress++;
    if (t.status === 'awaiting_report') {
      awaiting++;
      if (t.end_date < today) overdue++;
    }
    if (t.status === 'completed' && String(t.updated_at || t.end_date).startsWith(monthPrefix)) {
      completedMonth++;
    }

    const dest = String(t.destination || '—').trim() || '—';
    destCounts[dest] = (destCounts[dest] || 0) + 1;

    const monthKey = String(t.start_date || '').slice(0, 7);
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
    monthLabels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
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
       ORDER BY count DESC`
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

trips.get('/users-for-members', async (c) => {
  const userId = c.get('userId');
  const q = String(c.req.query('q') || '').trim();

  let sql = `SELECT id, full_name, email, sector, position_title, manager_name, employee_id
             FROM users WHERE id != ?`;
  const binds = [userId];

  if (q) {
    sql += ' AND (full_name LIKE ? OR email LIKE ? OR sector LIKE ? OR employee_id LIKE ?)';
    const like = `%${q}%`;
    binds.push(like, like, like, like);
  }
  sql += ' ORDER BY full_name ASC LIMIT 100';

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
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

trips.route('/', taskRoutes);

trips.post('/', async (c) => {
  const user = c.get('user');
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err('JSON inválido.');
  }

  const origin = String(body.origin || '').trim();
  const destination = String(body.destination || '').trim();
  const start_date = String(body.start_date || '').trim();
  const end_date = String(body.end_date || '').trim();
  const reason = String(body.reason || '').trim();
  const sector = String(body.sector || user.sector || '').trim();
  const memberIds = Array.isArray(body.member_ids) ? body.member_ids : [];

  if (!origin || !destination) return err('Informe origem e destino.');
  if (!start_date || !end_date) return err('Informe as datas da viagem.');
  if (end_date < start_date) return err('Data de término deve ser >= data de início.');
  if (!reason) return err('Informe o motivo da viagem.');

  const status = computeStatus({ start_date, end_date, status: 'planned' });
  const result = await c.env.DB.prepare(
    `INSERT INTO trips (user_id, origin, destination, start_date, end_date, reason, sector, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(user.id, origin, destination, start_date, end_date, reason, sector, status)
    .run();

  const tripId = result.meta.last_row_id;
  await c.env.DB.prepare('INSERT INTO trip_checklists (trip_id) VALUES (?)').bind(tripId).run();

  // Always include the trip creator as a trip member so they can be
  // selected as responsible for tasks.
  try {
    const ids = Array.isArray(memberIds) ? [...new Set(memberIds.map((i) => Number(i)).filter((n) => n > 0))] : [];
    if (!ids.includes(user.id)) ids.unshift(user.id);
    await saveTripMembers(c.env.DB, tripId, ids);
  } catch (e) {
    // fallback: try to save whatever was provided
    await saveTripMembers(c.env.DB, tripId, memberIds);
  }

  // Notifica o líder do setor sobre a nova viagem
  try {
    const { results: leaders } = await c.env.DB.prepare(
      `SELECT id FROM users WHERE sector = ? AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) = 'lider'`
    )
      .bind(sector)
      .all();
    const leaderIds = (leaders || []).map((r) => r.id).filter(Boolean);
    if (leaderIds.length > 0) {
      await notifyUsers(c.env.DB, leaderIds, {
        type: 'info',
        title: 'Nova viagem criada',
        message: `${user.full_name} criou uma viagem para ${destination} (${start_date} — ${end_date}).`,
        link: `/trip.html?id=${tripId}`,
      });
    }
  } catch (e) {
    console.error('Falha ao notificar líder da setor:', e);
  }

  const full = await fetchTripFull(c.env.DB, tripId, user.id);
  return json({ success: true, trip: full }, 201);
});

trips.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const userId = c.get('userId');
  const viewer = c.get('user');

  const tripRow = await c.env.DB.prepare('SELECT * FROM trips WHERE id = ?').bind(id).first();
  if (!tripRow) return err('Viagem não encontrada.', 404);

  if (tripRow.user_id !== userId) {
    const owner = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(tripRow.user_id)
      .first();
    const ledSector = getLedSector(viewer);

    const memberRow = await c.env.DB.prepare(
      'SELECT id FROM trip_members WHERE trip_id = ? AND user_id = ? LIMIT 1'
    )
      .bind(id, userId)
      .first();

    const allowed =
      isAdmin(viewer) ||
      owner?.manager_id === userId ||
      (ledSector && owner?.sector === ledSector) ||
      !!memberRow;
    if (!allowed) return err('Viagem não encontrada.', 404);
  }

  const full = await fetchTripFull(c.env.DB, id, tripRow.user_id);
  if (!full) return err('Viagem não encontrada.', 404);
  return json({ success: true, trip: full });
});

trips.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const userId = c.get('userId');
  const trip = await c.env.DB.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();
  if (!trip) return err('Viagem não encontrada.', 404);
  if (trip.status === 'completed') return err('Viagem concluída não pode ser editada.');

  let body;
  try {
    body = await c.req.json();
  } catch {
    return err('JSON inválido.');
  }

  const origin = String(body.origin ?? trip.origin).trim();
  const destination = String(body.destination ?? trip.destination).trim();
  const start_date = String(body.start_date ?? trip.start_date).trim();
  const end_date = String(body.end_date ?? trip.end_date).trim();
  const reason = String(body.reason ?? trip.reason).trim();
  const sector = String(body.sector ?? trip.sector).trim();

  if (!origin || !destination || !start_date || !end_date || !reason) {
    return err('Preencha todos os campos obrigatórios.');
  }
  if (end_date < start_date) return err('Data de término inválida.');

  const status = computeStatus({ start_date, end_date, status: trip.status });
  await c.env.DB.prepare(
    `UPDATE trips SET origin=?, destination=?, start_date=?, end_date=?, reason=?, sector=?, status=?, updated_at=datetime('now') WHERE id=?`
  )
    .bind(origin, destination, start_date, end_date, reason, sector, status, id)
    .run();

  if (Array.isArray(body.member_ids)) {
    try {
      const provided = Array.isArray(body.member_ids) ? body.member_ids.map((i) => Number(i)).filter((n) => n > 0) : [];
      const ids = [...new Set(provided)];
      if (!ids.includes(userId)) ids.unshift(userId);
      await saveTripMembers(c.env.DB, id, ids);
    } catch (e) {
      console.error('Falha ao atualizar integrantes:', e);
    }
  }

  return json({ success: true, trip: await fetchTripFull(c.env.DB, id, userId) });
});

trips.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const userId = c.get('userId');

  const trip = await c.env.DB.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();
  if (!trip) return err('Viagem não encontrada.', 404);

  await c.env.DB.prepare('DELETE FROM trip_task_photos WHERE task_id IN (SELECT id FROM trip_tasks WHERE trip_id = ?)')
    .bind(id)
    .run();
  await c.env.DB.prepare('DELETE FROM trip_tasks WHERE trip_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM trip_checklists WHERE trip_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM trip_members WHERE trip_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM trips WHERE id = ?').bind(id).run();

  return json({ success: true });
});

trips.route('/', checklistRoutes);