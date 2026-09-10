CREATE TABLE IF NOT EXISTS equipment_accessories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER NOT NULL REFERENCES sector_equipment_catalog(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_equipment_accessories_equipment_id
  ON equipment_accessories (equipment_id, name);
