PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS configuracoes_usuario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  janela_almoco_inicio TEXT NOT NULL DEFAULT '11:00',
  janela_almoco_fim TEXT NOT NULL DEFAULT '14:00',
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_configuracoes_usuario_usuario ON configuracoes_usuario(usuario_id);
