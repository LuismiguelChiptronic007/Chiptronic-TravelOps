-- Legacy compatibility migration.
-- Os campos de responsável, montadora, modelo, submodelo e ano já devem
-- existir na tabela trip_tasks após a base inicial e migrações seguintes.
PRAGMA foreign_keys = ON;
SELECT 1;
