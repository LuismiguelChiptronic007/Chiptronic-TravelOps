-- Add responsible member to trip tasks
PRAGMA foreign_keys = ON;

ALTER TABLE trip_tasks ADD COLUMN responsible_id INTEGER REFERENCES users(id);
