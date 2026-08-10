import { Hono } from 'hono';
import { requireUser } from './auth.js';
import {
  assertAllowedFile,
  daysBetween,
  err,
  fileKey,
  json,
  publicUser,
} from './helpers.js';
import { formatTrip, syncUserTripStatuses } from './trip_utils.js';

export const profile = new Hono();
profile.use('*', requireUser);

profile.get('/', async (c) => {
  const user = c.get('user');
  const userId = user.id;
  await syncUserTripStatuses(c.env.DB, userId);

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM trips WHERE user_id = ? ORDER BY start_date DESC, id DESC'
  )
    .bind(userId)
    .all();

  const tripsList = results || [];
  let totalDays = 0;
  const byStatus = {
    planned: 0,
    in_progress: 0,
    awaiting_report: 0,
    completed: 0,
  };

  for (const t of tripsList) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    totalDays += daysBetween(t.start_date, t.end_date);
  }

  return json({
    success: true,
    user: publicUser(user),
    stats: {
      total_trips: tripsList.length,
      total_days_away: totalDays,
      by_status: byStatus,
    },
    trips: tripsList.map((t) => formatTrip(t)),
  });
});

profile.put('/', async (c) => {
  const user = c.get('user');
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err('JSON inválido.');
  }

  const full_name = String(body.full_name ?? user.full_name).trim();
  const sector = String(body.sector ?? user.sector).trim();
  const position_title = String(body.position_title ?? user.position_title).trim();
  const manager_name = String(body.manager_name ?? user.manager_name ?? '').trim() || null;

  if (!full_name || full_name.length < 3) return err('Nome inválido.');
  if (!sector) return err('Setor obrigatório.');
  if (!position_title) return err('Cargo obrigatório.');

  // Determinar manager_id quando setor ou position_title mudam
  let manager_id = user.manager_id;
  let finalManagerName = manager_name;

  // Se o setor mudou ou o cargo mudou, recalcular o gerente
  if (sector !== user.sector || position_title !== user.position_title) {
    // Se for líder, não tem gerente
    if (position_title.toLowerCase().includes('líder')) {
      manager_id = null;
      finalManagerName = null;
    } else {
      // Encontrar o líder do novo setor
      const leader = await c.env.DB.prepare(
        `SELECT id, full_name FROM users WHERE sector = ?
         AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) = 'lider'
         LIMIT 1`
      )
        .bind(sector)
        .first();
      
      if (leader) {
        manager_id = leader.id;
        finalManagerName = leader.full_name;
      } else {
        manager_id = null;
        finalManagerName = null;
      }
    }
  }

  await c.env.DB.prepare(
    `UPDATE users SET full_name=?, sector=?, position_title=?, manager_name=?, manager_id=?, updated_at=datetime('now') WHERE id=?`
  )
    .bind(full_name, sector, position_title, finalManagerName, manager_id, user.id)
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(user.id)
    .first();
  return json({ success: true, user: publicUser(updated) });
});

profile.post('/avatar', async (c) => {
  const user = c.get('user');
  const form = await c.req.formData();
  const file = form.get('avatar');
  if (!file || typeof file !== 'object' || !file.size) {
    return err('Envie uma imagem.');
  }

  const mime = assertAllowedFile(file);
  if (!mime.startsWith('image/')) return err('Avatar deve ser uma imagem.');

  const key = fileKey(`avatars/${user.id}`, file.name || 'avatar.jpg');
  await c.env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType: mime },
  });

  if (user.avatar_key) {
    try {
      await c.env.FILES.delete(user.avatar_key);
    } catch {
      /* ignore */
    }
  }

  await c.env.DB.prepare(
    `UPDATE users SET avatar_key = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(key, user.id)
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(user.id)
    .first();
  return json({ success: true, user: publicUser(updated) });
});
