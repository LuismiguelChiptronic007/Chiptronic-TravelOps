import { Hono } from 'hono';
import { requireUser } from './auth.js';
import { err, getLedSector, isAdmin, isAdminMaster, isLuisMiguel, json, publicUser, SECTORS } from './helpers.js';

export const admin = new Hono();
admin.use('*', requireUser);

function requireAdmin(c) {
  const user = c.get('user');
  return isAdmin(user) ? user : null;
}

function canManageAllSectors(user) {
  const normalizedName = String(user?.full_name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  return isLuisMiguel(user) || normalizedName === 'rodneigomes';
}

function canRemoveUser(viewer, target) {
  if (canManageAllSectors(viewer) || isAdminMaster(viewer)) return true;
  return Boolean(getLedSector(viewer) && viewer.sector === target.sector);
}

function canManageRole(viewer, target) {
  if (canManageAllSectors(viewer) || isAdminMaster(viewer)) return true;
  return Boolean(getLedSector(viewer) && viewer.sector === target.sector);
}

admin.get('/users', async (c) => {
  const viewer = requireAdmin(c);
  if (!viewer) return err('Acesso negado.', 403);
  const requestedSector = String(c.req.query('sector') || '').trim();
  const sector = requestedSector || viewer.sector || 'APLICAÇÃO';
  if (!SECTORS.includes(sector)) return err('Setor inválido.', 400);
  if (!canManageAllSectors(viewer) && sector !== viewer.sector) return err('Você só pode visualizar usuários do seu setor.', 403);

  const { results } = await c.env.DB.prepare(
    `SELECT u.*, MAX(a.created_at) AS last_activity
     FROM users u
     LEFT JOIN activity_log a ON a.user_id = u.id
     WHERE u.sector = ?
     GROUP BY u.id
     ORDER BY u.full_name COLLATE NOCASE ASC`
  ).bind(sector).all();

  return json({
    success: true,
    users: (results || []).map((user) => ({
      ...publicUser(user),
      last_activity: user.last_activity || user.updated_at || user.created_at,
    })),
    sector,
    can_manage_all_sectors: canManageAllSectors(viewer),
  });
});

admin.put('/users/:id/role', async (c) => {
  const viewer = requireAdmin(c);
  if (!viewer) return err('Acesso negado.', 403);

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

  const target = await c.env.DB.prepare('SELECT id, role, sector FROM users WHERE id = ?').bind(userId).first();
  if (!target) return err('Usuário não encontrado.', 404);
  if (target.role === 'admin_master') return err('O Admin Master não pode ser rebaixado.', 403);
  if (!canManageRole(viewer, target)) return err('Você só pode alterar usuários do seu setor.', 403);

  await c.env.DB.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(role, userId)
    .run();
  return json({ success: true });
});

admin.delete('/users/:id', async (c) => {
  const viewer = requireAdmin(c);
  if (!viewer) return err('Acesso negado.', 403);

  const userId = Number(c.req.param('id'));
  if (!Number.isInteger(userId) || userId <= 0) return err('Usuário inválido.');
  if (userId === viewer.id) return err('Você não pode excluir o próprio usuário.', 403);

  const target = await c.env.DB.prepare('SELECT id, role, sector FROM users WHERE id = ?').bind(userId).first();
  if (!target) return err('Usuário não encontrado.', 404);
  if (target.role === 'admin_master') return err('O Admin Master não pode ser excluído.', 403);
  if (!canRemoveUser(viewer, target)) return err('Você só pode remover usuários do seu setor.', 403);

  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  return json({ success: true });
});