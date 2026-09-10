CREATE TABLE IF NOT EXISTS sector_equipment_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sector TEXT NOT NULL,
  equipment_type TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sector, equipment_type, name)
);

CREATE INDEX IF NOT EXISTS idx_sector_equipment_catalog_sector_type
  ON sector_equipment_catalog (sector, equipment_type, name);