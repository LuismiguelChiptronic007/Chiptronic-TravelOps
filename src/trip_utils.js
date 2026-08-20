import {
  checklistIsComplete,
  computeStatus,
  isReportOverdue,
  statusLabel,
} from './helpers.js';

export async function autoUpdateTripStatus(db, tripId) {
  const trip = await db
    .prepare('SELECT id, start_date, end_date, status FROM trips WHERE id = ?')
    .bind(tripId)
    .first();
  if (!trip || trip.status === 'completed') return trip;

  const next = computeStatus(trip);
  if (next !== trip.status) {
    await db
      .prepare("UPDATE trips SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(next, tripId)
      .run();
    trip.status = next;
  }
  return trip;
}

export async function syncUserTripStatuses(db, userId) {
  await db
    .prepare(`UPDATE trips SET status = CASE
      WHEN status = 'completed' THEN 'completed'
      WHEN end_date < date('now') THEN 'awaiting_report'
      WHEN start_date <= date('now') AND end_date >= date('now') THEN 'in_progress'
      ELSE 'planned'
    END,
    updated_at = datetime('now')
    WHERE user_id = ? AND status != 'completed'
      AND status != CASE
        WHEN end_date < date('now') THEN 'awaiting_report'
        WHEN start_date <= date('now') AND end_date >= date('now') THEN 'in_progress'
        ELSE 'planned'
      END`)
    .bind(userId)
    .run();
}

export async function syncMultipleUsersTripStatuses(db, userIds = []) {
  if (!userIds.length) return;
  const placeholders = userIds.map(() => '?').join(',');
  await db
    .prepare(`UPDATE trips SET status = CASE
      WHEN status = 'completed' THEN 'completed'
      WHEN end_date < date('now') THEN 'awaiting_report'
      WHEN start_date <= date('now') AND end_date >= date('now') THEN 'in_progress'
      ELSE 'planned'
    END,
    updated_at = datetime('now')
    WHERE user_id IN (${placeholders}) AND status != 'completed'`)
    .bind(...userIds)
    .run();
}

function formatMember(m) {
  return {
    id: m.id,
    user_id: m.user_id,
    full_name: m.full_name,
    sector: m.sector,
    manager_name: m.manager_name || null,
    position_title: m.position_title || null,
    email: m.email || null,
  };
}

function formatTask(task, photos = []) {
  const rawResponsibleIds = Array.isArray(task.responsible_ids)
    ? task.responsible_ids
    : String(task.responsible_ids || '')
        .split(',')
        .map((id) => Number(String(id).trim()))
        .filter((id) => Number.isInteger(id) && id > 0);

  const hasLegacySingleResponsible = !rawResponsibleIds.length && Number.isInteger(Number(task.responsible_id)) && Number(task.responsible_id) > 0;
  const responsibleIds = hasLegacySingleResponsible ? [Number(task.responsible_id)] : rawResponsibleIds;

  const responsibles = Array.isArray(task.responsibles) && task.responsibles.length
    ? task.responsibles
    : (responsibleIds.length
        ? responsibleIds
            .map((id) => ({
              id,
              full_name: task.responsible_full_name && id === Number(task.responsible_id) ? task.responsible_full_name : null,
            }))
            .filter((member) => member.full_name)
        : []);

  const responsibleLabel = responsibles.length
    ? responsibles.map((member) => member.full_name || '—').filter(Boolean).join(', ')
    : task.responsible_full_name || '—';

  return {
    id: task.id,
    trip_id: task.trip_id,
    work_type: task.work_type,
    location: task.location,
    start_time: task.start_time,
    end_time: task.end_time,
    summary: task.summary,
    task_date: task.task_date,
    responsible_id: responsibleIds[0] || task.responsible_id || null,
    responsible_ids: responsibleIds,
    vehicle: task.vehicle || null,
    plate: task.plate || null,
    montadora: task.montadora || null,
    modelo: task.modelo || null,
    submodelo: task.submodelo || null,
    project_id: task.project_id || null,
    project_name: task.project_name || null,
    custom_fields: task.custom_fields || {},
    responsible: responsibleIds.length || task.responsible_id
      ? {
          id: responsibleIds[0] || task.responsible_id || null,
          full_name: responsibleLabel,
          employee_id: task.responsible_employee_id || null,
          position_title: task.responsible_position_title || null,
        }
      : null,
    responsibles: responsibles,
    pending_items: task.pending_items || '',
    created_at: task.created_at,
    updated_at: task.updated_at,
    photos: (photos || []).map((p) => ({
      id: p.id,
      original_name: p.original_name,
      url: `/api/files/${p.stored_key}`,
      mime_type: p.mime_type,
      created_at: p.created_at,
    })),
  };
}

export function formatTrip(trip, checklist = null, expenses = [], attachments = [], members = [], tasks = []) {
  const taskList = tasks || [];
  return {
    id: trip.id,
    user_id: trip.user_id,
    origin: trip.origin,
    destination: trip.destination,
    start_date: trip.start_date,
    end_date: trip.end_date,
    reason: trip.reason,
    sector: trip.sector,
    status: trip.status,
    status_label: statusLabel(trip.status),
    is_overdue: isReportOverdue(trip),
    created_at: trip.created_at,
    updated_at: trip.updated_at,
    checklist: checklist
      ? {
          objective_met:
            checklist.objective_met === null || checklist.objective_met === undefined
              ? null
              : Boolean(checklist.objective_met),
          objective_notes: checklist.objective_notes || '',
          people_visited: checklist.people_visited || '',
          activities_summary: checklist.activities_summary || '',
          pending_items: checklist.pending_items || '',
          completed_at: checklist.completed_at || null,
          is_complete: checklistIsComplete(checklist, taskList),
        }
      : {
          is_complete: checklistIsComplete(null, taskList),
          completed_at: null,
        },
    members: (members || []).map(formatMember),
    tasks: taskList,
    expenses: (expenses || []).map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount) || 0,
      receipt_url: e.receipt_key ? `/api/files/${e.receipt_key}` : null,
      created_at: e.created_at,
    })),
    attachments: (attachments || []).map((a) => ({
      id: a.id,
      original_name: a.original_name,
      url: `/api/files/${a.stored_key}`,
      mime_type: a.mime_type,
      created_at: a.created_at,
    })),
  };
}

export async function fetchTripFull(db, tripId, userId) {
  await autoUpdateTripStatus(db, tripId);
  const trip = await db
    .prepare('SELECT * FROM trips WHERE id = ?')
    .bind(tripId)
    .first();
  if (!trip) return null;

  const [checklist, expenses, attachments, membersResult, taskRowsResult] = await Promise.all([
    db.prepare('SELECT * FROM trip_checklists WHERE trip_id = ?').bind(tripId).first(),
    db.prepare('SELECT * FROM expenses WHERE trip_id = ? ORDER BY id ASC').bind(tripId).all(),
    db.prepare('SELECT * FROM attachments WHERE trip_id = ? ORDER BY id ASC').bind(tripId).all(),
    (async () => {
      try {
        const { results } = await db
          .prepare(
            `SELECT tm.*, u.position_title, u.email
             FROM trip_members tm
             LEFT JOIN users u ON u.id = tm.user_id
             WHERE tm.trip_id = ?
             ORDER BY tm.id ASC`
          )
          .bind(tripId)
          .all();
        return results || [];
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        const { results } = await db
          .prepare(
            `SELECT tt.*, u.id AS responsible_id_ref, u.full_name AS responsible_full_name,
                    u.employee_id AS responsible_employee_id, u.position_title AS responsible_position_title,
                    lp.name AS project_name
             FROM trip_tasks tt
             LEFT JOIN users u ON u.id = tt.responsible_id
             LEFT JOIN leader_projects lp ON lp.id = tt.project_id
             WHERE tt.trip_id = ?
             ORDER BY tt.task_date ASC, tt.start_time ASC, tt.id ASC`
          )
          .bind(tripId)
          .all();
        return results || [];
      } catch (error) {
        console.error('Erro ao carregar tarefas da viagem:', error);
        return [];
      }
    })(),
  ]);

  let members = membersResult;

  try {
    const owner = await db
      .prepare('SELECT id, full_name, sector, manager_name, position_title, employee_id FROM users WHERE id = ?')
      .bind(trip.user_id)
      .first();
    if (owner) {
      const exists = (members || []).some((m) => Number(m.user_id || m.id) === Number(owner.id));
      if (!exists) {
        const ownerMember = {
          id: null,
          trip_id: tripId,
          user_id: owner.id,
          full_name: owner.full_name,
          sector: owner.sector || null,
          manager_name: owner.manager_name || null,
          position_title: owner.position_title || null,
          employee_id: owner.employee_id || null,
        };
        members = [ownerMember, ...(members || [])];
      }
    }
  } catch (e) {
    // ignore owner fetch failures
  }

  const taskRows = taskRowsResult;
  const tasks = [];

  if (taskRows.length) {
    const allResponsibleIds = new Set();
    const allTaskIds = [];
    for (const task of taskRows) {
      allTaskIds.push(task.id);
      const raw = Array.isArray(task.responsible_ids)
        ? task.responsible_ids
        : String(task.responsible_ids || '')
            .split(',')
            .map((id) => Number(String(id).trim()))
            .filter((id) => Number.isInteger(id) && id > 0);
      const idsToLoad = raw.length ? raw : (task.responsible_id ? [task.responsible_id] : (task.responsible_id_ref ? [task.responsible_id_ref] : []));
      for (const id of idsToLoad) allResponsibleIds.add(id);
    }

    const [responsibleUsers, photos, customFieldsRows] = await Promise.all([
      allResponsibleIds.size
        ? db
            .prepare(`SELECT id, full_name, employee_id, position_title FROM users WHERE id IN (${[...allResponsibleIds].map(() => '?').join(',')}) ORDER BY full_name ASC`)
            .bind(...allResponsibleIds)
            .all()
        : { results: [] },
      db
        .prepare(`SELECT * FROM trip_task_photos WHERE task_id IN (${allTaskIds.map(() => '?').join(',')}) ORDER BY id ASC`)
        .bind(...allTaskIds)
        .all(),
      db
        .prepare(`SELECT task_id, field_name, field_value FROM trip_task_custom_values WHERE task_id IN (${allTaskIds.map(() => '?').join(',')})`)
        .bind(...allTaskIds)
        .all(),
    ]);

    const responsibleMap = new Map((responsibleUsers.results || []).map((u) => [u.id, u]));
    const photosByTask = new Map();
    for (const p of photos.results || []) {
      if (!photosByTask.has(p.task_id)) photosByTask.set(p.task_id, []);
      photosByTask.get(p.task_id).push(p);
    }

    const customFieldsByTask = new Map();
    for (const row of customFieldsRows.results || []) {
      if (!customFieldsByTask.has(row.task_id)) customFieldsByTask.set(row.task_id, {});
      customFieldsByTask.get(row.task_id)[row.field_name] = row.field_value;
    }

    for (const task of taskRows) {
      const raw = Array.isArray(task.responsible_ids)
        ? task.responsible_ids
        : String(task.responsible_ids || '')
            .split(',')
            .map((id) => Number(String(id).trim()))
            .filter((id) => Number.isInteger(id) && id > 0);
      const hasLegacy = !raw.length && Number.isInteger(Number(task.responsible_id)) && Number(task.responsible_id) > 0;
      const responsibleIds = hasLegacy ? [Number(task.responsible_id)] : raw;
      const idsToLoad = responsibleIds.length ? responsibleIds : (task.responsible_id_ref ? [task.responsible_id_ref] : (task.responsible_id ? [task.responsible_id] : []));
      const responsibleList = idsToLoad
        .map((id) => responsibleMap.get(id))
        .filter(Boolean)
        .map((user) => ({
          id: user.id,
          full_name: user.full_name,
          employee_id: user.employee_id || null,
          position_title: user.position_title || null,
        }));

      const primaryResponsible = responsibleList[0] || null;
      const taskWithResponsibles = {
        ...task,
        responsible_id: primaryResponsible?.id || task.responsible_id || task.responsible_id_ref || null,
        responsible_full_name: primaryResponsible?.full_name || task.responsible_full_name || null,
        responsible_employee_id: primaryResponsible?.employee_id || task.responsible_employee_id || null,
        responsible_position_title: primaryResponsible?.position_title || task.responsible_position_title || null,
        responsibles: responsibleList,
        custom_fields: customFieldsByTask.get(task.id) || {},
      };

      tasks.push(formatTask(taskWithResponsibles, photosByTask.get(task.id) || []));
    }
  }

  return formatTrip(trip, checklist, expenses.results || [], attachments.results || [], members, tasks);
}

export async function saveTripMembers(db, tripId, memberUserIds = []) {
  const ids = [...new Set((memberUserIds || []).map((id) => Number(id)).filter((id) => id > 0))];

  await db.prepare('DELETE FROM trip_members WHERE trip_id = ?').bind(tripId).run();

  if (!ids.length) return;

  const placeholders = ids.map(() => '?').join(',');
  const { results: users } = await db
    .prepare(`SELECT id, full_name, sector, manager_name FROM users WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all();
  const userMap = new Map((users || []).map((u) => [u.id, u]));

  const rows = [];
  for (const userId of ids) {
    const user = userMap.get(userId);
    if (!user) continue;
    rows.push([tripId, user.id, user.full_name, user.sector || null, user.manager_name || null]);
  }
  if (!rows.length) return;

  const valuePlaceholders = rows.map(() => '(?, ?, ?, ?, ?)').join(', ');
  const flatBinds = rows.flat();
  await db
    .prepare(`INSERT INTO trip_members (trip_id, user_id, full_name, sector, manager_name) VALUES ${valuePlaceholders}`)
    .bind(...flatBinds)
    .run();
}
