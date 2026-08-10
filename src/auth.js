import { Hono } from 'hono';
import { hashPassword, verifyPassword, signJwt, verifyJwt, randomToken } from './crypto.js';
import {
  err,
  json,
  publicUser,
  SECTORS,
  POSITIONS,
  syncLeaderRole,
  syncSectorManagers,
  isAdminMasterEmail,
  isLeaderPosition,
  validatePassword,
  formatEmployeeId,
} from './helpers.js';
import { notifyAdmins } from './notifications.js';

export const auth = new Hono();

function getBearer(c) {
  const h = c.req.header('Authorization') || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

export async function requireUser(c, next) {
  const token = getBearer(c);
  if (!token) return err('Não autenticado.', 401);

  const secret = c.env.JWT_SECRET;
  if (!secret) return err('JWT_SECRET não configurado.', 500);

  const payload = await verifyJwt(token, secret);
  if (!payload?.sub) return err('Sessão inválida ou expirada.', 401);

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(payload.sub)
    .first();
  if (!user) return err('Usuário não encontrado.', 401);

  c.set('user', user);
  c.set('userId', user.id);
  await next();
}

auth.get('/sectors', (c) => json({ success: true, sectors: SECTORS }));

auth.get('/positions', (c) => json({ success: true, positions: POSITIONS }));

auth.post('/register', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err('JSON inválido.');
  }

  const full_name = String(body.full_name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const sector = String(body.sector || '').trim();
  const position_title = String(body.position_title || '').trim();
  const password = String(body.password || '');
  const password_confirm = String(body.password_confirm || '');

  if (!full_name || full_name.length < 3) return err('Informe o nome completo.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err('E-mail corporativo inválido.');
  }
  if (!sector || !SECTORS.includes(sector)) return err('Selecione um setor válido.');
  if (!position_title || !POSITIONS.includes(position_title)) {
    return err('Selecione Líder ou Integrante.');
  }

  const pwdError = validatePassword(password);
  if (pwdError) return err(pwdError);
  if (password !== password_confirm) return err('As senhas não coincidem.');

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first();
  if (existing) return err('E-mail já cadastrado.', 409);

  if (isLeaderPosition(position_title)) {
    const existingLeader = await c.env.DB.prepare(
      `SELECT id FROM users WHERE sector = ?
       AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) = 'lider'`
    )
      .bind(sector)
      .first();
    if (existingLeader) return err('Este setor já possui um líder cadastrado.');
  }

  let manager_id = null;
  let finalManagerName = null;
  if (!isLeaderPosition(position_title)) {
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
    }
  }

  const password_hash = await hashPassword(password);
  const tempEmployeeId = `TMP-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

  let role = 'user';
  if (isAdminMasterEmail(email)) role = 'admin_master';
  else if (isLeaderPosition(position_title)) role = 'admin';

  const result = await c.env.DB.prepare(
    `INSERT INTO users (full_name, email, password_hash, sector, position_title, employee_id, manager_name, manager_id, role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      full_name,
      email,
      password_hash,
      sector,
      position_title,
      tempEmployeeId,
      finalManagerName,
      manager_id,
      role
    )
    .run();

  const userId = result.meta.last_row_id;
  const employee_id = formatEmployeeId(userId);
  await c.env.DB.prepare('UPDATE users SET employee_id = ? WHERE id = ?')
    .bind(employee_id, userId)
    .run();

  let user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  user = await syncLeaderRole(c.env.DB, user);
  await syncSectorManagers(c.env.DB, sector);

  await notifyAdmins(c.env.DB, {
    type: 'user_registered',
    title: 'Novo cadastro no sistema',
    message: `${full_name} (${sector} · ${position_title}) acabou de se cadastrar.`,
    link: '/setor.html',
  });

  const token = await signJwt({ sub: userId, email }, c.env.JWT_SECRET);
  return json({ success: true, token, user: publicUser(user) }, 201);
});

auth.post('/login', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err('JSON inválido.');
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return err('Informe e-mail e senha.');

  let user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) return err('Credenciais inválidas.', 401);

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return err('Credenciais inválidas.', 401);

  user = await syncLeaderRole(c.env.DB, user);

  const token = await signJwt({ sub: user.id, email: user.email }, c.env.JWT_SECRET);
  return json({ success: true, token, user: publicUser(user) });
});

auth.get('/me', requireUser, async (c) => {
  let user = c.get('user');
  user = await syncLeaderRole(c.env.DB, user);
  return json({ success: true, user: publicUser(user) });
});
