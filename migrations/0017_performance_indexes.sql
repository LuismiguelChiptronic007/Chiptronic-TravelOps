CREATE INDEX IF NOT EXISTS idx_trips_owner_dates ON trips(user_id, start_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_trip_members_user_trip ON trip_members(user_id, trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_trip ON trip_members(trip_id, id);
CREATE INDEX IF NOT EXISTS idx_trip_tasks_trip_schedule ON trip_tasks(trip_id, task_date, start_time, id);