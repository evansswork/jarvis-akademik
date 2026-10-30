-- p1 = task id, p2 = JSON perubahan (field yang tidak dikirim tidak diubah).
-- Dibungkus CTE + SELECT: jika id tidak ada, node mengembalikan 0 baris (bukan "success").
with upd as (
update tasks t set
  title          = coalesce(c.title, t.title),
  course         = coalesce(c.course, t.course),
  task_type      = coalesce(c.task_type, t.task_type),
  deadline       = coalesce(c.deadline, t.deadline),
  effort_minutes = coalesce(c.effort_minutes, t.effort_minutes),
  done_minutes   = coalesce(c.done_minutes, t.done_minutes),
  weight         = coalesce(c.weight, t.weight),
  target_pct     = coalesce(c.target_pct, t.target_pct),
  status         = coalesce(c.status, t.status),
  notes          = coalesce(c.notes, t.notes),
  updated_at     = now()
from jsonb_to_record($2::jsonb) as c(title text, course text, task_type text, deadline timestamptz,
                                       effort_minutes int, done_minutes int, weight int, target_pct int,
                                       status text, notes text)
where t.id = $1::bigint
returning t.id, t.course, t.title, t.task_type,
          to_char(t.deadline at time zone 'Asia/Jakarta', 'Dy DD Mon YYYY HH24:MI') as deadline_wib,
          t.effort_minutes, t.done_minutes, t.weight, t.target_pct, t.status
)
select * from upd;
