-- Daftar tugas aktif + waktu tidak tersedia ke depan (untuk agent).
select
  (select coalesce(jsonb_agg(t order by t.deadline nulls last, t.weight desc), '[]'::jsonb) from (
     select id, course, title, task_type, source,
            to_char(deadline at time zone 'Asia/Jakarta', 'Dy DD Mon YYYY HH24:MI') as deadline_wib,
            deadline, effort_minutes, done_minutes, weight, target_pct,
            greatest(0, round(effort_minutes * target_pct / 100.0)::int - done_minutes) as remaining_minutes
     from tasks where status = 'open'
     order by deadline nulls last limit 60) t) as open_tasks,
  (select coalesce(jsonb_agg(u order by u.start_at), '[]'::jsonb) from (
     select id, reason,
            to_char(start_at at time zone 'Asia/Jakarta', 'Dy DD Mon HH24:MI') as mulai,
            to_char(end_at at time zone 'Asia/Jakarta', 'Dy DD Mon HH24:MI') as selesai,
            start_at
     from unavailability where end_at > now()) u) as unavailable;
