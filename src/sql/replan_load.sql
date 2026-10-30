-- Semua bahan untuk penjadwal dalam satu baris.
select
  (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from settings) as settings,
  (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
     select id, title, course, task_type, deadline, effort_minutes, done_minutes, weight, target_pct, status
     from tasks where status = 'open') t) as tasks,
  (select coalesce(jsonb_agg(u), '[]'::jsonb) from (
     select start_at as start, end_at as "end", coalesce(reason, 'tidak tersedia') as label
     from unavailability where end_at > now()) u) as unavailable;
