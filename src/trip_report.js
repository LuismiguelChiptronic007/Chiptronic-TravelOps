import { statusLabel } from "./helpers.js";

function parseTaskResponsibles(task) {
  if (Array.isArray(task.responsibles) && task.responsibles.length) {
    return task.responsibles;
  }
  const ids = Array.isArray(task.responsible_ids)
    ? task.responsible_ids
    : String(task.responsible_ids || task.responsible_id || "")
        .split(",")
        .map(Number)
        .filter(Boolean);
  return ids.map((id) => ({ id, full_name: task.responsible_full_name || "—" }));
}

function taskIsCompleted(task) {
  return !String(task.pending_items || "").trim();
}

function calculateHours(tasks) {
  let minutes = 0;
  for (const task of tasks) {
    const start = timeToMinutes(task.start_time);
    const end = timeToMinutes(task.end_time);
    if (start != null && end != null && end > start) minutes += end - start;
  }
  return Math.round((minutes / 60) * 100) / 100;
}

function timeToMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return null;
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

export function buildTripReportModel(trip) {
  const tasks = Array.isArray(trip.tasks) ? trip.tasks : [];
  const owner = (trip.members || []).find(
    (member) => Number(member.user_id || member.id) === Number(trip.user_id),
  );
  const assignedUsers = new Map();

  for (const task of tasks) {
    for (const responsible of parseTaskResponsibles(task)) {
      const id = Number(responsible.id || responsible.user_id || 0);
      const key = id || responsible.full_name || `task-${task.id}`;
      if (!assignedUsers.has(key)) {
        assignedUsers.set(key, {
          id,
          fullName: responsible.full_name || "Responsável",
          tasks: [],
        });
      }
      assignedUsers.get(key).tasks.push(task);
    }
  }

  if (!assignedUsers.size && owner) {
    assignedUsers.set(Number(owner.user_id || owner.id), {
      id: Number(owner.user_id || owner.id),
      fullName: owner.full_name,
      tasks: [],
    });
  }

  const userSummaries = [...assignedUsers.values()].map((user) => {
    const byDate = new Map();
    for (const task of user.tasks) {
      if (!byDate.has(task.task_date)) byDate.set(task.task_date, []);
      byDate.get(task.task_date).push(task);
    }
    const days = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dateTasks]) => ({
      date,
      slots: dateTasks.map((task) => ({
        start: task.start_time,
        end: task.end_time,
        workType: task.work_type,
      })),
      timeSlots: dateTasks
        .map((task) =>
          task.start_time && task.end_time
            ? `${task.start_time} – ${task.end_time}`
            : task.start_time || task.end_time || "",
        )
        .filter(Boolean)
        .join(" / "),
    }));
    return {
      fullName: user.fullName,
      tasksCompleted: user.tasks.filter(taskIsCompleted).length,
      tasksAssigned: user.tasks.length,
      totalHoursWorked: user.tasks.length ? calculateHours(user.tasks) : null,
      days,
    };
  });

  const taskResults = tasks.map((task) => ({
    id: task.id,
    date: task.task_date,
    startTime: task.start_time,
    endTime: task.end_time,
    workType: task.work_type,
    location: task.location,
    summary: task.summary,
    pendingItems: task.pending_items,
    completed: taskIsCompleted(task),
    responsibles: parseTaskResponsibles(task).map((r) => r.full_name),
  }));

  const memberNames = (trip.members || []).map((m) => m.full_name).filter(Boolean);

  return {
    general: {
      code: `TRIP-${trip.id}`,
      status: trip.status,
      statusLabel: trip.status_label || statusLabel(trip.status),
      origin: trip.origin,
      destination: trip.destination,
      startDate: trip.start_date,
      endDate: trip.end_date,
      reason: trip.reason,
      sector: trip.sector,
      priority: trip.priority || "normal",
      employee: owner?.full_name || "—",
      coordinator: owner?.manager_name || "—",
      participants: memberNames.join(", ") || "—",
      objectiveMet: trip.checklist?.objective_met ?? null,
      objectiveNotes: trip.checklist?.objective_notes || "",
      peopleVisited: trip.checklist?.people_visited || "",
      activitiesSummary: trip.checklist?.activities_summary || "",
      generalPendingItems: trip.checklist?.pending_items || "",
      completedAt: trip.checklist?.completed_at || null,
    },
    taskResults,
    members: (trip.members || []).map((member) => ({
      fullName: member.full_name,
      sector: member.sector,
      positionTitle: member.position_title,
    })),
    tasksCompleted: tasks
      .filter(taskIsCompleted)
      .map((task) => ({
        ...task,
        responsibles: parseTaskResponsibles(task).map((r) => r.full_name),
      })),
    tasksPending: tasks
      .filter((task) => !taskIsCompleted(task))
      .map((task) => ({
        ...task,
        responsibles: parseTaskResponsibles(task).map((r) => r.full_name),
      })),
    userSummaries,
    generatedAt: new Date().toISOString(),
  };
}
