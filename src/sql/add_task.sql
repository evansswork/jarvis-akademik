-- p1 = JSON task {course,title,task_type,deadline,effort_minutes,weight,notes}
insert into tasks (source, course, title, task_type, deadline, effort_minutes, weight, notes)
select 'manual', x.course, x.title, coalesce(nullif(x.task_type, ''), 'tugas'), x.deadline,
       coalesce(x.effort_minutes, 90), coalesce(x.weight, 2), x.notes
from jsonb_to_record($1::jsonb) as x(course text, title text, task_type text, deadline timestamptz,
                                       effort_minutes int, weight int, notes text)
returning id, course, title, task_type, deadline,
          to_char(deadline at time zone 'Asia/Jakarta', 'Dy DD Mon YYYY HH24:MI') as deadline_wib,
          effort_minutes, weight;
