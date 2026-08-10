import { Hono } from 'hono';
import { requireUser } from './auth.js';
import { err, json } from './helpers.js';

export const notifications = new Hono();
notifications.use('*', requireUser);

function formatNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link || null,
    is_read: Boolean(row.is_read),
    created_at: row.created_at,
  };
}

export async function notifyUsers(db, userIds, { type = 'info', title, message, link = null }) {
  const ids = [...new Set((userIds || []).filter((id) => id > 0))];
  for (const userId of ids) {
    await db
      .prepare(
        `INSERT INTO notifications (user_id, type, title, message, link)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(userId, type, title, message, link)
      .run();
  }
}

export async function notifyAdmins(db, payload) {
  const { results } = await db
    .prepare("SELECT id FROM users WHERE role IN ('admin', 'admin_master')")
    .all();
  await notifyUsers(
    db,
    (results || []).map((r) => r.id),
    payload
  );
}

notifications.get('/', async (c) => {
  const userId = c.get('userId');
  const limit = Math.min(Number(c.req.query('limit') || 30), 100);

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM notifications WHERE user_id = ?
     ORDER BY created_at DESC, id DESC LIMIT ?`
  )
    .bind(userId, limit)
    .all();

  const { count } = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0'
  )
    .bind(userId)
    .first();

  return json({
    success: true,
    notifications: (results || []).map(formatNotification),
    unread_count: count || 0,
  });
});

notifications.get('/unread-count', async (c) => {
  const userId = c.get('userId');
  const row = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0'
  )
    .bind(userId)
    .first();
  return json({ success: true, unread_count: row?.count || 0 });
});

notifications.post('/:id/read', async (c) => {
  const userId = c.get('userId');
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();
  if (!row) return err('Notificação não encontrada.', 404);

  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').bind(id).run();
  return json({ success: true });
});

notifications.post('/read-all', async (c) => {
  const userId = c.get('userId');
  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?')
    .bind(userId)
    .run();
  return json({ success: true });
});
