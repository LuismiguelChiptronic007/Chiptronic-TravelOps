CREATE TABLE IF NOT EXISTS atividades_modelo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_projeto TEXT,
  descricao TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT 1,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demandas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viagem_id INTEGER NOT NULL,
  tipo_projeto TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  criado_por INTEGER NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (viagem_id) REFERENCES trips(id),
  FOREIGN KEY (criado_por) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS demanda_veiculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_id INTEGER NOT NULL,
  montadora TEXT NOT NULL,
  modelo TEXT NOT NULL,
  versao_modelo TEXT,
  ano TEXT,
  placa TEXT,
  FOREIGN KEY (demanda_id) REFERENCES demandas(id)
);

CREATE TABLE IF NOT EXISTS demanda_atividades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_veiculo_id INTEGER NOT NULL,
  atividade_modelo_id INTEGER NOT NULL,
  prioridade INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pendente',
  concluida_por INTEGER,
  concluida_em DATETIME,
  FOREIGN KEY (demanda_veiculo_id) REFERENCES demanda_veiculos(id),
  FOREIGN KEY (atividade_modelo_id) REFERENCES atividades_modelo(id),
  FOREIGN KEY (concluida_por) REFERENCES users(id)
);

ALTER TABLE trip_tasks ADD COLUMN eh_atividade_prioridade BOOLEAN DEFAULT 0;
ALTER TABLE trip_tasks ADD COLUMN demanda_atividade_id INTEGER;
ALTER TABLE trip_tasks ADD COLUMN demanda_veiculo_id INTEGER;

INSERT INTO atividades_modelo (tipo_projeto, descricao, ativo) VALUES
('Manutenção', 'Troca de óleo', 1),
('Manutenção', 'Troca de filtros', 1),
('Manutenção', 'Revisão de freios', 1),
('Manutenção', 'Checagem de pneus', 1),
('Diagnóstico', 'Leitura de falhas ECU', 1),
('Diagnóstico', 'Teste de sensores', 1),
('Instalação', 'Instalação de equipamento', 1),
('Instalação', 'Configuração de módulo', 1),
('Configuração', 'Calibração de parâmetros', 1),
('Configuração', 'Atualização de firmware', 1);
