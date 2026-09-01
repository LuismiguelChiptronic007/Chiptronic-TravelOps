-- Legacy compatibility migration.
-- A tabela trip_tasks já recebe vehicle e plate na migration 0002,
-- então esta etapa fica como no-op para evitar colunas duplicadas.
PRAGMA foreign_keys = ON;
SELECT 1;
