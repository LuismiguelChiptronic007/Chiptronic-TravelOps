CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  montadora TEXT NOT NULL,
  modelo TEXT NOT NULL,
  versao_modelo TEXT,
  ano TEXT,
  placa TEXT,
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS vehicle_demands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL,
  trip_id INTEGER NOT NULL,
  tipo_projeto TEXT NOT NULL,
  atividade_modelo_id INTEGER,
  atividade TEXT NOT NULL,
  prioridade INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (atividade_modelo_id) REFERENCES atividades_modelo(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_trip_id ON vehicles(trip_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_demands_vehicle_id ON vehicle_demands(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_demands_trip_id ON vehicle_demands(trip_id);
