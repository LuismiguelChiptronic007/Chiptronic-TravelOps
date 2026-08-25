CREATE TABLE IF NOT EXISTS leader_work_type_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sector TEXT NOT NULL,
  work_type_name TEXT NOT NULL,
  field_name TEXT NOT NULL,
  is_required INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sector, work_type_name, field_name)
);

CREATE TABLE IF NOT EXISTS leader_project_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sector TEXT NOT NULL,
  project_id INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  is_required INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sector, project_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_leader_work_type_fields_sector_type ON leader_work_type_fields(sector, work_type_name);
CREATE INDEX IF NOT EXISTS idx_leader_project_fields_sector_project ON leader_project_fields(sector, project_id);
