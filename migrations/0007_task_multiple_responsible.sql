-- Adiciona suporte para múltiplos responsáveis e campos de montadora/modelo/submodelo em tarefas
PRAGMA foreign_keys = ON;

ALTER TABLE trip_tasks ADD COLUMN responsible_ids TEXT;
ALTER TABLE trip_tasks ADD COLUMN montadora TEXT;
ALTER TABLE trip_tasks ADD COLUMN modelo TEXT;
ALTER TABLE trip_tasks ADD COLUMN submodelo TEXT;
