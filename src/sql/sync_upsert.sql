-- p1 = JSON array task dari Lentera/Classroom (lihat lib/normalize.js)
-- p2 = JSON array nama kelas Classroom yang dilewati (semester lalu / diabaikan)
with incoming as (
  select * from jsonb_to_recordset($1::jsonb) as x(source text, source_id text, course text, title text,
         task_type text, deadline timestamptz, effort_minutes int, weight int, status text)
), up as (
  insert into tasks (source, source_id, course, title, task_type, deadline, effort_minutes, weight, status)
  select source, source_id, course, title, task_type, deadline, effort_minutes, weight, status from incoming
  on conflict (source, source_id) do update set
    title      = excluded.title,
    course     = excluded.course,
    deadline   = excluded.deadline,
    status     = case when excluded.status = 'done' then 'done' else tasks.status end,
    updated_at = now()
  where tasks.title    is distinct from excluded.title
     or tasks.course   is distinct from excluded.course
     or tasks.deadline is distinct from excluded.deadline
     or (excluded.status = 'done' and tasks.status <> 'done')
  returning (xmax = 0) as inserted, id, source, course, title, deadline, status
), dropped as (
  -- tugas yang belum selesai dari kelas yang sekarang dilewati
  update tasks set status = 'dropped', updated_at = now()
  where source = 'classroom' and status = 'open'
    and course in (select jsonb_array_elements_text(coalesce($2::jsonb, '[]'::jsonb)))
    and id not in (select id from up)
  returning id
), expired as (
  -- kuis Lentera yang sudah tutup lebih dari 1 hari tidak bisa dikerjakan lagi
  update tasks set status = 'expired', updated_at = now()
  where source = 'lentera' and status = 'open' and deadline < now() - interval '1 day'
    and id not in (select id from up)
  returning id
)
select
  coalesce(jsonb_agg(jsonb_build_object(
    'id', up.id, 'course', up.course, 'title', up.title, 'source', up.source,
    'deadline_wib', to_char(up.deadline at time zone 'Asia/Jakarta', 'Dy DD Mon HH24:MI')))
    filter (where up.inserted and up.status = 'open'), '[]'::jsonb) as new_tasks,
  count(*) filter (where not up.inserted) as updated_count,
  count(*) filter (where up.status = 'done' and not up.inserted) as marked_done_count,
  (select count(*) from expired) as expired_count,
  (select count(*) from dropped) as dropped_from_old_courses_count,
  (select count(*) from incoming) as incoming_count
from up;
