import { Hono } from 'hono';
import { requireUser } from './auth.js';
import { err, json } from './helpers.js';
import { configuracoesLider } from './configuracoes-lider.js';

const DEFAULT_CONFIG = {
  janelaAlmocoInicio: '11:00',
  janelaAlmocoFim: '14:00',
};

function isTimeValue(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

async function getConfigAlmoco(db, userId) {
  const row = await db
    .prepare(
      'SELECT janela_almoco_inicio, janela_almoco_fim FROM configuracoes_usuario WHERE usuario_id = ?'
    )
    .bind(userId)
    .first();

  return row
    ? {
        janelaAlmocoInicio: row.janela_almoco_inicio,
        janelaAlmocoFim: row.janela_almoco_fim,
      }
    : DEFAULT_CONFIG;
}

async function salvarConfigAlmoco(db, userId, inicio, fim) {
  return db
    .prepare(`
      INSERT INTO configuracoes_usuario (usuario_id, janela_almoco_inicio, janela_almoco_fim, atualizado_em)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(usuario_id) DO UPDATE SET
        janela_almoco_inicio = excluded.janela_almoco_inicio,
        janela_almoco_fim = excluded.janela_almoco_fim,
        atualizado_em = datetime('now')
    `)
    .bind(userId, inicio, fim)
    .run();
}

export const configuracoes = new Hono();
configuracoes.use('*', requireUser);

configuracoes.get('/almoco', async (c) => {
  const userId = c.get('userId');
  const config = await getConfigAlmoco(c.env.DB, userId);
  return json({ success: true, config });
});

configuracoes.post('/almoco', async (c) => {
  const userId = c.get('userId');
  let body;

  try {
    body = await c.req.json();
  } catch {
    return err('JSON inválido.', 400);
  }

  const inicio = String(body.janelaAlmocoInicio ?? body.inicio ?? '').trim();
  const fim = String(body.janelaAlmocoFim ?? body.fim ?? '').trim();

  if (!isTimeValue(inicio) || !isTimeValue(fim)) {
    return err('Horários inválidos. Use o formato HH:MM.', 400);
  }

  if (inicio >= fim) {
    return err('O início precisa ser antes do término.', 400);
  }

  await salvarConfigAlmoco(c.env.DB, userId, inicio, fim);

  return json({
    success: true,
    config: { janelaAlmocoInicio: inicio, janelaAlmocoFim: fim },
  });
});

configuracoes.route('/lider', configuracoesLider);
