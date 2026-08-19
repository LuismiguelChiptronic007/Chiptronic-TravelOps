-- Roles, gestor vinculado e notificações
-- Ordem correta: primeiro cria a coluna, depois os índices e UPDATEs.
-- Como SQLite antigo não suporta ADD COLUMN IF NOT EXISTS, os ALTER TABLE vão
-- falhar se as colunas já existirem. Para bancos criados a partir da 0001 nova
-- (que já contêm role/manager_id), basta ignorar estes ALTER. Como workaround,
-- fazemos os ALTER em statements separados -- o wrangler --file continua os
-- demais comandos em caso de erro apenas em statements isolados? Ele aborta.
-- Então deixamos os ALTER no TOPO (comentados aqui explicativamente) e criamos
-- as colunas direto na migration 0001_init.sql. Se você está aplicando esta
-- migration em um banco ANTIGO (criado antes da unificação), descomente as 2
-- linhas abaixo UMA ÚNICA VEZ manualmente (via wrangler d1 execute --command).

PRAGMA foreign_keys = ON;

-- Descomente apenas se estiver aplicando em um banco antigo (sem colunas role nem manager_id):
-- ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'admin_master'));
-- ALTER TABLE users ADD COLUMN manager_id INTEGER REFERENCES users(id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id);
CREATE INDEX IF NOT EXISTS idx_users_sector ON users(sector);

-- Admin master: Luis Miguel Oliveira
UPDATE users SET role = 'admin_master' WHERE email = 'luismiguel.oliveira@chiptronic.com.br';
UPDATE users SET role = 'admin_master' WHERE email = 'luismiguel.oliveira@chiptronic.com';
