import { Hono } from 'hono';
import { requireUser } from './auth.js';
import { err, getLedSector, isAdminMaster, json } from './helpers.js';

export const activity = new Hono();
activity.use('*', requireUser);

export async function logActivity(db, { tripId = null, userId, action, summary, details = null }) {
  await db.prepare(
    `INSERT INTO activity_log (trip_id, user_id, action, summary, details)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(tripId, userId, action, summary, details ? JSON.stringify(details) : null).run();
}

async function canViewTrip(db, user, tripId) {
  const trip = await db.prepare('SELECT * FROM trips WHERE id = ?').bind(tripId).first();
  if (!trip) return null;
  if (isAdminMaster(user) || trip.user_id === user.id) return trip;
  const ledSector = getLedSector(user);
  if (ledSector && ledSector === trip.sector) return trip;
  const member = await db.prepare('SELECT id FROM trip_members WHERE trip_id = ? AND user_id = ?').bind(tripId, user.id).first();
  return member ? trip : null;
}

function format(row) {
  let details = null;
  try { details = row.details ? JSON.parse(row.details) : null; } catch { details = null; }
  return { ...row, details, user_name: row.user_name || 'Usuário removido' };
}

activity.get('/trips/:id', async (c) => {
  const tripId = Number(c.req.param('id'));
  const trip = await canViewTrip(c.env.DB, c.get('user'), tripId);
  if (!trip) return err('Viagem não encontrada.', 404);
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 100), 1), 300);
  const { results } = await c.env.DB.prepare(
    `SELECT a.*, u.full_name AS user_name
     FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.trip_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT ?`
  ).bind(tripId, limit).all();
  return json({ success: true, activities: (results || []).map(format) });
});

activity.get('/', async (c) => {
  const user = c.get('user');
  if (!isAdminMaster(user) && !getLedSector(user)) return err('Acesso negado.', 403);
  const sector = getLedSector(user);
  const personId = Number(c.req.query('user_id') || 0);
  const from = String(c.req.query('from') || '').trim();
  const to = String(c.req.query('to') || '').trim();
  let sql = `SELECT a.*, u.full_name AS user_name, t.destination
             FROM activity_log a JOIN users u ON u.id = a.user_id
             LEFT JOIN trips t ON t.id = a.trip_id WHERE 1=1`;
  const binds = [];
  if (!isAdminMaster(user)) { sql += ' AND u.sector = ?'; binds.push(sector); }
  if (personId) { sql += ' AND a.user_id = ?'; binds.push(personId); }
  if (from) { sql += " AND a.created_at >= ?"; binds.push(`${from} 00:00:00`); }
  if (to) { sql += " AND a.created_at <= ?"; binds.push(`${to} 23:59:59`); }
  sql += ' ORDER BY a.created_at DESC, a.id DESC LIMIT 300';
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return json({ success: true, activities: (results || []).map(format) });
});