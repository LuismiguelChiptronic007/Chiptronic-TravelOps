CREATE INDEX IF NOT EXISTS idx_demandas_viagem
  ON demandas(viagem_id);

CREATE INDEX IF NOT EXISTS idx_demanda_veiculos_demanda
  ON demanda_veiculos(demanda_id);

CREATE INDEX IF NOT EXISTS idx_demanda_atividades_veiculo
  ON demanda_atividades(demanda_veiculo_id);

CREATE INDEX IF NOT EXISTS idx_trip_tasks_atividade
  ON trip_tasks(demanda_atividade_id);