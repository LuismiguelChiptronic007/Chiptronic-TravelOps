import { Hono } from 'hono';
import { requireUser } from './auth.js';
import { err, json, getLedSector, isAdmin } from './helpers.js';
import { notifyUsers } from './notifications.js';
import { logActivity } from './activity.js';
import { getAccessibleTrip } from './tasks.js';

export const demandas = new Hono();
demandas.use('*', requireUser);

function validarPlaca(placa) {
  if (!placa) return true;
  const limpa = String(placa).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const padraoAntigo = /^[A-Z]{3}[0-9]{4}$/;
  const padraoMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
  return padraoAntigo.test(limpa) || padraoMercosul.test(limpa);
}

function formatarPlaca(placa) {
  if (!placa) return null;
  const limpa = String(placa).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z]{3}[0-9]{4}$/.test(limpa)) {
    return limpa.slice(0, 3) + '-' + limpa.slice(3);
  }
  return limpa || null;
}

async function atualizarStatusDemanda(db, demandaId) {
  const { results: atividades } = await db.prepare(`
    SELECT da.id, da.status FROM demanda_atividades da
    INNER JOIN demanda_veiculos dv ON dv.id = da.demanda_veiculo_id
    WHERE dv.demanda_id = ?
  `).bind(demandaId).all();

  if (!atividades || !atividades.length) return;

  const total = atividades.length;
  const concluidas = atividades.filter(a => a.status === 'concluida').length;
  const emAndamento = atividades.filter(a => a.status === 'em_andamento').length;

  let novoStatus = 'pendente';
  if (concluidas === total) {
    novoStatus = 'concluida';
  } else if (concluidas > 0 || emAndamento > 0) {
    novoStatus = 'em_andamento';
  }

  await db.prepare('UPDATE demandas SET status = ? WHERE id = ?')
    .bind(novoStatus, demandaId).run();
}

export async function fetchDemandasViagem(db, viagemId) {
  try {
    const { results: demandasRows } = await db.prepare(`
      SELECT d.*, u.full_name AS criado_nome
      FROM demandas d
      LEFT JOIN users u ON u.id = d.criado_por
      WHERE d.viagem_id = ?
      ORDER BY d.criado_em DESC, d.id DESC
    `).bind(viagemId).all();

    const demandasFormatadas = [];
    for (const d of demandasRows || []) {
      const { results: veiculosRows } = await db.prepare(`
        SELECT * FROM demanda_veiculos WHERE demanda_id = ? ORDER BY id ASC
      `).bind(d.id).all();

      const veiculos = [];
      for (const dv of veiculosRows || []) {
        const { results: atividadesRows } = await db.prepare(`
          SELECT da.*, am.descricao AS atividade_descricao, am.tipo_projeto AS atividade_tipo_projeto,
                 u.full_name AS concluida_nome
          FROM demanda_atividades da
          LEFT JOIN atividades_modelo am ON am.id = da.atividade_modelo_id
          LEFT JOIN users u ON u.id = da.concluida_por
          WHERE da.demanda_veiculo_id = ?
          ORDER BY da.prioridade ASC, da.id ASC
        `).bind(dv.id).all();

        veiculos.push({
          ...dv,
          atividades: atividadesRows || []
        });
      }

      demandasFormatadas.push({
        ...d,
        veiculos
      });
    }

    return demandasFormatadas;
  } catch (e) {
    console.error('Erro ao buscar demandas:', e);
    return [];
  }
}

demandas.get('/atividades-modelo', async (c) => {
  const tipoProjeto = String(c.req.query('tipo_projeto') || '').trim();
  let sql = 'SELECT * FROM atividades_modelo WHERE ativo = 1';
  const binds = [];
  if (tipoProjeto) {
    sql += ' AND (tipo_projeto = ? OR tipo_projeto IS NULL)';
    binds.push(tipoProjeto);
  }
  sql += ' ORDER BY tipo_projeto ASC, descricao ASC';
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return json({ success: true, atividades: results || [] });
});

demandas.post('/atividades-modelo', async (c) => {
  const user = c.get('user');
  const viewer = c.get('user');
  const ledSector = getLedSector(viewer);
  if (!ledSector && !isAdmin(viewer)) {
    return err('Apenas líderes ou administradores podem cadastrar atividades-modelo.', 403);
  }
  let body;
  try { body = await c.req.json(); } catch { return err('JSON inválido.'); }
  const descricao = String(body.descricao || '').trim();
  const tipo_projeto = String(body.tipo_projeto || '').trim() || null;
  if (!descricao) return err('Informe a descrição da atividade.');
  const result = await c.env.DB.prepare(
    'INSERT INTO atividades_modelo (tipo_projeto, descricao) VALUES (?, ?)'
  ).bind(tipo_projeto, descricao).run();
  return json({ success: true, id: result.meta.last_row_id }, 201);
});

demandas.get('/viagem/:viagemId', async (c) => {
  const viagemId = Number(c.req.param('viagemId'));
  const trip = await getAccessibleTrip(c, viagemId);
  if (!trip) return err('Viagem não encontrada.', 404);
  const lista = await fetchDemandasViagem(c.env.DB, viagemId);
  return json({ success: true, demandas: lista });
});

demandas.post('/viagem/:viagemId', async (c) => {
  const viagemId = Number(c.req.param('viagemId'));
  const userId = c.get('userId');
  const viewer = c.get('user');

  const trip = await getAccessibleTrip(c, viagemId);
  if (!trip) return err('Viagem não encontrada.', 404);

  const ledSector = getLedSector(viewer);
  const isLeader = Boolean(ledSector && trip.sector === ledSector);

  if (!isLeader) {
    return err('Apenas líderes podem fornecer demandas para esta viagem.', 403);
  }

  let body;
  try { body = await c.req.json(); } catch { return err('JSON inválido.'); }

  const tipo_projeto = String(body.tipo_projeto || '').trim();
  const veiculos = Array.isArray(body.veiculos) ? body.veiculos : [];

  if (!tipo_projeto) return err('Informe o tipo de projeto.');
  if (!veiculos.length) return err('Adicione pelo menos um veículo.');

  for (const [idx, v] of veiculos.entries()) {
    const montadora = String(v.montadora || '').trim();
    const modelo = String(v.modelo || '').trim();
    const placaBruta = String(v.placa || '').trim();
    if (!montadora) return err(`Veículo ${idx + 1}: informe a montadora.`);
    if (!modelo) return err(`Veículo ${idx + 1}: informe o modelo.`);
    if (placaBruta && !validarPlaca(placaBruta)) {
      return err(`Veículo ${idx + 1}: placa inválida (use AAA-0000 ou AAA0A00).`);
    }
    const atividades = Array.isArray(v.atividades) ? v.atividades : [];
    if (!atividades.length) return err(`Veículo ${idx + 1}: adicione pelo menos uma atividade.`);
    for (const [aidx, a] of atividades.entries()) {
      const amId = Number(a.atividade_modelo_id || 0);
      const prioridade = Number(a.prioridade || 0);
      if (!amId) return err(`Veículo ${idx + 1} / Atividade ${aidx + 1}: selecione a atividade.`);
      if (!prioridade || prioridade < 1) return err(`Veículo ${idx + 1} / Atividade ${aidx + 1}: prioridade inválida.`);
    }
  }

  const resultDemanda = await c.env.DB.prepare(
    `INSERT INTO demandas (viagem_id, tipo_projeto, status, criado_por) VALUES (?, ?, 'pendente', ?)`
  ).bind(viagemId, tipo_projeto, userId).run();
  const demandaId = resultDemanda.meta.last_row_id;

  for (const v of veiculos) {
    const placa = formatarPlaca(v.placa);
    const resultVeiculo = await c.env.DB.prepare(
      `INSERT INTO demanda_veiculos (demanda_id, montadora, modelo, versao_modelo, ano, placa) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      demandaId,
      String(v.montadora || '').trim(),
      String(v.modelo || '').trim(),
      String(v.versao_modelo || '').trim() || null,
      String(v.ano || '').trim() || null,
      placa
    ).run();
    const veiculoId = resultVeiculo.meta.last_row_id;

    const atividades = Array.isArray(v.atividades) ? v.atividades : [];
    for (const a of atividades) {
      await c.env.DB.prepare(
        `INSERT INTO demanda_atividades (demanda_veiculo_id, atividade_modelo_id, prioridade, status) VALUES (?, ?, ?, 'pendente')`
      ).bind(
        veiculoId,
        Number(a.atividade_modelo_id),
        Number(a.prioridade || 1)
      ).run();
    }
  }

  try {
    const memberIds = new Set();
    memberIds.add(trip.user_id);
    const { results: members } = await c.env.DB.prepare(
      'SELECT user_id FROM trip_members WHERE trip_id = ?'
    ).bind(viagemId).all();
    for (const m of members || []) memberIds.add(Number(m.user_id));
    const destinatarios = [...memberIds].filter(id => id !== userId);

    if (destinatarios.length) {
      await notifyUsers(c.env.DB, destinatarios, {
        type: 'info',
        title: 'Novas demandas de veículo',
        message: `O líder forneceu demandas para a viagem ${trip.origin} → ${trip.destination}. Acesse a viagem para ver as atividades.`,
        link: `/trip.html?id=${viagemId}#demandas`
      });
    }
  } catch (e) {
    console.error('Falha ao notificar integrantes sobre demanda:', e);
  }

  await logActivity(c.env.DB, {
    tripId: viagemId,
    userId,
    action: 'demanda_criada',
    summary: `Forneceu demandas (tipo: ${tipo_projeto}) para ${veiculos.length} veículo(s).`,
    details: { tipo_projeto, veiculos_qtd: veiculos.length }
  });

  const lista = await fetchDemandasViagem(c.env.DB, viagemId);
  return json({ success: true, demandas: lista }, 201);
});

demandas.put('/atividade/:atividadeId/status', async (c) => {
  return err('A demanda deve ser concluída ao registrar a atividade dentro da viagem.', 410);

  const atividadeId = Number(c.req.param('atividadeId'));
  const userId = c.get('userId');
  const trip = await getAccessibleTrip(c, Number(c.req.query('trip_id') || 0));

  if (!trip) return err('Viagem não encontrada.', 404);

  const atividade = await c.env.DB.prepare(`
    SELECT da.*, dv.demanda_id, dv.montadora, dv.modelo, d.tipo_projeto,
           am.descricao AS atividade_descricao
    FROM demanda_atividades da
    INNER JOIN demanda_veiculos dv ON dv.id = da.demanda_veiculo_id
    INNER JOIN demandas d ON d.id = dv.demanda_id
    LEFT JOIN atividades_modelo am ON am.id = da.atividade_modelo_id
    WHERE da.id = ? AND d.viagem_id = ?
  `).bind(atividadeId, trip.id).first();

  if (!atividade) return err('Atividade não encontrada.', 404);

  let body;
  try { body = await c.req.json(); } catch { return err('JSON inválido.'); }
  const status = String(body.status || '').trim();
  if (!['pendente', 'em_andamento', 'concluida'].includes(status)) {
    return err('Status inválido.');
  }

  const binds = [status, atividadeId];
  let sql = 'UPDATE demanda_atividades SET status = ?';
  if (status === 'concluida') {
    sql += ', concluida_por = ?, concluida_em = CURRENT_TIMESTAMP';
    binds.splice(1, 0, userId);
  } else {
    sql += ', concluida_por = NULL, concluida_em = NULL';
  }
  sql += ' WHERE id = ?';

  await c.env.DB.prepare(sql).bind(...binds).run();
  await atualizarStatusDemanda(c.env.DB, atividade.demanda_id);

  if (status === 'concluida' && atividade.status !== 'concluida') {
    try {
      const lider = await c.env.DB.prepare(`
        SELECT id FROM users
        WHERE sector = ?
          AND LOWER(REPLACE(REPLACE(position_title, 'í', 'i'), 'Í', 'I')) = 'lider'
        LIMIT 1
      `).bind(trip.sector).first();

      if (lider && Number(lider.id) !== Number(userId)) {
        await notifyUsers(c.env.DB, [lider.id], {
          type: 'success',
          title: 'Demanda de prioridade concluída',
          message: `${c.get('user')?.full_name || 'Um integrante'} concluiu "${atividade.atividade_descricao || 'uma atividade'}"${atividade.tipo_projeto ? ` (${atividade.tipo_projeto})` : ''}.`,
          link: `/trip.html?id=${trip.id}#demandas`
        });
      }
    } catch (e) {
      console.error('Falha ao notificar líder sobre demanda concluída:', e);
    }
  }

  const lista = await fetchDemandasViagem(c.env.DB, trip.id);
  return json({ success: true, demandas: lista });
});

demandas.delete('/:demandaId', async (c) => {
  const demandaId = Number(c.req.param('demandaId'));
  const userId = c.get('userId');
  const viewer = c.get('user');

  const demanda = await c.env.DB.prepare('SELECT * FROM demandas WHERE id = ?')
    .bind(demandaId).first();
  if (!demanda) return err('Demanda não encontrada.', 404);

  const trip = await getAccessibleTrip(c, demanda.viagem_id);
  if (!trip) return err('Viagem não encontrada.', 404);

  const ledSector = getLedSector(viewer);
  const isLeader = Boolean(ledSector && trip.sector === ledSector);

  if (!isLeader) {
    return err('Sem permissão para excluir esta demanda.', 403);
  }

  const veiculoIds = (await c.env.DB.prepare(
    'SELECT id FROM demanda_veiculos WHERE demanda_id = ?'
  ).bind(demandaId).all()).results?.map(r => r.id) || [];

  if (veiculoIds.length) {
    const placeholders = veiculoIds.map(() => '?').join(',');
    await c.env.DB.prepare(
      `DELETE FROM demanda_atividades WHERE demanda_veiculo_id IN (${placeholders})`
    ).bind(...veiculoIds).run();
    await c.env.DB.prepare(
      `DELETE FROM demanda_veiculos WHERE id IN (${placeholders})`
    ).bind(...veiculoIds).run();
  }

  await c.env.DB.prepare('DELETE FROM demandas WHERE id = ?').bind(demandaId).run();

  const lista = await fetchDemandasViagem(c.env.DB, trip.id);
  return json({ success: true, demandas: lista });
});
