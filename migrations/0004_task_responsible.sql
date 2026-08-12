-- Add responsible member to trip tasks
-- Obs.: a coluna responsible_id já foi criada na migration 0002_members_tasks.sql
--       diretamente no CREATE TABLE trip_tasks. Esta migration está vazia para
--       manter compatibilidade com ambientes onde 0004 já foi aplicada e para
--       evitar erro de "duplicate column name" em ambientes novos.
PRAGMA foreign_keys = ON;
