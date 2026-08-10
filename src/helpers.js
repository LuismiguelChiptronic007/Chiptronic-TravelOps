export const SECTORS = [
  'APLICAÇÃO',
  'CRIPTO',
  'DIESELDIAG',
  'ECU TEST',
  'HARDWARE',
  'MOBILE',
  'MOTODIAG',
  'OBDMAP',
  'PROJETOS ESPECIAIS',
  'RESOLVE',
  'T.I INTERNO',
  'T.I TELEMETRIA',
  'TELEMETRIA ADM',
  'TELEMETRIA HW',
  'TELEMETRIA SW',
];

export const POSITIONS = ['Líder', 'Integrante'];

export const ADMIN_MASTER_EMAIL = 'luismiguel.oliveira@chiptronic.com.br';

/** E-mails alternativos do admin master (ex.: .com vs .com.br) */
export const ADMIN_MASTER_EMAILS = [
  ADMIN_MASTER_EMAIL,
  'luismiguel.oliveira@chiptronic.com',
];

/** Admin master → setor liderado (bootstrap legado) */
export const SECTOR_LEADERS = {
  APLICAÇÃO: ADMIN_MASTER_EMAIL,
};

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Aceita variações .com / .com.br para o mesmo usuário Chiptronic. */
export function emailsMatch(a, b) {
  const na = normalizeEmail(a);
  const nb = normalizeEmail(b);
  if (na === nb) return true;
  const localA = na.split('@')[0];
  const localB = nb.split('@')[0];
  return localA === localB && localA.length > 0 && na.includes('chiptronic') && nb.includes('chiptronic');
}

export function isAdminMasterEmail(email) {
  return ADMIN_MASTER_EMAILS.some((e) => emailsMatch(email, e));
}

export function isAdmin(user) {
  return user?.role === 'admin' || user?.role === 'admin_master';
}

export function isAdminMaster(user) {
  return user?.role === 'admin_master';
}

export function isLeaderPosition(position) {
  const p = String(position || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return p === 'lider';
}

export function getLedSector(userOrEmail) {
  if (typeof userOrEmail === 'string') {
    for (const [sector, leaderEmail] of Object.entries(SECTOR_LEADERS)) {
      if (emailsMatch(userOrEmail, leaderEmail)) return sector;
    }
    return null;
  }

  const user = userOrEmail;
  if (!user) return null;
  if (isLeaderPosition(user.position_title)) return user.sector;
  if (isAdminMaster(user)) {
    for (const [sector, leaderEmail] of Object.entries(SECTOR_LEADERS)) {
      if (emailsMatch(user.email, leaderEmail)) return sector;
    }
  }
  return null;
}

export function isSectorLeader(user) {
  return Boolean(getLedSector(user));
}

export function validatePassword(password) {
  const pwd = String(password || '');
  if (pwd.length < 8) return 'A senha deve ter no mínimo 8 caracteres.';
  if (!/[a-zA-Z]/.test(pwd)) return 'A senha deve conter pelo menos uma letra.';
  if (!/[0-9]/.test(pwd)) return 'A senha deve conter pelo menos um número.';
  return null;
}

export function formatEmployeeId(userId) {
  return String(userId).padStart(6, '0');
}

export async function syncLeaderRole(db, user) {
  if (!user?.email) return user;
  let role = user.role || 'user';

  if (isAdminMasterEmail(user.email)) {
    role = 'admin_master';
  } else if (isLeaderPosition(user.position_title) && role !== 'admin_master') {
    role = 'admin';
  } else if (!isLeaderPosition(user.position_title) && role === 'admin' && !isAdminMasterEmail(user.email)) {
    role = 'user';
  }

  if (role !== user.role) {
    await db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(role, user.id)
      .run();
    user.role = role;
  }
  return user;
}

export async function syncSectorManagers(db, sector) {
  if (!sector) return;

  const leader = await db
    .prepare(
      `SELECT id, full_name FROM users
       WHERE sector = ?
       AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) = 'lider'
       LIMIT 1`
    )
    .bind(sector)
    .first();

  if (leader) {
    await db
      .prepare(
        `UPDATE users
         SET manager_id = ?, manager_name = ?, updated_at = datetime('now')
         WHERE sector = ?
           AND id != ?
           AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) != 'lider'`
      )
      .bind(leader.id, leader.full_name, sector, leader.id)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE users
         SET manager_id = NULL, manager_name = NULL, updated_at = datetime('now')
         WHERE sector = ?
           AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) != 'lider'`
      )
      .bind(sector)
      .run();
  }
}

export function canViewSectorPage(user) {
  return isSectorLeader(user);
}

export const WORK_TYPES = [
  'Dieseldiag Ontime',
  'Controle de Logs',
];

export const STATUS_LABELS = {
  planned: 'Planejada',
  in_progress: 'Em andamento',
  awaiting_report: 'Aguardando relatório',
  completed: 'Concluída',
};

export function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export function err(message, status = 400, extra = {}) {
  return json({ success: false, error: message, ...extra }, status);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function isReportOverdue(trip) {
  if (trip.status !== 'awaiting_report') return false;
  if (!trip.end_date) return false;
  return trip.end_date < todayISO();
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function publicUser(row) {
  const ledSector = getLedSector(row);
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    sector: row.sector,
    position_title: row.position_title,
    employee_id: row.employee_id,
    manager_name: row.manager_name || null,
    manager_id: row.manager_id || null,
    role: row.role || 'user',
    is_admin: isAdmin(row),
    is_admin_master: isAdminMaster(row),
    is_sector_leader: Boolean(ledSector),
    led_sector: ledSector,
    can_view_sector: canViewSectorPage(row),
    avatar_url: row.avatar_key ? `/api/files/${row.avatar_key}` : null,
    created_at: row.created_at,
  };
}

/** Viagem pode ser concluída se houver ao menos uma tarefa registrada. */
export function checklistIsComplete(c, tasks = null) {
  if (Array.isArray(tasks)) {
    return tasks.length > 0;
  }
  if (!c) return false;
  if (c.objective_met === null || c.objective_met === undefined || c.objective_met === '') {
    return false;
  }
  if (!String(c.people_visited || '').trim()) return false;
  if (!String(c.activities_summary || '').trim()) return false;
  if (!String(c.pending_items || '').trim()) return false;
  return true;
}

export function computeStatus(trip) {
  if (trip.status === 'completed') return 'completed';
  const today = todayISO();
  if (trip.end_date < today) return 'awaiting_report';
  if (trip.start_date <= today && trip.end_date >= today) return 'in_progress';
  return 'planned';
}

export function daysBetween(start, end) {
  const a = new Date(start + 'T00:00:00Z');
  const b = new Date(end + 'T00:00:00Z');
  const diff = Math.round((b - a) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function assertAllowedFile(file) {
  if (!file || typeof file !== 'object') throw new Error('Arquivo inválido.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Arquivo excede o limite de 8 MB.');
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mime)) throw new Error('Tipo de arquivo não permitido.');
  return mime;
}

export function assertImageFile(file) {
  if (!file || typeof file !== 'object') throw new Error('Arquivo inválido.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Arquivo excede o limite de 8 MB.');
  const mime = file.type || 'application/octet-stream';
  if (!IMAGE_MIME.has(mime)) throw new Error('Envie apenas fotos (JPEG, PNG, WebP ou GIF).');
  return mime;
}

export function fileKey(prefix, originalName) {
  const ext = (originalName.split('.').pop() || 'bin').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const id = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}/${id}.${ext || 'bin'}`;
}
