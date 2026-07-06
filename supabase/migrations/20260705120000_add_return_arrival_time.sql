-- Store the computed return-to-base arrival time (last job end + return travel)
-- so the staff mobile view can show it without needing live travel segments.
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS return_arrival_time text;
