import { Hono } from 'hono';
import { requireUser } from './auth.js';
import { err, json } from './helpers.js';
import { sendEmail } from './email.js';

export const notifications = new Hono();
notifications.use('*', requireUser);

export function buildNotificationEmailHtml({ title, message, link = '' }) {
  const href = String(link || '').trim();
  const action = href ? `<p><a href="${href}" style="color:#2563eb;">Abrir viagem</a></p>` : '';
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:600px;margin:0 auto;">
      <h2 style="margin-bottom:12px;">${title}</h2>
      <p>${message}</p>
      ${action}
    </div>
  `;
}

export async function getUsersEmails(db, userIds) {
  const ids = [...new Set((userIds || []).filter((id) => Number(id) > 0))];
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const { results } = await db.prepare(`SELECT id, email FROM users WHERE id IN (${placeholders})`).bind(...ids).all();
  return (results || [])
    .map((row) => String(row.email || '').trim().toLowerCase())
    .filter(Boolean);
}

export async function notifyUsersWithEmail(db, userIds, payload, env) {
  const ids = [...new Set((userIds || []).filter((id) => Number(id) > 0))];
  if (!ids.length) return;

  await notifyUsers(db, ids, payload);
  const emails = await getUsersEmails(db, ids);
  if (!emails.length || !env || !env.RESEND_API_KEY) return;

  const html = buildNotificationEmailHtml({
    title: payload.title || 'Nova notificação',
    message: payload.message || '',
    link: payload.link || '',
  });

  await Promise.all(
    emails.map((email) =>
      sendEmail(env, {
        to: email,
        subject: payload.title || 'Nova notificação',
        html,
      }),
    ),
  );
}

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
  if (!ids.length) return;
  const placeholders = ids.map(() => '(?, ?, ?, ?, ?)').join(', ');
  const flatBinds = ids.flatMap((id) => [id, type, title, message, link]);
  await db
    .prepare(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ${placeholders}`)
    .bind(...flatBinds)
    .run();
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
