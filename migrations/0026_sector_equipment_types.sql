CREATE TABLE IF NOT EXISTS sector_equipment_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sector TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sector, name)
);

CREATE INDEX IF NOT EXISTS idx_sector_equipment_types_sector
  ON sector_equipment_types (sector, name);