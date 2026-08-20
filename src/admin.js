import { Hono } from 'hono';
import { requireUser } from './auth.js';
import { err, isAdmin, isAdminMaster, json, publicUser } from './helpers.js';

export const admin = new Hono();
admin.use('*', requireUser);

function requireAdmin(c) {
  const user = c.get('user');
  return isAdmin(user) ? user : null;
}

admin.get('/users', async (c) => {
  const viewer = requireAdmin(c);
  if (!viewer) return err('Acesso negado.', 403);

  const { results } = await c.env.DB.prepare(
    `SELECT u.*, MAX(a.created_at) AS last_activity
     FROM users u
     LEFT JOIN activity_log a ON a.user_id = u.id
     GROUP BY u.id
     ORDER BY u.full_name COLLATE NOCASE ASC`
  ).all();

  return json({
    success: true,
    users: (results || []).map((user) => ({
      ...publicUser(user),
      last_activity: user.last_activity || user.updated_at || user.created_at,
    })),
  });
});

admin.put('/users/:id/role', async (c) => {
  const viewer = requireAdmin(c);
  if (!viewer) return err('Acesso negado.', 403);
  if (!isAdminMaster(viewer)) return err('Apenas o Admin Master pode alterar níveis.', 403);

  const userId = Number(c.req.param('id'));
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err('JSON inválido.');
  }
  const role = String(body.role || '').trim();
  if (!Number.isInteger(userId) || userId <= 0) return err('Usuário inválido.');
  if (!['user', 'admin'].includes(role)) return err('Nível inválido.');

  const target = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(userId).first();
  if (!target) return err('Usuário não encontrado.', 404);
  if (target.role === 'admin_master') return err('O Admin Master não pode ser rebaixado.', 403);

  await c.env.DB.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(role, userId)
    .run();
  return json({ success: true });
});

admin.delete('/users/:id', async (c) => {
  const viewer = requireAdmin(c);
  if (!viewer) return err('Acesso negado.', 403);
  if (!isAdminMaster(viewer)) return err('Apenas o Admin Master pode excluir usuários.', 403);

  const userId = Number(c.req.param('id'));
  if (!Number.isInteger(userId) || userId <= 0) return err('Usuário inválido.');
  if (userId === viewer.id) return err('Você não pode excluir o próprio usuário.', 403);

  const target = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(userId).first();
  if (!target) return err('Usuário não encontrado.', 404);
  if (target.role === 'admin_master') return err('O Admin Master não pode ser excluído.', 403);

  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  return json({ success: true });
});