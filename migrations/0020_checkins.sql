-- Tabela de check-ins de localiza√ß√£o para o Mapa Operacional
-- Hist√≥rico de localiza√ß√µes por integrante/trabalho/viagem

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trabalho_id INTEGER NOT NULL REFERENCES trip_tasks(id) ON DELETE CASCADE,
  integrante_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viagem_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_checkins_integrante ON checkins(integrante_id);
CREATE INDEX IF NOT EXISTS idx_checkins_viagem ON checkins(viagem_id);
CREATE INDEX IF NOT EXISTS idx_checkins_trabalho ON checkins(trabalho_id);
CREATE INDEX IF NOT EXISTS idx_checkins_timestamp ON checkins(timestamp);
CREATE INDEX IF NOT EXISTS idx_checkins_integrante_timestamp ON checkins(integrante_id, timestamp DESC);
