import { Hono } from 'hono';
import { requireUser } from './auth.js';
import {
  assertAvatarFile,
  daysBetween,
  err,
  hasFileStorage,
  json,
  publicUser,
  SECTORS,
  POSITIONS,
  isLeaderPosition,
  syncLeaderRole,
  syncSectorManagers,
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
  const oldSector = user.sector;
  const oldPosition = user.position_title;

  if (!full_name || full_name.length < 3) return err('Nome inválido.');
  if (!sector || !SECTORS.includes(sector)) return err('Setor inválido.');
  if (!position_title || !POSITIONS.includes(position_title)) return err('Selecione Líder ou Integrante.');

  if (isLeaderPosition(position_title)) {
    const existingLeader = await c.env.DB.prepare(
      `SELECT id FROM users WHERE sector = ?
       AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) = 'lider'
       AND id != ?
       LIMIT 1`
    )
      .bind(sector, user.id)
      .first();
    if (existingLeader) return err('Este setor já possui um líder cadastrado.');
  }

  let manager_id = null;
  let finalManagerName = null;

  const isLeader = isLeaderPosition(position_title);

  if (!isLeader) {
    const leader = await c.env.DB.prepare(
      `SELECT id, full_name FROM users WHERE sector = ?
       AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) = 'lider'
       AND id != ?
       LIMIT 1`
    )
      .bind(sector, user.id)
      .first();

    if (leader) {
      manager_id = leader.id;
      finalManagerName = leader.full_name;
    }
  }

  await c.env.DB.prepare(
    `UPDATE users SET full_name=?, sector=?, position_title=?, manager_name=?, manager_id=?, updated_at=datetime('now') WHERE id=?`
  )
    .bind(full_name, sector, position_title, finalManagerName, manager_id, user.id)
    .run();

  const sectorChanged = sector !== oldSector;
  const positionChanged = position_title !== oldPosition;
  if (sectorChanged) {
    await syncSectorManagers(c.env.DB, oldSector);
  }
  if (sectorChanged || positionChanged) {
    await syncSectorManagers(c.env.DB, sector);
  }

  let updated = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(user.id)
    .first();

  updated = await syncLeaderRole(c.env.DB, updated);
  return json({ success: true, user: publicUser(updated) });
});

profile.post('/avatar', async (c) => {
  const user = c.get('user');
  const form = await c.req.formData();
  const file = form.get('avatar');
  if (!file || typeof file !== 'object' || !file.size) {
    return err('Envie uma imagem.');
  }

  const mime = assertAvatarFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const avatarData = `data:${mime};base64,${btoa(binary)}`;

  if (hasFileStorage(c.env) && user.avatar_key) {
    try {
      await c.env.FILES.delete(user.avatar_key);
    } catch {
      /* ignore */
    }
  }

  await c.env.DB.prepare(
    `UPDATE users SET avatar_data = ?, avatar_key = NULL, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(avatarData, user.id)
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(user.id)
    .first();
  return json({ success: true, user: publicUser(updated) });
});
