-- Composite index para consultas de tarefas por viagem e data
CREATE INDEX IF NOT EXISTS idx_trip_tasks_trip_date ON trip_tasks(trip_id, task_date);
