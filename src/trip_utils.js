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
  const { results } = await db
    .prepare("SELECT id FROM trips WHERE user_id = ? AND status != 'completed'")
    .bind(userId)
    .all();
  for (const row of results || []) {
    await autoUpdateTripStatus(db, row.id);
  }
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
  return {
    id: task.id,
    trip_id: task.trip_id,
    work_type: task.work_type,
    location: task.location,
    start_time: task.start_time,
    end_time: task.end_time,
    summary: task.summary,
    task_date: task.task_date,
    approved_loads: task.approved_loads || '',
    rejected_loads: task.rejected_loads || '',
    logs_realizados: task.logs_realizados || '',
    sistemas_logados: task.sistemas_logados || '',
    nome_sistemas_logados: task.nome_sistemas_logados || '',
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
    .prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
    .bind(tripId, userId)
    .first();
  if (!trip) return null;

  const checklist = await db
    .prepare('SELECT * FROM trip_checklists WHERE trip_id = ?')
    .bind(tripId)
    .first();

  const { results: expenses } = await db
    .prepare('SELECT * FROM expenses WHERE trip_id = ? ORDER BY id ASC')
    .bind(tripId)
    .all();

  const { results: attachments } = await db
    .prepare('SELECT * FROM attachments WHERE trip_id = ? ORDER BY id ASC')
    .bind(tripId)
    .all();

  let members = [];
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
    members = results || [];
  } catch {
    members = [];
  }

  let tasks = [];
  try {
    const { results: taskRows } = await db
      .prepare('SELECT * FROM trip_tasks WHERE trip_id = ? ORDER BY task_date ASC, start_time ASC, id ASC')
      .bind(tripId)
      .all();

    for (const task of taskRows || []) {
      const { results: photos } = await db
        .prepare('SELECT * FROM trip_task_photos WHERE task_id = ? ORDER BY id ASC')
        .bind(task.id)
        .all();
      tasks.push(formatTask(task, photos || []));
    }
  } catch {
    tasks = [];
  }

  return formatTrip(trip, checklist, expenses, attachments, members, tasks);
}

export async function saveTripMembers(db, tripId, memberUserIds = []) {
  const ids = [...new Set((memberUserIds || []).map((id) => Number(id)).filter((id) => id > 0))];

  await db.prepare('DELETE FROM trip_members WHERE trip_id = ?').bind(tripId).run();

  for (const userId of ids) {
    const user = await db
      .prepare('SELECT id, full_name, sector, manager_name, position_title FROM users WHERE id = ?')
      .bind(userId)
      .first();
    if (!user) continue;

    await db
      .prepare(
        `INSERT INTO trip_members (trip_id, user_id, full_name, sector, manager_name)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(tripId, user.id, user.full_name, user.sector, user.manager_name || null)
      .run();
  }
}