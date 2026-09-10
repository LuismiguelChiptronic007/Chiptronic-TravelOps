-- Integrantes da viagem e tarefas de encerramento

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trip_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  sector TEXT NOT NULL,
  manager_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_members_trip ON trip_members(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_user ON trip_members(user_id);

CREATE TABLE IF NOT EXISTS trip_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  responsible_id INTEGER REFERENCES users(id),
  work_type TEXT NOT NULL,
  location TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  summary TEXT NOT NULL,
  task_date TEXT NOT NULL,
  pending_items TEXT,
  vehicle TEXT,
  plate TEXT,
  approved_loads TEXT,
  rejected_loads TEXT,
  logs_realizados TEXT,
  sistemas_logados TEXT,
  nome_sistemas_logados TEXT,
  montadora TEXT,
  modelo TEXT,
  submodelo TEXT,
  ano TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trip_tasks_trip ON trip_tasks(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_tasks_date ON trip_tasks(task_date);

CREATE TABLE IF NOT EXISTS trip_task_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  stored_key TEXT NOT NULL,
  mime_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES trip_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trip_task_photos_task ON trip_task_photos(task_id);
