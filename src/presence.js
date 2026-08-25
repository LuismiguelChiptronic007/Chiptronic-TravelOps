import { Hono } from 'hono';
import { err, getLedSector, isAdminMaster, json } from './helpers.js';
import { requireUser } from './auth.js';
import { notifyUsers } from './notifications.js';

export const presence = new Hono();
presence.use('*', requireUser);

presence.post('/heartbeat', async (c) => {
  const userId = c.get('userId');
  const user = c.get('user');
  const previous = await c.env.DB.prepare('SELECT last_seen_at FROM user_presence WHERE user_id = ?').bind(userId).first();
  await c.env.DB.prepare(
    `INSERT INTO user_presence (user_id, last_seen_at) VALUES (?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`
  ).bind(userId).run();
  const wasOffline = !previous?.last_seen_at || previous.last_seen_at < new Date(Date.now() - 120000).toISOString().replace('T', ' ').slice(0, 19);
  if (wasOffline) {
    const { results: leaders } = await c.env.DB.prepare(
      `SELECT id FROM users WHERE sector = ? AND id != ?
       AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) = 'lider'`
    ).bind(user.sector, userId).all();
    await notifyUsers(c.env.DB, (leaders || []).map((row) => row.id), {
      type: 'user_online',
      title: 'Integrante online',
      message: `${user.full_name} está online no sistema.`,
      link: '/setor.html',
    });
  }
  return json({ success: true });
});

presence.get('/users', async (c) => {
  const user = c.get('user');
  const sector = getLedSector(user);
  if (!isAdminMaster(user) && !sector) return err('Acesso negado.', 403);
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.full_name, u.sector, p.last_seen_at,
       CASE WHEN p.last_seen_at >= datetime('now', '-2 minutes') THEN 1 ELSE 0 END AS is_online
     FROM users u LEFT JOIN user_presence p ON p.user_id = u.id
     WHERE (? = 1 OR u.sector = ?) ORDER BY u.full_name`
  ).bind(isAdminMaster(user) ? 1 : 0, sector || '').all();
  return json({ success: true, users: results || [] });
});