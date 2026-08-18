ALTER TABLE trip_tasks ADD COLUMN project_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_trip_tasks_project ON trip_tasks(project_id);
