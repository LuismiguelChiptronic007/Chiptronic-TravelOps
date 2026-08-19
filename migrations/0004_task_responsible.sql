-- Corrige schema antigo de trip_tasks para suportar veículo/placa em tarefas.
-- Em bancos criados a partir da migration 0002, estas colunas já existem.
-- Em bancos antigos, esta migration adiciona as colunas faltantes.
-- Importante: o SQLite/D1 não suporta IF NOT EXISTS em ALTER TABLE, então
-- esta migration deve ser aplicada somente em bancos que ainda não tenham
-- vehicle e plate na tabela trip_tasks.
PRAGMA foreign_keys = ON;

ALTER TABLE trip_tasks ADD COLUMN vehicle TEXT;
ALTER TABLE trip_tasks ADD COLUMN plate TEXT;
