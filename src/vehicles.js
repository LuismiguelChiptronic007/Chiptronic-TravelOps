import { Hono } from 'hono';
import { requireUser } from './auth.js';
import { err, getLedSector, isAdmin, json } from './helpers.js';
import { getAccessibleTrip } from './tasks.js';

export const vehicleRoutes = new Hono();
vehicleRoutes.use('*', requireUser);

function validarPlaca(placa) {
  if (!placa) return true;
  const limpa = String(placa).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{3}[0-9]{4}$/.test(limpa) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(limpa);
}

function formatarPlaca(placa) {
  const limpa = String(placa || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!limpa) return null;
  return /^[A-Z]{3}[0-9]{4}$/.test(limpa) ? `${limpa.slice(0, 3)}-${limpa.slice(3)}` : limpa;
}

async function getVehicle(db, tripId, vehicleId) {
  return db.prepare('SELECT * FROM vehicles WHERE id = ? AND trip_id = ?').bind(vehicleId, tripId).first();
}

async function formatVehicles(db, tripId) {
  const { results: vehicles } = await db.prepare(`
    SELECT v.*, u.full_name AS created_by_name
    FROM vehicles v
    LEFT JOIN users u ON u.id = v.created_by
    WHERE v.trip_id = ?
    ORDER BY v.id ASC
  `).bind(tripId).all();
  const ids = (vehicles || []).map((vehicle) => Number(vehicle.id)).filter(Boolean);
  const demandsByVehicle = new Map();
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const { results: demands } = await db.prepare(`
      SELECT vd.*, u.full_name AS created_by_name
      FROM vehicle_demands vd
      LEFT JOIN users u ON u.id = vd.created_by
      WHERE vd.vehicle_id IN (${placeholders})
      ORDER BY vd.prioridade ASC, vd.id ASC
    `).bind(...ids).all();
    for (const demand of demands || []) {
      if (!demandsByVehicle.has(Number(demand.vehicle_id))) demandsByVehicle.set(Number(demand.vehicle_id), []);
      demandsByVehicle.get(Number(demand.vehicle_id)).push(demand);
    }
  }
  return (vehicles || []).map((vehicle) => ({
    ...vehicle,
    demands: demandsByVehicle.get(Number(vehicle.id)) || [],
  }));
}

function canManageDemands(viewer, trip) {
  return isAdmin(viewer) || Boolean(getLedSector(viewer) && String(trip.sector || '').trim() === String(getLedSector(viewer) || '').trim());
}

vehicleRoutes.get('/trips/:tripId/vehicles', async (c) => {
  const tripId = Number(c.req.param('tripId'));
  const trip = await getAccessibleTrip(c, tripId);
  if (!trip) return err('Viagem não encontrada.', 404);
  return json({ success: true, vehicles: await formatVehicles(c.env.DB, tripId) });
});

vehicleRoutes.post('/trips/:tripId/vehicles', async (c) => {
  const tripId = Number(c.req.param('tripId'));
  const trip = await getAccessibleTrip(c, tripId);
  if (!trip) return err('Viagem não encontrada.', 404);
  let body;
  try { body = await c.req.json(); } catch { return err('JSON inválido.'); }
  const montadora = String(body.montadora || '').trim();
  const modelo = String(body.modelo || '').trim();
  const versaoModelo = String(body.versao_modelo || '').trim();
  const ano = String(body.ano || '').trim();
  const placaBruta = String(body.placa || '').trim();
  if (!montadora) return err('Informe a montadora.');
  if (!modelo) return err('Informe o modelo.');
  if (ano && (!/^\d{4}$/.test(ano) || Number(ano) < 1900 || Number(ano) > new Date().getFullYear() + 1)) return err('Informe um ano válido.');
  if (!validarPlaca(placaBruta)) return err('Placa inválida. Use AAA-0000 ou AAA0A00.');
  await c.env.DB.prepare(`
    INSERT INTO vehicles (trip_id, montadora, modelo, versao_modelo, ano, placa, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(tripId, montadora, modelo, versaoModelo || null, ano || null, formatarPlaca(placaBruta), c.get('userId')).run();
  return json({ success: true, vehicles: await formatVehicles(c.env.DB, tripId) }, 201);
});

vehicleRoutes.get('/trips/:tripId/vehicles/:vehicleId/demands', async (c) => {
  const tripId = Number(c.req.param('tripId'));
  const vehicleId = Number(c.req.param('vehicleId'));
  const trip = await getAccessibleTrip(c, tripId);
  if (!trip) return err('Viagem não encontrada.', 404);
  const vehicle = await getVehicle(c.env.DB, tripId, vehicleId);
  if (!vehicle) return err('Veículo não encontrado.', 404);
  const { results } = await c.env.DB.prepare(`
    SELECT vd.*, u.full_name AS created_by_name
    FROM vehicle_demands vd
    LEFT JOIN users u ON u.id = vd.created_by
    WHERE vd.vehicle_id = ? AND vd.trip_id = ?
    ORDER BY vd.prioridade ASC, vd.id ASC
  `).bind(vehicleId, tripId).all();
  return json({ success: true, demands: results || [] });
});

vehicleRoutes.post('/trips/:tripId/vehicles/:vehicleId/demands', async (c) => {
  const tripId = Number(c.req.param('tripId'));
  const vehicleId = Number(c.req.param('vehicleId'));
  const viewer = c.get('user');
  const trip = await getAccessibleTrip(c, tripId);
  if (!trip) return err('Viagem não encontrada.', 404);
  if (!canManageDemands(viewer, trip)) return err('Apenas líderes ou administradores podem fornecer demandas.', 403);
  const vehicle = await getVehicle(c.env.DB, tripId, vehicleId);
  if (!vehicle) return err('Veículo não encontrado.', 404);
  let body;
  try { body = await c.req.json(); } catch { return err('JSON inválido.'); }
  const tipoProjeto = String(body.tipo_projeto || '').trim();
  const tipoTrabalho = String(body.tipo_trabalho || body.work_type || '').trim();
  const atividadeModeloId = Number(body.atividade_modelo_id || 0);
  const prioridade = Number(body.prioridade || 1);
  if (!tipoProjeto) return err('Informe o tipo de projeto.');
  if (!tipoTrabalho) return err('Informe o tipo de trabalho.');
  if (!atividadeModeloId) return err('Selecione uma atividade.');
  if (!Number.isInteger(prioridade) || prioridade < 1) return err('Informe uma prioridade válida.');
  const activity = await c.env.DB.prepare('SELECT id, descricao FROM atividades_modelo WHERE id = ? AND ativo = 1').bind(atividadeModeloId).first();
  if (!activity) return err('Atividade inválida.');
  await c.env.DB.prepare(`
    INSERT INTO vehicle_demands (vehicle_id, trip_id, tipo_projeto, tipo_trabalho, atividade_modelo_id, atividade, prioridade, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?)
  `).bind(vehicleId, tripId, tipoProjeto, tipoTrabalho, activity.id, activity.descricao, prioridade, c.get('userId')).run();
  return json({ success: true, vehicles: await formatVehicles(c.env.DB, tripId) }, 201);
});

vehicleRoutes.patch('/vehicle-demands/:demandId', async (c) => {
  const demandId = Number(c.req.param('demandId'));
  const viewer = c.get('user');
  const demand = await c.env.DB.prepare('SELECT * FROM vehicle_demands WHERE id = ?').bind(demandId).first();
  if (!demand) return err('Demanda não encontrada.', 404);
  const trip = await getAccessibleTrip(c, Number(demand.trip_id));
  if (!trip) return err('Viagem não encontrada.', 404);
  let body;
  try { body = await c.req.json(); } catch { return err('JSON inválido.'); }
  const status = String(body.status || '').trim();
  if (!['pendente', 'em_andamento', 'concluida'].includes(status)) return err('Status inválido.');
  if (!canManageDemands(viewer, trip) && status !== 'concluida') return err('Você não pode alterar esta demanda.', 403);
  await c.env.DB.prepare('UPDATE vehicle_demands SET status = ? WHERE id = ?').bind(status, demandId).run();
  return json({ success: true, demand: await c.env.DB.prepare('SELECT * FROM vehicle_demands WHERE id = ?').bind(demandId).first() });
});

vehicleRoutes.delete('/vehicle-demands/:demandId', async (c) => {
  const demandId = Number(c.req.param('demandId'));
  const viewer = c.get('user');
  const demand = await c.env.DB.prepare('SELECT * FROM vehicle_demands WHERE id = ?').bind(demandId).first();
  if (!demand) return err('Demanda não encontrada.', 404);

  const trip = await getAccessibleTrip(c, Number(demand.trip_id));
  if (!trip) return err('Viagem não encontrada.', 404);
  if (!canManageDemands(viewer, trip)) return err('Apenas líderes ou administradores podem excluir demandas.', 403);

  const normalize = (value, plate = false) => {
    const normalized = String(value || '').trim().toLowerCase();
    return plate ? normalized.replace(/[^a-z0-9]/g, '') : normalized;
  };
  const { results: legacyCandidates } = await c.env.DB.prepare(`
    SELECT da.id AS atividade_id, dv.id AS demanda_veiculo_id, d.id AS demanda_id,
           d.tipo_projeto, dv.montadora, dv.modelo, dv.versao_modelo, dv.ano, dv.placa,
           da.atividade_modelo_id, am.descricao AS atividade_descricao
    FROM demanda_atividades da
    INNER JOIN demanda_veiculos dv ON dv.id = da.demanda_veiculo_id
    INNER JOIN demandas d ON d.id = dv.demanda_id
    LEFT JOIN atividades_modelo am ON am.id = da.atividade_modelo_id
    WHERE d.viagem_id = ?
  `).bind(demand.trip_id).all();
  const vehicle = await getVehicle(c.env.DB, demand.trip_id, demand.vehicle_id);
  const linkedLegacy = (legacyCandidates || []).find((candidate) =>
    normalize(candidate.tipo_projeto) === normalize(demand.tipo_projeto)
    && normalize(candidate.montadora) === normalize(vehicle?.montadora)
    && normalize(candidate.modelo) === normalize(vehicle?.modelo)
    && normalize(candidate.versao_modelo) === normalize(vehicle?.versao_modelo)
    && normalize(candidate.ano) === normalize(vehicle?.ano)
    && normalize(candidate.placa, true) === normalize(vehicle?.placa, true)
    && (String(candidate.atividade_modelo_id || '') === String(demand.atividade_modelo_id || '')
      || normalize(candidate.atividade_descricao) === normalize(demand.atividade))
  );

  await c.env.DB.prepare('DELETE FROM vehicle_demands WHERE id = ?').bind(demandId).run();

  if (linkedLegacy) {
    await c.env.DB.prepare('DELETE FROM demanda_atividades WHERE id = ?').bind(linkedLegacy.atividade_id).run();
    const remainingActivities = await c.env.DB.prepare(
      'SELECT COUNT(*) AS total FROM demanda_atividades WHERE demanda_veiculo_id = ?'
    ).bind(linkedLegacy.demanda_veiculo_id).first();
    if (!Number(remainingActivities?.total || 0)) {
      await c.env.DB.prepare('DELETE FROM demanda_veiculos WHERE id = ?').bind(linkedLegacy.demanda_veiculo_id).run();
      const remainingVehicles = await c.env.DB.prepare(
        'SELECT COUNT(*) AS total FROM demanda_veiculos WHERE demanda_id = ?'
      ).bind(linkedLegacy.demanda_id).first();
      if (!Number(remainingVehicles?.total || 0)) {
        await c.env.DB.prepare('DELETE FROM demandas WHERE id = ?').bind(linkedLegacy.demanda_id).run();
      }
    }
  }

  return json({ success: true, vehicles: await formatVehicles(c.env.DB, Number(demand.trip_id)) });
});
