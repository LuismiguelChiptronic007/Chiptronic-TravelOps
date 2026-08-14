import { Hono } from 'hono';
import { requireUser } from './auth.js';
import {
  err,
  json,
  publicUser,
  getLedSector,
  isSectorLeader,
  daysBetween,
} from './helpers.js';
import { formatTrip, syncMultipleUsersTripStatuses } from './trip_utils.js';

export const sector = new Hono();
sector.use('*', requireUser);

async function fetchTeamData(db, user) {
  const ledSector = getLedSector(user);
  if (!ledSector) return null;

  const { results: members } = await db
    .prepare(
      `SELECT * FROM users
       WHERE sector = ? AND id != ?
       ORDER BY full_name ASC`
    )
    .bind(ledSector, user.id)
    .all();

  const memberIds = (members || []).map((m) => m.id);
  await syncMultipleUsersTripStatuses(db, memberIds);

  const tripsByUser = {};
  const checklistsByTrip = {};
  const tasksByUser = {};
  const tripUsersByTrip = {};

  if (memberIds.length) {
    const placeholders = memberIds.map(() => '?').join(',');
    const { results: tripRows } = await db
      .prepare(
        `SELECT DISTINCT t.*
         FROM trips t
         LEFT JOIN trip_members tm ON tm.trip_id = t.id
         WHERE t.user_id IN (${placeholders}) OR tm.user_id IN (${placeholders})
         ORDER BY t.start_date DESC, t.id DESC`
      )
      .bind(...memberIds, ...memberIds)
      .all();

    const tripIds = (tripRows || []).map((t) => t.id);

    const tripMembersByTrip = new Map();
    if (tripIds.length) {
      const tripPh = tripIds.map(() => '?').join(',');
      const { results: allTripMembers } = await db
        .prepare(`SELECT trip_id, user_id FROM trip_members WHERE trip_id IN (${tripPh})`)
        .bind(...tripIds)
        .all();
      for (const row of allTripMembers || []) {
        if (!tripMembersByTrip.has(row.trip_id)) tripMembersByTrip.set(row.trip_id, []);
        tripMembersByTrip.get(row.trip_id).push(Number(row.user_id));
      }
    }

    for (const trip of tripRows || []) {
      const relatedUsers = new Set([Number(trip.user_id)]);
      const tripMembers = tripMembersByTrip.get(trip.id) || [];
      for (const userId of tripMembers) {
        if (memberIds.includes(userId)) relatedUsers.add(userId);
      }

      tripUsersByTrip[trip.id] = [...relatedUsers].filter((id) => memberIds.includes(id));

      for (const userId of tripUsersByTrip[trip.id]) {
        if (!tripsByUser[userId]) tripsByUser[userId] = [];
        tripsByUser[userId].push(formatTrip(trip));
      }
    }

    if (tripIds.length) {
      const tripPh = tripIds.map(() => '?').join(',');
      const { results: checklists } = await db
        .prepare(`SELECT * FROM trip_checklists WHERE trip_id IN (${tripPh})`)
        .bind(...tripIds)
        .all();
      for (const cl of checklists || []) {
        checklistsByTrip[cl.trip_id] = cl;
      }

      const { results: taskRows } = await db
        .prepare(
          `SELECT tt.*, t.user_id, t.destination, t.status AS trip_status,
                  u.full_name AS responsible_full_name
           FROM trip_tasks tt
           INNER JOIN trips t ON t.id = tt.trip_id
           LEFT JOIN trip_members tm ON tm.trip_id = t.id
           LEFT JOIN users u ON u.id = tt.responsible_id
           WHERE t.user_id IN (${placeholders}) OR tm.user_id IN (${placeholders})
           ORDER BY tt.task_date DESC, tt.start_time DESC`
        )
        .bind(...memberIds, ...memberIds)
        .all();

      for (const task of taskRows || []) {
        const relatedUsers = tripUsersByTrip[task.trip_id] || [Number(task.user_id)];
        for (const userId of relatedUsers) {
          if (!tasksByUser[userId]) tasksByUser[userId] = [];
          tasksByUser[userId].push({
            id: task.id,
            trip_id: task.trip_id,
            work_type: task.work_type,
            location: task.location,
            task_date: task.task_date,
            start_time: task.start_time,
            end_time: task.end_time,
            summary: task.summary,
            destination: task.destination,
            trip_status: task.trip_status,
            responsible_full_name: task.responsible_full_name || null,
          });
        }
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const team = (members || []).map((m) => {
    const trips = tripsByUser[m.id] || [];
    const tasks = tasksByUser[m.id] || [];
    const byStatus = { planned: 0, in_progress: 0, awaiting_report: 0, completed: 0 };
    let daysAway = 0;
    let pendingReports = 0;
    let overdueReports = 0;

    for (const t of trips) {
      if (byStatus[t.status] !== undefined) byStatus[t.status]++;
      if (t.status === 'awaiting_report') {
        pendingReports++;
        if (t.end_date < today) overdueReports++;
      }
      daysAway += daysBetween(t.start_date, t.end_date);
    }

    const reports = trips.map((t) => {
      const cl = checklistsByTrip[t.id];
      return {
        trip_id: t.id,
        destination: t.destination,
        period: `${t.start_date} — ${t.end_date}`,
        status: t.status,
        status_label: t.status_label,
        is_overdue: t.is_overdue,
        activities_summary: cl?.activities_summary || '',
        pending_items: cl?.pending_items || '',
        people_visited: cl?.people_visited || '',
        task_count: tasks.filter((tk) => tk.trip_id === t.id).length,
      };
    });

    return {
      user: publicUser(m),
      stats: {
        total_trips: trips.length,
        total_tasks: tasks.length,
        total_days_away: daysAway,
        pending_reports: pendingReports,
        overdue_reports: overdueReports,
        by_status: byStatus,
      },
      trips,
      tasks,
      reports,
    };
  });

  return { sector: ledSector, team };
}

sector.get('/dashboard', async (c) => {
  const user = c.get('user');
  if (!isSectorLeader(user)) {
    return err('Você não tem permissão para ver o dashboard do setor.', 403);
  }

  const data = await fetchTeamData(c.env.DB, user);
  if (!data) return err('Setor não configurado.', 404);

  const { sector: sectorName, team } = data;

  let totalTrips = 0;
  let totalTasks = 0;
  let totalDays = 0;
  let pendingReports = 0;
  let overdueReports = 0;
  let completedTrips = 0;
  const workTypeCounts = {};
  const monthlyCounts = {};

  const ranking = team
    .map((m) => {
      totalTrips += m.stats.total_trips;
      totalTasks += m.stats.total_tasks;
      totalDays += m.stats.total_days_away;
      pendingReports += m.stats.pending_reports;
      overdueReports += m.stats.overdue_reports || 0;
      completedTrips += m.stats.by_status.completed || 0;

      for (const t of m.tasks || []) {
        workTypeCounts[t.work_type] = (workTypeCounts[t.work_type] || 0) + 1;
      }
      for (const trip of m.trips || []) {
        const monthKey = String(trip.start_date || '').slice(0, 7);
        if (monthKey) monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
      }

      return {
        user_id: m.user.id,
        full_name: m.user.full_name,
        trip_count: m.stats.total_trips,
        task_count: m.stats.total_tasks,
        days_away: m.stats.total_days_away,
        pending_reports: m.stats.pending_reports,
        overdue_reports: m.stats.overdue_reports || 0,
      };
    })
    .sort((a, b) => b.trip_count - a.trip_count || b.task_count - a.task_count);

  const now = new Date();
  const monthlyTrips = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyTrips.push({ month: key, count: monthlyCounts[key] || 0 });
  }

  const workTypes = Object.entries(workTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  return json({
    success: true,
    sector: sectorName,
    summary: {
      total_members: team.length,
      total_trips: totalTrips,
      total_tasks: totalTasks,
      total_days_away: totalDays,
      pending_reports: pendingReports,
      overdue_reports: overdueReports,
      completed_trips: completedTrips,
    },
    ranking,
    work_types: workTypes,
    monthly_trips: monthlyTrips,
    team,
  });
});

sector.get('/team', async (c) => {
  const user = c.get('user');
  if (!isSectorLeader(user)) {
    return err('Você não tem permissão para ver a equipe do setor.', 403);
  }

  const data = await fetchTeamData(c.env.DB, user);
  if (!data) return err('Setor não configurado.', 404);

  return json({
    success: true,
    sector: data.sector,
    team: data.team,
  });
});

sector.get('/access', async (c) => {
  const user = c.get('user');
  const ledSector = getLedSector(user);
  return json({
    success: true,
    can_view: isSectorLeader(user),
    led_sector: ledSector,
    is_admin: user.role === 'admin' || user.role === 'admin_master',
    is_sector_leader: isSectorLeader(user),
  });
});
