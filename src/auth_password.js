import { Hono } from 'hono';
import { hashPassword, randomToken } from './crypto.js';
import { err, json } from './helpers.js';

export const authPassword = new Hono();

authPassword.post('/forgot-password', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err('JSON inválido.');
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email) return err('Informe o e-mail.');

  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();

  if (user) {
    const token = randomToken(24);
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await c.env.DB.prepare(
      `UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(token, expires, user.id)
      .run();

    return json({
      success: true,
      message: 'Se o e-mail existir, um link de redefinição será enviado.',
      dev_reset_token: token,
    });
  }

  return json({
    success: true,
    message: 'Se o e-mail existir, um link de redefinição será enviado.',
  });
});

authPassword.post('/reset-password', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return err('JSON inválido.');
  }

  const token = String(body.token || '').trim();
  const password = String(body.password || '');
  const password_confirm = String(body.password_confirm || '');

  if (!token) return err('Token inválido.');
  if (password.length < 6) return err('A senha deve ter no mínimo 6 caracteres.');
  if (password !== password_confirm) return err('As senhas não coincidem.');

  const user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE reset_token = ? AND reset_token_expires IS NOT NULL AND reset_token_expires > datetime('now')`
  )
    .bind(token)
    .first();

  if (!user) return err('Token inválido ou expirado.', 400);

  const password_hash = await hashPassword(password);
  await c.env.DB.prepare(
    `UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(password_hash, user.id)
    .run();

  return json({ success: true, message: 'Senha redefinida com sucesso.' });
});
