CREATE TABLE IF NOT EXISTS trip_task_custom_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  field_value TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(task_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_trip_task_custom_values_task ON trip_task_custom_values(task_id);
